"""Configurações do sistema Inspiralle (dev / prod / teste)."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "troque-esta-chave-em-producao")
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", f"sqlite:///{BASE_DIR / 'instance' / 'inspiralle.db'}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Pasta da landing page (servida em "/" para o agendamento usar a mesma origem)
    LANDING_DIR = os.environ.get("LANDING_DIR", str(BASE_DIR.parent / "inspiralle-landing"))

    # Agenda da clínica
    SLOT_MINUTES = 30            # intervalo entre horários oferecidos
    BOOKING_DAYS_AHEAD = 30      # até quantos dias à frente o paciente pode agendar
    MIN_HOURS_NOTICE = 2         # antecedência mínima para agendamento online
    # Horário de funcionamento por dia da semana (0 = segunda ... 6 = domingo)
    BUSINESS_HOURS = {
        0: [("09:00", "12:00"), ("13:30", "19:00")],
        1: [("09:00", "12:00"), ("13:30", "19:00")],
        2: [("09:00", "12:00"), ("13:30", "19:00")],
        3: [("09:00", "12:00"), ("13:30", "19:00")],
        4: [("09:00", "12:00"), ("13:30", "18:00")],
        5: [("09:00", "12:00")],
    }
    CLINIC_WHATSAPP = "5519999393772"


class ProdConfig(Config):
    SESSION_COOKIE_SECURE = True


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False
    MIN_HOURS_NOTICE = 0
