"""Estoque de materiais, ficha técnica por procedimento e lista de compras."""
from decimal import Decimal, InvalidOperation

from flask import Blueprint, flash, redirect, render_template, request, url_for

from app.extensions import db
from app.models import Service, ServiceSupply, StockItem, StockMove, UNITS
from app.modules.auth.decorators import role_required
from app.services.finance import parse_money
from app.services.inventory import adjust, shopping_list

bp = Blueprint("inventory", __name__)


def _qty(raw: str) -> Decimal | None:
    try:
        return Decimal((raw or "").replace(",", ".").strip())
    except (InvalidOperation, ValueError):
        return None


@bp.route("/", methods=["GET", "POST"])
@role_required("recepcao", "dentista")
def index():
    if request.method == "POST":
        name = (request.form.get("nome") or "").strip()
        if not name:
            flash("Informe o nome do material.", "danger")
            return redirect(url_for("inventory.index"))
        db.session.add(StockItem(name=name, unit=request.form.get("unidade", "un"),
                                 quantity=_qty(request.form.get("quantidade")) or Decimal("0"),
                                 minimum=_qty(request.form.get("minimo")) or Decimal("0"),
                                 unit_cost=parse_money(request.form.get("custo")) or Decimal("0"),
                                 supplier=(request.form.get("fornecedor") or "").strip() or None))
        db.session.commit()
        flash("Material cadastrado.", "success")
        return redirect(url_for("inventory.index"))

    items = StockItem.query.order_by(StockItem.name).all()
    moves = StockMove.query.order_by(StockMove.created_at.desc()).limit(25).all()
    total = sum((i.quantity * i.unit_cost for i in items), Decimal("0"))
    return render_template("inventory/index.html", items=items, moves=moves, units=UNITS,
                           shopping=shopping_list(), total=total)


@bp.route("/<int:id>/movimentar", methods=["POST"])
@role_required("recepcao", "dentista")
def move(id):
    item = db.get_or_404(StockItem, id)
    qty = _qty(request.form.get("quantidade"))
    if qty is None or qty == 0:
        flash("Informe a quantidade (use um número negativo para saída).", "danger")
        return redirect(url_for("inventory.index"))
    adjust(item, qty, (request.form.get("motivo") or "").strip() or "Ajuste manual")
    db.session.commit()
    flash(f"{item.name}: estoque agora em {item.quantity:.0f} {item.unit_label}.", "success")
    return redirect(url_for("inventory.index"))


@bp.route("/ficha-tecnica", methods=["GET", "POST"])
@role_required("dentista")
def recipes():
    services = Service.query.filter_by(active=True).order_by(Service.name).all()
    items = StockItem.query.order_by(StockItem.name).all()
    if request.method == "POST":
        svc = db.session.get(Service, request.form.get("servico", type=int) or 0)
        item = db.session.get(StockItem, request.form.get("material", type=int) or 0)
        qty = _qty(request.form.get("quantidade"))
        if svc is None or item is None or qty is None or qty <= 0:
            flash("Escolha o procedimento, o material e a quantidade.", "danger")
            return redirect(url_for("inventory.recipes"))
        row = ServiceSupply.query.filter_by(service_id=svc.id, item_id=item.id).first()
        if row is None:
            db.session.add(ServiceSupply(service=svc, item=item, quantity=qty))
        else:
            row.quantity = qty
        db.session.commit()
        flash(f"Ficha técnica de {svc.name} atualizada.", "success")
        return redirect(url_for("inventory.recipes"))
    return render_template("inventory/recipes.html", services=services, items=items)


@bp.route("/ficha-tecnica/<int:id>/remover", methods=["POST"])
@role_required("dentista")
def remove_recipe(id):
    row = db.get_or_404(ServiceSupply, id)
    db.session.delete(row)
    db.session.commit()
    flash("Material retirado da ficha técnica.", "success")
    return redirect(url_for("inventory.recipes"))
