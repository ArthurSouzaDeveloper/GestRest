"""Indicadores de gestão: ocupação da agenda, faltas e conversão de orçamentos."""
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.models import Appointment, Dentist, Patient, TreatmentPlan
from app.services.availability import business_windows

# Metas usadas como referência de mercado odontológico
TARGET_OCCUPANCY = 80       # %
TARGET_NOSHOW = 5           # %
TARGET_CONVERSION = 60      # %


@dataclass
class Insights:
    start: date
    end: date
    label: str
    booked_min: int = 0
    open_min: int = 0
    done: int = 0
    noshow: int = 0
    cancelled: int = 0
    total_slots: int = 0
    plans: list = field(default_factory=list)
    new_patients: int = 0
    returning: int = 0
    by_dentist: list = field(default_factory=list)
    by_origin: dict = field(default_factory=dict)
    by_day: list = field(default_factory=list)   # [(rótulo, ocupação %, iso)]
    lost_min: int = 0            # tempo de cadeira perdido com faltas e cancelamentos
    revenue: Decimal = Decimal("0")

    @property
    def occupancy(self) -> int:
        return round(100 * self.booked_min / self.open_min) if self.open_min else 0

    @property
    def idle_min(self) -> int:
        return max(0, self.open_min - self.booked_min)

    @property
    def noshow_rate(self) -> float:
        base = self.done + self.noshow + self.cancelled
        return round(100 * self.noshow / base, 1) if base else 0.0

    @property
    def cancel_rate(self) -> float:
        base = self.done + self.noshow + self.cancelled
        return round(100 * self.cancelled / base, 1) if base else 0.0

    @property
    def proposed(self) -> list:
        return [p for p in self.plans]

    @property
    def approved(self) -> list:
        return [p for p in self.plans if p.status in ("aprovado", "em_andamento", "concluido")]

    @property
    def conversion(self) -> int:
        decided = [p for p in self.plans if p.status != "proposto"]
        return round(100 * len(self.approved) / len(decided)) if decided else 0

    @property
    def proposed_value(self) -> Decimal:
        return sum((p.total for p in self.plans), Decimal("0"))

    @property
    def approved_value(self) -> Decimal:
        return sum((p.total for p in self.approved), Decimal("0"))

    @property
    def waiting_value(self) -> Decimal:
        return sum((p.total for p in self.plans if p.status == "proposto"), Decimal("0"))

    @property
    def idle_cost(self) -> Decimal:
        """Quanto a agenda vazia custou, usando o ticket médio do período."""
        if not self.done or not self.booked_min:
            return Decimal("0")
        per_min = self.revenue / Decimal(self.booked_min)
        return (per_min * Decimal(self.idle_min)).quantize(Decimal("0.01"))


def build(start: date, end: date, label: str, dentist_id: int | None = None) -> Insights:
    """end é exclusivo."""
    i = Insights(start=start, end=end, label=label)

    dentists = Dentist.query.filter_by(active=True)
    if dentist_id:
        dentists = dentists.filter_by(id=dentist_id)
    dentists = dentists.order_by(Dentist.name).all()

    # Capacidade: horário de funcionamento x dias que cada profissional atende
    capacity_by_day: dict = {}
    day = start
    while day < end:
        minutes = sum(int((b - a).total_seconds() // 60) for a, b in business_windows(day))
        cap = sum(minutes for d in dentists if day.weekday() in d.weekday_set)
        capacity_by_day[day] = cap
        i.open_min += cap
        day += timedelta(days=1)

    q = Appointment.query.filter(Appointment.start >= datetime.combine(start, datetime.min.time()),
                                 Appointment.start < datetime.combine(end, datetime.min.time()))
    if dentist_id:
        q = q.filter(Appointment.dentist_id == dentist_id)
    appts = q.all()

    per_dentist: dict[int, dict] = {d.id: {"d": d, "min": 0, "done": 0, "noshow": 0} for d in dentists}
    for a in appts:
        i.by_origin[a.origin] = i.by_origin.get(a.origin, 0) + 1
        slot = a.duration_min
        if a.status in ("agendado", "confirmado", "em_atendimento", "concluido"):
            i.booked_min += slot
            if a.dentist_id in per_dentist:
                per_dentist[a.dentist_id]["min"] += slot
        if a.status == "concluido":
            i.done += 1
            if a.dentist_id in per_dentist:
                per_dentist[a.dentist_id]["done"] += 1
            if a.financial_entry:
                i.revenue += a.financial_entry.amount
        elif a.status == "faltou":
            i.noshow += 1
            i.lost_min += slot
            if a.dentist_id in per_dentist:
                per_dentist[a.dentist_id]["noshow"] += 1
        elif a.status == "cancelado":
            i.cancelled += 1
            i.lost_min += slot

    # Ocupação dia a dia, para o gráfico
    booked_by_day: dict = {d: 0 for d in capacity_by_day}
    for a in appts:
        if a.status in ("agendado", "confirmado", "em_atendimento", "concluido"):
            d = a.start.date()
            if d in booked_by_day:
                booked_by_day[d] += a.duration_min
    weekdays = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]
    for d, cap in capacity_by_day.items():
        pct = round(100 * booked_by_day[d] / cap) if cap else 0
        label = f"{weekdays[d.weekday()]}<br>{d.day}" if (end - start).days <= 10 else str(d.day)
        i.by_day.append((label, pct, d.isoformat()))

    i.by_dentist = sorted(per_dentist.values(), key=lambda r: -r["min"])
    for row in i.by_dentist:
        d = row["d"]
        cap = 0
        day = start
        while day < end:
            if day.weekday() in d.weekday_set:
                cap += sum(int((b - a).total_seconds() // 60) for a, b in business_windows(day))
            day += timedelta(days=1)
        row["cap"] = cap
        row["occupancy"] = round(100 * row["min"] / cap) if cap else 0

    i.plans = TreatmentPlan.query.filter(
        TreatmentPlan.created_at >= datetime.combine(start, datetime.min.time()),
        TreatmentPlan.created_at < datetime.combine(end, datetime.min.time())).all()

    i.new_patients = Patient.query_active().filter(
        Patient.created_at >= datetime.combine(start, datetime.min.time()),
        Patient.created_at < datetime.combine(end, datetime.min.time())).count()
    i.returning = len({a.patient_id for a in appts}) - i.new_patients
    i.total_slots = len(appts)
    return i
