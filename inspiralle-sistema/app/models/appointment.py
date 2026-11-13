import secrets
from datetime import datetime

from app.extensions import db
from app.models.base import TimestampMixin

STATUSES = {
    "agendado": "Agendado",
    "confirmado": "Confirmado",
    "em_atendimento": "Em atendimento",
    "concluido": "Concluído",
    "faltou": "Faltou",
    "cancelado": "Cancelado",
}
# Status que ocupam o horário na agenda
BLOCKING_STATUSES = ("agendado", "confirmado", "em_atendimento", "concluido")


def new_code() -> str:
    return secrets.token_hex(3).upper()


class Appointment(TimestampMixin, db.Model):
    __tablename__ = "appointments"

    code = db.Column(db.String(8), unique=True, nullable=False, default=new_code)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    dentist_id = db.Column(db.Integer, db.ForeignKey("dentists.id", ondelete="RESTRICT"), nullable=False, index=True)
    service_id = db.Column(db.Integer, db.ForeignKey("services.id", ondelete="RESTRICT"), nullable=False)
    start = db.Column(db.DateTime, nullable=False, index=True)
    end = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.String(20), nullable=False, default="agendado")
    origin = db.Column(db.String(20), nullable=False, default="recepcao")  # site | recepcao
    notes = db.Column(db.Text)

    patient = db.relationship("Patient", back_populates="appointments")
    dentist = db.relationship("Dentist")
    service = db.relationship("Service")

    @property
    def status_label(self) -> str:
        return STATUSES.get(self.status, self.status)

    @property
    def is_past(self) -> bool:
        return self.end < datetime.now()

    @property
    def duration_min(self) -> int:
        return int((self.end - self.start).total_seconds() // 60)
