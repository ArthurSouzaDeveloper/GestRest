"""Estoque: baixa automática pela ficha técnica do procedimento."""
from decimal import Decimal

from app.extensions import db
from app.models import Appointment, StockItem, StockMove


def consume_for(appt: Appointment) -> list[StockMove]:
    """Consulta concluída dá baixa no material do procedimento, uma vez só."""
    if appt.status != "concluido":
        return []
    already = StockMove.query.filter_by(appointment_id=appt.id).count()
    if already:
        return []
    moves = []
    for supply in appt.service.supplies:
        supply.item.quantity = (supply.item.quantity or Decimal("0")) - supply.quantity
        moves.append(StockMove(item=supply.item, quantity=-supply.quantity,
                               reason=f"{appt.service.name} · {appt.patient.name}", appointment_id=appt.id))
    db.session.add_all(moves)
    return moves


def adjust(item: StockItem, quantity: Decimal, reason: str) -> StockMove:
    """Entrada (positiva) ou saída manual (negativa)."""
    item.quantity = (item.quantity or Decimal("0")) + Decimal(quantity)
    move = StockMove(item=item, quantity=Decimal(quantity), reason=reason)
    db.session.add(move)
    return move


def shopping_list() -> list[dict]:
    """O que está abaixo do mínimo e quanto custaria repor."""
    out = []
    for item in StockItem.query.order_by(StockItem.name).all():
        if not item.low:
            continue
        need = (item.minimum * 2) - item.quantity
        out.append({"item": item, "need": need, "cost": (need * item.unit_cost).quantize(Decimal("0.01"))})
    return out
