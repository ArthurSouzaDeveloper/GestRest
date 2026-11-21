"""Contas a receber do tratamento e contas a pagar da clínica."""
from datetime import date
from decimal import Decimal

from app.extensions import db
from app.models.base import TimestampMixin

METHODS = {"pix": "Pix", "cartao": "Cartão", "dinheiro": "Dinheiro", "boleto": "Boleto", "convenio": "Convênio"}
EXPENSE_CATEGORIES = {
    "aluguel": "Aluguel", "material": "Material", "laboratorio": "Laboratório", "salarios": "Equipe",
    "comissao": "Comissão", "impostos": "Impostos", "marketing": "Marketing", "outros": "Outros",
}


class Receivable(TimestampMixin, db.Model):
    """Parcela que o paciente tem a pagar."""
    __tablename__ = "receivables"

    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id = db.Column(db.Integer, db.ForeignKey("treatment_plans.id", ondelete="SET NULL"), index=True)
    description = db.Column(db.String(160), nullable=False)
    installment = db.Column(db.Integer, nullable=False, default=1)
    installments = db.Column(db.Integer, nullable=False, default=1)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    due_date = db.Column(db.Date, nullable=False, index=True)
    paid_at = db.Column(db.DateTime, index=True)
    paid_amount = db.Column(db.Numeric(10, 2))
    method = db.Column(db.String(20))
    fee = db.Column(db.Numeric(10, 2), nullable=False, default=0)   # taxa do meio de pagamento

    patient = db.relationship("Patient", back_populates="receivables")
    plan = db.relationship("TreatmentPlan", back_populates="receivables")

    @property
    def paid(self) -> bool:
        return self.paid_at is not None

    @property
    def overdue_days(self) -> int:
        if self.paid or self.due_date >= date.today():
            return 0
        return (date.today() - self.due_date).days

    @property
    def state(self) -> str:
        if self.paid:
            return "pago"
        if self.overdue_days > 0:
            return "atrasado"
        if self.due_date == date.today():
            return "vence_hoje"
        return "a_vencer"

    @property
    def state_label(self) -> str:
        return {"pago": "Pago", "atrasado": "Em atraso", "vence_hoje": "Vence hoje", "a_vencer": "A vencer"}[self.state]

    @property
    def label(self) -> str:
        if self.installments > 1:
            return f"{self.description} ({self.installment}/{self.installments})"
        return self.description


class Payable(TimestampMixin, db.Model):
    """Conta a pagar da clínica."""
    __tablename__ = "payables"

    description = db.Column(db.String(160), nullable=False)
    category = db.Column(db.String(20), nullable=False, default="outros")
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    due_date = db.Column(db.Date, nullable=False, index=True)
    paid_at = db.Column(db.DateTime)
    recurring = db.Column(db.Boolean, nullable=False, default=False)
    dentist_id = db.Column(db.Integer, db.ForeignKey("dentists.id", ondelete="SET NULL"))

    dentist = db.relationship("Dentist")

    @property
    def paid(self) -> bool:
        return self.paid_at is not None

    @property
    def overdue(self) -> bool:
        return not self.paid and self.due_date < date.today()

    @property
    def category_label(self) -> str:
        return EXPENSE_CATEGORIES.get(self.category, self.category)
