"""Dados de demonstração. Nomes de profissionais e pacientes são fictícios."""
import random
import unicodedata
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.extensions import db
from app.models import Appointment, ClinicalNote, Dentist, Patient, Service, User
from app.services.availability import business_windows

FIRST = ["Ana", "Bruno", "Carla", "Daniel", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela", "João",
         "Larissa", "Marcos", "Natália", "Otávio", "Paula", "Rafaela", "Sérgio", "Tatiane", "Vinícius", "Juliana",
         "Lucas", "Mariana", "Pedro", "Beatriz", "Gustavo", "Letícia", "Rodrigo", "Fernanda", "Thiago", "Camila"]
LAST = ["Almeida", "Barbosa", "Cardoso", "Costa", "Ferreira", "Gomes", "Lima", "Martins", "Oliveira", "Pereira",
        "Ribeiro", "Rodrigues", "Santos", "Silva", "Souza", "Teixeira", "Vieira", "Moraes", "Nunes", "Rocha"]

NOTES = {
    "Avaliação inicial": ["Avaliação clínica completa. Indicada profilaxia e acompanhamento.",
                          "Exame clínico e radiográfico. Plano de tratamento apresentado ao paciente."],
    "Limpeza e profilaxia": ["Profilaxia e aplicação tópica de flúor. Orientação de higiene.",
                             "Remoção de cálculo supragengival. Retorno em 6 meses."],
    "Clareamento dental": ["Sessão de clareamento em consultório. Sem sensibilidade relatada.",
                           "Moldagem para placa de clareamento caseiro. Orientações entregues."],
    "Próteses fixas": ["Preparo e moldagem para coroa. Provisório cimentado.",
                       "Prova da prótese. Ajuste oclusal realizado."],
    "Extração de siso": ["Exodontia do elemento sem intercorrências. Sutura e receita entregues.",
                         "Retorno pós-operatório: boa cicatrização, sutura removida."],
    "Sensibilidade dentária": ["Aplicação de dessensibilizante. Indicado creme dental específico.",
                               "Reavaliação: melhora significativa da sensibilidade."],
}
def _ascii(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()


TEETH = ["11", "21", "36", "46", "38", "48", "16", "26", None, None]


def seed_demo(rng_seed: int = 42) -> None:
    rnd = random.Random(rng_seed)

    services = [
        Service(name="Avaliação inicial", duration_min=30, price=Decimal("0"),
                description="Primeira consulta: exame clínico e plano de tratamento."),
        Service(name="Limpeza e profilaxia", duration_min=45, price=Decimal("180"),
                description="Remoção de tártaro, polimento e flúor."),
        Service(name="Clareamento dental", duration_min=60, price=Decimal("900"),
                description="Clareamento em consultório com acompanhamento."),
        Service(name="Próteses fixas", duration_min=60, price=None,
                description="Consulta para reabilitação com prótese fixa."),
        Service(name="Extração de siso", duration_min=60, price=Decimal("450"),
                description="Avaliação e remoção do terceiro molar."),
        Service(name="Sensibilidade dentária", duration_min=30, price=Decimal("150"),
                description="Diagnóstico e tratamento da sensibilidade."),
    ]
    db.session.add_all(services)
    sv = {s.name: s for s in services}

    dentists = [
        Dentist(name="Dra. Helena Prado", cro="CRO-SP 000001", specialty="Dentística e estética",
                color="#c9a468", weekdays="0,1,2,3,4,5"),
        Dentist(name="Dr. Rafael Moretti", cro="CRO-SP 000002", specialty="Cirurgia e prótese",
                color="#4f7cac", weekdays="0,2,4"),
        Dentist(name="Dra. Camila Duarte", cro="CRO-SP 000003", specialty="Clínica geral",
                color="#6aa78c", weekdays="1,2,3,4,5"),
    ]
    db.session.add_all(dentists)
    helena, rafael, camila = dentists
    helena.services = [sv["Avaliação inicial"], sv["Limpeza e profilaxia"], sv["Clareamento dental"], sv["Sensibilidade dentária"]]
    rafael.services = [sv["Avaliação inicial"], sv["Próteses fixas"], sv["Extração de siso"]]
    camila.services = [sv["Avaliação inicial"], sv["Limpeza e profilaxia"], sv["Sensibilidade dentária"], sv["Clareamento dental"]]

    for name, email, role, pwd, den in [
        ("Administrador", "admin@inspiralle.demo", "admin", "admin123", None),
        ("Recepção", "recepcao@inspiralle.demo", "recepcao", "recepcao123", None),
        ("Dra. Helena Prado", "helena@inspiralle.demo", "dentista", "dentista123", helena),
    ]:
        u = User(name=name, email=email, role=role, dentist=den)
        u.set_password(pwd)
        db.session.add(u)

    patients = []
    used = set()
    while len(patients) < 48:
        n = f"{rnd.choice(FIRST)} {rnd.choice(LAST)}"
        if n in used:
            continue
        used.add(n)
        patients.append(Patient(
            name=n,
            phone=f"19{rnd.choice('9')}{rnd.randint(70000000, 99999999)}",
            email=_ascii(f"{n.split()[0]}.{n.split()[1]}@email.com".lower()),
            cpf=None,
            birth_date=date(rnd.randint(1958, 2010), rnd.randint(1, 12), rnd.randint(1, 28)),
            allergies=rnd.choice([None, None, None, "Dipirona", "Penicilina", "Látex"]),
            medications=rnd.choice([None, None, "Losartana 50mg", "Levotiroxina"]),
            origin=rnd.choice(["recepcao", "recepcao", "site"]),
            created_at=datetime.now() - timedelta(days=rnd.randint(20, 400)),
        ))
    db.session.add_all(patients)
    db.session.flush()

    admin_user = User.query.filter_by(role="admin").first()
    now = datetime.now()
    today = date.today()

    for offset in range(-30, 15):
        day = today + timedelta(days=offset)
        for den in dentists:
            if day.weekday() not in den.weekday_set:
                continue
            fill = 0.75 if offset < 0 else (0.7 if offset == 0 else max(0.15, 0.6 - offset * 0.03))
            for w_start, w_end in business_windows(day):
                cursor = w_start
                while cursor < w_end:
                    svc = rnd.choice(den.services)
                    end = cursor + timedelta(minutes=svc.duration_min)
                    if end > w_end:
                        break
                    if rnd.random() > fill:
                        cursor += timedelta(minutes=30)
                        continue
                    pat = rnd.choice(patients)
                    if end <= now:
                        status = rnd.choices(["concluido", "faltou", "cancelado"], [86, 8, 6])[0]
                    elif cursor <= now:
                        status = "em_atendimento"
                    else:
                        status = rnd.choices(["confirmado", "agendado"], [55, 45] if offset <= 2 else [25, 75])[0]
                    origin = "site" if rnd.random() < 0.35 else "recepcao"
                    appt = Appointment(patient=pat, dentist=den, service=svc, start=cursor, end=end,
                                       status=status, origin=origin,
                                       created_at=min(now, cursor - timedelta(days=rnd.randint(0, 10))))
                    db.session.add(appt)
                    if status == "concluido" and rnd.random() < 0.6:
                        db.session.add(ClinicalNote(
                            patient=pat, appointment=appt, author=admin_user,
                            procedure=svc.name, tooth=rnd.choice(TEETH),
                            text=rnd.choice(NOTES[svc.name]),
                            created_at=end,
                        ))
                    cursor = end
    # Alguns pedidos recentes vindos do site, aguardando confirmação
    for a in Appointment.query.filter(Appointment.start > now, Appointment.status == "agendado").limit(5):
        a.origin = "site"
        a.created_at = now - timedelta(hours=rnd.randint(1, 30))
    db.session.commit()
