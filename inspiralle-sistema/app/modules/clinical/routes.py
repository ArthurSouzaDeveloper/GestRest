"""Odontograma, plano de tratamento e orçamento.

Acesso: dentista e admin marcam o odontograma e montam o plano; a recepção
acompanha o funil de orçamentos e registra a decisão do paciente.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal

from flask import Blueprint, abort, flash, redirect, render_template, request, url_for
from flask_login import current_user

from app.extensions import db
from app.models import (ALL_TEETH, CONDITIONS, FACES, LOWER, METHODS, PLAN_STATUSES, Patient, Service,
                        ToothState, TreatmentItem, TreatmentPlan, UPPER, current_chart)
from app.models import Dentist
from app.modules.auth.decorators import role_required
from app.services.audit import log
from app.services.finance import parse_money
from app.services.treatment import decide, mark_item_done, plan_totals, suggestions_from_chart

bp = Blueprint("clinical", __name__)


def _patient(id: int) -> Patient:
    p = db.get_or_404(Patient, id)
    if p.deleted_at:
        abort(404)
    return p


def _default_dentist() -> Dentist | None:
    if current_user.role == "dentista" and current_user.dentist_id:
        return db.session.get(Dentist, current_user.dentist_id)
    return Dentist.query.filter_by(active=True).order_by(Dentist.name).first()


# ------------------------------------------------------------- odontograma

@bp.route("/paciente/<int:id>/odontograma")
@role_required("dentista", "recepcao")
def odontogram(id):
    p = _patient(id)
    chart = current_chart(p.id)
    selected = request.args.get("dente", type=int)
    if selected and selected not in chart:
        selected = None
    history = (ToothState.query.filter_by(patient_id=p.id)
               .order_by(ToothState.created_at.desc()).limit(30).all())
    return render_template("clinical/odontogram.html", p=p, chart=chart, upper=UPPER, lower=LOWER,
                           conditions=CONDITIONS, faces=FACES, selected=selected, history=history,
                           suggestions=suggestions_from_chart(p.id),
                           can_edit=current_user.role in ("admin", "dentista"))


@bp.route("/paciente/<int:id>/odontograma/marcar", methods=["POST"])
@role_required("dentista")
def mark_tooth(id):
    p = _patient(id)
    tooth = request.form.get("dente", type=int)
    condition = request.form.get("condicao", "")
    if tooth not in ALL_TEETH or condition not in CONDITIONS:
        flash("Marcação inválida.", "danger")
        return redirect(url_for("clinical.odontogram", id=p.id))

    note = (request.form.get("obs") or "").strip() or None
    kind = CONDITIONS[condition]["kind"]
    picked = [f for f in request.form.getlist("face") if f in FACES]
    if kind == "face" and not picked:
        flash("Escolha pelo menos uma face para esta condição.", "warning")
        return redirect(url_for("clinical.odontogram", id=p.id, dente=tooth))

    targets = picked if kind == "face" else [None]
    for face in targets:
        db.session.add(ToothState(patient_id=p.id, tooth=tooth, face=face, condition=condition,
                                  note=note, author_id=current_user.id))
    log("alterou", "Odontograma", entity_id=p.id, patient_id=p.id,
        detail=f"Dente {tooth}: {CONDITIONS[condition]['label']}" + (f" ({''.join(targets)})" if picked else ""))
    db.session.commit()
    flash(f"Dente {tooth} marcado como {CONDITIONS[condition]['label'].lower()}.", "success")
    return redirect(url_for("clinical.odontogram", id=p.id, dente=tooth))


# ------------------------------------------------ planos / funil de orçamentos

@bp.route("/orcamentos")
@role_required("dentista", "recepcao")
def plans():
    status = request.args.get("status", "")
    q = TreatmentPlan.query
    if current_user.role == "dentista" and current_user.dentist_id:
        q = q.filter_by(dentist_id=current_user.dentist_id)
    all_plans = q.order_by(TreatmentPlan.created_at.desc()).all()
    rows = [p for p in all_plans if not status or p.status == status]
    return render_template("clinical/plans.html", plans=rows, statuses=PLAN_STATUSES,
                           totals=plan_totals(all_plans), status=status)


@bp.route("/paciente/<int:id>/plano/novo", methods=["POST"])
@role_required("dentista")
def new_plan(id):
    p = _patient(id)
    dentist = _default_dentist()
    if dentist is None:
        flash("Cadastre um profissional antes de montar o plano.", "danger")
        return redirect(url_for("patients.detail", id=p.id))
    plan = TreatmentPlan(patient=p, dentist=dentist,
                         title=(request.form.get("titulo") or "").strip() or "Plano de tratamento",
                         valid_until=date.today() + timedelta(days=30))
    db.session.add(plan)
    db.session.flush()

    # Puxa do odontograma o que está marcado como pendente
    if request.form.get("do_odontograma"):
        catalog = {s.name: s for s in Service.query.filter_by(active=True).all()}
        for sug in suggestions_from_chart(p.id):
            svc = catalog.get(sug["procedure"]) or catalog.get("Avaliação inicial")
            if svc is None:
                continue
            price = dentist.price_for(svc) or svc.price or Decimal("0")
            db.session.add(TreatmentItem(plan=plan, service=svc, tooth=sug["tooth"],
                                         faces=sug["faces"] or None, price=price))
    log("criou", "Orçamento", entity_id=plan.id, patient_id=p.id, detail=plan.title)
    db.session.commit()
    flash("Plano criado. Agora ajuste os procedimentos e os valores.", "success")
    return redirect(url_for("clinical.plan_detail", id=plan.id))


def _plan(id: int) -> TreatmentPlan:
    plan = db.get_or_404(TreatmentPlan, id)
    if current_user.role == "dentista" and current_user.dentist_id not in (None, plan.dentist_id):
        abort(403)
    return plan


@bp.route("/plano/<int:id>")
@role_required("dentista", "recepcao")
def plan_detail(id):
    plan = _plan(id)
    services = Service.query.filter_by(active=True).order_by(Service.name).all()
    return render_template("clinical/plan_detail.html", plan=plan, services=services, faces=FACES,
                           teeth=ALL_TEETH, methods=METHODS, statuses=PLAN_STATUSES,
                           can_edit=current_user.role in ("admin", "dentista"))


@bp.route("/plano/<int:id>/item", methods=["POST"])
@role_required("dentista")
def add_item(id):
    plan = _plan(id)
    svc = db.session.get(Service, request.form.get("servico", type=int) or 0)
    if svc is None:
        flash("Escolha um procedimento.", "danger")
        return redirect(url_for("clinical.plan_detail", id=plan.id))
    price = parse_money(request.form.get("valor"))
    if price is None:
        price = plan.dentist.price_for(svc) or svc.price or Decimal("0")
    tooth = request.form.get("dente", type=int)
    faces = "".join(f for f in request.form.getlist("face") if f in FACES) or None
    db.session.add(TreatmentItem(plan=plan, service=svc, tooth=tooth if tooth in ALL_TEETH else None,
                                 faces=faces, phase=request.form.get("etapa", type=int) or 1,
                                 price=price, discount=parse_money(request.form.get("desconto")) or Decimal("0")))
    log("alterou", "Orçamento", entity_id=plan.id, patient_id=plan.patient_id,
        detail=f"Item adicionado: {svc.name}")
    db.session.commit()
    flash("Procedimento adicionado ao plano.", "success")
    return redirect(url_for("clinical.plan_detail", id=plan.id))


@bp.route("/plano/<int:id>/item/<int:item_id>/remover", methods=["POST"])
@role_required("dentista")
def remove_item(id, item_id):
    plan = _plan(id)
    item = db.get_or_404(TreatmentItem, item_id)
    if item.plan_id != plan.id:
        abort(404)
    item.status = "removido"       # não apaga: o orçamento assinado tem que continuar íntegro
    log("alterou", "Orçamento", entity_id=plan.id, patient_id=plan.patient_id,
        detail=f"Item removido: {item.service.name}")
    db.session.commit()
    flash("Procedimento retirado do plano.", "success")
    return redirect(url_for("clinical.plan_detail", id=plan.id))


@bp.route("/plano/<int:id>/item/<int:item_id>/executar", methods=["POST"])
@role_required("dentista")
def do_item(id, item_id):
    plan = _plan(id)
    item = db.get_or_404(TreatmentItem, item_id)
    if item.plan_id != plan.id:
        abort(404)
    mark_item_done(item)
    if item.tooth:
        # O dente passa da condição pendente para a resolvida, mantendo o histórico
        resolved = {"cariado": "restaurado", "a_restaurar": "restaurado",
                    "canal_indicado": "canal", "a_extrair": "extraido"}
        chart = current_chart(plan.patient_id).get(item.tooth, {"dente": None, "faces": {}})
        for face in (list(item.faces) if item.faces else [None]):
            before = chart["faces"].get(face) if face else chart["dente"]
            condition = resolved.get(before.condition if before else "", "restaurado")
            db.session.add(ToothState(patient_id=plan.patient_id, tooth=item.tooth, face=face,
                                      condition=condition,
                                      note=f"Executado: {item.service.name}", author_id=current_user.id,
                                      treatment_item_id=item.id))
    log("alterou", "Plano de tratamento", entity_id=plan.id, patient_id=plan.patient_id,
        detail=f"Executado: {item.service.name}")
    db.session.commit()
    flash("Procedimento marcado como executado e o odontograma foi atualizado.", "success")
    return redirect(url_for("clinical.plan_detail", id=plan.id))


@bp.route("/plano/<int:id>/decidir", methods=["POST"])
@role_required("dentista", "recepcao")
def plan_decide(id):
    plan = _plan(id)
    approved = request.form.get("decisao") == "aprovar"
    try:
        first = date.fromisoformat(request.form.get("primeiro_vencimento", ""))
    except ValueError:
        first = date.today()
    created = decide(plan, approved,
                     installments=max(1, request.form.get("parcelas", type=int) or 1),
                     first_due=first,
                     down_payment=parse_money(request.form.get("entrada")),
                     method=request.form.get("forma") if request.form.get("forma") in METHODS else "pix")
    db.session.commit()
    if approved:
        flash(f"Orçamento aprovado. {len(created)} parcela(s) lançada(s) em contas a receber.", "success")
    else:
        flash("Orçamento registrado como recusado.", "success")
    return redirect(url_for("clinical.plan_detail", id=plan.id))


@bp.route("/plano/<int:id>/imprimir")
@role_required("dentista", "recepcao")
def plan_print(id):
    plan = _plan(id)
    log("exportou", "Orçamento", entity_id=plan.id, patient_id=plan.patient_id, detail="Impressão do orçamento")
    db.session.commit()
    return render_template("clinical/plan_print.html", plan=plan, today=date.today())


@bp.route("/plano/<int:id>/termo", methods=["GET", "POST"])
@role_required("dentista", "recepcao")
def consent(id):
    plan = _plan(id)
    if request.method == "POST":
        name = (request.form.get("nome") or "").strip()
        png = request.form.get("assinatura") or ""
        if len(name) < 3 or not png.startswith("data:image/png"):
            flash("Assine no quadro e confirme o nome completo.", "danger")
            return redirect(url_for("clinical.consent", id=plan.id))
        plan.signed_at = datetime.now()
        plan.signed_name = name
        plan.signed_ip = request.remote_addr
        plan.signature_png = png[:400000]
        log("assinou", "Termo de consentimento", entity_id=plan.id, patient_id=plan.patient_id,
            detail=f"Assinado por {name}")
        db.session.commit()
        flash("Termo assinado e guardado no prontuário.", "success")
        return redirect(url_for("clinical.plan_detail", id=plan.id))
    return render_template("clinical/consent.html", plan=plan, today=date.today())
