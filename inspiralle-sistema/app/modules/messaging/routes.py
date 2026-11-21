"""Fila de mensagens de WhatsApp, lista de espera e regras de recall."""
from datetime import date, datetime

from flask import Blueprint, flash, redirect, render_template, request, url_for

from app.extensions import db
from app.models import (Appointment, Dentist, KINDS, MESSAGE_STATUSES, Message, Patient, RecallRule,
                        Service, WaitlistEntry)
from app.modules.auth.decorators import role_required
from app.services import messaging as svc
from app.services.availability import free_slots

bp = Blueprint("messaging", __name__)


@bp.route("/")
@role_required("recepcao", "dentista")
def index():
    kind = request.args.get("tipo", "")
    q = Message.query
    if kind in KINDS:
        q = q.filter_by(kind=kind)
    total = q.count()
    rows = q.order_by(Message.status == "enviada", Message.scheduled_for.desc()).limit(25).all()
    counters = {k: Message.query.filter_by(kind=k).count() for k in KINDS}
    queued = Message.query.filter_by(status="fila").count()
    confirmed = Message.query.filter_by(kind="confirmacao", status="confirmada").count()
    answered = Message.query.filter(Message.kind == "confirmacao",
                                    Message.status.in_(("confirmada", "remarcar"))).count()
    return render_template("messaging/index.html", rows=rows, kinds=KINDS, statuses=MESSAGE_STATUSES,
                           kind=kind, counters=counters, queued=queued, confirmed=confirmed,
                           answered=answered, cost=svc.month_cost(), today=date.today(), total=total)


@bp.route("/gerar", methods=["POST"])
@role_required("recepcao")
def generate():
    """Monta a fila do dia: confirmações, lembretes, cobrança e recall."""
    created = 0
    for a in Appointment.query.filter(Appointment.start > datetime.now(),
                                      Appointment.status.in_(("agendado", "confirmado"))).all():
        created += len(svc.enqueue_appointment(a))
    created += len(svc.enqueue_dunning())
    created += len(svc.enqueue_recalls())
    db.session.commit()
    flash(f"{created} mensagem(ns) na fila. Nada sai sem a clínica revisar.", "success")
    return redirect(url_for("messaging.index"))


@bp.route("/enviar", methods=["POST"])
@role_required("recepcao")
def send():
    n = svc.send_due()
    db.session.commit()
    flash(f"{n} mensagem(ns) enviada(s).", "success")
    return redirect(url_for("messaging.index"))


@bp.route("/<int:id>/status", methods=["POST"])
@role_required("recepcao")
def set_status(id):
    m = db.get_or_404(Message, id)
    status = request.form.get("status", "")
    if status not in MESSAGE_STATUSES:
        flash("Status inválido.", "danger")
        return redirect(url_for("messaging.index"))
    m.status = status
    m.answered_at = datetime.now() if status in ("confirmada", "remarcar", "respondida") else None
    if status == "confirmada" and m.appointment and m.appointment.status == "agendado":
        m.appointment.status = "confirmado"
    db.session.commit()
    flash("Resposta registrada.", "success")
    return redirect(request.referrer or url_for("messaging.index"))


# ---------------------------------------------------------------- lista de espera

@bp.route("/espera", methods=["GET", "POST"])
@role_required("recepcao", "dentista")
def waitlist():
    if request.method == "POST":
        pid = request.form.get("paciente", type=int)
        patient = db.session.get(Patient, pid or 0)
        if patient is None:
            flash("Escolha um paciente.", "danger")
            return redirect(url_for("messaging.waitlist"))
        db.session.add(WaitlistEntry(patient=patient,
                                     service_id=request.form.get("servico", type=int) or None,
                                     dentist_id=request.form.get("dentista", type=int) or None,
                                     preference=request.form.get("preferencia", "qualquer"),
                                     note=(request.form.get("obs") or "").strip() or None))
        db.session.commit()
        flash(f"{patient.name} entrou na lista de espera.", "success")
        return redirect(url_for("messaging.waitlist"))

    try:
        day = date.fromisoformat(request.args.get("dia", ""))
    except ValueError:
        day = date.today()
    rows = WaitlistEntry.query.filter_by(active=True).order_by(WaitlistEntry.created_at).all()

    # Horários vagos do dia, para sugerir o encaixe
    openings = []
    for d in Dentist.query.filter_by(active=True).all():
        if day.weekday() not in d.weekday_set:
            continue
        svc_default = d.services[0] if d.services else None
        if svc_default is None:
            continue
        for slot in free_slots(d, svc_default, day, online=False):
            openings.append(slot)
    openings = sorted(set(openings))[:12]
    matches = svc.openings_for_waitlist(day, openings)
    return render_template("messaging/waitlist.html", rows=rows, day=day, openings=openings,
                           matches=matches, patients=Patient.query_active().order_by(Patient.name).limit(300).all(),
                           services=Service.query.filter_by(active=True).order_by(Service.name).all(),
                           dentists=Dentist.query.filter_by(active=True).order_by(Dentist.name).all(),
                           texts={w.id: svc.waitlist_text(w, s) for w, s in matches})


@bp.route("/espera/<int:id>/chamar", methods=["POST"])
@role_required("recepcao")
def call_waitlist(id):
    w = db.get_or_404(WaitlistEntry, id)
    w.called_at = datetime.now()
    db.session.add(Message(patient_id=w.patient_id, kind="confirmacao", scheduled_for=datetime.now(),
                           body=(request.form.get("texto") or "").strip()
                           or f"{w.patient.name}, abriu um horário aqui na clínica. Quer o encaixe?"))
    db.session.commit()
    flash(f"{w.patient.name} foi chamado para o encaixe.", "success")
    return redirect(url_for("messaging.waitlist"))


@bp.route("/espera/<int:id>/sair", methods=["POST"])
@role_required("recepcao")
def leave_waitlist(id):
    w = db.get_or_404(WaitlistEntry, id)
    w.active = False
    w.scheduled_at = datetime.now()
    db.session.commit()
    flash("Paciente saiu da lista de espera.", "success")
    return redirect(url_for("messaging.waitlist"))


# ------------------------------------------------------------------------ recall

@bp.route("/recall", methods=["GET", "POST"])
@role_required("recepcao", "dentista")
def recall():
    services = Service.query.filter_by(active=True).order_by(Service.name).all()
    if request.method == "POST":
        for s in services:
            months = request.form.get(f"meses_{s.id}", type=int)
            rule = RecallRule.query.filter_by(service_id=s.id).first()
            active = bool(request.form.get(f"ativo_{s.id}"))
            if months and months > 0:
                if rule is None:
                    rule = RecallRule(service_id=s.id)
                    db.session.add(rule)
                rule.months = months
                rule.active = active
            elif rule is not None:
                db.session.delete(rule)
        db.session.commit()
        flash("Regras de retorno salvas.", "success")
        return redirect(url_for("messaging.recall"))
    rules = {r.service_id: r for r in RecallRule.query.all()}
    pending = Message.query.filter_by(kind="recall").order_by(Message.created_at.desc()).limit(30).all()
    return render_template("messaging/recall.html", services=services, rules=rules, pending=pending)
