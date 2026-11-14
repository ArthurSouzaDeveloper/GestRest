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
    # Quando falso, a anotação fica só para a equipe (não aparece no portal do paciente)
    visible_to_patient = db.Column(db.Boolean, nullable=False, default=True)

    patient = db.relationship("Patient", back_populates="clinical_notes")
    appointment = db.relationship("Appointment")
    author = db.relationship("User")
    images = db.relationship("NoteImage", back_populates="note", cascade="all, delete-orphan",
                             order_by="NoteImage.id")

    @property
    def professional_name(self) -> str:
        if self.appointment:
            return self.appointment.dentist.name
        return self.author.name if self.author else ""


class NoteImage(TimestampMixin, db.Model):
    """Foto ou radiografia anexada a uma evolução (guardada em instance/uploads)."""
    __tablename__ = "note_images"

    note_id = db.Column(db.Integer, db.ForeignKey("clinical_notes.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = db.Column(db.String(80), nullable=False, unique=True)  # nome gerado (uuid.ext)
    original_name = db.Column(db.String(200))
    caption = db.Column(db.String(200))

    note = db.relationship("ClinicalNote", back_populates="images")
