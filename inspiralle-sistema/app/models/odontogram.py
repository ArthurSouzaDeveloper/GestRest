"""Odontograma: estado de cada dente e face do paciente."""
from app.extensions import db
from app.models.base import TimestampMixin

# Faces usadas na marcação (padrão FDI)
FACES = {"O": "Oclusal/Incisal", "M": "Mesial", "D": "Distal", "V": "Vestibular", "L": "Lingual/Palatina"}

# Condições que o dentista marca no dente. cor = como aparece no desenho.
CONDITIONS = {
    "hígido": {"label": "Hígido", "color": "#ffffff", "kind": "dente"},
    "cariado": {"label": "Cárie", "color": "#c0504d", "kind": "face"},
    "restaurado": {"label": "Restaurado", "color": "#4f7cac", "kind": "face"},
    "a_restaurar": {"label": "A restaurar", "color": "#e3a93c", "kind": "face"},
    "canal": {"label": "Canal tratado", "color": "#7b5ea7", "kind": "dente"},
    "canal_indicado": {"label": "Canal indicado", "color": "#b58ad6", "kind": "dente"},
    "coroa": {"label": "Coroa / prótese", "color": "#c9a468", "kind": "dente"},
    "implante": {"label": "Implante", "color": "#3f8f6b", "kind": "dente"},
    "extraido": {"label": "Ausente / extraído", "color": "#9aa0ad", "kind": "dente"},
    "a_extrair": {"label": "Extração indicada", "color": "#d97a66", "kind": "dente"},
}

# Numeração FDI, de cima à esquerda do paciente para a direita
UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11]
UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28]
LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38]
LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41]
UPPER = UPPER_RIGHT + UPPER_LEFT
LOWER = LOWER_RIGHT + LOWER_LEFT
ALL_TEETH = UPPER + LOWER


class ToothState(TimestampMixin, db.Model):
    """Uma marcação no odontograma: dente inteiro ou uma face dele.

    Guardamos o histórico: a marcação mais recente de cada dente/face é a
    que vale. Nada é apagado, porque o prontuário precisa ser mantido.
    """
    __tablename__ = "tooth_states"

    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    tooth = db.Column(db.Integer, nullable=False, index=True)       # 11..48 (FDI)
    face = db.Column(db.String(1))                                   # None = dente inteiro
    condition = db.Column(db.String(20), nullable=False)
    note = db.Column(db.String(200))
    author_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    treatment_item_id = db.Column(db.Integer, db.ForeignKey("treatment_items.id", ondelete="SET NULL"))

    patient = db.relationship("Patient", back_populates="tooth_states")
    author = db.relationship("User")

    @property
    def label(self) -> str:
        return CONDITIONS.get(self.condition, {}).get("label", self.condition)

    @property
    def color(self) -> str:
        return CONDITIONS.get(self.condition, {}).get("color", "#9aa0ad")

    @property
    def face_label(self) -> str:
        return FACES.get(self.face, "Dente todo") if self.face else "Dente todo"


def current_chart(patient_id: int) -> dict:
    """Estado atual: {dente: {"dente": ToothState|None, "faces": {face: ToothState}}}."""
    rows = (ToothState.query.filter_by(patient_id=patient_id)
            .order_by(ToothState.created_at, ToothState.id).all())
    chart = {t: {"dente": None, "faces": {}} for t in ALL_TEETH}
    for r in rows:
        if r.tooth not in chart:
            continue
        if r.face:
            chart[r.tooth]["faces"][r.face] = r
        else:
            chart[r.tooth]["dente"] = r
    return chart
