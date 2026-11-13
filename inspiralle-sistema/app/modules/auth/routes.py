from urllib.parse import urlparse

from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required, login_user, logout_user

from app.models import User

bp = Blueprint("auth", __name__)


@bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("dashboard.index"))
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        user = User.query.filter_by(email=email).first()
        if user and user.active and user.check_password(request.form.get("senha", "")):
            login_user(user, remember=bool(request.form.get("lembrar")))
            nxt = request.args.get("next", "")
            if nxt and urlparse(nxt).netloc == "" and nxt.startswith("/"):
                return redirect(nxt)
            return redirect(url_for("dashboard.index"))
        flash("E-mail ou senha incorretos.", "danger")
    return render_template("auth/login.html")


@bp.route("/sair")
@login_required
def logout():
    logout_user()
    flash("Você saiu do painel.", "success")
    return redirect(url_for("auth.login"))
