"""Plano de tratamento e orçamento."""
from datetime import date, datetime
from decimal import Decimal

from app.extensions import db
from app.models.base import TimestampMixin

PLAN_STATUSES = {
    "proposto": "Proposto",
    "aprovado": "Aprovado",
    "em_andamento": "Em andamento",
    "concluido": "Concluído",
    "recusado": "Recusado",
}
ITEM_STATUSES = {"previsto": "Previsto", "aprovado": "Aprovado", "executado": "Executado", "removido": "Removido"}


class TreatmentPlan(TimestampMixin, db.Model):
    """Orçamento e plano de tratamento do paciente, em etapas."""
    __tablename__ = "treatment_plans"

    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    dentist_id = db.Column(db.Integer, db.ForeignKey("dentists.id", ondelete="RESTRICT"), nullable=False)
    title = db.Column(db.String(160), nullable=False, default="Plano de tratamento")
    status = db.Column(db.String(20), nullable=False, default="proposto", index=True)
    notes = db.Column(db.Text)
    valid_until = db.Column(db.Date)
    decided_at = db.Column(db.DateTime)          # quando o paciente aprovou ou recusou
    # Assinatura do termo de consentimento, feita na tela
    signed_at = db.Column(db.DateTime)
    signed_name = db.Column(db.String(160))
    signed_ip = db.Column(db.String(45))
    signature_png = db.Column(db.Text)           # data URL do traço assinado

    patient = db.relationship("Patient", back_populates="plans")
    dentist = db.relationship("Dentist")
    items = db.relationship("TreatmentItem", back_populates="plan", cascade="all, delete-orphan",
                            order_by="TreatmentItem.phase, TreatmentItem.id")
    receivables = db.relationship("Receivable", back_populates="plan", order_by="Receivable.due_date")

    @property
    def status_label(self) -> str:
        return PLAN_STATUSES.get(self.status, self.status)

    @property
    def live_items(self):
        return [i for i in self.items if i.status != "removido"]

    @property
    def total(self) -> Decimal:
        return sum((i.total for i in self.live_items), Decimal("0"))

    @property
    def discount(self) -> Decimal:
        return sum((i.discount or Decimal("0")) for i in self.live_items)

    @property
    def done_count(self) -> int:
        return sum(1 for i in self.live_items if i.status == "executado")

    @property
    def progress(self) -> int:
        n = len(self.live_items)
        return round(100 * self.done_count / n) if n else 0

    @property
    def expired(self) -> bool:
        return bool(self.valid_until and self.status == "proposto" and self.valid_until < date.today())

    @property
    def days_waiting(self) -> int:
        return (datetime.now() - self.created_at).days


class TreatmentItem(TimestampMixin, db.Model):
    """Um procedimento do plano, ligado ao dente e à face."""
    __tablename__ = "treatment_items"

    plan_id = db.Column(db.Integer, db.ForeignKey("treatment_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    service_id = db.Column(db.Integer, db.ForeignKey("services.id", ondelete="RESTRICT"), nullable=False)
    tooth = db.Column(db.Integer)
    faces = db.Column(db.String(10))             # ex.: "OM"
    phase = db.Column(db.Integer, nullable=False, default=1)
    price = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    discount = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    status = db.Column(db.String(20), nullable=False, default="previsto")
    appointment_id = db.Column(db.Integer, db.ForeignKey("appointments.id", ondelete="SET NULL"))

    plan = db.relationship("TreatmentPlan", back_populates="items")
    service = db.relationship("Service")
    appointment = db.relationship("Appointment")

    @property
    def total(self) -> Decimal:
        return (self.price or Decimal("0")) - (self.discount or Decimal("0"))

    @property
    def status_label(self) -> str:
        return ITEM_STATUSES.get(self.status, self.status)

    @property
    def where(self) -> str:
        if not self.tooth:
            return "Boca toda"
        return f"Dente {self.tooth}" + (f" · {self.faces}" if self.faces else "")
