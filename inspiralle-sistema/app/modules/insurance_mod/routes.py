"""Convênios odontológicos: tabela por procedimento e guias no padrão TISS."""
from datetime import date, datetime
from decimal import Decimal

from flask import Blueprint, flash, redirect, render_template, request, url_for

from app.extensions import db
from app.models import (Dentist, GUIDE_STATUSES, Insurance, InsurancePrice, Patient, Service,
                        TissGuide, TreatmentPlan)
from app.modules.auth.decorators import role_required
from app.services.finance import parse_money

bp = Blueprint("insurance", __name__)


@bp.route("/", methods=["GET", "POST"])
@role_required("recepcao", "dentista")
def index():
    if request.method == "POST":
        name = (request.form.get("nome") or "").strip()
        if not name:
            flash("Informe o nome do convênio.", "danger")
            return redirect(url_for("insurance.index"))
        db.session.add(Insurance(name=name, ans_code=(request.form.get("ans") or "").strip() or None,
                                 pay_days=request.form.get("prazo", type=int) or 30))
        db.session.commit()
        flash("Convênio cadastrado.", "success")
        return redirect(url_for("insurance.index"))

    insurances = Insurance.query.order_by(Insurance.name).all()
    guides = TissGuide.query.order_by(TissGuide.created_at.desc()).limit(60).all()
    totals = {
        "enviado": sum((g.amount for g in guides if g.status in ("enviada", "paga", "glosada")), Decimal("0")),
        "pago": sum((g.paid_amount or Decimal("0") for g in guides), Decimal("0")),
        "glosa": sum((g.glosa or Decimal("0") for g in guides if g.status == "glosada"), Decimal("0")),
        "aberto": sum((g.amount for g in guides if g.status in ("gerada", "enviada")), Decimal("0")),
    }
    return render_template("insurance/index.html", insurances=insurances, guides=guides, totals=totals,
                           statuses=GUIDE_STATUSES, today=date.today(),
                           plans=TreatmentPlan.query.order_by(TreatmentPlan.created_at.desc()).limit(40).all(),
                           patients=Patient.query_active().order_by(Patient.name).limit(300).all(),
                           dentists=Dentist.query.filter_by(active=True).order_by(Dentist.name).all())


@bp.route("/<int:id>/tabela", methods=["GET", "POST"])
@role_required("dentista")
def prices(id):
    ins = db.get_or_404(Insurance, id)
    services = Service.query.filter_by(active=True).order_by(Service.name).all()
    if request.method == "POST":
        current = {p.service_id: p for p in ins.prices}
        for s in services:
            value = parse_money(request.form.get(f"valor_{s.id}"))
            tuss = (request.form.get(f"tuss_{s.id}") or "").strip() or None
            row = current.get(s.id)
            if value is None and not tuss:
                if row is not None:
                    db.session.delete(row)
                continue
            if row is None:
                row = InsurancePrice(insurance=ins, service=s)
                db.session.add(row)
            row.amount = value or Decimal("0")
            row.tuss = tuss
        db.session.commit()
        flash("Tabela do convênio salva.", "success")
        return redirect(url_for("insurance.prices", id=ins.id))
    rows = {p.service_id: p for p in ins.prices}
    return render_template("insurance/prices.html", ins=ins, services=services, rows=rows)


@bp.route("/guia/nova", methods=["POST"])
@role_required("recepcao", "dentista")
def new_guide():
    ins = db.session.get(Insurance, request.form.get("convenio", type=int) or 0)
    patient = db.session.get(Patient, request.form.get("paciente", type=int) or 0)
    dentist = db.session.get(Dentist, request.form.get("dentista", type=int) or 0)
    if not (ins and patient and dentist):
        flash("Escolha convênio, paciente e profissional.", "danger")
        return redirect(url_for("insurance.index"))
    plan = db.session.get(TreatmentPlan, request.form.get("plano", type=int) or 0)
    amount = parse_money(request.form.get("valor"))
    if amount is None and plan is not None:
        # Valor do convênio pelos procedimentos do plano, não o preço particular
        table = {p.service_id: p.amount for p in ins.prices}
        amount = sum((table.get(i.service_id, Decimal("0")) for i in plan.live_items), Decimal("0"))
    seq = TissGuide.query.count() + 1
    guide = TissGuide(number=f"{date.today():%Y%m}{seq:05d}", insurance=ins, patient=patient,
                      dentist=dentist, plan=plan, amount=amount or Decimal("0"))
    db.session.add(guide)
    db.session.commit()
    flash(f"Guia {guide.number} gerada.", "success")
    return redirect(url_for("insurance.index"))


@bp.route("/guia/<int:id>/status", methods=["POST"])
@role_required("recepcao", "dentista")
def guide_status(id):
    g = db.get_or_404(TissGuide, id)
    status = request.form.get("status", "")
    if status not in GUIDE_STATUSES:
        flash("Status inválido.", "danger")
        return redirect(url_for("insurance.index"))
    g.status = status
    if status == "enviada":
        g.sent_at = datetime.now()
    if status == "paga":
        g.paid_amount = parse_money(request.form.get("valor")) or g.amount
    if status == "glosada":
        g.paid_amount = parse_money(request.form.get("valor")) or Decimal("0")
    db.session.commit()
    flash(f"Guia {g.number}: {g.status_label.lower()}.", "success")
    return redirect(url_for("insurance.index"))
