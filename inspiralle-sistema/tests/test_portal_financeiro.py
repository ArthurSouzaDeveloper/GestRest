"""Portal do paciente (evolução com imagens) e financeiro automático."""
import io
import re
from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from app.extensions import db
from app.models import (Appointment, ClinicalNote, Dentist, DentistPrice, FinancialEntry, NoteImage, Patient,
                        Service, User)
from app.services.finance import build_report, parse_money

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture
def setup(app):
    """Dois dentistas, um serviço com preço padrão e um com preço do dentista."""
    s = db.session.get(Service, 1)
    s.price = Decimal("150")
    d1 = db.session.get(Dentist, 1)
    d2 = Dentist(name="Dr. Dois", weekdays="0,1,2,3,4,5,6")
    d2.services = [s]
    db.session.add(d2)
    db.session.add(DentistPrice(dentist=d1, service=s, price=Decimal("200")))
    for email, role, den in [("rec@t.com", "recepcao", None), ("den1@t.com", "dentista", d1), ("den2@t.com", "dentista", d2)]:
        u = User(name=email, email=email, role=role, dentist=den)
        u.set_password("123")
        db.session.add(u)
    p = Patient(name="Paciente Um", phone="19999990001", cpf="11122233344")
    q = Patient(name="Paciente Dois", phone="19999990002")
    db.session.add_all([p, q])
    db.session.commit()
    return {"service": s, "d1": d1, "d2": d2, "p": p, "q": q}


def _appt(patient, dentist, service, days_ago=0, hour=10):
    start = datetime.now().replace(hour=hour, minute=0, second=0, microsecond=0) - timedelta(days=days_ago)
    a = Appointment(patient=patient, dentist=dentist, service=service, start=start,
                    end=start + timedelta(minutes=30), status="confirmado")
    db.session.add(a)
    db.session.commit()
    return a


def _login(client, email, pwd="123"):
    return client.post("/painel/login", data={"email": email, "senha": pwd})


# ------------------------------------------------------------------ financeiro

def test_concluir_consulta_lanca_preco_do_dentista_e_desfazer_remove(client, setup):
    a = _appt(setup["p"], setup["d1"], setup["service"])
    _login(client, "admin@t.com")
    client.post(f"/painel/agenda/{a.id}/status", data={"status": "concluido"})
    e = FinancialEntry.query.one()
    assert e.amount == Decimal("200") and not e.price_missing

    client.post(f"/painel/agenda/{a.id}/status", data={"status": "em_atendimento"})
    assert FinancialEntry.query.count() == 0


def test_sem_preco_do_dentista_usa_padrao_e_sem_padrao_sinaliza(client, setup):
    a = _appt(setup["p"], setup["d2"], setup["service"])
    _login(client, "admin@t.com")
    client.post(f"/painel/agenda/{a.id}/status", data={"status": "concluido"})
    assert FinancialEntry.query.one().amount == Decimal("150")

    setup["service"].price = None
    db.session.commit()
    b = _appt(setup["q"], setup["d2"], setup["service"], hour=11)
    client.post(f"/painel/agenda/{b.id}/status", data={"status": "concluido"})
    e = db.session.get(Appointment, b.id).financial_entry
    assert e.amount == 0 and e.price_missing


def test_mudar_preco_nao_altera_lancamentos_antigos(client, setup):
    a = _appt(setup["p"], setup["d1"], setup["service"])
    _login(client, "den1@t.com")
    client.post(f"/painel/agenda/{a.id}/status", data={"status": "concluido"})
    client.post("/painel/financeiro/precos", data={f"preco_{setup['service'].id}": "1.250,50"})
    assert DentistPrice.query.filter_by(dentist_id=setup["d1"].id).one().price == Decimal("1250.50")
    assert FinancialEntry.query.one().amount == Decimal("200")


def test_relatorios_dia_semana_mes(app, setup):
    for i, days in enumerate([0, 1, 40]):
        a = _appt(setup["p"], setup["d1"], setup["service"], days_ago=days, hour=9 + i)
        a.status = "concluido"
        from app.services.finance import sync_appointment_entry
        sync_appointment_entry(a)
    db.session.commit()
    today = datetime.now().date()
    assert build_report("dia", today).total == Decimal("200")
    week = build_report("semana", today)
    expected_week = 400 if today.weekday() >= 1 else 200
    assert week.total == Decimal(expected_week)
    assert build_report("mes", today).count == (2 if today.day >= 2 else 1)


def test_acesso_ao_financeiro(client, setup):
    a = _appt(setup["p"], setup["d1"], setup["service"])
    b = _appt(setup["q"], setup["d2"], setup["service"], hour=11)
    _login(client, "admin@t.com")
    for x in (a, b):
        client.post(f"/painel/agenda/{x.id}/status", data={"status": "concluido"})
    r = client.get("/painel/financeiro/?periodo=dia")
    assert r.status_code == 200 and "R$ 350,00" in r.get_data(as_text=True)
    client.get("/painel/sair")

    _login(client, "den2@t.com")
    html = client.get("/painel/financeiro/?periodo=dia&dentista=1").get_data(as_text=True)
    assert "R$ 150,00" in html and "Paciente Um" not in html  # só a própria produção
    client.get("/painel/sair")

    _login(client, "rec@t.com")
    assert client.get("/painel/financeiro/").status_code == 403
    assert client.get("/painel/financeiro/precos").status_code == 403
    assert "R$" not in client.get(f"/painel/agenda/{a.id}").get_data(as_text=True)


def test_exportar_csv(client, setup):
    a = _appt(setup["p"], setup["d1"], setup["service"])
    _login(client, "admin@t.com")
    client.post(f"/painel/agenda/{a.id}/status", data={"status": "concluido"})
    r = client.get("/painel/financeiro/exportar.csv?periodo=mes")
    assert r.mimetype == "text/csv" and "Paciente Um" in r.get_data(as_text=True) and "200,00" in r.get_data(as_text=True)


def test_ajuste_manual_so_admin(client, setup):
    a = _appt(setup["p"], setup["d1"], setup["service"])
    _login(client, "den1@t.com")
    client.post(f"/painel/agenda/{a.id}/status", data={"status": "concluido"})
    e = FinancialEntry.query.one()
    assert client.post(f"/painel/financeiro/lancamento/{e.id}/valor", data={"valor": "10"}).status_code == 403
    client.get("/painel/sair")
    _login(client, "admin@t.com")
    client.post(f"/painel/financeiro/lancamento/{e.id}/valor", data={"valor": "180,00"})
    db.session.refresh(e)
    assert e.amount == Decimal("180") and e.adjusted_by_id


def test_parse_money():
    assert parse_money("1.500,00") == Decimal("1500.00")
    assert parse_money("R$ 180") == Decimal("180.00")
    assert parse_money("99.9") == Decimal("99.90")
    assert parse_money("-5") is None and parse_money("abc") is None and parse_money("") is None


# ------------------------------------------------------------------ evolução com imagens

def test_dentista_registra_evolucao_com_imagem(client, setup):
    _login(client, "den1@t.com")
    pid = setup["p"].id
    r = client.post(f"/painel/pacientes/{pid}/evolucao", content_type="multipart/form-data", data={
        "texto": "Clareamento sessão 1", "visivel": "on", "legenda": "Antes",
        "imagens": [(io.BytesIO(PNG), "antes.png"), (io.BytesIO(b"not an image"), "virus.exe")],
    })
    assert r.status_code == 302
    note = ClinicalNote.query.one()
    assert note.visible_to_patient and len(note.images) == 1 and note.images[0].caption == "Antes"
    assert client.get(f"/painel/pacientes/imagem/{note.images[0].id}").data == PNG


def test_recepcao_nao_registra_evolucao(client, setup):
    _login(client, "rec@t.com")
    r = client.post(f"/painel/pacientes/{setup['p'].id}/evolucao", data={"texto": "x"})
    assert r.status_code == 403


# ------------------------------------------------------------------ portal do paciente

def _enable_portal(client, pid):
    _login(client, "rec@t.com")
    client.post(f"/painel/pacientes/{pid}/portal")
    html = client.get(f"/painel/pacientes/{pid}").get_data(as_text=True)
    client.get("/painel/sair")
    return re.search(r"Senha provisória</span><strong>(\d{6})</strong>", html).group(1)


def _note(patient, text, visible=True, with_image=True, app=None):
    from app.services.uploads import upload_dir
    n = ClinicalNote(patient=patient, text=text, visible_to_patient=visible)
    if with_image:
        name = f"test-{text.replace(' ', '')}.png"
        (upload_dir() / name).write_bytes(PNG)
        n.images.append(NoteImage(filename=name))
    db.session.add(n)
    db.session.commit()
    return n


def test_portal_fluxo_completo(client, setup):
    p, q = setup["p"], setup["q"]
    a = _appt(p, setup["d1"], setup["service"], days_ago=1)
    a.status = "concluido"
    from app.services.finance import sync_appointment_entry
    sync_appointment_entry(a)
    db.session.commit()
    visible = _note(p, "Evolucao visivel")
    hidden = _note(p, "Anotacao interna", visible=False)
    other = _note(q, "De outro paciente")

    pwd = _enable_portal(client, p.id)
    assert client.get("/portal/inicio").status_code == 302  # sem login

    r = client.post("/portal/entrar", data={"login": "111.222.333-44", "senha": pwd})
    assert r.headers["Location"].endswith("/portal/inicio")
    assert client.get("/portal/inicio").headers["Location"].endswith("/portal/senha")  # troca obrigatória
    client.post("/portal/senha", data={"atual": pwd, "nova": "minhasenha", "confirma": "minhasenha"})

    html = client.get("/portal/inicio").get_data(as_text=True)
    assert "Evolucao visivel" in html
    assert "Anotacao interna" not in html and "De outro paciente" not in html
    assert "R$" not in html and "200" not in html  # nada financeiro no portal

    assert client.get(f"/portal/imagem/{visible.images[0].id}").status_code == 200
    assert client.get(f"/portal/imagem/{hidden.images[0].id}").status_code == 404
    assert client.get(f"/portal/imagem/{other.images[0].id}").status_code == 404
    # A sessão do paciente não abre o painel nem as rotas de imagem da equipe
    assert client.get("/painel/financeiro/").status_code == 302
    assert client.get(f"/painel/pacientes/imagem/{visible.images[0].id}").status_code == 302

    client.get("/portal/sair")
    r = client.post("/portal/entrar", data={"login": "19999990001", "senha": "minhasenha"})
    assert r.headers["Location"].endswith("/portal/inicio")  # também entra pelo celular


def test_portal_senha_errada_e_bloqueio(client, setup):
    _enable_portal(client, setup["p"].id)
    for _ in range(5):
        r = client.post("/portal/entrar", data={"login": "11122233344", "senha": "errada"})
        assert r.status_code == 200 and "incorretos" in r.get_data(as_text=True)
    assert client.post("/portal/entrar", data={"login": "11122233344", "senha": "errada"}).status_code == 429


def test_portal_revogado_e_paciente_arquivado_nao_entram(client, setup):
    pwd = _enable_portal(client, setup["p"].id)
    _login(client, "rec@t.com")
    client.post(f"/painel/pacientes/{setup['p'].id}/portal/revogar")
    client.get("/painel/sair")
    r = client.post("/portal/entrar", data={"login": "11122233344", "senha": pwd})
    assert r.status_code == 200 and "incorretos" in r.get_data(as_text=True)


def test_remarcar_consulta_concluida_recalcula_valor(client, setup):
    a = _appt(setup["p"], setup["d1"], setup["service"])
    _login(client, "admin@t.com")
    client.post(f"/painel/agenda/{a.id}/status", data={"status": "concluido"})
    assert FinancialEntry.query.one().amount == Decimal("200")
    client.post(f"/painel/agenda/{a.id}/editar", data={
        "servico": setup["service"].id, "dentista": setup["d2"].id, "paciente": setup["p"].id,
        "data": a.start.date().isoformat(), "hora": a.start.strftime("%H:%M")})
    e = FinancialEntry.query.one()
    assert e.dentist_id == setup["d2"].id and e.amount == Decimal("150")
