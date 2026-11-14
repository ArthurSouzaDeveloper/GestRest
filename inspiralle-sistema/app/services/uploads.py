"""Armazenamento das imagens da evolução clínica.

Os arquivos ficam em UPLOAD_DIR com nome aleatório e só são entregues por
rotas que checam quem está pedindo (equipe logada ou o próprio paciente).
"""
import uuid
from pathlib import Path

from flask import current_app

# Assinatura dos formatos aceitos (não confia só na extensão)
SIGNATURES = {
    b"\xff\xd8\xff": "jpg",
    b"\x89PNG\r\n\x1a\n": "png",
}


class UploadError(ValueError):
    pass


def upload_dir() -> Path:
    d = Path(current_app.config["UPLOAD_DIR"])
    d.mkdir(parents=True, exist_ok=True)
    return d


def _detect(head: bytes) -> str | None:
    for sig, ext in SIGNATURES.items():
        if head.startswith(sig):
            return ext
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None


def save_image(file_storage) -> tuple[str, str]:
    """Valida e grava a imagem. Devolve (nome_gerado, nome_original)."""
    data = file_storage.read()
    if not data:
        raise UploadError("Arquivo vazio.")
    max_mb = current_app.config.get("MAX_IMAGE_MB", 10)
    if len(data) > max_mb * 1024 * 1024:
        raise UploadError(f"“{file_storage.filename}” passa de {max_mb} MB.")
    ext = _detect(data[:16])
    if not ext:
        raise UploadError(f"“{file_storage.filename}” não é uma imagem JPG, PNG ou WEBP.")
    name = f"{uuid.uuid4().hex}.{ext}"
    (upload_dir() / name).write_bytes(data)
    return name, (file_storage.filename or "")[:200]


def delete_file(name: str) -> None:
    try:
        (upload_dir() / name).unlink(missing_ok=True)
    except OSError:
        pass
