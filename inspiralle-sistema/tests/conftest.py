import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import Dentist, Service, User  # noqa: E402


@pytest.fixture
def app():
    app = create_app("test")
    # Atende todos os dias das 08h às 20h, para os testes não dependerem do dia da semana
    app.config["BUSINESS_HOURS"] = {d: [("08:00", "20:00")] for d in range(7)}
    with app.app_context():
        db.create_all()
        s = Service(name="Avaliação", duration_min=30)
        d = Dentist(name="Dra. Teste", weekdays="0,1,2,3,4,5,6")
        d.services = [s]
        u = User(name="Admin", email="admin@t.com", role="admin")
        u.set_password("123")
        db.session.add_all([s, d, u])
        db.session.commit()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()
