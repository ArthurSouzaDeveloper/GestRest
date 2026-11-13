"""API pública usada pelo agendamento online da landing page.

Somente leitura de catálogo/horários + criação de agendamento. Não expõe
nenhum dado de paciente.
"""
from datetime import date, datetime, timedelta

from flask import Blueprint, current_app, jsonify, request

from app.extensions import db
from app.models import Appointment, Dentist, Patient, Service, only_digits
from app.services.availability import BookingError, free_slots, validate_booking

bp = Blueprint("public_api", __name__)


def _err(msg, code=400):
    return jsonify({"success": False, "error": msg}), code


@bp.after_request
def _cors(resp):
    # Permite que a landing seja hospedada em outro domínio.
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp


@bp.route("/servicos")
def services():
    rows = Service.query.filter_by(active=True, online_booking=True).order_by(Service.id).all()
    return jsonify({"success": True, "data": [s.to_public() for s in rows if any(d.active for d in s.dentists)]})


@bp.route("/dentistas")
def dentists():
    service = db.session.get(Service, request.args.get("servico", type=int) or 0)
    if not service:
        return _err("Serviço não encontrado.", 404)
    return jsonify({"success": True, "data": [d.to_public() for d in service.dentists if d.active]})


@bp.route("/dias")
def days():
    """Próximos dias com pelo menos um horário livre."""
    service = db.session.get(Service, request.args.get("servico", type=int) or 0)
    if not service:
        return _err("Serviço não encontrado.", 404)
    dentists = _dentists_for(service, request.args.get("dentista", type=int))
    out = []
    for i in range(current_app.config["BOOKING_DAYS_AHEAD"] + 1):
        d = date.today() + timedelta(days=i)
        total = sum(len(free_slots(den, service, d)) for den in dentists)
        if total:
            out.append({"data": d.isoformat(), "livres": total})
    return jsonify({"success": True, "data": out})


@bp.route("/horarios")
def slots():
    service = db.session.get(Service, request.args.get("servico", type=int) or 0)
    try:
        day = date.fromisoformat(request.args.get("data", ""))
    except ValueError:
        return _err("Data inválida.")
    if not service:
        return _err("Serviço não encontrado.", 404)

    by_time: dict[str, list[int]] = {}
    for den in _dentists_for(service, request.args.get("dentista", type=int)):
        for s in free_slots(den, service, day):
            by_time.setdefault(s.strftime("%H:%M"), []).append(den.id)
    data = [{"hora": h, "dentistas": ids} for h, ids in sorted(by_time.items())]
    return jsonify({"success": True, "data": data})


@bp.route("/agendamentos", methods=["POST", "OPTIONS"])
def create_booking():
    if request.method == "OPTIONS":
        return "", 204
    p = request.get_json(silent=True) or {}

    if p.get("website"):  # honeypot anti-robô
        return _err("Requisição inválida.")

    nome = (p.get("nome") or "").strip()
    telefone = only_digits(p.get("telefone"))
    email = (p.get("email") or "").strip().lower() or None
    if len(nome.split()) < 2:
        return _err("Informe nome e sobrenome.")
    if len(telefone) not in (10, 11):
        return _err("Informe um WhatsApp válido com DDD.")
    if not p.get("aceite"):
        return _err("É preciso aceitar o uso dos dados para o agendamento.")

    service = db.session.get(Service, int(p.get("servico") or 0))
    dentist = db.session.get(Dentist, int(p.get("dentista") or 0))
    try:
        start = datetime.fromisoformat(f"{p.get('data')}T{p.get('hora')}")
    except (TypeError, ValueError):
        return _err("Horário inválido.")

    try:
        end = validate_booking(dentist, service, start, online=True)
    except BookingError as e:
        return _err(str(e), 409)

    # Paciente: reaproveita a ficha pelo telefone (mesmo banco do painel)
    patient = Patient.query_active().filter_by(phone=telefone).first()
    if not patient:
        patient = Patient(name=nome, phone=telefone, email=email, origin="site")
        db.session.add(patient)
    elif email and not patient.email:
        patient.email = email

    appt = Appointment(
        patient=patient, dentist=dentist, service=service, start=start, end=end,
        status="agendado", origin="site", notes=(p.get("observacoes") or "").strip()[:500] or None,
    )
    db.session.add(appt)
    db.session.commit()
    current_app.logger.info("Agendamento online %s criado para %s", appt.code, start)

    return jsonify({"success": True, "data": {
        "codigo": appt.code,
        "servico": service.name,
        "dentista": dentist.name,
        "inicio": start.isoformat(timespec="minutes"),
        "whatsapp": current_app.config["CLINIC_WHATSAPP"],
    }}), 201


def _dentists_for(service: Service, dentist_id: int | None) -> list[Dentist]:
    ds = [d for d in service.dentists if d.active]
    if dentist_id:
        ds = [d for d in ds if d.id == dentist_id]
    return ds
