"""Dados de demonstração dos módulos novos: odontograma, plano, contas, estoque, convênio.

Separado de `seed.py` para o arquivo principal não virar um monólito. Chamado no fim
do `init-db`, depois que pacientes, agenda e financeiro já existem.
"""
import random
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.extensions import db
from app.models import (ALL_TEETH, Appointment, AuditLog, Dentist, Insurance, InsurancePrice, Patient,
                        Payable, Receivable, RecallRule, Service, ServiceSupply, StockItem, TissGuide,
                        ToothState, TreatmentItem, TreatmentPlan, User, WaitlistEntry)
from app.services.billing import receive
from app.services.inventory import adjust
from app.services.messaging import (enqueue_appointment, enqueue_dunning, enqueue_recalls, send_due)
from app.services.treatment import build_installments

MATERIALS = [
    # nome, unidade, qtd, mínimo, custo, fornecedor
    ("Anestésico Mepivacaína 2%", "cx", 6, 4, 72.00, "Dental Cremer"),
    ("Agulha gengival 30G", "cx", 3, 4, 38.50, "Dental Cremer"),
    ("Resina composta A2", "un", 12, 6, 64.90, "3M"),
    ("Ácido fosfórico 37%", "un", 2, 3, 29.00, "FGM"),
    ("Adesivo dentinário", "un", 5, 3, 118.00, "FGM"),
    ("Luva de procedimento M", "cx", 9, 6, 42.00, "Supermedy"),
    ("Sugador descartável", "cx", 14, 8, 24.90, "Supermedy"),
    ("Gel clareador 35%", "un", 4, 3, 189.00, "FGM"),
    ("Pasta profilática", "un", 7, 4, 31.50, "Maquira"),
    ("Fio de sutura 4-0", "un", 2, 4, 46.00, "Technew"),
    ("Broca diamantada 1014", "un", 16, 10, 12.90, "KG Sorensen"),
    ("Moldeira descartável", "cx", 5, 3, 55.00, "Maquira"),
]

# Ficha técnica: procedimento -> [(material, quantidade por procedimento)]
RECIPES = {
    "Limpeza e profilaxia": [("Pasta profilática", 1), ("Luva de procedimento M", 0.04), ("Sugador descartável", 0.02)],
    "Clareamento dental": [("Gel clareador 35%", 1), ("Moldeira descartável", 0.05), ("Luva de procedimento M", 0.04)],
    "Extração de siso": [("Anestésico Mepivacaína 2%", 0.1), ("Agulha gengival 30G", 0.02),
                         ("Fio de sutura 4-0", 1), ("Luva de procedimento M", 0.04)],
    "Próteses fixas": [("Moldeira descartável", 0.1), ("Broca diamantada 1014", 1), ("Luva de procedimento M", 0.04)],
    "Sensibilidade dentária": [("Adesivo dentinário", 0.1), ("Luva de procedimento M", 0.04)],
}

FIXED_COSTS = [
    ("Aluguel da clínica", "aluguel", 4200, True),
    ("Energia elétrica", "outros", 680, True),
    ("Internet e telefonia", "outros", 240, True),
    ("Equipe (recepção e ASB)", "salarios", 6400, True),
    ("Contabilidade", "outros", 590, True),
    ("Simples Nacional", "impostos", 1850, True),
    ("Tráfego pago e redes", "marketing", 900, True),
    ("Autoclave · manutenção", "outros", 380, False),
]


def seed_modules(rng_seed: int = 7) -> None:
    rnd = random.Random(rng_seed)
    today = date.today()
    now = datetime.now()

    sv = {s.name: s for s in Service.query.all()}
    dentists = Dentist.query.order_by(Dentist.id).all()
    lucio = dentists[0]
    admin = User.query.filter_by(role="admin").first()
    patients = Patient.query_active().order_by(Patient.id).all()

    _commissions(dentists)
    items = _stock(sv)
    _plans_and_receivables(rnd, sv, dentists, patients, admin, today)
    _payables(rnd, dentists, today)
    _insurance(sv, dentists, patients, today)
    _waitlist(rnd, sv, dentists, patients)
    _recalls(sv)
    _messages()
    _consume_stock(items)
    _audit(admin, patients, lucio)
    db.session.commit()


# ------------------------------------------------------------------ repasse

def _commissions(dentists) -> None:
    for d, pct, base in zip(dentists, [Decimal("45"), Decimal("50"), Decimal("40")],
                            ["liquido", "liquido", "bruto"]):
        d.commission_pct = pct
        d.commission_base = base


# ------------------------------------------------------------------ estoque

def _stock(sv: dict) -> dict:
    items = {}
    for name, unit, qty, minimum, cost, supplier in MATERIALS:
        it = StockItem(name=name, unit=unit, quantity=Decimal(str(qty)), minimum=Decimal(str(minimum)),
                       unit_cost=Decimal(str(cost)), supplier=supplier)
        db.session.add(it)
        items[name] = it
    db.session.flush()
    for svc_name, recipe in RECIPES.items():
        svc = sv.get(svc_name)
        if svc is None:
            continue
        for mat, qty in recipe:
            db.session.add(ServiceSupply(service=svc, item=items[mat], quantity=Decimal(str(qty))))
    # Algumas entradas de nota fiscal, para o histórico não nascer vazio
    for name in ("Resina composta A2", "Luva de procedimento M", "Broca diamantada 1014"):
        adjust(items[name], Decimal("6"), "Entrada · nota fiscal do fornecedor")
    db.session.flush()
    return items


def _consume_stock(items: dict) -> None:
    """Dá baixa pelas consultas concluídas dos últimos 15 dias."""
    from app.services.inventory import consume_for
    cutoff = datetime.now() - timedelta(days=15)
    for a in (Appointment.query.filter(Appointment.status == "concluido", Appointment.start >= cutoff)
              .order_by(Appointment.start).all()):
        consume_for(a)


# --------------------------------------------------- planos, orçamentos, parcelas

# Histórias clínicas de exemplo: (dentes cariados, dentes a restaurar, canal, extração)
CHARTS = [
    {"cariado": [(16, "O"), (16, "M"), (26, "O")], "a_restaurar": [(36, "O")], "canal_indicado": [47],
     "a_extrair": [38]},
    {"cariado": [(24, "O"), (25, "V")], "restaurado": [(46, "O")], "a_extrair": [48]},
    {"cariado": [(11, "V")], "coroa": [21], "implante": [36], "extraido": [37]},
    {"a_restaurar": [(15, "O"), (14, "O")], "canal": [26], "cariado": [(45, "M")]},
]


def _plans_and_receivables(rnd, sv, dentists, patients, admin, today) -> None:
    lucio = dentists[0]
    chosen = patients[:4] + patients[10:16]

    # Odontograma: histórias clínicas nos primeiros pacientes
    for p, chart in zip(chosen, CHARTS):
        for condition, marks in chart.items():
            for mark in marks:
                tooth, face = mark if isinstance(mark, tuple) else (mark, None)
                if tooth not in ALL_TEETH:
                    continue
                db.session.add(ToothState(patient_id=p.id, tooth=tooth, face=face, condition=condition,
                                          author_id=admin.id if admin else None,
                                          created_at=datetime.now() - timedelta(days=rnd.randint(3, 60))))
    # Dentes hígidos nos demais, para o odontograma não ficar todo vazio
    for p in patients[20:26]:
        for tooth in rnd.sample(ALL_TEETH, 6):
            db.session.add(ToothState(patient_id=p.id, tooth=tooth, condition="hígido",
                                      author_id=admin.id if admin else None))
    db.session.flush()

    # Planos em todos os estágios do funil
    recipes = [
        ("Reabilitação do lado direito", "aprovado", [("Próteses fixas", 16, None, 1), ("Limpeza e profilaxia", None, None, 1)], 3, -40),
        ("Tratamento restaurador", "em_andamento", [("Sensibilidade dentária", 24, "O", 1), ("Sensibilidade dentária", 25, "V", 1), ("Limpeza e profilaxia", None, None, 1)], 2, -20),
        ("Estética do sorriso", "proposto", [("Clareamento dental", None, None, 1), ("Limpeza e profilaxia", None, None, 1)], 2, -5),
        ("Extração dos sisos", "proposto", [("Extração de siso", 38, None, 1), ("Extração de siso", 48, None, 2)], 2, -2),
        ("Plano completo", "recusado", [("Próteses fixas", 36, None, 1), ("Clareamento dental", None, None, 2)], 1, -25),
        ("Manutenção anual", "concluido", [("Limpeza e profilaxia", None, None, 1)], 1, -120),
        ("Canal e restauração", "aprovado", [("Sensibilidade dentária", 47, None, 1), ("Próteses fixas", 47, None, 2)], 4, -55),
    ]
    # A paciente da demo (índice 0) fica com um plano aprovado e um ainda em aberto,
    # para o portal mostrar o orçamento e o termo para assinar.
    owners = [0, 1, 0, 2, 3, 4, 5]
    for i, (title, status, items, parcelas, day_offset) in enumerate(recipes):
        p = chosen[owners[i] % len(chosen)]
        dentist = dentists[i % len(dentists)]
        created = datetime.now() + timedelta(days=day_offset)
        plan = TreatmentPlan(patient=p, dentist=dentist, title=title, status="proposto",
                             valid_until=(created + timedelta(days=30)).date(), created_at=created)
        db.session.add(plan)
        db.session.flush()
        for svc_name, tooth, faces, phase in items:
            svc = sv.get(svc_name)
            if svc is None:
                continue
            price = dentist.price_for(svc) or svc.price or Decimal("300")
            db.session.add(TreatmentItem(plan=plan, service=svc, tooth=tooth, faces=faces, phase=phase,
                                         price=Decimal(price), created_at=created))
        db.session.flush()

        if status == "recusado":
            plan.status = "recusado"
            plan.decided_at = created + timedelta(days=4)
            continue
        if status == "proposto":
            continue

        plan.status = status
        plan.decided_at = created + timedelta(days=rnd.randint(1, 5))
        plan.signed_at = plan.decided_at
        plan.signed_name = p.name
        plan.signed_ip = "189.112.44.17"
        plan.signature_png = _signature_png()
        entrada = (plan.total * Decimal("0.3")).quantize(Decimal("0.01")) if parcelas > 1 else None
        rows = build_installments(plan, parcelas, plan.decided_at.date(), entrada,
                                  rnd.choice(["pix", "cartao", "cartao", "boleto"]))
        db.session.flush()
        # Parcelas vencidas são pagas, menos algumas, para a inadimplência aparecer
        for r in rows:
            if r.due_date < today and rnd.random() < 0.72:
                receive(r, when=datetime.combine(r.due_date, datetime.min.time()) + timedelta(hours=11))
        if status in ("em_andamento", "concluido"):
            live = plan.live_items
            upto = len(live) if status == "concluido" else max(1, len(live) // 2)
            for it in live[:upto]:
                it.status = "executado"
    db.session.flush()

    # Algumas parcelas soltas, de tratamento fechado antes do sistema
    for p in patients[30:35]:
        n = rnd.randint(1, 3)
        base = Decimal(str(rnd.choice([180, 240, 320, 450])))
        for i in range(n):
            due = today + timedelta(days=rnd.randint(-45, 40))
            r = Receivable(patient_id=p.id, description="Tratamento em andamento", installment=i + 1,
                           installments=n, amount=base, due_date=due, method="pix")
            db.session.add(r)
            if due < today and rnd.random() < 0.6:
                db.session.flush()
                receive(r, when=datetime.combine(due, datetime.min.time()) + timedelta(hours=10))
    db.session.flush()


def _signature_png() -> str:
    """Assinatura ilustrativa (traço desenhado), para a demo mostrar o termo assinado."""
    return ("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='90'>"
            "<path d='M12 62 C34 20 46 72 62 44 C78 16 92 70 108 46 C122 24 134 64 150 50 "
            "C168 34 176 62 196 48 C214 36 226 58 248 44 C262 34 272 52 300 40' "
            "fill='none' stroke='%2313213c' stroke-width='2.4' stroke-linecap='round'/></svg>")


# --------------------------------------------------------------- contas a pagar

def _payables(rnd, dentists, today) -> None:
    month = today.replace(day=1)
    for offset in (-1, 0, 1, 2):
        ref = month
        for _ in range(abs(offset)):
            ref = ((ref + timedelta(days=32)).replace(day=1) if offset > 0
                   else (ref - timedelta(days=1)).replace(day=1))
        for desc, cat, amount, recurring in FIXED_COSTS:
            if not recurring and offset != 0:
                continue
            due = ref.replace(day=min(10 if cat == "aluguel" else rnd.randint(5, 25), 28))
            p = Payable(description=desc, category=cat, amount=Decimal(str(amount)), due_date=due,
                        recurring=recurring)
            if due < today and rnd.random() < 0.85:
                p.paid_at = datetime.combine(due, datetime.min.time()) + timedelta(hours=14)
            db.session.add(p)
        # Laboratório: por dentista, para descontar do repasse
        for d in dentists[:2]:
            due = ref.replace(day=20)
            db.session.add(Payable(description=f"Laboratório · {d.name}", category="laboratorio",
                                   amount=Decimal(str(rnd.choice([480, 620, 840, 1150]))), due_date=due,
                                   dentist_id=d.id,
                                   paid_at=(datetime.combine(due, datetime.min.time()) if due < today else None)))
    db.session.flush()


# ------------------------------------------------------------------- convênios

def _insurance(sv, dentists, patients, today) -> None:
    uni = Insurance(name="Uniodonto", ans_code="302147", pay_days=30)
    amil = Insurance(name="Amil Dental", ans_code="326305", pay_days=45)
    db.session.add_all([uni, amil])
    db.session.flush()
    table = {
        "Avaliação inicial": ("81000014", 24.00, 20.00),
        "Limpeza e profilaxia": ("81000154", 48.00, 42.00),
        "Sensibilidade dentária": ("81000308", 36.00, 30.00),
        "Extração de siso": ("82000476", 190.00, 165.00),
    }
    for name, (tuss, v_uni, v_amil) in table.items():
        svc = sv.get(name)
        if svc is None:
            continue
        db.session.add(InsurancePrice(insurance=uni, service=svc, tuss=tuss, amount=Decimal(str(v_uni))))
        db.session.add(InsurancePrice(insurance=amil, service=svc, tuss=tuss, amount=Decimal(str(v_amil))))
    db.session.flush()

    plan_states = [("paga", 30), ("paga", 22), ("enviada", 12), ("enviada", 6), ("glosada", 18), ("gerada", 1)]
    for i, (status, days_ago) in enumerate(plan_states):
        ins = uni if i % 2 == 0 else amil
        pat = patients[40 + i]
        den = dentists[i % len(dentists)]
        amount = Decimal(str([238.00, 96.00, 190.00, 48.00, 214.00, 72.00][i]))
        g = TissGuide(number=f"{today:%Y%m}{i + 1:05d}", insurance=ins, patient=pat, dentist=den,
                      status=status, amount=amount,
                      created_at=datetime.now() - timedelta(days=days_ago))
        if status in ("enviada", "paga", "glosada"):
            g.sent_at = g.created_at + timedelta(days=1)
        if status == "paga":
            g.paid_amount = amount
        if status == "glosada":
            g.paid_amount = (amount * Decimal("0.6")).quantize(Decimal("0.01"))
        db.session.add(g)
    db.session.flush()


# -------------------------------------------------------------- lista de espera

def _waitlist(rnd, sv, dentists, patients) -> None:
    wanted = [("Clareamento dental", "tarde", "Quer antes do casamento da irmã"),
              ("Limpeza e profilaxia", "manha", None),
              ("Extração de siso", "qualquer", "Dor ao mastigar do lado esquerdo"),
              ("Limpeza e profilaxia", "tarde", None),
              ("Próteses fixas", "qualquer", "Aguarda retorno do laboratório")]
    for i, (svc_name, pref, note) in enumerate(wanted):
        db.session.add(WaitlistEntry(patient=patients[25 + i], service=sv.get(svc_name),
                                     dentist=dentists[i % len(dentists)], preference=pref, note=note,
                                     created_at=datetime.now() - timedelta(days=rnd.randint(1, 18))))
    db.session.flush()


# -------------------------------------------------------------------- recall

def _recalls(sv) -> None:
    for name, months in [("Limpeza e profilaxia", 6), ("Clareamento dental", 12),
                         ("Avaliação inicial", 12), ("Sensibilidade dentária", 6)]:
        svc = sv.get(name)
        if svc is not None:
            db.session.add(RecallRule(service_id=svc.id, months=months, active=True))
    db.session.flush()


# ------------------------------------------------------------------ mensagens

def _messages() -> None:
    now = datetime.now()
    for a in (Appointment.query.filter(Appointment.start > now,
                                       Appointment.status.in_(("agendado", "confirmado"))).all()):
        enqueue_appointment(a)
    enqueue_dunning()
    enqueue_recalls()
    db.session.flush()
    send_due(now - timedelta(hours=6))      # o que já passou da hora aparece como enviado
    db.session.flush()

    # Algumas respostas de paciente, para o painel mostrar a taxa de confirmação
    import random
    rnd = random.Random(11)
    from app.models import Message
    for m in Message.query.filter_by(kind="confirmacao", status="enviada").all():
        roll = rnd.random()
        if roll < 0.62:
            m.status = "confirmada"
            m.answered_at = m.sent_at + timedelta(minutes=rnd.randint(3, 240))
            if m.appointment and m.appointment.status == "agendado":
                m.appointment.status = "confirmado"
        elif roll < 0.72:
            m.status = "remarcar"
            m.answered_at = m.sent_at + timedelta(minutes=rnd.randint(5, 300))
    db.session.flush()


# ------------------------------------------------------------------ auditoria

def _audit(admin, patients, lucio) -> None:
    """Trilha de exemplo, para a tela não nascer vazia na demo."""
    base = datetime.now() - timedelta(days=6)
    rows = [
        ("acessou", "Prontuário", "Abriu a ficha do paciente", patients[0]),
        ("alterou", "Odontograma", "Dente 16: Cárie (OM)", patients[0]),
        ("criou", "Orçamento", "Reabilitação do lado direito", patients[0]),
        ("assinou", "Termo de consentimento", "Assinado pelo paciente no portal", patients[0]),
        ("exportou", "Relatório financeiro", "Exportou a planilha do mês", None),
        ("acessou", "Portal do paciente", "Login do paciente no portal", patients[0]),
        ("alterou", "Contas a receber", "Baixa de 1.260,00 em cartão", patients[1]),
        ("exportou", "Ficha do paciente", "Exportação a pedido do paciente (LGPD art. 18)", patients[0]),
    ]
    for i, (action, entity, detail, pat) in enumerate(rows):
        db.session.add(AuditLog(user_id=admin.id if admin else None,
                                user_label=admin.name if admin else "sistema",
                                patient_id=pat.id if pat is not None else None,
                                action=action, entity=entity, detail=detail, ip="189.112.44.17",
                                created_at=base + timedelta(hours=i * 7)))
    db.session.flush()
