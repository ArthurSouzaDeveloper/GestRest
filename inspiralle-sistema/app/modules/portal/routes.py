"""Portal do paciente: acesso separado do painel da clínica.

O paciente entra com CPF (ou telefone) e senha e vê somente os próprios
dados: evolução do tratamento liberada pela equipe (texto + imagens) e as
próximas consultas. Somente leitura, exceto a troca da própria senha.
Nenhum dado financeiro é carregado aqui.
"""
import time
from datetime import datetime
from functools import wraps

from flask import Blueprint, abort, flash, g, redirect, render_template, request, send_from_directory, session, url_for

from app.extensions import db
from app.models import Appointment, ClinicalNote, NoteImage, Patient, only_digits
from app.services.uploads import upload_dir

bp = Blueprint("portal", __name__)

SESSION_KEY = "portal_pid"
MAX_ATTEMPTS = 5
LOCK_SECONDS = 5 * 60


def patient_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        pid = session.get(SESSION_KEY)
        p = Patient.query_active().filter_by(id=pid).first() if pid else None
        if not p or not p.portal_enabled:
            session.pop(SESSION_KEY, None)
            return redirect(url_for("portal.login"))
        g.patient = p
        if p.portal_must_change and request.endpoint not in ("portal.password", "portal.logout"):
            return redirect(url_for("portal.password"))
        return view(*args, **kwargs)
    return wrapped


def _find_candidates(login: str) -> list[Patient]:
    digits = only_digits(login)
    if len(digits) not in (10, 11):
        return []
    q = Patient.query_active().filter(Patient.portal_password_hash.isnot(None))
    return q.filter((Patient.cpf == digits) | (Patient.phone == digits)).all()


@bp.route("/")
def home():
    return redirect(url_for("portal.timeline") if session.get(SESSION_KEY) else url_for("portal.login"))


@bp.route("/entrar", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        locked_until = session.get("portal_lock", 0)
        if locked_until > time.time():
            flash("Muitas tentativas. Aguarde alguns minutos e tente de novo.", "danger")
            return render_template("portal/login.html"), 429
        pwd = request.form.get("senha", "")
        patient = next((p for p in _find_candidates(request.form.get("login", "")) if p.check_portal_password(pwd)), None)
        if patient:
            session.pop("portal_attempts", None)
            session.pop("portal_lock", None)
            session[SESSION_KEY] = patient.id
            session.permanent = True
            patient.portal_last_login = datetime.now()
            db.session.commit()
            return redirect(url_for("portal.timeline"))
        attempts = session.get("portal_attempts", 0) + 1
        session["portal_attempts"] = attempts
        if attempts >= MAX_ATTEMPTS:
            session["portal_lock"] = time.time() + LOCK_SECONDS
            session["portal_attempts"] = 0
        flash("CPF/telefone ou senha incorretos.", "danger")
    return render_template("portal/login.html")


@bp.route("/sair")
def logout():
    session.pop(SESSION_KEY, None)
    flash("Você saiu da sua área.", "success")
    return redirect(url_for("portal.login"))


@bp.route("/inicio")
@patient_required
def timeline():
    p = g.patient
    notes = (ClinicalNote.query
             .filter_by(patient_id=p.id, visible_to_patient=True)
             .order_by(ClinicalNote.created_at.desc()).all())
    upcoming = (Appointment.query
                .filter(Appointment.patient_id == p.id, Appointment.start >= datetime.now(),
                        Appointment.status.in_(("agendado", "confirmado")))
                .order_by(Appointment.start).all())
    done = Appointment.query.filter_by(patient_id=p.id, status="concluido").count()
    photos = [img for n in notes for img in n.images]
    return render_template("portal/timeline.html", p=p, notes=notes, upcoming=upcoming,
                           done=done, photos=photos)


@bp.route("/imagem/<int:img_id>")
@patient_required
def image(img_id):
    img = db.session.get(NoteImage, img_id)
    # Só entrega imagens do próprio paciente e de evoluções liberadas para ele
    if not img or img.note.patient_id != g.patient.id or not img.note.visible_to_patient:
        abort(404)
    resp = send_from_directory(upload_dir(), img.filename, max_age=3600)
    resp.headers["Cache-Control"] = "private, max-age=3600"
    return resp


@bp.route("/senha", methods=["GET", "POST"])
@patient_required
def password():
    p = g.patient
    if request.method == "POST":
        current, new, confirm = (request.form.get(k, "") for k in ("atual", "nova", "confirma"))
        if not p.check_portal_password(current):
            flash("Senha atual incorreta.", "danger")
        elif len(new) < 6:
            flash("A nova senha precisa ter pelo menos 6 caracteres.", "danger")
        elif new != confirm:
            flash("A confirmação não confere com a nova senha.", "danger")
        elif new == current:
            flash("Escolha uma senha diferente da provisória.", "danger")
        else:
            p.set_portal_password(new, temporary=False)
            db.session.commit()
            flash("Senha atualizada.", "success")
            return redirect(url_for("portal.timeline"))
    return render_template("portal/password.html", p=p)
