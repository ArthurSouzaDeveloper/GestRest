"""Ponto de entrada: `python run.py` sobe o sistema em http://localhost:5000"""
import os

from app import create_app

app = create_app(os.environ.get("APP_ENV", "dev"))

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=os.environ.get("APP_ENV", "dev") == "dev")
