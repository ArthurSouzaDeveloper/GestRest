"""App factory do sistema Inspiralle (agendamento + controle de pacientes)."""
from datetime import date, datetime
from pathlib import Path

from flask import Flask, abort, send_from_directory
from sqlalchemy import event
from sqlalchemy.engine import Engine

from app.extensions import db, login_manager

CONFIGS = {"dev": "config.Config", "prod": "config.ProdConfig", "test": "config.TestConfig"}

WEEKDAYS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]
MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
          "agosto", "setembro", "outubro", "novembro", "dezembro"]


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_conn, _record):
    """WAL + chaves estrangeiras no SQLite."""
    if dbapi_conn.__class__.__module__.startswith("sqlite3"):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.close()


def create_app(env: str = "dev") -> Flask:
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(CONFIGS.get(env, CONFIGS["dev"]))
    Path(app.instance_path).mkdir(parents=True, exist_ok=True)

    db.init_app(app)
    login_manager.init_app(app)

    from app.models import User

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    from app.modules.auth.routes import bp as auth_bp
    from app.modules.dashboard.routes import bp as dashboard_bp
    from app.modules.patients.routes import bp as patients_bp
    from app.modules.public_api.routes import bp as public_api_bp
    from app.modules.scheduling.routes import bp as scheduling_bp
    from app.modules.settings.routes import bp as settings_bp

    app.register_blueprint(auth_bp, url_prefix="/painel")
    app.register_blueprint(dashboard_bp, url_prefix="/painel")
    app.register_blueprint(scheduling_bp, url_prefix="/painel/agenda")
    app.register_blueprint(patients_bp, url_prefix="/painel/pacientes")
    app.register_blueprint(settings_bp, url_prefix="/painel/cadastros")
    app.register_blueprint(public_api_bp, url_prefix="/api/public")

    _register_csrf(app)
    _register_filters(app)
    _register_landing(app)
    _register_cli(app)
    return app


def _register_csrf(app: Flask) -> None:
    """CSRF simples por sessão para os formulários do painel."""
    import secrets

    from flask import request, session

    def csrf_token():
        if "_csrf" not in session:
            session["_csrf"] = secrets.token_urlsafe(32)
        return session["_csrf"]

    app.jinja_env.globals["csrf_token"] = csrf_token

    @app.before_request
    def _check_csrf():
        if app.config.get("TESTING") and not app.config.get("CSRF_IN_TESTS"):
            return
        if request.method == "POST" and request.path.startswith("/painel"):
            sent = request.form.get("_csrf") or request.headers.get("X-CSRF-Token")
            if not sent or sent != session.get("_csrf"):
                abort(400, "Sessão expirada. Recarregue a página e tente novamente.")


def _register_filters(app: Flask) -> None:
    @app.template_filter("data")
    def fmt_date(value):
        return value.strftime("%d/%m/%Y") if value else "—"

    @app.template_filter("hora")
    def fmt_time(value):
        return value.strftime("%H:%M") if value else ""

    @app.template_filter("datahora")
    def fmt_dt(value):
        return value.strftime("%d/%m/%Y %H:%M") if value else "—"

    @app.template_filter("dia_extenso")
    def fmt_long(value: date):
        return f"{WEEKDAYS[value.weekday()]}, {value.day} de {MONTHS[value.month - 1]}"

    @app.template_filter("moeda")
    def fmt_money(value):
        if value is None:
            return "—"
        return "R$ " + f"{float(value):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    @app.context_processor
    def inject_now():
        return {"now": datetime.now(), "today": date.today()}


def _register_landing(app: Flask) -> None:
    """Serve a landing page estática na raiz, na mesma origem da API."""
    landing = Path(app.config["LANDING_DIR"])

    @app.route("/")
    def landing_index():
        if not (landing / "index.html").exists():
            abort(404)
        return send_from_directory(landing, "index.html")

    @app.route("/<path:filename>")
    def landing_static(filename):
        if filename.startswith(("painel", "api")):
            abort(404)
        return send_from_directory(landing, filename)


def _register_cli(app: Flask) -> None:
    @app.cli.command("init-db")
    def init_db():
        """Cria as tabelas e popula com dados de demonstração."""
        from app.seed import seed_demo
        db.drop_all()
        db.create_all()
        seed_demo()
        print("Banco criado com dados de demonstração.")
