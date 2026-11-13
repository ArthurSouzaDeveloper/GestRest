from functools import wraps

from flask import abort
from flask_login import current_user, login_required


def role_required(*roles):
    """Restringe a rota aos perfis informados (admin sempre passa)."""
    def decorator(view):
        @wraps(view)
        @login_required
        def wrapped(*args, **kwargs):
            if current_user.role != "admin" and current_user.role not in roles:
                abort(403)
            return view(*args, **kwargs)
        return wrapped
    return decorator
