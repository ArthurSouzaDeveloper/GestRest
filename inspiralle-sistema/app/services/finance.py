"""Regras do financeiro: receita nasce quando a consulta é concluída.

Toda mudança de status ou de dados de uma consulta passa por
`sync_appointment_entry`, então o relatório sempre bate com a agenda.
"""
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from sqlalchemy import func

from app.extensions import db
from app.models import Appointment, Dentist, FinancialEntry, Service

PERIODS = {"dia": "Dia", "semana": "Semana", "mes": "Mês"}
MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
          "agosto", "setembro", "outubro", "novembro", "dezembro"]
WEEKDAYS_SHORT = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]


def parse_money(raw: str) -> Decimal | None:
    """Aceita "1.500,00", "1500,5", "1500.50" ou "R$ 180". Devolve None se inválido/negativo."""
    txt = (raw or "").replace("R$", "").replace(" ", "").strip()
    if not txt:
        return None
    if "," in txt:
        txt = txt.replace(".", "").replace(",", ".")
    try:
        value = Decimal(txt).quantize(Decimal("0.01"))
    except InvalidOperation:
        return None
    return value if value >= 0 else None


def sync_appointment_entry(appt: Appointment) -> FinancialEntry | None:
    """Cria, atualiza ou remove o lançamento da consulta conforme o status."""
    entry = appt.financial_entry
    if appt.status != "concluido":
        if entry is not None:
            appt.financial_entry = None  # delete-orphan apaga o lançamento
        return None

    price = appt.dentist.price_for(appt.service)  # lê antes de criar o lançamento (evita autoflush incompleto)
    if entry is None:
        entry = FinancialEntry(dentist=appt.dentist, service=appt.service, patient=appt.patient,
                               performed_at=appt.start)
        _apply_price(entry, price)
        appt.financial_entry = entry
    elif entry.adjusted_by_id is None and (entry.dentist is not appt.dentist or entry.service is not appt.service):
        # Remarcaram dentista/serviço de uma consulta já concluída: recalcula
        _apply_price(entry, price)
    entry.dentist = appt.dentist
    entry.service = appt.service
    entry.patient = appt.patient
    entry.performed_at = appt.start
    return entry


def _apply_price(entry: FinancialEntry, price) -> None:
    entry.amount = Decimal(price) if price is not None else Decimal("0")
    entry.price_missing = price is None


# ---------------------------------------------------------------- relatórios

@dataclass
class Report:
    period: str
    ref: date
    start: datetime
    end: datetime
    label: str
    prev_ref: date
    next_ref: date
    total: Decimal = Decimal("0")
    count: int = 0
    prev_total: Decimal = Decimal("0")
    missing_price: int = 0
    series: list = field(default_factory=list)       # [(rótulo, valor, data_iso|None)]
    by_dentist: list = field(default_factory=list)   # [(Dentist, total, qtd)]
    by_service: list = field(default_factory=list)   # [(Service, total, qtd)]
    entries: list = field(default_factory=list)

    @property
    def ticket(self) -> Decimal:
        return (self.total / self.count) if self.count else Decimal("0")

    @property
    def variation(self) -> int | None:
        if not self.prev_total:
            return None
        return round(float((self.total - self.prev_total) / self.prev_total * 100))

    @property
    def series_max(self) -> Decimal:
        return max([v for _, v, _ in self.series] + [Decimal("1")])


def period_bounds(period: str, ref: date):
    """Devolve (início, fim, rótulo, ref_anterior, ref_seguinte)."""
    if period == "dia":
        start = ref
        end = ref + timedelta(days=1)
        label = f"{ref.day:02d}/{ref.month:02d}/{ref.year}"
        prev_ref, next_ref = ref - timedelta(days=1), ref + timedelta(days=1)
    elif period == "semana":
        start = ref - timedelta(days=ref.weekday())
        end = start + timedelta(days=7)
        last = end - timedelta(days=1)
        label = f"{start.day:02d}/{start.month:02d} a {last.day:02d}/{last.month:02d}/{last.year}"
        prev_ref, next_ref = start - timedelta(days=7), start + timedelta(days=7)
    else:
        start = ref.replace(day=1)
        end = (start + timedelta(days=32)).replace(day=1)
        label = f"{MONTHS[start.month - 1]} de {start.year}"
        prev_ref = (start - timedelta(days=1)).replace(day=1)
        next_ref = end
    as_dt = lambda d: datetime.combine(d, datetime.min.time())  # noqa: E731
    return as_dt(start), as_dt(end), label, prev_ref, next_ref


def build_report(period: str, ref: date, dentist_id: int | None = None) -> Report:
    period = period if period in PERIODS else "dia"
    start, end, label, prev_ref, next_ref = period_bounds(period, ref)
    r = Report(period=period, ref=ref, start=start, end=end, label=label, prev_ref=prev_ref, next_ref=next_ref)

    def base(s, e):
        q = FinancialEntry.query.filter(FinancialEntry.performed_at >= s, FinancialEntry.performed_at < e)
        if dentist_id:
            q = q.filter(FinancialEntry.dentist_id == dentist_id)
        return q

    r.entries = base(start, end).order_by(FinancialEntry.performed_at.desc()).all()
    r.total = sum((e.amount for e in r.entries), Decimal("0"))
    r.count = len(r.entries)
    r.missing_price = sum(1 for e in r.entries if e.price_missing)

    p_start, p_end, *_ = period_bounds(period, prev_ref)
    r.prev_total = (base(p_start, p_end).with_entities(func.coalesce(func.sum(FinancialEntry.amount), 0)).scalar())
    r.prev_total = Decimal(str(r.prev_total or 0))

    # Série do gráfico: por hora (dia), por dia (semana/mês)
    if period == "dia":
        buckets = {h: Decimal("0") for h in range(8, 20)}
        for e in r.entries:
            buckets[e.performed_at.hour] = buckets.get(e.performed_at.hour, Decimal("0")) + e.amount
        r.series = [(f"{h}h", v, None) for h, v in sorted(buckets.items())]
    else:
        days = (end - start).days
        buckets = {(start + timedelta(days=i)).date(): Decimal("0") for i in range(days)}
        for e in r.entries:
            buckets[e.performed_at.date()] += e.amount
        if period == "semana":
            r.series = [(f"{WEEKDAYS_SHORT[d.weekday()]}<br>{d.day}", v, d.isoformat()) for d, v in buckets.items()]
        else:
            r.series = [(str(d.day), v, d.isoformat()) for d, v in buckets.items()]

    agg_d, agg_s = {}, {}
    for e in r.entries:
        t, n = agg_d.get(e.dentist_id, (Decimal("0"), 0))
        agg_d[e.dentist_id] = (t + e.amount, n + 1)
        t, n = agg_s.get(e.service_id, (Decimal("0"), 0))
        agg_s[e.service_id] = (t + e.amount, n + 1)
    dentists = {d.id: d for d in Dentist.query.filter(Dentist.id.in_(agg_d)).all()} if agg_d else {}
    services = {s.id: s for s in Service.query.filter(Service.id.in_(agg_s)).all()} if agg_s else {}
    r.by_dentist = sorted([(dentists[k], t, n) for k, (t, n) in agg_d.items()], key=lambda x: -x[1])
    r.by_service = sorted([(services[k], t, n) for k, (t, n) in agg_s.items()], key=lambda x: -x[1])
    return r


def revenue_between(start: datetime, end: datetime, dentist_id: int | None = None) -> Decimal:
    q = db.session.query(func.coalesce(func.sum(FinancialEntry.amount), 0)).filter(
        FinancialEntry.performed_at >= start, FinancialEntry.performed_at < end)
    if dentist_id:
        q = q.filter(FinancialEntry.dentist_id == dentist_id)
    return Decimal(str(q.scalar() or 0))
