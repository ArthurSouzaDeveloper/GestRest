from datetime import date, datetime, timedelta

from flask import Blueprint, abort, flash, jsonify, redirect, render_template, request, url_for
from flask_login import current_user, login_required

from app.extensions import db
from app.models import STATUSES, Appointment, Dentist, Patient, Service, only_digits
from app.modules.auth.decorators import role_required
from app.services.availability import BookingError, business_windows, free_slots, validate_booking

bp = Blueprint("scheduling", __name__)

GRID_START = 8 * 60 + 30   # 08:30
GRID_END = 19 * 60 + 30    # 19:30


def _day_arg() -> date:
    try:
        return date.fromisoformat(request.args.get("data", ""))
    except ValueError:
        return date.today()


@bp.route("/")
@login_required
def day_view():
    day = _day_arg()
    dentists = Dentist.query.filter_by(active=True).order_by(Dentist.id).all()
    if current_user.role == "dentista" and current_user.dentist_id and request.args.get("todos") != "1":
        dentists = [d for d in dentists if d.id == current_user.dentist_id]

    ds = datetime.combine(day, datetime.min.time())
    appts = (Appointment.query
             .filter(Appointment.start >= ds, Appointment.start < ds + timedelta(days=1),
                     Appointment.status != "cancelado")
             .order_by(Appointment.start).all())
    by_dentist = {d.id: [] for d in dentists}
    for a in appts:
        if a.dentist_id in by_dentist:
            mins = a.start.hour * 60 + a.start.minute
            by_dentist[a.dentist_id].append({
                "a": a,
                "top": mins - GRID_START,
                "height": max(a.duration_min, 25),
            })

    hours = [f"{m // 60:02d}:{m % 60:02d}" for m in range(GRID_START, GRID_END, 30)]
    closed = not business_windows(day)
    return render_template("scheduling/day.html", day=day, dentists=dentists, by_dentist=by_dentist,
                           hours=hours, grid_height=GRID_END - GRID_START, appts=appts, closed=closed,
                           prev_day=day - timedelta(days=1), next_day=day + timedelta(days=1),
                           grid_start=GRID_START)


@bp.route("/novo", methods=["GET", "POST"])
@role_required("recepcao")
def create():
    return _form(None)


@bp.route("/<int:id>/editar", methods=["GET", "POST"])
@role_required("recepcao")
def edit(id):
    return _form(db.get_or_404(Appointment, id))


def _form(appt: Appointment | None):
    services = Service.query.filter_by(active=True).order_by(Service.name).all()
    dentists = Dentist.query.filter_by(active=True).order_by(Dentist.name).all()
    patients = Patient.query_active().order_by(Patient.name).all()

    if request.method == "POST":
        f = request.form
        try:
            service = db.session.get(Service, int(f.get("servico") or 0))
            dentist = db.session.get(Dentist, int(f.get("dentista") or 0))
            start = datetime.fromisoformat(f"{f.get('data')}T{f.get('hora')}")
        except ValueError:
            flash("Preencha serviço, profissional, data e horário.", "danger")
            return redirect(request.url)

        patient = None
        if f.get("paciente"):
            patient = Patient.query_active().filter_by(id=int(f["paciente"])).first()
        elif f.get("novo_nome") and only_digits(f.get("novo_telefone")):
            patient = Patient(name=f["novo_nome"].strip(), phone=only_digits(f["novo_telefone"]))
            db.session.add(patient)
        if not patient:
            flash("Selecione um paciente ou cadastre um novo (nome e telefone).", "danger")
            return redirect(request.url)

        try:
            end = validate_booking(dentist, service, start, online=False, ignore_id=appt.id if appt else None)
        except BookingError as e:
            db.session.rollback()
            flash(str(e), "danger")
            return redirect(request.url)

        if appt is None:
            appt = Appointment(origin="recepcao", status="confirmado")
            db.session.add(appt)
        appt.patient, appt.dentist, appt.service = patient, dentist, service
        appt.start, appt.end = start, end
        appt.notes = f.get("observacoes") or None
        db.session.commit()
        flash("Consulta salva na agenda.", "success")
        return redirect(url_for("scheduling.day_view", data=start.date().isoformat()))

    prefill = {
        "data": request.args.get("data", date.today().isoformat()),
        "hora": request.args.get("hora", ""),
        "dentista": request.args.get("dentista", type=int),
        "paciente": request.args.get("paciente", type=int),
    }
    if appt:
        prefill = {"data": appt.start.date().isoformat(), "hora": appt.start.strftime("%H:%M"),
                   "dentista": appt.dentist_id, "paciente": appt.patient_id}
    return render_template("scheduling/form.html", appt=appt, services=services, dentists=dentists,
                           patients=patients, prefill=prefill)


@bp.route("/horarios-livres")
@login_required
def free_slots_json():
    """Usado pelo formulário da recepção para sugerir horários livres."""
    service = db.session.get(Service, request.args.get("servico", type=int) or 0)
    dentist = db.session.get(Dentist, request.args.get("dentista", type=int) or 0)
    try:
        day = date.fromisoformat(request.args.get("data", ""))
    except ValueError:
        return jsonify({"success": False, "error": "Data inválida."}), 400
    if not service or not dentist:
        return jsonify({"success": True, "data": []})
    return jsonify({"success": True, "data": [s.strftime("%H:%M") for s in free_slots(dentist, service, day, online=False)]})


@bp.route("/<int:id>")
@login_required
def detail(id):
    appt = db.get_or_404(Appointment, id)
    return render_template("scheduling/detail.html", appt=appt, statuses=STATUSES)


@bp.route("/<int:id>/status", methods=["POST"])
@login_required
def set_status(id):
    appt = db.get_or_404(Appointment, id)
    status = request.form.get("status")
    if status not in STATUSES:
        abort(400)
    if status in ("agendado", "confirmado") and appt.status == "cancelado":
        try:
            validate_booking(appt.dentist, appt.service, appt.start, online=False, ignore_id=appt.id)
        except BookingError as e:
            flash(str(e), "danger")
            return redirect(request.referrer or url_for("scheduling.detail", id=id))
    appt.status = status
    db.session.commit()
    flash(f"Consulta marcada como “{appt.status_label}”.", "success")
    return redirect(request.referrer or url_for("scheduling.detail", id=id))
