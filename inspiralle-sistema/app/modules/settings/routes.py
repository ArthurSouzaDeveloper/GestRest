from decimal import Decimal, InvalidOperation

from flask import Blueprint, flash, redirect, render_template, request, url_for

from app.extensions import db
from app.models import Dentist, Service, User
from app.modules.auth.decorators import role_required

bp = Blueprint("settings", __name__)
WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]


@bp.route("/")
@role_required("admin")
def index():
    return render_template("settings/index.html",
                           services=Service.query.order_by(Service.name).all(),
                           dentists=Dentist.query.order_by(Dentist.name).all(),
                           users=User.query.order_by(User.name).all(),
                           weekday_labels=WEEKDAY_LABELS)


@bp.route("/servico/novo", methods=["GET", "POST"])
@bp.route("/servico/<int:id>", methods=["GET", "POST"])
@role_required("admin")
def service_form(id=None):
    s = db.get_or_404(Service, id) if id else None
    dentists = Dentist.query.order_by(Dentist.name).all()
    if request.method == "POST":
        f = request.form
        if not f.get("name", "").strip():
            flash("Informe o nome do serviço.", "danger")
            return redirect(request.url)
        if s is None:
            s = Service()
            db.session.add(s)
        s.name = f["name"].strip()
        s.description = f.get("description") or None
        s.duration_min = max(15, f.get("duration_min", type=int) or 30)
        try:
            s.price = Decimal(f.get("price").replace(",", ".")) if f.get("price") else None
        except InvalidOperation:
            s.price = None
        s.online_booking = bool(f.get("online_booking"))
        s.active = bool(f.get("active"))
        s.dentists = [d for d in dentists if str(d.id) in f.getlist("dentists")]
        db.session.commit()
        flash("Serviço salvo.", "success")
        return redirect(url_for("settings.index"))
    return render_template("settings/service_form.html", s=s, dentists=dentists)


@bp.route("/profissional/novo", methods=["GET", "POST"])
@bp.route("/profissional/<int:id>", methods=["GET", "POST"])
@role_required("admin")
def dentist_form(id=None):
    d = db.get_or_404(Dentist, id) if id else None
    services = Service.query.order_by(Service.name).all()
    if request.method == "POST":
        f = request.form
        if not f.get("name", "").strip():
            flash("Informe o nome do profissional.", "danger")
            return redirect(request.url)
        if d is None:
            d = Dentist()
            db.session.add(d)
        d.name = f["name"].strip()
        d.cro = f.get("cro") or None
        d.specialty = f.get("specialty") or None
        d.color = f.get("color") or "#c9a468"
        d.weekdays = ",".join(sorted(f.getlist("weekdays"))) or "0"
        d.active = bool(f.get("active"))
        d.services = [s for s in services if str(s.id) in f.getlist("services")]
        db.session.commit()
        flash("Profissional salvo.", "success")
        return redirect(url_for("settings.index"))
    return render_template("settings/dentist_form.html", d=d, services=services, weekday_labels=WEEKDAY_LABELS)
