from app.extensions import db
from app.models.base import TimestampMixin
from app.models.dentist import service_dentists


class Service(TimestampMixin, db.Model):
    __tablename__ = "services"

    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.String(300))
    duration_min = db.Column(db.Integer, nullable=False, default=30)
    price = db.Column(db.Numeric(10, 2))
    online_booking = db.Column(db.Boolean, nullable=False, default=True)
    active = db.Column(db.Boolean, nullable=False, default=True)

    dentists = db.relationship("Dentist", secondary=service_dentists, back_populates="services")
    supplies = db.relationship("ServiceSupply", back_populates="service", cascade="all, delete-orphan")

    @property
    def supply_cost(self):
        """Custo de material por procedimento, vindo da ficha técnica."""
        from decimal import Decimal
        return sum((s.quantity * s.item.unit_cost for s in self.supplies), Decimal("0"))

    def to_public(self) -> dict:
        return {
            "id": self.id,
            "nome": self.name,
            "descricao": self.description,
            "duracao": self.duration_min,
        }
