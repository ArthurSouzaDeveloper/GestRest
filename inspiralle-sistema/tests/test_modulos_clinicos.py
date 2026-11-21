"""Odontograma, plano de tratamento, contas a receber, repasse, mensagens e estoque."""
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.extensions import db
from app.models import (Appointment, Dentist, Message, Patient, Payable, Receivable, RecallRule,
                        Service, ServiceSupply, StockItem, StockMove, ToothState, TreatmentItem,
                        TreatmentPlan, current_chart)
from app.services import billing, commission, inventory
from app.services import messaging as msg
from app.services.treatment import build_installments, decide, mark_item_done, suggestions_from_chart


@pytest.fixture
def base(app):
    s = db.session.get(Service, 1)
    s.price = Decimal("300")
    d = db.session.get(Dentist, 1)
    d.commission_pct = Decimal("50")
    d.commission_base = "liquido"
    p = Patient(name="Maria Teste", phone="19999990000")
    db.session.add(p)
    db.session.commit()
    return {"service": s, "dentist": d, "patient": p}


def _plan(base, n_items=2, price="300"):
    plan = TreatmentPlan(patient=base["patient"], dentist=base["dentist"], title="Plano")
    db.session.add(plan)
    for i in range(n_items):
        db.session.add(TreatmentItem(plan=plan, service=base["service"], tooth=16 + i,
                                     price=Decimal(price)))
    db.session.commit()
    return plan


# ------------------------------------------------------------------ odontograma

def test_odontograma_guarda_historico_e_vale_a_marcacao_mais_recente(base):
    p = base["patient"]
    db.session.add(ToothState(patient_id=p.id, tooth=16, face="O", condition="cariado"))
    db.session.commit()
    db.session.add(ToothState(patient_id=p.id, tooth=16, face="O", condition="restaurado"))
    db.session.commit()
    chart = current_chart(p.id)
    assert chart[16]["faces"]["O"].condition == "restaurado"
    assert ToothState.query.filter_by(patient_id=p.id).count() == 2   # nada é apagado


def test_sugestoes_vem_das_condicoes_pendentes(base):
    p = base["patient"]
    db.session.add_all([
        ToothState(patient_id=p.id, tooth=16, face="O", condition="cariado"),
        ToothState(patient_id=p.id, tooth=16, face="M", condition="cariado"),
        ToothState(patient_id=p.id, tooth=21, condition="hígido"),
        ToothState(patient_id=p.id, tooth=38, condition="a_extrair"),
    ])
    db.session.commit()
    sug = suggestions_from_chart(p.id)
    assert {s["tooth"] for s in sug} == {16, 38}
    assert next(s for s in sug if s["tooth"] == 16)["faces"] == "MO"


# -------------------------------------------------------- plano e parcelamento

def test_aprovar_plano_gera_parcelas_com_entrada(base):
    plan = _plan(base, n_items=2, price="500")        # total 1000
    created = decide(plan, True, installments=3, first_due=date(2026, 3, 10),
                     down_payment=Decimal("250"), method="cartao")
    db.session.commit()
    assert plan.status == "aprovado"
    assert all(i.status == "aprovado" for i in plan.items)
    assert len(created) == 4                           # entrada + 3 parcelas
    assert created[0].amount == Decimal("250.00")
    assert sum(r.amount for r in created) == Decimal("1000.00")
    assert [r.due_date.month for r in created] == [3, 4, 5, 6]


def test_recusar_plano_nao_gera_parcela(base):
    plan = _plan(base)
    assert decide(plan, False) == []
    db.session.commit()
    assert plan.status == "recusado" and Receivable.query.count() == 0


def test_reparcelar_apaga_as_parcelas_em_aberto_e_mantem_as_pagas(base):
    plan = _plan(base, n_items=1, price="600")
    rows = build_installments(plan, 3, date.today())
    db.session.commit()
    billing.receive(rows[0])
    db.session.commit()
    build_installments(plan, 2, date.today())
    db.session.commit()
    assert Receivable.query.filter(Receivable.paid_at.isnot(None)).count() == 1
    assert Receivable.query.filter(Receivable.paid_at.is_(None)).count() == 2


def test_executar_todos_os_itens_fecha_o_plano(base):
    plan = _plan(base, n_items=2)
    for it in plan.items:
        mark_item_done(it)
    db.session.commit()
    assert plan.status == "concluido" and plan.progress == 100


# ------------------------------------------------------------ contas a receber

def test_parcela_vencida_entra_como_atraso_e_baixa_calcula_taxa(base):
    r = Receivable(patient_id=base["patient"].id, description="Parcela", amount=Decimal("1000"),
                   due_date=date.today() - timedelta(days=5), method="cartao")
    db.session.add(r)
    db.session.commit()
    assert r.state == "atrasado" and r.overdue_days == 5
    s = billing.summary()
    assert r in s.overdue and s.overdue_total == Decimal("1000")

    billing.receive(r, method="cartao")
    db.session.commit()
    assert r.paid and r.state == "pago"
    assert r.fee == Decimal("39.90")                   # 3,99% da maquininha


def test_regua_de_cobranca_so_dispara_nos_marcos(base):
    for days in (1, 3, 7):
        db.session.add(Receivable(patient_id=base["patient"].id, description=f"P{days}",
                                  amount=Decimal("100"), due_date=date.today() - timedelta(days=days)))
    db.session.commit()
    created = msg.enqueue_dunning()
    db.session.commit()
    assert len(created) == 2                           # 1 e 7 dias; 3 dias não é marco
    assert all(m.kind == "cobranca" for m in created)
    assert msg.enqueue_dunning() == []                 # não repete a mesma parcela


# -------------------------------------------------------------------- repasse

def test_repasse_desconta_material_laboratorio_e_cartao(base, app):
    item = StockItem(name="Resina", quantity=Decimal("10"), unit_cost=Decimal("50"))
    db.session.add(item)
    db.session.add(ServiceSupply(service=base["service"], item=item, quantity=Decimal("1")))
    start = datetime.now().replace(hour=10, minute=0, second=0, microsecond=0)
    appt = Appointment(patient=base["patient"], dentist=base["dentist"], service=base["service"],
                       start=start, end=start + timedelta(minutes=30), status="concluido")
    db.session.add(appt)
    db.session.add(Payable(description="Lab", category="laboratorio", amount=Decimal("100"),
                           due_date=date.today(), dentist_id=base["dentist"].id))
    db.session.commit()
    from app.services.finance import sync_appointment_entry
    sync_appointment_entry(appt)
    db.session.commit()

    rows = commission.build("mes", date.today())
    c = next(r for r in rows if r.dentist.id == base["dentist"].id)
    assert c.gross == Decimal("300")
    assert c.supplies == Decimal("50") and c.lab == Decimal("100")
    assert c.net == Decimal("150")
    assert c.amount == Decimal("75.00")                # 50% sobre o líquido
    assert c.clinic_share == Decimal("75.00")


# ------------------------------------------------------------------- estoque

def test_consulta_concluida_da_baixa_no_material_uma_vez(base):
    item = StockItem(name="Luva", quantity=Decimal("10"), unit_cost=Decimal("2"))
    db.session.add(item)
    db.session.add(ServiceSupply(service=base["service"], item=item, quantity=Decimal("2")))
    start = datetime.now()
    appt = Appointment(patient=base["patient"], dentist=base["dentist"], service=base["service"],
                       start=start, end=start + timedelta(minutes=30), status="concluido")
    db.session.add(appt)
    db.session.commit()

    inventory.consume_for(appt)
    db.session.commit()
    assert item.quantity == Decimal("8")
    inventory.consume_for(appt)                        # idempotente
    db.session.commit()
    assert item.quantity == Decimal("8") and StockMove.query.count() == 1


def test_lista_de_compras_pega_o_que_esta_abaixo_do_minimo(base):
    db.session.add_all([
        StockItem(name="Baixo", quantity=Decimal("1"), minimum=Decimal("4"), unit_cost=Decimal("10")),
        StockItem(name="Ok", quantity=Decimal("9"), minimum=Decimal("4"), unit_cost=Decimal("10")),
    ])
    db.session.commit()
    lista = inventory.shopping_list()
    assert [r["item"].name for r in lista] == ["Baixo"]
    assert lista[0]["need"] == Decimal("7") and lista[0]["cost"] == Decimal("70.00")


# ----------------------------------------------------------------- mensagens

def test_confirmacao_e_lembrete_sao_montados_uma_vez_por_consulta(base):
    start = datetime.now() + timedelta(days=3)
    appt = Appointment(patient=base["patient"], dentist=base["dentist"], service=base["service"],
                       start=start, end=start + timedelta(minutes=30), status="agendado")
    db.session.add(appt)
    db.session.commit()
    created = msg.enqueue_appointment(appt)
    db.session.commit()
    assert {m.kind for m in created} == {"confirmacao", "lembrete"}
    assert "Responda 1 para confirmar" in created[0].body
    assert msg.enqueue_appointment(appt) == []
    assert Message.query.count() == 2


def test_envio_respeita_a_hora_programada(base):
    agora = datetime.now()
    db.session.add_all([
        Message(patient_id=base["patient"].id, kind="recall", scheduled_for=agora - timedelta(hours=1), body="a"),
        Message(patient_id=base["patient"].id, kind="recall", scheduled_for=agora + timedelta(days=1), body="b"),
    ])
    db.session.commit()
    assert msg.send_due(agora) == 1
    db.session.commit()
    assert Message.query.filter_by(status="fila").count() == 1


def test_recall_nao_chama_quem_ja_tem_consulta_marcada(base):
    antigo = datetime.now() - timedelta(days=400)
    db.session.add(Appointment(patient=base["patient"], dentist=base["dentist"], service=base["service"],
                               start=antigo, end=antigo + timedelta(minutes=30), status="concluido"))
    db.session.add(RecallRule(service_id=base["service"].id, months=6))
    db.session.commit()
    assert len(msg.enqueue_recalls()) == 1
    db.session.rollback()

    futuro = datetime.now() + timedelta(days=5)
    db.session.add(Appointment(patient=base["patient"], dentist=base["dentist"], service=base["service"],
                               start=futuro, end=futuro + timedelta(minutes=30), status="agendado"))
    db.session.commit()
    assert msg.enqueue_recalls() == []


# ------------------------------------------------------- permissões e auditoria

def _login(client, email="admin@t.com", pwd="123"):
    import re
    html = client.get("/painel/login").data.decode()
    m = re.search(r'name="_csrf" value="([^"]+)"', html)
    data = {"email": email, "senha": pwd}
    if m:
        data["_csrf"] = m.group(1)
    return client.post("/painel/login", data=data, follow_redirects=True)


def test_recepcao_nao_ve_repasse_nem_contas_a_pagar(app, client, base):
    from app.models import User
    u = User(name="Recepção", email="rec@t.com", role="recepcao")
    u.set_password("123")
    db.session.add(u)
    db.session.commit()
    _login(client, "rec@t.com")
    assert client.get("/painel/contas/comissao").status_code == 403
    assert client.get("/painel/contas/pagar").status_code == 403
    assert client.get("/painel/indicadores/").status_code == 403
    assert client.get("/painel/contas/receber").status_code == 200   # pode dar baixa


def test_odontograma_registra_na_trilha_de_auditoria(app, client, base):
    from app.models import AuditLog
    _login(client)
    r = client.post(f"/painel/clinico/paciente/{base['patient'].id}/odontograma/marcar",
                    data={"dente": "16", "condicao": "cariado", "face": "O"}, follow_redirects=True)
    assert r.status_code == 200
    assert ToothState.query.count() == 1
    log = AuditLog.query.filter_by(entity="Odontograma").first()
    assert log is not None and "Dente 16" in log.detail


def test_paciente_nao_ve_valor_de_outro_paciente_no_portal(app, client, base):
    outro = Patient(name="Outro", phone="19988887777", cpf="98765432100")
    outro.set_portal_password("segredo123", temporary=False)
    db.session.add(outro)
    plan = _plan(base)                                  # plano é da Maria, não do Outro
    db.session.commit()
    import re
    html = client.get("/portal/entrar").data.decode()
    m = re.search(r'name="_csrf" value="([^"]+)"', html)
    data = {"login": "98765432100", "senha": "segredo123"}
    if m:
        data["_csrf"] = m.group(1)
    client.post("/portal/entrar", data=data, follow_redirects=True)
    assert client.get(f"/portal/orcamento/{plan.id}").status_code == 404
    assert "R$" not in client.get("/portal/orcamentos").data.decode()
