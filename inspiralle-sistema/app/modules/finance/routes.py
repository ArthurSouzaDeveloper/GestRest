"""Financeiro da clínica: relatórios diário/semanal/mensal e tabela de preços.

Acesso: administrador vê tudo; dentista vê só a própria produção e define os
próprios preços. Recepção e pacientes não têm acesso.
"""
import csv
import io
from datetime import date

from flask import Blueprint, Response, abort, flash, redirect, render_template, request, url_for
from flask_login import current_user

from app.extensions import db
from app.models import Dentist, DentistPrice, FinancialEntry
from app.modules.auth.decorators import role_required
from app.services.finance import PERIODS, build_report, parse_money

bp = Blueprint("finance", __name__)


def _scope_dentist_id() -> int | None:
    """Dentista só enxerga o próprio financeiro; admin pode filtrar por profissional."""
    if current_user.role == "dentista":
        if not current_user.dentist_id:
            abort(403)
        return current_user.dentist_id
    return request.args.get("dentista", type=int) or None


def _ref_date() -> date:
    try:
        return date.fromisoformat(request.args.get("data", ""))
    except ValueError:
        return date.today()


@bp.route("/")
@role_required("dentista")
def index():
    period = request.args.get("periodo", "dia")
    dentist_id = _scope_dentist_id()
    report = build_report(period, _ref_date(), dentist_id)
    dentists = Dentist.query.order_by(Dentist.name).all() if current_user.role == "admin" else []
    return render_template("finance/index.html", r=report, periods=PERIODS, dentists=dentists,
                           dentist_id=dentist_id, today=date.today())


@bp.route("/exportar.csv")
@role_required("dentista")
def export_csv():
    report = build_report(request.args.get("periodo", "dia"), _ref_date(), _scope_dentist_id())
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Data", "Hora", "Paciente", "Tratamento", "Profissional", "Valor (R$)", "Observação"])
    for e in sorted(report.entries, key=lambda x: x.performed_at):
        obs = "Sem preço definido" if e.price_missing else ("Valor ajustado" if e.adjusted_by_id else "")
        w.writerow([e.performed_at.strftime("%d/%m/%Y"), e.performed_at.strftime("%H:%M"), e.patient.name,
                    e.service.name, e.dentist.name, f"{e.amount:.2f}".replace(".", ","), obs])
    w.writerow([])
    w.writerow(["Total", "", "", "", "", f"{report.total:.2f}".replace(".", ","), f"{report.count} consultas"])
    name = f"financeiro-{report.period}-{report.start:%Y-%m-%d}.csv"
    return Response("﻿" + buf.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@bp.route("/precos", methods=["GET", "POST"])
@role_required("dentista")
def prices():
    if current_user.role == "dentista":
        dentist = db.get_or_404(Dentist, _scope_dentist_id())
    else:
        dentists = Dentist.query.order_by(Dentist.name).all()
        sel = request.args.get("dentista", type=int) or (dentists[0].id if dentists else 0)
        dentist = db.get_or_404(Dentist, sel)

    if request.method == "POST":
        current = {p.service_id: p for p in dentist.prices}
        for s in dentist.services:
            raw = (request.form.get(f"preco_{s.id}") or "").strip()
            if not raw:
                if s.id in current:
                    db.session.delete(current[s.id])  # volta a usar o valor padrão do serviço
                continue
            value = parse_money(raw)
            if value is None:
                flash(f"Valor inválido para {s.name}.", "danger")
                return redirect(request.url)
            if s.id in current:
                current[s.id].price = value
            else:
                db.session.add(DentistPrice(dentist=dentist, service=s, price=value))
        db.session.commit()
        flash("Tabela de preços salva. Novas consultas concluídas já usam estes valores.", "success")
        return redirect(url_for("finance.prices", dentista=dentist.id))

    own = {p.service_id: p.price for p in dentist.prices}
    all_dentists = Dentist.query.order_by(Dentist.name).all() if current_user.role == "admin" else []
    return render_template("finance/prices.html", dentist=dentist, own=own, dentists=all_dentists)


@bp.route("/lancamento/<int:id>/valor", methods=["POST"])
@role_required("admin")
def adjust(id):
    entry = db.get_or_404(FinancialEntry, id)
    value = parse_money(request.form.get("valor"))
    if value is None:
        flash("Informe um valor válido.", "danger")
        return redirect(request.referrer or url_for("finance.index"))
    entry.amount = value
    entry.price_missing = False
    entry.adjusted_by_id = current_user.id
    db.session.commit()
    flash("Valor da consulta ajustado.", "success")
    return redirect(request.referrer or url_for("finance.index"))
