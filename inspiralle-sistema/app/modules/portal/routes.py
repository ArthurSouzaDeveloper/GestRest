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


# ------------------------------------------------- anamnese preenchida pelo paciente

ANAMNESIS = [
    ("tratamento_medico", "Está em tratamento médico atualmente?"),
    ("medicamentos", "Toma algum medicamento de uso contínuo?"),
    ("alergia", "Tem alergia a algum medicamento ou material?"),
    ("anestesia", "Já teve reação a anestesia odontológica?"),
    ("sangramento", "Tem problema de coagulação ou sangramento?"),
    ("pressao", "Tem pressão alta?"),
    ("diabetes", "Tem diabetes?"),
    ("cardiaco", "Tem problema cardíaco?"),
    ("gravidez", "Está grávida ou amamentando?"),
    ("fumante", "Fuma?"),
    ("bruxismo", "Range ou aperta os dentes?"),
    ("cirurgia", "Já fez cirurgia odontológica?"),
]


@bp.route("/anamnese", methods=["GET", "POST"])
@patient_required
def anamnesis():
    import json

    p = g.patient
    if request.method == "POST":
        answers = {}
        for key, _label in ANAMNESIS:
            answers[key] = {"resposta": request.form.get(key, "nao"),
                            "detalhe": (request.form.get(f"{key}_detalhe") or "").strip()}
        p.anamnesis_json = json.dumps(answers, ensure_ascii=False)
        p.anamnesis_at = datetime.now()
        # Alimenta o resumo que a equipe vê no prontuário
        p.allergies = answers["alergia"]["detalhe"] or None if answers["alergia"]["resposta"] == "sim" else None
        p.medications = answers["medicamentos"]["detalhe"] or None if answers["medicamentos"]["resposta"] == "sim" else None
        from app.services.audit import log
        log("alterou", "Anamnese", patient_id=p.id, detail="Preenchida pelo paciente no portal",
            actor=p.name)
        db.session.commit()
        flash("Obrigado! Sua ficha de saúde foi enviada para a equipe.", "success")
        return redirect(url_for("portal.timeline"))
    return render_template("portal/anamnesis.html", p=p, questions=ANAMNESIS, saved=p.anamnesis)


# ------------------------------------------- orçamento e termo na área do paciente

@bp.route("/orcamentos")
@patient_required
def plans():
    from app.models import TreatmentPlan
    rows = (TreatmentPlan.query.filter(TreatmentPlan.patient_id == g.patient.id,
                                       TreatmentPlan.status != "recusado")
            .order_by(TreatmentPlan.created_at.desc()).all())
    return render_template("portal/plans.html", p=g.patient, plans=rows)


@bp.route("/orcamento/<int:id>", methods=["GET", "POST"])
@patient_required
def plan(id):
    from app.models import TreatmentPlan
    from app.services.audit import log

    plan = db.session.get(TreatmentPlan, id)
    if plan is None or plan.patient_id != g.patient.id:
        abort(404)
    if request.method == "POST":
        name = (request.form.get("nome") or "").strip()
        png = request.form.get("assinatura") or ""
        if len(name) < 3 or not png.startswith("data:image/png"):
            flash("Escreva seu nome completo e assine no quadro.", "danger")
            return redirect(url_for("portal.plan", id=plan.id))
        plan.signed_at = datetime.now()
        plan.signed_name = name
        plan.signed_ip = request.remote_addr
        plan.signature_png = png[:400000]
        if plan.status == "proposto":
            from app.services.treatment import decide
            decide(plan, True, installments=1)
        log("assinou", "Termo de consentimento", entity_id=plan.id, patient_id=plan.patient_id,
            detail=f"Assinado pelo paciente no portal ({name})", actor=g.patient.name)
        db.session.commit()
        flash("Orçamento aprovado e termo assinado. A clínica já foi avisada.", "success")
        return redirect(url_for("portal.plans"))
    return render_template("portal/plan.html", p=g.patient, plan=plan)


# ------------------------------------------------- exportar a própria ficha (LGPD)

@bp.route("/minha-ficha.json")
@patient_required
def export_record():
    import json

    from flask import Response

    from app.services.audit import log
    p = g.patient
    data = {
        "paciente": {"nome": p.name, "telefone": p.phone, "email": p.email, "cpf": p.cpf,
                     "nascimento": p.birth_date.isoformat() if p.birth_date else None},
        "anamnese": p.anamnesis,
        "consultas": [{"data": a.start.isoformat(), "procedimento": a.service.name,
                       "profissional": a.dentist.name, "situacao": a.status_label}
                      for a in p.appointments],
        "evolucao": [{"data": n.created_at.isoformat(), "procedimento": n.procedure, "texto": n.text}
                     for n in p.clinical_notes if n.visible_to_patient],
        "orcamentos": [{"titulo": pl.title, "situacao": pl.status_label, "total": str(pl.total)}
                       for pl in p.plans],
    }
    log("exportou", "Ficha do paciente", patient_id=p.id,
        detail="Exportação a pedido do paciente (LGPD art. 18)", actor=p.name)
    db.session.commit()
    body = json.dumps(data, ensure_ascii=False, indent=2)
    return Response(body, mimetype="application/json",
                    headers={"Content-Disposition": 'attachment; filename="minha-ficha-inspiralle.json"'})
