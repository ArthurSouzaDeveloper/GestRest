"""Cálculo de horários livres e detecção de conflitos.

É a única fonte de verdade para "esse horário está livre?" — usada tanto pelo
agendamento online da landing page quanto pela recepção no painel.
"""
from datetime import date, datetime, time, timedelta

from flask import current_app

from app.extensions import db
from app.models import BLOCKING_STATUSES, Appointment, Dentist, Service


class BookingError(ValueError):
    """Erro de regra de negócio com mensagem amigável para o usuário."""


def _parse_hhmm(value: str) -> time:
    h, m = value.split(":")
    return time(int(h), int(m))


def business_windows(day: date) -> list[tuple[datetime, datetime]]:
    hours = current_app.config["BUSINESS_HOURS"].get(day.weekday(), [])
    return [
        (datetime.combine(day, _parse_hhmm(a)), datetime.combine(day, _parse_hhmm(b)))
        for a, b in hours
    ]


def has_conflict(dentist_id: int, start: datetime, end: datetime, ignore_id: int | None = None) -> bool:
    q = Appointment.query.filter(
        Appointment.dentist_id == dentist_id,
        Appointment.status.in_(BLOCKING_STATUSES),
        Appointment.start < end,
        Appointment.end > start,
    )
    if ignore_id:
        q = q.filter(Appointment.id != ignore_id)
    return db.session.query(q.exists()).scalar()


def free_slots(dentist: Dentist, service: Service, day: date, online: bool = True) -> list[datetime]:
    """Horários de início livres para um dentista/serviço num dia."""
    if not dentist.active or day.weekday() not in dentist.weekday_set:
        return []

    cfg = current_app.config
    step = timedelta(minutes=cfg["SLOT_MINUTES"])
    duration = timedelta(minutes=service.duration_min)
    earliest = datetime.now() + timedelta(hours=cfg["MIN_HOURS_NOTICE"] if online else 0)

    day_start = datetime.combine(day, time.min)
    busy = [
        (a.start, a.end)
        for a in Appointment.query.filter(
            Appointment.dentist_id == dentist.id,
            Appointment.status.in_(BLOCKING_STATUSES),
            Appointment.start < day_start + timedelta(days=1),
            Appointment.end > day_start,
        )
    ]

    slots = []
    for w_start, w_end in business_windows(day):
        cursor = w_start
        while cursor + duration <= w_end:
            end = cursor + duration
            if cursor >= earliest and not any(s < end and e > cursor for s, e in busy):
                slots.append(cursor)
            cursor += step
    return slots


def validate_booking(dentist: Dentist, service: Service, start: datetime,
                     online: bool, ignore_id: int | None = None) -> datetime:
    """Valida o horário e devolve o fim calculado. Lança BookingError se inválido."""
    if not dentist or not dentist.active:
        raise BookingError("Profissional indisponível.")
    if not service or not service.active:
        raise BookingError("Serviço indisponível.")
    if online and dentist not in service.dentists:
        raise BookingError("Este profissional não realiza o serviço escolhido.")

    end = start + timedelta(minutes=service.duration_min)

    if online:
        cfg = current_app.config
        if start < datetime.now() + timedelta(hours=cfg["MIN_HOURS_NOTICE"]):
            raise BookingError("Escolha um horário com pelo menos %d h de antecedência." % cfg["MIN_HOURS_NOTICE"])
        if start.date() > date.today() + timedelta(days=cfg["BOOKING_DAYS_AHEAD"]):
            raise BookingError("Agendamentos online abrem com até %d dias de antecedência." % cfg["BOOKING_DAYS_AHEAD"])
        if start not in free_slots(dentist, service, start.date(), online=True):
            raise BookingError("Esse horário acabou de ser ocupado. Escolha outro, por favor.")
    elif has_conflict(dentist.id, start, end, ignore_id=ignore_id):
        raise BookingError(f"{dentist.name} já tem uma consulta nesse horário.")

    return end
