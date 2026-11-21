"""Mensagens automáticas: confirmação de consulta, cobrança e recall."""
from datetime import date, datetime

from app.extensions import db
from app.models.base import TimestampMixin

KINDS = {
    "confirmacao": "Confirmação de consulta",
    "lembrete": "Lembrete véspera",
    "cobranca": "Cobrança",
    "recall": "Retorno (recall)",
    "aniversario": "Aniversário",
}
STATUSES = {
    "fila": "Na fila", "enviada": "Enviada", "respondida": "Respondida",
    "confirmada": "Confirmada", "remarcar": "Pediu remarcar", "erro": "Falhou",
}
# Preço da Meta por mensagem de utilidade (tabela de 01/10/2026, em reais)
COST_PER_MESSAGE = 0.035


class Message(TimestampMixin, db.Model):
    """Uma mensagem de WhatsApp que o sistema programou para o paciente."""
    __tablename__ = "messages"

    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    appointment_id = db.Column(db.Integer, db.ForeignKey("appointments.id", ondelete="CASCADE"), index=True)
    receivable_id = db.Column(db.Integer, db.ForeignKey("receivables.id", ondelete="CASCADE"))
    kind = db.Column(db.String(20), nullable=False, default="confirmacao", index=True)
    status = db.Column(db.String(20), nullable=False, default="fila", index=True)
    scheduled_for = db.Column(db.DateTime, nullable=False, index=True)
    sent_at = db.Column(db.DateTime)
    answered_at = db.Column(db.DateTime)
    body = db.Column(db.Text, nullable=False)

    patient = db.relationship("Patient")
    appointment = db.relationship("Appointment")
    receivable = db.relationship("Receivable")

    @property
    def kind_label(self) -> str:
        return KINDS.get(self.kind, self.kind)

    @property
    def status_label(self) -> str:
        return STATUSES.get(self.status, self.status)


class RecallRule(TimestampMixin, db.Model):
    """Depois de X meses de um serviço, o sistema chama o paciente de volta."""
    __tablename__ = "recall_rules"

    service_id = db.Column(db.Integer, db.ForeignKey("services.id", ondelete="CASCADE"), nullable=False, unique=True)
    months = db.Column(db.Integer, nullable=False, default=6)
    active = db.Column(db.Boolean, nullable=False, default=True)

    service = db.relationship("Service")


class WaitlistEntry(TimestampMixin, db.Model):
    """Paciente que quer encaixe: quando abre um horário, o sistema avisa estes primeiro."""
    __tablename__ = "waitlist"

    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    service_id = db.Column(db.Integer, db.ForeignKey("services.id", ondelete="SET NULL"))
    dentist_id = db.Column(db.Integer, db.ForeignKey("dentists.id", ondelete="SET NULL"))
    preference = db.Column(db.String(20), nullable=False, default="qualquer")  # manha | tarde | qualquer
    note = db.Column(db.String(200))
    active = db.Column(db.Boolean, nullable=False, default=True, index=True)
    called_at = db.Column(db.DateTime)
    scheduled_at = db.Column(db.DateTime)

    patient = db.relationship("Patient")
    service = db.relationship("Service")
    dentist = db.relationship("Dentist")

    @property
    def preference_label(self) -> str:
        return {"manha": "Manhã", "tarde": "Tarde", "qualquer": "Qualquer horário"}.get(self.preference, self.preference)

    @property
    def waiting_days(self) -> int:
        return (datetime.now() - self.created_at).days
