"""Convênios odontológicos e guias no padrão TISS."""
from app.extensions import db
from app.models.base import TimestampMixin

GUIDE_STATUSES = {"gerada": "Gerada", "enviada": "Enviada", "paga": "Paga", "glosada": "Glosada"}


class Insurance(TimestampMixin, db.Model):
    __tablename__ = "insurances"

    name = db.Column(db.String(120), nullable=False)
    ans_code = db.Column(db.String(20))          # registro da operadora na ANS
    active = db.Column(db.Boolean, nullable=False, default=True)
    pay_days = db.Column(db.Integer, nullable=False, default=30)

    prices = db.relationship("InsurancePrice", back_populates="insurance", cascade="all, delete-orphan")


class InsurancePrice(TimestampMixin, db.Model):
    """Quanto o convênio paga por procedimento (código TUSS)."""
    __tablename__ = "insurance_prices"
    __table_args__ = (db.UniqueConstraint("insurance_id", "service_id", name="uq_insurance_service"),)

    insurance_id = db.Column(db.Integer, db.ForeignKey("insurances.id", ondelete="CASCADE"), nullable=False)
    service_id = db.Column(db.Integer, db.ForeignKey("services.id", ondelete="CASCADE"), nullable=False)
    tuss = db.Column(db.String(12))
    amount = db.Column(db.Numeric(10, 2), nullable=False, default=0)

    insurance = db.relationship("Insurance", back_populates="prices")
    service = db.relationship("Service")


class TissGuide(TimestampMixin, db.Model):
    """Guia de tratamento odontológico enviada ao convênio."""
    __tablename__ = "tiss_guides"

    number = db.Column(db.String(20), nullable=False, unique=True)
    insurance_id = db.Column(db.Integer, db.ForeignKey("insurances.id", ondelete="RESTRICT"), nullable=False)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    dentist_id = db.Column(db.Integer, db.ForeignKey("dentists.id", ondelete="RESTRICT"), nullable=False)
    plan_id = db.Column(db.Integer, db.ForeignKey("treatment_plans.id", ondelete="SET NULL"))
    status = db.Column(db.String(20), nullable=False, default="gerada")
    amount = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    paid_amount = db.Column(db.Numeric(10, 2))
    sent_at = db.Column(db.DateTime)

    insurance = db.relationship("Insurance")
    patient = db.relationship("Patient")
    dentist = db.relationship("Dentist")
    plan = db.relationship("TreatmentPlan")

    @property
    def status_label(self) -> str:
        return GUIDE_STATUSES.get(self.status, self.status)

    @property
    def glosa(self):
        if self.paid_amount is None:
            return None
        return self.amount - self.paid_amount
