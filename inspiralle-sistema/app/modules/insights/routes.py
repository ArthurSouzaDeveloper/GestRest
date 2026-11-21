"""Indicadores de gestão: ocupação da agenda, faltas e conversão de orçamentos."""
from datetime import date, timedelta

from flask import Blueprint, render_template, request

from app.models import Dentist
from app.modules.auth.decorators import role_required
from app.services import insights as svc
from app.services.finance import MONTHS, period_bounds

bp = Blueprint("insights", __name__)

RANGES = {"semana": "Esta semana", "mes": "Este mês", "trimestre": "Últimos 3 meses"}


def _window(key: str, ref: date):
    if key == "semana":
        start = ref - timedelta(days=ref.weekday())
        end = start + timedelta(days=7)
        last = end - timedelta(days=1)
        return start, end, f"{start.strftime('%d/%m')} a {last.strftime('%d/%m/%Y')}"
    if key == "trimestre":
        end = (ref.replace(day=1) + timedelta(days=32)).replace(day=1)
        start = end
        for _ in range(3):
            start = (start.replace(day=1) - timedelta(days=1)).replace(day=1)
        return start, end, f"{MONTHS[start.month - 1]} a {MONTHS[(end - timedelta(days=1)).month - 1]}"
    start, end, label, *_ = period_bounds("mes", ref)
    return start.date(), end.date(), label


@bp.route("/")
@role_required("dentista")
def index():
    key = request.args.get("faixa", "mes")
    key = key if key in RANGES else "mes"
    try:
        ref = date.fromisoformat(request.args.get("data", ""))
    except ValueError:
        ref = date.today()
    dentist_id = request.args.get("dentista", type=int) or None
    start, end, label = _window(key, ref)
    i = svc.build(start, end, label, dentist_id)
    return render_template("insights/index.html", i=i, ranges=RANGES, key=key, ref=ref,
                           dentists=Dentist.query.filter_by(active=True).order_by(Dentist.name).all(),
                           dentist_id=dentist_id, targets={
                               "occupancy": svc.TARGET_OCCUPANCY, "noshow": svc.TARGET_NOSHOW,
                               "conversion": svc.TARGET_CONVERSION})
