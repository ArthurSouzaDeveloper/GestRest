import bcrypt
from flask_login import UserMixin

from app.extensions import db
from app.models.base import TimestampMixin

ROLES = {
    "admin": "Administrador",
    "recepcao": "Recepção",
    "dentista": "Dentista",
}


class User(TimestampMixin, UserMixin, db.Model):
    __tablename__ = "users"

    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(160), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(128), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="recepcao")
    active = db.Column(db.Boolean, nullable=False, default=True)
    dentist_id = db.Column(db.Integer, db.ForeignKey("dentists.id", ondelete="SET NULL"))

    dentist = db.relationship("Dentist")

    def set_password(self, raw: str) -> None:
        self.password_hash = bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()

    def check_password(self, raw: str) -> bool:
        return bcrypt.checkpw(raw.encode(), self.password_hash.encode())

    @property
    def is_active(self) -> bool:  # usado pelo Flask-Login
        return self.active

    @property
    def role_label(self) -> str:
        return ROLES.get(self.role, self.role)
