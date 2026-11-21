"""Mensagens automáticas de WhatsApp: confirmação, lembrete, cobrança e recall.

A demo só monta a fila e mostra o texto exato que sairia. O envio de verdade
exige uma conta na API oficial da Meta (ou um gateway); o resto da regra já está aqui.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal

from flask import current_app

from app.extensions import db
from app.models import (Appointment, COST_PER_MESSAGE, Message, RecallRule, Receivable, WaitlistEntry)

CLINIC = "Inspiralle Odontologia"


def _first_name(full: str) -> str:
    return full.split()[0]


def confirmation_text(appt: Appointment) -> str:
    return (f"Olá, {_first_name(appt.patient.name)}! Aqui é da {CLINIC}. "
            f"Sua consulta de {appt.service.name} com {appt.dentist.name} está marcada para "
            f"{appt.start.strftime('%d/%m')} às {appt.start.strftime('%H:%M')}. "
            f"Responda 1 para confirmar ou 2 para remarcar.")


def reminder_text(appt: Appointment) -> str:
    return (f"{_first_name(appt.patient.name)}, passando para lembrar da sua consulta amanhã "
            f"às {appt.start.strftime('%H:%M')} na {CLINIC}. Até lá!")


def dunning_text(r: Receivable) -> str:
    days = r.overdue_days
    valor = f"R$ {r.amount:.2f}".replace(".", ",")
    if days <= 3:
        return (f"Olá, {_first_name(r.patient.name)}! A parcela de {valor} do seu tratamento "
                f"venceu em {r.due_date.strftime('%d/%m')}. Quer que eu envie o Pix?")
    if days <= 15:
        return (f"{_first_name(r.patient.name)}, sua parcela de {valor} está com {days} dias de atraso. "
                f"Podemos reparcelar se ficar melhor para você. Me chama aqui.")
    return (f"{_first_name(r.patient.name)}, seguimos com {valor} em aberto desde "
            f"{r.due_date.strftime('%d/%m')}. Vamos combinar uma forma de regularizar?")


def recall_text(patient_name: str, service_name: str, months: int) -> str:
    return (f"Olá, {_first_name(patient_name)}! Já faz {months} meses da sua última "
            f"{service_name.lower()} na {CLINIC}. Quer agendar o retorno?")


def waitlist_text(w: WaitlistEntry, start: datetime) -> str:
    return (f"{_first_name(w.patient.name)}, abriu um horário na {CLINIC}: "
            f"{start.strftime('%d/%m às %H:%M')}. Quer esse encaixe? Responda SIM que já reservo.")


def _exists(patient_id: int, kind: str, appointment_id=None, receivable_id=None) -> bool:
    q = Message.query.filter_by(patient_id=patient_id, kind=kind)
    if appointment_id:
        q = q.filter_by(appointment_id=appointment_id)
    if receivable_id:
        q = q.filter_by(receivable_id=receivable_id)
    return db.session.query(q.exists()).scalar()


def enqueue_appointment(appt: Appointment) -> list[Message]:
    """Confirmação na marcação e lembrete na véspera."""
    out = []
    if appt.status in ("cancelado", "faltou", "concluido"):
        return out
    if not _exists(appt.patient_id, "confirmacao", appointment_id=appt.id):
        out.append(Message(patient_id=appt.patient_id, appointment_id=appt.id, kind="confirmacao",
                           scheduled_for=datetime.now(), body=confirmation_text(appt)))
    vespera = appt.start - timedelta(days=1)
    if vespera > datetime.now() and not _exists(appt.patient_id, "lembrete", appointment_id=appt.id):
        out.append(Message(patient_id=appt.patient_id, appointment_id=appt.id, kind="lembrete",
                           scheduled_for=vespera.replace(hour=18, minute=0, second=0, microsecond=0),
                           body=reminder_text(appt)))
    db.session.add_all(out)
    return out


def enqueue_dunning(ref: date | None = None) -> list[Message]:
    """Régua de cobrança: 1 mensagem por parcela em atraso, nos marcos 1, 7 e 20 dias."""
    ref = ref or date.today()
    out = []
    for r in Receivable.query.filter(Receivable.paid_at.is_(None), Receivable.due_date < ref).all():
        if r.overdue_days not in (1, 7, 20) or _exists(r.patient_id, "cobranca", receivable_id=r.id):
            continue
        out.append(Message(patient_id=r.patient_id, receivable_id=r.id, kind="cobranca",
                           scheduled_for=datetime.now(), body=dunning_text(r)))
    db.session.add_all(out)
    return out


def enqueue_recalls(ref: date | None = None) -> list[Message]:
    """Para cada regra de recall, chama quem passou do prazo e não voltou."""
    ref = ref or date.today()
    out = []
    for rule in RecallRule.query.filter_by(active=True).all():
        cutoff = datetime.combine(ref, datetime.min.time()) - timedelta(days=30 * rule.months)
        done = (Appointment.query.filter(Appointment.service_id == rule.service_id,
                                         Appointment.status == "concluido",
                                         Appointment.start <= cutoff)
                .order_by(Appointment.start.desc()).all())
        seen = set()
        for a in done:
            if a.patient_id in seen:
                continue
            seen.add(a.patient_id)
            future = Appointment.query.filter(Appointment.patient_id == a.patient_id,
                                              Appointment.start > datetime.now()).count()
            if future or _exists(a.patient_id, "recall"):
                continue
            out.append(Message(patient_id=a.patient_id, kind="recall", scheduled_for=datetime.now(),
                               body=recall_text(a.patient.name, rule.service.name, rule.months)))
    db.session.add_all(out)
    return out


def send_due(now: datetime | None = None, limit: int = 200) -> int:
    """Marca como enviadas as mensagens cuja hora chegou.

    Em produção, aqui entraria a chamada à API do WhatsApp. A demo só muda o status
    para a clínica ver o fluxo funcionando ponta a ponta.
    """
    now = now or datetime.now()
    rows = (Message.query.filter(Message.status == "fila", Message.scheduled_for <= now)
            .order_by(Message.scheduled_for).limit(limit).all())
    for m in rows:
        m.status = "enviada"
        m.sent_at = now
    return len(rows)


def month_cost(ref: date | None = None) -> dict:
    """Quanto a clínica gastaria com as mensagens do mês."""
    ref = ref or date.today()
    start = ref.replace(day=1)
    end = (start + timedelta(days=32)).replace(day=1)
    n = Message.query.filter(Message.scheduled_for >= datetime.combine(start, datetime.min.time()),
                             Message.scheduled_for < datetime.combine(end, datetime.min.time())).count()
    unit = Decimal(str(current_app.config.get("WHATSAPP_COST", COST_PER_MESSAGE)))
    return {"count": n, "unit": unit, "total": (unit * n).quantize(Decimal("0.01"))}


def openings_for_waitlist(day: date, slots: list[datetime]) -> list[tuple[WaitlistEntry, datetime]]:
    """Casa os horários vagos do dia com quem está na lista de espera."""
    waiting = (WaitlistEntry.query.filter_by(active=True)
               .order_by(WaitlistEntry.created_at).all())
    pairs = []
    used = set()
    for slot in slots:
        period = "manha" if slot.hour < 12 else "tarde"
        for w in waiting:
            if w.id in used or w.preference not in (period, "qualquer"):
                continue
            pairs.append((w, slot))
            used.add(w.id)
            break
    return pairs
