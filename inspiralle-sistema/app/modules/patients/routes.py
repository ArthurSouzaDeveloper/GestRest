from datetime import date, datetime

from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required
from sqlalchemy import or_

from app.extensions import db
from app.models import ClinicalNote, Patient, only_digits
from app.modules.auth.decorators import role_required

bp = Blueprint("patients", __name__)

FIELDS = ["name", "email", "cpf", "address", "allergies", "medications", "health_notes", "notes"]


@bp.route("/")
@login_required
def index():
    q = request.args.get("q", "").strip()
    origem = request.args.get("origem", "")
    query = Patient.query_active()
    if q:
        digits = only_digits(q)
        conds = [Patient.name.ilike(f"%{q}%")]
        if digits:
            conds += [Patient.phone.contains(digits), Patient.cpf.contains(digits)]
        query = query.filter(or_(*conds))
    if origem in ("site", "recepcao"):
        query = query.filter(Patient.origin == origem)
    patients = query.order_by(Patient.name).all()
    return render_template("patients/index.html", patients=patients, q=q, origem=origem)


@bp.route("/novo", methods=["GET", "POST"])
@role_required("recepcao")
def create():
    if request.method == "POST":
        p = Patient(origin="recepcao")
        if _fill(p):
            db.session.add(p)
            db.session.commit()
            flash("Paciente cadastrado.", "success")
            return redirect(url_for("patients.detail", id=p.id))
    return render_template("patients/form.html", p=None)


@bp.route("/<int:id>")
@login_required
def detail(id):
    p = _get(id)
    now = datetime.now()
    upcoming = sorted([a for a in p.appointments if a.start >= now and a.status != "cancelado"], key=lambda a: a.start)
    history = [a for a in p.appointments if a.start < now or a.status == "cancelado"]
    stats = {
        "consultas": sum(1 for a in p.appointments if a.status == "concluido"),
        "faltas": sum(1 for a in p.appointments if a.status == "faltou"),
        "ultima": next((a.start for a in history if a.status == "concluido"), None),
    }
    return render_template("patients/detail.html", p=p, upcoming=upcoming, history=history, stats=stats)


@bp.route("/<int:id>/editar", methods=["GET", "POST"])
@role_required("recepcao")
def edit(id):
    p = _get(id)
    if request.method == "POST" and _fill(p):
        db.session.commit()
        flash("Dados do paciente atualizados.", "success")
        return redirect(url_for("patients.detail", id=p.id))
    return render_template("patients/form.html", p=p)


@bp.route("/<int:id>/excluir", methods=["POST"])
@role_required("admin")
def delete(id):
    p = _get(id)
    p.deleted_at = datetime.now()
    db.session.commit()
    flash("Paciente arquivado. O prontuário continua guardado no banco.", "success")
    return redirect(url_for("patients.index"))


@bp.route("/<int:id>/evolucao", methods=["POST"])
@role_required("dentista")
def add_note(id):
    p = _get(id)
    text = request.form.get("texto", "").strip()
    if not text:
        flash("Escreva a evolução antes de salvar.", "danger")
        return redirect(url_for("patients.detail", id=id) + "#prontuario")
    db.session.add(ClinicalNote(
        patient=p, author_id=current_user.id, text=text,
        procedure=request.form.get("procedimento") or None,
        tooth=request.form.get("dente") or None,
        appointment_id=request.form.get("consulta", type=int),
    ))
    db.session.commit()
    flash("Evolução registrada no prontuário.", "success")
    return redirect(url_for("patients.detail", id=id) + "#prontuario")


def _get(id) -> Patient:
    return Patient.query_active().filter_by(id=id).first_or_404()


def _fill(p: Patient) -> bool:
    f = request.form
    phone = only_digits(f.get("phone"))
    if len((f.get("name") or "").strip()) < 3 or len(phone) not in (10, 11):
        flash("Nome e telefone com DDD são obrigatórios.", "danger")
        return False
    dup = Patient.query_active().filter(Patient.phone == phone, Patient.id != (p.id or 0)).first()
    if dup:
        flash(f"Já existe um paciente com esse telefone: {dup.name}.", "danger")
        return False
    for k in FIELDS:
        setattr(p, k, (f.get(k) or "").strip() or None)
    p.phone = phone
    p.cpf = only_digits(p.cpf) or None
    try:
        p.birth_date = date.fromisoformat(f["birth_date"]) if f.get("birth_date") else None
    except ValueError:
        p.birth_date = None
    return True
