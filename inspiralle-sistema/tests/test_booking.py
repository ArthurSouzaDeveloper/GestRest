from datetime import date, timedelta

from app.models import Appointment, Patient

TOMORROW = (date.today() + timedelta(days=1)).isoformat()


def _book(client, hora="10:00", tel="19999990000", **extra):
    payload = {"servico": 1, "dentista": 1, "data": TOMORROW, "hora": hora,
               "nome": "Maria Silva", "telefone": tel, "aceite": True, **extra}
    return client.post("/api/public/agendamentos", json=payload)


def test_lista_servicos_e_horarios(client):
    r = client.get("/api/public/servicos")
    assert r.json["data"][0]["nome"] == "Avaliação"
    r = client.get(f"/api/public/horarios?servico=1&data={TOMORROW}")
    horas = [h["hora"] for h in r.json["data"]]
    assert "08:00" in horas and "19:30" in horas and "20:00" not in horas


def test_agendamento_online_cria_paciente_e_ocupa_horario(client, app):
    r = _book(client)
    assert r.status_code == 201 and r.json["data"]["codigo"]
    with app.app_context():
        assert Patient.query.count() == 1
        a = Appointment.query.one()
        assert a.origin == "site" and a.status == "agendado"
    r = client.get(f"/api/public/horarios?servico=1&data={TOMORROW}")
    assert "10:00" not in [h["hora"] for h in r.json["data"]]


def test_conflito_de_horario_e_bloqueado(client):
    assert _book(client).status_code == 201
    r = _book(client, tel="19988887777")
    assert r.status_code == 409 and "ocupado" in r.json["error"]


def test_mesmo_telefone_reaproveita_ficha(client, app):
    _book(client, hora="09:00")
    _book(client, hora="11:00", tel="(19) 99999-0000")
    with app.app_context():
        assert Patient.query.count() == 1
        assert Appointment.query.count() == 2


def test_validacoes(client):
    assert _book(client, nome="Maria").status_code == 400
    assert _book(client, tel="123").status_code == 400
    assert _book(client, aceite=False).status_code == 400
    assert _book(client, website="spam").status_code == 400


def test_painel_exige_login(client):
    r = client.get("/painel/pacientes/")
    assert r.status_code == 302 and "/painel/login" in r.headers["Location"]


def test_login_e_dashboard(client):
    r = client.post("/painel/login", data={"email": "admin@t.com", "senha": "123"})
    assert r.status_code == 302
    assert client.get("/painel/").status_code == 200
    assert client.get("/painel/agenda/").status_code == 200
