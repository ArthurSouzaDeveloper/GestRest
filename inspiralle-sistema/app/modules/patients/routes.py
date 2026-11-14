import secrets
from datetime import date, datetime

from flask import Blueprint, abort, current_app, flash, redirect, render_template, request, send_from_directory, session, url_for
from flask_login import current_user, login_required
from sqlalchemy import or_

from app.extensions import db
from app.models import ClinicalNote, NoteImage, Patient, only_digits
from app.modules.auth.decorators import role_required
from app.services.uploads import UploadError, delete_file, save_image, upload_dir

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
    # Senha provisória do portal: mostrada uma única vez, logo após ser gerada
    portal_temp = session.pop("portal_temp", None)
    if portal_temp and portal_temp.get("pid") != p.id:
        portal_temp = None
    return render_template("patients/detail.html", p=p, upcoming=upcoming, history=history, stats=stats,
                           portal_temp=portal_temp, portal_login=_portal_login_hint(p),
                           max_images=current_app.config["MAX_IMAGES_PER_NOTE"])


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
    back = url_for("patients.detail", id=id) + "#prontuario"
    text = request.form.get("texto", "").strip()
    if not text:
        flash("Escreva a evolução antes de salvar.", "danger")
        return redirect(back)
    note = ClinicalNote(
        patient=p, author_id=current_user.id, text=text,
        procedure=request.form.get("procedimento") or None,
        tooth=request.form.get("dente") or None,
        appointment_id=request.form.get("consulta", type=int),
        visible_to_patient=bool(request.form.get("visivel")),
    )
    db.session.add(note)
    errors = _attach_images(note)
    db.session.commit()
    for e in errors:
        flash(e, "danger")
    n = len(note.images)
    flash("Evolução registrada no prontuário" + (f" com {n} imagem(ns)." if n else "."), "success")
    return redirect(back)


@bp.route("/<int:id>/evolucao/<int:note_id>/imagens", methods=["POST"])
@role_required("dentista")
def add_images(id, note_id):
    note = _get_note(id, note_id)
    errors = _attach_images(note)
    db.session.commit()
    for e in errors:
        flash(e, "danger")
    if not errors:
        flash("Imagens adicionadas à evolução.", "success")
    return redirect(url_for("patients.detail", id=id) + f"#nota-{note.id}")


@bp.route("/<int:id>/evolucao/<int:note_id>/visibilidade", methods=["POST"])
@role_required("dentista")
def toggle_visibility(id, note_id):
    note = _get_note(id, note_id)
    note.visible_to_patient = not note.visible_to_patient
    db.session.commit()
    flash("Evolução agora aparece no portal do paciente." if note.visible_to_patient
          else "Evolução escondida do portal do paciente (fica só para a equipe).", "success")
    return redirect(url_for("patients.detail", id=id) + f"#nota-{note.id}")


@bp.route("/imagem/<int:img_id>")
@login_required
def image(img_id):
    img = db.get_or_404(NoteImage, img_id)
    return send_from_directory(upload_dir(), img.filename, max_age=3600)


@bp.route("/imagem/<int:img_id>/excluir", methods=["POST"])
@role_required("dentista")
def delete_image(img_id):
    img = db.get_or_404(NoteImage, img_id)
    pid, nid = img.note.patient_id, img.note_id
    delete_file(img.filename)
    db.session.delete(img)
    db.session.commit()
    flash("Imagem removida.", "success")
    return redirect(url_for("patients.detail", id=pid) + f"#nota-{nid}")


@bp.route("/<int:id>/portal", methods=["POST"])
@role_required("recepcao")
def portal_access(id):
    """Gera (ou refaz) a senha provisória do portal do paciente."""
    p = _get(id)
    if not p.cpf and not p.phone:
        flash("Cadastre CPF ou telefone antes de liberar o portal.", "danger")
        return redirect(url_for("patients.detail", id=id))
    pwd = f"{secrets.randbelow(10**6):06d}"
    p.set_portal_password(pwd, temporary=True)
    db.session.commit()
    session["portal_temp"] = {"pid": p.id, "pwd": pwd}
    flash("Acesso ao portal liberado. Envie a senha provisória ao paciente.", "success")
    return redirect(url_for("patients.detail", id=id) + "#portal")


@bp.route("/<int:id>/portal/revogar", methods=["POST"])
@role_required("recepcao")
def portal_revoke(id):
    p = _get(id)
    p.portal_password_hash = None
    db.session.commit()
    flash("Acesso ao portal removido.", "success")
    return redirect(url_for("patients.detail", id=id) + "#portal")


def _get_note(pid, note_id) -> ClinicalNote:
    _get(pid)
    note = db.session.get(ClinicalNote, note_id)
    if not note or note.patient_id != pid:
        abort(404)
    return note


def _attach_images(note: ClinicalNote) -> list[str]:
    files = [f for f in request.files.getlist("imagens") if f and f.filename]
    limit = current_app.config["MAX_IMAGES_PER_NOTE"]
    errors = []
    room = limit - len(note.images)
    if len(files) > room:
        errors.append(f"Cada evolução aceita até {limit} imagens; as excedentes não foram salvas.")
        files = files[:max(room, 0)]
    caption = (request.form.get("legenda") or "").strip() or None
    for f in files:
        try:
            name, original = save_image(f)
        except UploadError as e:
            errors.append(str(e))
            continue
        note.images.append(NoteImage(filename=name, original_name=original, caption=caption))
    return errors


def _portal_login_hint(p: Patient) -> str:
    if p.cpf:
        return f"CPF {p.cpf[:3]}.{p.cpf[3:6]}.{p.cpf[6:9]}-{p.cpf[9:]}" if len(p.cpf) == 11 else f"CPF {p.cpf}"
    return f"telefone {p.phone_fmt}"


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
