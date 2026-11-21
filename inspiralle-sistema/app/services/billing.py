"""Contas a receber, contas a pagar e caixa projetado."""
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.extensions import db
from app.models import Payable, Receivable
from app.services.audit import log

# Taxa média cobrada pela maquininha, por meio de pagamento (editável nos cadastros)
FEES = {"pix": Decimal("0"), "dinheiro": Decimal("0"), "boleto": Decimal("0.0349"),
        "cartao": Decimal("0.0399"), "convenio": Decimal("0")}


@dataclass
class ReceivableSummary:
    overdue: list = field(default_factory=list)
    today: list = field(default_factory=list)
    upcoming: list = field(default_factory=list)
    paid_month: Decimal = Decimal("0")
    expected_month: Decimal = Decimal("0")
    due_so_far: Decimal = Decimal("0")     # tudo que já venceu, pago ou não

    @property
    def overdue_total(self) -> Decimal:
        return sum((r.amount for r in self.overdue), Decimal("0"))

    @property
    def open_total(self) -> Decimal:
        return sum((r.amount for r in self.overdue + self.today + self.upcoming), Decimal("0"))

    @property
    def default_rate(self) -> float:
        """Inadimplência: do que já venceu, quanto segue em aberto."""
        if not self.due_so_far:
            return 0.0
        return round(float(self.overdue_total / self.due_so_far * 100), 1)


def summary(ref: date | None = None, horizon_days: int = 60) -> ReceivableSummary:
    ref = ref or date.today()
    month_start = ref.replace(day=1)
    month_end = (month_start + timedelta(days=32)).replace(day=1)
    s = ReceivableSummary()

    open_rows = (Receivable.query.filter(Receivable.paid_at.is_(None))
                 .order_by(Receivable.due_date).all())
    for r in open_rows:
        if r.due_date < ref:
            s.overdue.append(r)
        elif r.due_date == ref:
            s.today.append(r)
        elif r.due_date <= ref + timedelta(days=horizon_days):
            s.upcoming.append(r)

    s.paid_month = sum((r.paid_amount or r.amount for r in Receivable.query.filter(
        Receivable.paid_at >= datetime.combine(month_start, datetime.min.time()),
        Receivable.paid_at < datetime.combine(month_end, datetime.min.time())).all()), Decimal("0"))
    s.expected_month = sum((r.amount for r in Receivable.query.filter(
        Receivable.due_date >= month_start, Receivable.due_date < month_end).all()), Decimal("0"))
    s.due_so_far = sum((r.amount for r in Receivable.query.filter(
        Receivable.due_date < ref).all()), Decimal("0"))
    return s


def receive(r: Receivable, amount: Decimal | None = None, method: str | None = None,
            when: datetime | None = None) -> Receivable:
    """Dá baixa na parcela e guarda a taxa do meio de pagamento (vai sair da comissão)."""
    r.paid_at = when or datetime.now()
    r.paid_amount = Decimal(amount) if amount is not None else r.amount
    if method:
        r.method = method
    r.fee = (r.paid_amount * FEES.get(r.method or "pix", Decimal("0"))).quantize(Decimal("0.01"))
    log("alterou", "Contas a receber", entity_id=r.id, patient_id=r.patient_id,
        detail=f"Baixa de {r.paid_amount} em {r.method or 'pix'}")
    return r


def undo_receive(r: Receivable) -> Receivable:
    log("alterou", "Contas a receber", entity_id=r.id, patient_id=r.patient_id, detail="Baixa desfeita")
    r.paid_at = None
    r.paid_amount = None
    r.fee = Decimal("0")
    return r


def cash_projection(months: int = 6, ref: date | None = None) -> list[dict]:
    """Entradas previstas menos contas a pagar, mês a mês."""
    ref = (ref or date.today()).replace(day=1)
    out = []
    cursor = ref
    for _ in range(months):
        nxt = (cursor + timedelta(days=32)).replace(day=1)
        inflow = sum((r.amount for r in Receivable.query.filter(
            Receivable.due_date >= cursor, Receivable.due_date < nxt).all()), Decimal("0"))
        outflow = sum((p.amount for p in Payable.query.filter(
            Payable.due_date >= cursor, Payable.due_date < nxt).all()), Decimal("0"))
        out.append({"month": cursor, "inflow": inflow, "outflow": outflow, "net": inflow - outflow})
        cursor = nxt
    return out


def payables_summary(ref: date | None = None) -> dict:
    ref = ref or date.today()
    month_start = ref.replace(day=1)
    month_end = (month_start + timedelta(days=32)).replace(day=1)
    rows = Payable.query.filter(Payable.due_date >= month_start, Payable.due_date < month_end).all()
    by_cat: dict[str, Decimal] = {}
    for p in rows:
        by_cat[p.category] = by_cat.get(p.category, Decimal("0")) + p.amount
    overdue = [p for p in Payable.query.filter(Payable.paid_at.is_(None), Payable.due_date < ref).all()]
    return {
        "rows": sorted(rows, key=lambda p: p.due_date),
        "total": sum((p.amount for p in rows), Decimal("0")),
        "paid": sum((p.amount for p in rows if p.paid), Decimal("0")),
        "overdue": overdue,
        "by_category": sorted(by_cat.items(), key=lambda kv: -kv[1]),
    }
