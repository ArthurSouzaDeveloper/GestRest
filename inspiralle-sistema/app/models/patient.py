import re
from datetime import date

from app.extensions import db
from app.models.base import TimestampMixin


def only_digits(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


class Patient(TimestampMixin, db.Model):
    __tablename__ = "patients"

    name = db.Column(db.String(160), nullable=False, index=True)
    phone = db.Column(db.String(20), nullable=False, index=True)  # só dígitos
    email = db.Column(db.String(160))
    cpf = db.Column(db.String(14), index=True)
    birth_date = db.Column(db.Date)
    address = db.Column(db.String(255))
    # Anamnese resumida
    allergies = db.Column(db.String(255))
    medications = db.Column(db.String(255))
    health_notes = db.Column(db.Text)
    notes = db.Column(db.Text)
    origin = db.Column(db.String(20), nullable=False, default="recepcao")  # site | recepcao
    deleted_at = db.Column(db.DateTime)  # exclusão lógica (prontuário deve ser mantido)

    appointments = db.relationship(
        "Appointment", back_populates="patient", cascade="all, delete-orphan",
        order_by="desc(Appointment.start)",
    )
    clinical_notes = db.relationship(
        "ClinicalNote", back_populates="patient", cascade="all, delete-orphan",
        order_by="desc(ClinicalNote.created_at)",
    )

    @classmethod
    def query_active(cls):
        return cls.query.filter(cls.deleted_at.is_(None))

    @property
    def phone_fmt(self) -> str:
        d = self.phone
        if len(d) == 11:
            return f"({d[:2]}) {d[2:7]}-{d[7:]}"
        if len(d) == 10:
            return f"({d[:2]}) {d[2:6]}-{d[6:]}"
        return d

    @property
    def whatsapp_link(self) -> str:
        return f"https://wa.me/55{self.phone}"

    @property
    def age(self) -> int | None:
        if not self.birth_date:
            return None
        t = date.today()
        b = self.birth_date
        return t.year - b.year - ((t.month, t.day) < (b.month, b.day))

    @property
    def initials(self) -> str:
        parts = self.name.split()
        return (parts[0][0] + (parts[-1][0] if len(parts) > 1 else "")).upper()
