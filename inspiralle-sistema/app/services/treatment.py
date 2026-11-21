"""Regras do plano de tratamento e do orçamento.

O plano é a espinha do sistema clínico: nasce do odontograma, vira orçamento,
o paciente aprova, e daí saem as parcelas a receber e os procedimentos a agendar.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.extensions import db
from app.models import PLAN_STATUSES, Receivable, ToothState, TreatmentItem, TreatmentPlan
from app.services.audit import log

# Condição marcada no dente -> procedimento que normalmente resolve
SUGGESTED = {
    "cariado": "Restauração",
    "a_restaurar": "Restauração",
    "canal_indicado": "Tratamento de canal",
    "a_extrair": "Extração de siso",
}


def suggestions_from_chart(patient_id: int) -> list[dict]:
    """Lê o odontograma e devolve o que ainda precisa de tratamento.

    Serve para o dentista montar o plano em um clique, sem redigitar dente por dente.
    """
    rows = (ToothState.query.filter_by(patient_id=patient_id)
            .order_by(ToothState.created_at, ToothState.id).all())
    latest: dict[tuple[int, str | None], ToothState] = {}
    for r in rows:
        latest[(r.tooth, r.face)] = r

    grouped: dict[tuple[int, str], list[str]] = {}
    for (tooth, face), state in latest.items():
        proc = SUGGESTED.get(state.condition)
        if not proc:
            continue
        if state.treatment_item_id:      # já está em algum plano
            continue
        grouped.setdefault((tooth, proc), []).append(face or "")
    out = []
    for (tooth, proc), faces in sorted(grouped.items()):
        out.append({"tooth": tooth, "procedure": proc, "faces": "".join(sorted(f for f in faces if f))})
    return out


def plan_totals(plans) -> dict:
    """Resumo do funil de orçamentos: quanto está proposto, aprovado e perdido."""
    out = {k: {"count": 0, "total": Decimal("0")} for k in PLAN_STATUSES}
    for p in plans:
        out[p.status]["count"] += 1
        out[p.status]["total"] += p.total
    return out


def decide(plan: TreatmentPlan, approved: bool, installments: int = 1, first_due: date | None = None,
           down_payment: Decimal | None = None, method: str = "pix") -> list[Receivable]:
    """Registra a decisão do paciente. Se aprovou, gera as parcelas a receber."""
    plan.status = "aprovado" if approved else "recusado"
    plan.decided_at = datetime.now()
    if not approved:
        log("alterou", "Orçamento", entity_id=plan.id, patient_id=plan.patient_id,
            detail="Paciente recusou o orçamento")
        return []
    for item in plan.items:
        if item.status == "previsto":
            item.status = "aprovado"
    created = build_installments(plan, installments, first_due, down_payment, method)
    log("alterou", "Orçamento", entity_id=plan.id, patient_id=plan.patient_id,
        detail=f"Aprovado em {len(created)} parcela(s), total {plan.total}")
    return created


def build_installments(plan: TreatmentPlan, installments: int, first_due: date | None = None,
                       down_payment: Decimal | None = None, method: str = "pix") -> list[Receivable]:
    """Entrada opcional + parcelas iguais, com o resto do centavo na primeira.

    Apaga parcelas ainda não pagas antes de recriar, para o dentista poder
    renegociar sem duplicar cobrança.
    """
    for r in list(plan.receivables):
        if not r.paid:
            db.session.delete(r)
    db.session.flush()

    total = plan.total
    due = first_due or date.today()
    created: list[Receivable] = []

    if down_payment and down_payment > 0:
        entrada = min(Decimal(down_payment), total)
        created.append(Receivable(patient_id=plan.patient_id, plan=plan, description=f"{plan.title} · entrada",
                                  installment=1, installments=1, amount=entrada, due_date=due, method=method))
        total -= entrada
        due = _add_month(due)

    n = max(1, installments)
    if total > 0:
        base = (total / n).quantize(Decimal("0.01"))
        rest = total - base * n
        for i in range(n):
            amount = base + (rest if i == 0 else Decimal("0"))
            created.append(Receivable(patient_id=plan.patient_id, plan=plan, description=plan.title,
                                      installment=i + 1, installments=n, amount=amount,
                                      due_date=due, method=method))
            due = _add_month(due)
    db.session.add_all(created)
    return created


def _add_month(d: date) -> date:
    """Mesmo dia do mês seguinte; encurta quando o mês é mais curto."""
    y, m = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    for day in (d.day, 30, 29, 28):
        try:
            return date(y, m, day)
        except ValueError:
            continue
    return d + timedelta(days=30)


def mark_item_done(item: TreatmentItem, appointment=None) -> None:
    """Procedimento executado: avança o plano e, se acabou, fecha o plano."""
    item.status = "executado"
    if appointment is not None:
        item.appointment = appointment
    plan = item.plan
    if all(i.status in ("executado", "removido") for i in plan.items):
        plan.status = "concluido"
    elif plan.status == "aprovado":
        plan.status = "em_andamento"
