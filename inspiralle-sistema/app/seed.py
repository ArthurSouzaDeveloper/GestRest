"""Dados de demonstração. Profissionais com os nomes reais da clínica; pacientes fictícios."""
import random
import shutil
import unicodedata
import uuid
from pathlib import Path
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.extensions import db
from app.models import Appointment, ClinicalNote, Dentist, DentistPrice, NoteImage, Patient, Service, User
from app.services.availability import business_windows
from app.services.finance import sync_appointment_entry
from app.services.uploads import upload_dir

ASSETS = Path(__file__).resolve().parent / "seed_assets"
DEMO_CPF = "12345678909"
DEMO_PORTAL_PASSWORD = "paciente123"

FIRST = ["Ana", "Bruno", "Carla", "Daniel", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela", "João",
         "Larissa", "Marcos", "Natália", "Otávio", "Paula", "Renata", "Sérgio", "Tatiane", "Vinícius", "Juliana",
         "Lucas", "Mariana", "Pedro", "Beatriz", "André", "Letícia", "Rodrigo", "Fernanda", "Thiago", "Camila"]
LAST = ["Almeida", "Barbosa", "Cardoso", "Costa", "Ferreira", "Gomes", "Lima", "Martins", "Mendes", "Pereira",
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
        Dentist(name="Dr. Lúcio Scalco", specialty="Cirurgião-dentista",
                color="#c9a468", weekdays="0,1,2,3,4,5"),
        Dentist(name="Dra. Rafaela Beloni", specialty="Cirurgiã-dentista",
                color="#4f7cac", weekdays="0,2,4"),
        Dentist(name="Dr. Gustavo Oliveira", specialty="Cirurgião-dentista",
                color="#6aa78c", weekdays="1,2,3,4,5"),
    ]
    db.session.add_all(dentists)
    helena, rafael, camila = dentists  # Lúcio, Rafaela, Gustavo
    helena.services = [sv["Avaliação inicial"], sv["Limpeza e profilaxia"], sv["Clareamento dental"], sv["Sensibilidade dentária"]]
    rafael.services = [sv["Avaliação inicial"], sv["Próteses fixas"], sv["Extração de siso"]]
    camila.services = [sv["Avaliação inicial"], sv["Limpeza e profilaxia"], sv["Sensibilidade dentária"], sv["Clareamento dental"]]

    # Cada dentista define o próprio preço (o resto usa o valor padrão do serviço)
    db.session.add_all([
        DentistPrice(dentist=helena, service=sv["Clareamento dental"], price=Decimal("950")),
        DentistPrice(dentist=helena, service=sv["Limpeza e profilaxia"], price=Decimal("200")),
        DentistPrice(dentist=rafael, service=sv["Próteses fixas"], price=Decimal("2800")),
        DentistPrice(dentist=rafael, service=sv["Extração de siso"], price=Decimal("520")),
        DentistPrice(dentist=camila, service=sv["Limpeza e profilaxia"], price=Decimal("180")),
        DentistPrice(dentist=camila, service=sv["Clareamento dental"], price=Decimal("880")),
    ])

    for name, email, role, pwd, den in [
        ("Administrador", "admin@inspiralle.demo", "admin", "admin123", None),
        ("Recepção", "recepcao@inspiralle.demo", "recepcao", "recepcao123", None),
        ("Dr. Lúcio Scalco", "lucio@inspiralle.demo", "dentista", "dentista123", helena),
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
    db.session.flush()

    _seed_portal_patient(patients[0], helena, sv, admin_user)

    # Financeiro: toda consulta concluída gera o lançamento com o preço do dentista
    for a in Appointment.query.filter_by(status="concluido").all():
        sync_appointment_entry(a)
    db.session.flush()

    from app.seed_modules import seed_modules
    seed_modules()
    db.session.commit()


def _copy_asset(name: str) -> str:
    target = f"{uuid.uuid4().hex}{Path(name).suffix}"
    shutil.copyfile(ASSETS / name, upload_dir() / target)
    return target


def _seed_portal_patient(p: Patient, lucio: Dentist, sv: dict, author: User) -> None:
    """Paciente de demonstração com portal liberado e evolução de clareamento com fotos."""
    p.name = "Juliana Ribeiro"
    p.cpf = DEMO_CPF
    p.email = "juliana.ribeiro@email.com"
    p.allergies = None
    p.set_portal_password(DEMO_PORTAL_PASSWORD, temporary=False)
    p.portal_last_login = datetime.now() - timedelta(days=2)

    # Usa consultas já concluídas do Dr. Lúcio para montar a história dela (sem criar conflitos na agenda)
    past = (Appointment.query
            .filter(Appointment.dentist_id == lucio.id, Appointment.status == "concluido")
            .order_by(Appointment.start).all())
    plan = [
        ("Avaliação inicial", None,
         "Avaliação clínica completa e radiografia panorâmica. Dentes saudáveis, sem cáries. "
         "Combinamos limpeza seguida de clareamento em consultório.",
         [("radiografia.jpg", "Radiografia panorâmica")]),
        ("Limpeza e profilaxia", None,
         "Limpeza completa, remoção de tártaro e aplicação de flúor. Gengiva saudável, pronta para o clareamento.",
         [("profilaxia.jpg", "Depois da limpeza")]),
        ("Clareamento dental", None,
         "Primeira sessão de clareamento. Cor inicial registrada na foto. Sem sensibilidade durante a sessão. "
         "Evite café, vinho e alimentos com corante por 48 horas.",
         [("clareamento-antes.jpg", "Antes do clareamento")]),
        ("Clareamento dental", None,
         "Segunda sessão concluída. Resultado de 4 tons mais claro, dentro do esperado. "
         "Manter a placa de manutenção 1 vez por semana.",
         [("clareamento-antes.jpg", "Antes"), ("clareamento-depois.jpg", "Depois")]),
    ]
    # Limpa anotações aleatórias dela para a história do portal ficar coerente
    ClinicalNote.query.filter_by(patient_id=p.id).delete()
    chosen = [past[int(i * len(past) / len(plan))] for i in range(len(plan))] if len(past) >= len(plan) else past
    for a, (svc_name, tooth, text, imgs) in zip(chosen, plan):
        ClinicalNote.query.filter_by(appointment_id=a.id).delete()
        a.patient = p
        a.service = sv[svc_name]
        note = ClinicalNote(patient=p, appointment=a, author=author, procedure=svc_name, tooth=tooth,
                            text=text, created_at=a.end, visible_to_patient=True)
        for fname, caption in imgs:
            note.images.append(NoteImage(filename=_copy_asset(fname), original_name=fname, caption=caption))
        db.session.add(note)
    if chosen:
        db.session.add(ClinicalNote(patient=p, appointment=chosen[0], author=author, procedure="Anotação interna",
                                    text="Paciente prefere horários no fim da tarde. Avaliar desconto no pacote.",
                                    created_at=chosen[0].end, visible_to_patient=False))

    nxt = (Appointment.query
           .filter(Appointment.dentist_id == lucio.id, Appointment.start > datetime.now(),
                   Appointment.status.in_(("confirmado", "agendado")))
           .order_by(Appointment.start).first())
    if nxt:
        nxt.patient = p
        nxt.service = sv["Limpeza e profilaxia"] if nxt.duration_min >= 45 else sv["Sensibilidade dentária"]
