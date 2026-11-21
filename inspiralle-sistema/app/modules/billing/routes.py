"""Contas a receber, contas a pagar e repasse por dentista.

Acesso: administração vê tudo. Dentista vê só o próprio repasse.
Recepção pode dar baixa em parcela, mas não vê o repasse nem o caixa.
"""
import csv
import io
from datetime import date

from flask import Blueprint, Response, flash, redirect, render_template, request, url_for
from flask_login import current_user

from app.extensions import db
from app.models import EXPENSE_CATEGORIES, METHODS, Payable, Receivable
from app.modules.auth.decorators import role_required
from app.services import billing as svc
from app.services import commission as comm
from app.services.finance import PERIODS, parse_money
from app.services.messaging import enqueue_dunning

bp = Blueprint("billing", __name__)


def _ref() -> date:
    try:
        return date.fromisoformat(request.args.get("data", ""))
    except ValueError:
        return date.today()


# ------------------------------------------------------------ contas a receber

@bp.route("/receber")
@role_required("dentista", "recepcao")
def receivables():
    s = svc.summary(_ref())
    return render_template("billing/receivables.html", s=s, methods=METHODS, today=date.today(),
                           can_see_totals=current_user.role in ("admin", "dentista"))


@bp.route("/receber/<int:id>/baixa", methods=["POST"])
@role_required("dentista", "recepcao")
def receive(id):
    r = db.get_or_404(Receivable, id)
    amount = parse_money(request.form.get("valor"))
    method = request.form.get("forma") if request.form.get("forma") in METHODS else r.method
    svc.receive(r, amount, method)
    db.session.commit()
    flash(f"Baixa registrada: {r.patient.name} · {r.label}.", "success")
    return redirect(request.referrer or url_for("billing.receivables"))


@bp.route("/receber/<int:id>/desfazer", methods=["POST"])
@role_required("admin")
def unreceive(id):
    r = db.get_or_404(Receivable, id)
    svc.undo_receive(r)
    db.session.commit()
    flash("Baixa desfeita. A parcela voltou para em aberto.", "success")
    return redirect(request.referrer or url_for("billing.receivables"))


@bp.route("/receber/cobranca", methods=["POST"])
@role_required("recepcao")
def dunning():
    created = enqueue_dunning()
    db.session.commit()
    if created:
        flash(f"{len(created)} mensagem(ns) de cobrança na fila para revisão antes do envio.", "success")
    else:
        flash("Nenhuma parcela atingiu um marco da régua hoje (1, 7 e 20 dias de atraso).", "warning")
    return redirect(url_for("messaging.index", tipo="cobranca"))


@bp.route("/receber/exportar.csv")
@role_required("dentista")
def export_receivables():
    s = svc.summary(_ref())
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Situação", "Vencimento", "Paciente", "Descrição", "Parcela", "Valor (R$)", "Atraso (dias)"])
    for r in s.overdue + s.today + s.upcoming:
        w.writerow([r.state_label, r.due_date.strftime("%d/%m/%Y"), r.patient.name, r.description,
                    f"{r.installment}/{r.installments}", f"{r.amount:.2f}".replace(".", ","), r.overdue_days])
    return Response("﻿" + buf.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="contas-a-receber.csv"'})


# --------------------------------------------------------------- contas a pagar

@bp.route("/pagar", methods=["GET", "POST"])
@role_required("admin")
def payables():
    if request.method == "POST":
        amount = parse_money(request.form.get("valor"))
        try:
            due = date.fromisoformat(request.form.get("vencimento", ""))
        except ValueError:
            due = None
        desc = (request.form.get("descricao") or "").strip()
        if not desc or amount is None or due is None:
            flash("Preencha descrição, valor e vencimento.", "danger")
        else:
            db.session.add(Payable(description=desc, amount=amount, due_date=due,
                                   category=request.form.get("categoria", "outros"),
                                   recurring=bool(request.form.get("recorrente"))))
            db.session.commit()
            flash("Conta a pagar lançada.", "success")
        return redirect(url_for("billing.payables"))
    data = svc.payables_summary(_ref())
    return render_template("billing/payables.html", d=data, categories=EXPENSE_CATEGORIES,
                           projection=svc.cash_projection(6), today=date.today())


@bp.route("/pagar/<int:id>/baixa", methods=["POST"])
@role_required("admin")
def pay(id):
    from datetime import datetime
    p = db.get_or_404(Payable, id)
    p.paid_at = None if p.paid else datetime.now()
    db.session.commit()
    flash("Conta marcada como paga." if p.paid else "Baixa desfeita.", "success")
    return redirect(url_for("billing.payables"))


# -------------------------------------------------------------------- repasse

@bp.route("/comissao")
@role_required("dentista")
def commission():
    period = request.args.get("periodo", "mes")
    period = period if period in PERIODS else "mes"
    rows = comm.build(period, _ref())
    if current_user.role == "dentista" and current_user.dentist_id:
        rows = [r for r in rows if r.dentist.id == current_user.dentist_id]
    return render_template("billing/commission.html", rows=rows, period=period, periods=PERIODS,
                           ref=_ref(), today=date.today())
