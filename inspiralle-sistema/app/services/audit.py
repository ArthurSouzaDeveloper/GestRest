"""Trilha de auditoria. Toda ação sobre dado de paciente passa por aqui.

Exigência de prontuário eletrônico: é preciso saber quem viu e quem alterou.
O registro não é editável e não é apagado junto com o dado.
"""
from flask import has_request_context, request
from flask_login import current_user

from app.extensions import db
from app.models import AuditLog


def log(action: str, entity: str, *, entity_id: int | None = None, patient_id: int | None = None,
        detail: str | None = None, actor: str | None = None) -> AuditLog:
    """Grava uma linha na trilha. Não commita: segue a transação de quem chamou."""
    user_id = None
    label = actor or "sistema"
    try:
        if current_user and current_user.is_authenticated:
            user_id = current_user.id
            label = actor or current_user.name
    except RuntimeError:          # fora de requisição (tarefa automática, seed)
        pass
    entry = AuditLog(user_id=user_id, user_label=label, patient_id=patient_id, action=action,
                     entity=entity, entity_id=entity_id, detail=detail,
                     ip=request.remote_addr if has_request_context() else None)
    db.session.add(entry)
    return entry
