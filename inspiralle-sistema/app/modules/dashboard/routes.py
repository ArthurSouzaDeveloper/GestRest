from datetime import date, datetime, timedelta

from flask import Blueprint, redirect, render_template, url_for
from flask_login import current_user, login_required
from sqlalchemy import func

from app.extensions import db
from app.models import Appointment, Patient

bp = Blueprint("dashboard", __name__)


@bp.route("/")
@login_required
def index():
    today = date.today()
    day_start = datetime.combine(today, datetime.min.time())
    day_end = day_start + timedelta(days=1)

    q_today = Appointment.query.filter(Appointment.start >= day_start, Appointment.start < day_end,
                                       Appointment.status != "cancelado")
    if current_user.role == "dentista" and current_user.dentist_id:
        q_today = q_today.filter(Appointment.dentist_id == current_user.dentist_id)
    today_list = q_today.order_by(Appointment.start).all()

    pending_site = (Appointment.query
                    .filter(Appointment.origin == "site", Appointment.status == "agendado",
                            Appointment.start >= datetime.now())
                    .order_by(Appointment.created_at.desc()).limit(8).all())

    last30 = day_start - timedelta(days=30)
    past = (db.session.query(Appointment.status, func.count())
            .filter(Appointment.start >= last30, Appointment.start < day_start)
            .group_by(Appointment.status).all())
    past = dict(past)
    attended = past.get("concluido", 0)
    missed = past.get("faltou", 0)
    attendance = round(100 * attended / (attended + missed)) if attended + missed else None

    week_site = Appointment.query.filter(Appointment.origin == "site",
                                         Appointment.created_at >= day_start - timedelta(days=7)).count()

    # Ocupação dos próximos 7 dias
    upcoming = []
    for i in range(7):
        d = today + timedelta(days=i)
        ds = datetime.combine(d, datetime.min.time())
        n = Appointment.query.filter(Appointment.start >= ds, Appointment.start < ds + timedelta(days=1),
                                     Appointment.status != "cancelado").count()
        upcoming.append((d, n))
    max_up = max([n for _, n in upcoming] + [1])

    kpis = {
        "hoje": len(today_list),
        "site_semana": week_site,
        "pacientes": Patient.query_active().count(),
        "comparecimento": attendance,
    }
    return render_template("dashboard/index.html", kpis=kpis, today_list=today_list,
                           pending_site=pending_site, upcoming=upcoming, max_up=max_up)


@bp.route("/inicio")
def home_redirect():
    return redirect(url_for("dashboard.index"))
