"""Estoque de materiais e baixa automática por procedimento."""
from app.extensions import db
from app.models.base import TimestampMixin

UNITS = {"un": "unidade", "cx": "caixa", "ml": "ml", "g": "g", "par": "par"}


class StockItem(TimestampMixin, db.Model):
    __tablename__ = "stock_items"

    name = db.Column(db.String(120), nullable=False)
    unit = db.Column(db.String(10), nullable=False, default="un")
    quantity = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    minimum = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    unit_cost = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    supplier = db.Column(db.String(120))

    moves = db.relationship("StockMove", back_populates="item", cascade="all, delete-orphan",
                            order_by="desc(StockMove.created_at)")
    recipes = db.relationship("ServiceSupply", back_populates="item", cascade="all, delete-orphan")

    @property
    def low(self) -> bool:
        return self.quantity <= self.minimum

    @property
    def unit_label(self) -> str:
        return UNITS.get(self.unit, self.unit)


class ServiceSupply(TimestampMixin, db.Model):
    """Ficha técnica: o que cada procedimento consome."""
    __tablename__ = "service_supplies"
    __table_args__ = (db.UniqueConstraint("service_id", "item_id", name="uq_service_item"),)

    service_id = db.Column(db.Integer, db.ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = db.Column(db.Integer, db.ForeignKey("stock_items.id", ondelete="CASCADE"), nullable=False)
    quantity = db.Column(db.Numeric(10, 2), nullable=False, default=1)

    service = db.relationship("Service", back_populates="supplies")
    item = db.relationship("StockItem", back_populates="recipes")


class StockMove(TimestampMixin, db.Model):
    __tablename__ = "stock_moves"

    item_id = db.Column(db.Integer, db.ForeignKey("stock_items.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = db.Column(db.Numeric(10, 2), nullable=False)      # negativo = saída
    reason = db.Column(db.String(120), nullable=False)
    appointment_id = db.Column(db.Integer, db.ForeignKey("appointments.id", ondelete="SET NULL"))

    item = db.relationship("StockItem", back_populates="moves")
    appointment = db.relationship("Appointment")
