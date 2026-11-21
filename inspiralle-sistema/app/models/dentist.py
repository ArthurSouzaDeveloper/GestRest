from app.extensions import db
from app.models.base import TimestampMixin

service_dentists = db.Table(
    "service_dentists",
    db.Column("service_id", db.Integer, db.ForeignKey("services.id", ondelete="CASCADE"), primary_key=True),
    db.Column("dentist_id", db.Integer, db.ForeignKey("dentists.id", ondelete="CASCADE"), primary_key=True),
)


class Dentist(TimestampMixin, db.Model):
    __tablename__ = "dentists"

    name = db.Column(db.String(120), nullable=False)
    cro = db.Column(db.String(30))
    specialty = db.Column(db.String(120))
    color = db.Column(db.String(9), nullable=False, default="#c9a468")
    # Dias em que atende, ex.: "0,1,2,3,4" (0 = segunda)
    weekdays = db.Column(db.String(20), nullable=False, default="0,1,2,3,4,5")
    active = db.Column(db.Boolean, nullable=False, default=True)
    # Repasse: % da produção do profissional. "liquido" desconta material, laboratório e taxa de cartão.
    commission_pct = db.Column(db.Numeric(5, 2), nullable=False, default=0)
    commission_base = db.Column(db.String(10), nullable=False, default="liquido")  # bruto | liquido

    services = db.relationship("Service", secondary=service_dentists, back_populates="dentists")
    prices = db.relationship("DentistPrice", back_populates="dentist", cascade="all, delete-orphan")

    def price_for(self, service):
        """Preço deste dentista para o serviço; cai no valor padrão do serviço se não houver."""
        for p in self.prices:
            if p.service_id == service.id:
                return p.price
        return service.price

    @property
    def commission_base_label(self) -> str:
        return "sobre o líquido" if self.commission_base == "liquido" else "sobre o bruto"

    @property
    def weekday_set(self) -> set[int]:
        return {int(d) for d in self.weekdays.split(",") if d.strip() != ""}

    def to_public(self) -> dict:
        return {"id": self.id, "nome": self.name, "especialidade": self.specialty, "cor": self.color}
