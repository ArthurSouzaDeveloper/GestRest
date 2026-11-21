"""Repasse por dentista: produção menos material, laboratório e taxa de cartão."""
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from app.models import Dentist, FinancialEntry, Payable, Receivable
from app.services.finance import period_bounds


@dataclass
class DentistCommission:
    dentist: Dentist
    gross: Decimal = Decimal("0")
    count: int = 0
    supplies: Decimal = Decimal("0")     # material consumido (ficha técnica)
    lab: Decimal = Decimal("0")          # laboratório lançado no período
    card_fees: Decimal = Decimal("0")    # taxa da maquininha nas parcelas recebidas
    entries: list = field(default_factory=list)

    @property
    def deductions(self) -> Decimal:
        return self.supplies + self.lab + self.card_fees

    @property
    def net(self) -> Decimal:
        return self.gross - self.deductions

    @property
    def base(self) -> Decimal:
        return self.net if self.dentist.commission_base == "liquido" else self.gross

    @property
    def amount(self) -> Decimal:
        pct = Decimal(self.dentist.commission_pct or 0) / Decimal("100")
        return (self.base * pct).quantize(Decimal("0.01"))

    @property
    def clinic_share(self) -> Decimal:
        return self.net - self.amount


def build(period: str, ref: date) -> list[DentistCommission]:
    start, end, *_ = period_bounds(period, ref)
    rows = {}
    for d in Dentist.query.order_by(Dentist.name).all():
        rows[d.id] = DentistCommission(dentist=d)

    for e in FinancialEntry.query.filter(FinancialEntry.performed_at >= start,
                                         FinancialEntry.performed_at < end).all():
        c = rows.get(e.dentist_id)
        if c is None:
            continue
        c.gross += e.amount
        c.count += 1
        c.supplies += e.service.supply_cost
        c.entries.append(e)

    # Laboratório e taxa de cartão: lançados no período, atribuídos ao dentista
    for p in Payable.query.filter(Payable.due_date >= start.date(), Payable.due_date < end.date(),
                                  Payable.category == "laboratorio").all():
        if p.dentist_id in rows:
            rows[p.dentist_id].lab += p.amount

    for r in Receivable.query.filter(Receivable.paid_at >= start, Receivable.paid_at < end).all():
        plan = r.plan
        if plan is not None and plan.dentist_id in rows:
            rows[plan.dentist_id].card_fees += r.fee or Decimal("0")

    return [c for c in rows.values() if c.count or c.amount]
