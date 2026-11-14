from datetime import datetime

from app.extensions import db
from app.models.base import TimestampMixin


class DentistPrice(TimestampMixin, db.Model):
    """Preço que cada dentista cobra por tratamento (sobrepõe o valor padrão do serviço)."""
    __tablename__ = "dentist_prices"
    __table_args__ = (db.UniqueConstraint("dentist_id", "service_id", name="uq_dentist_service_price"),)

    dentist_id = db.Column(db.Integer, db.ForeignKey("dentists.id", ondelete="CASCADE"), nullable=False, index=True)
    service_id = db.Column(db.Integer, db.ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True)
    price = db.Column(db.Numeric(10, 2), nullable=False)

    dentist = db.relationship("Dentist", back_populates="prices")
    service = db.relationship("Service")


class FinancialEntry(TimestampMixin, db.Model):
    """Receita gerada por uma consulta realizada.

    Criada automaticamente quando a consulta é marcada como "Concluído" e
    removida se o status sair de "Concluído". O valor é copiado do preço no
    momento da conclusão, então mudar a tabela de preços depois não altera o
    histórico. Nunca é exposta no portal do paciente.
    """
    __tablename__ = "financial_entries"

    appointment_id = db.Column(db.Integer, db.ForeignKey("appointments.id", ondelete="CASCADE"),
                               nullable=False, unique=True)
    dentist_id = db.Column(db.Integer, db.ForeignKey("dentists.id", ondelete="RESTRICT"), nullable=False, index=True)
    service_id = db.Column(db.Integer, db.ForeignKey("services.id", ondelete="RESTRICT"), nullable=False, index=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    performed_at = db.Column(db.DateTime, nullable=False, index=True, default=datetime.now)
    amount = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    price_missing = db.Column(db.Boolean, nullable=False, default=False)  # tratamento ainda sem preço
    adjusted_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))  # valor ajustado à mão

    appointment = db.relationship("Appointment", back_populates="financial_entry")
    dentist = db.relationship("Dentist")
    service = db.relationship("Service")
    patient = db.relationship("Patient")
    adjusted_by = db.relationship("User")
