from app.extensions import db
from app.models.base import TimestampMixin


class ClinicalNote(TimestampMixin, db.Model):
    """Evolução clínica registrada no prontuário do paciente."""
    __tablename__ = "clinical_notes"

    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    appointment_id = db.Column(db.Integer, db.ForeignKey("appointments.id", ondelete="SET NULL"))
    author_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    procedure = db.Column(db.String(160))
    tooth = db.Column(db.String(40))
    text = db.Column(db.Text, nullable=False)

    patient = db.relationship("Patient", back_populates="clinical_notes")
    appointment = db.relationship("Appointment")
    author = db.relationship("User")
