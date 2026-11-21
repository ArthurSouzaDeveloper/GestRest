"""Trilha de auditoria: quem mexeu em quê, exigência para prontuário eletrônico."""
from app.extensions import db
from app.models.base import TimestampMixin

ACTIONS = {
    "criou": "Criou", "alterou": "Alterou", "removeu": "Removeu",
    "acessou": "Acessou", "exportou": "Exportou", "assinou": "Assinou",
}


class AuditLog(TimestampMixin, db.Model):
    """Registro imutável de cada ação sobre dado de paciente."""
    __tablename__ = "audit_logs"

    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), index=True)
    user_label = db.Column(db.String(160), nullable=False)   # cópia do nome: o log sobrevive ao usuário
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id", ondelete="SET NULL"), index=True)
    action = db.Column(db.String(20), nullable=False, index=True)
    entity = db.Column(db.String(60), nullable=False)        # ex.: "Odontograma", "Orçamento"
    entity_id = db.Column(db.Integer)
    detail = db.Column(db.String(300))
    ip = db.Column(db.String(45))

    user = db.relationship("User")
    patient = db.relationship("Patient")

    @property
    def action_label(self) -> str:
        return ACTIONS.get(self.action, self.action)
