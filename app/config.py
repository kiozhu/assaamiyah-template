"""Konfigurasi global: dibaca dari environment (.env) dan config/templates.yaml."""
import os
import pathlib
import yaml
from dotenv import load_dotenv

ROOT = pathlib.Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()

# Daftar user Telegram yang boleh pakai bot (pisah koma). Wajib diisi.
ALLOWED_IDS = {
    int(x) for x in os.getenv("ALLOWED_IDS", "").replace(" ", "").split(",") if x
}

# Lokasi binary LibreOffice (kosong = auto-detect)
SOFFICE_BIN = os.getenv("SOFFICE_BIN", "").strip()

# Google Sheets (opsional, untuk mode "Google Sheet")
GSHEET_ID = os.getenv("GSHEET_ID", "").strip()
GOOGLE_CREDENTIALS = os.getenv("GOOGLE_CREDENTIALS", "").strip()  # path ke service-account.json

WORK_DIR = ROOT / "data" / "work"
WORK_DIR.mkdir(parents=True, exist_ok=True)


def load_templates() -> dict:
    with open(ROOT / "config" / "templates.yaml", "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    out = {}
    for key, t in data["templates"].items():
        t["key"] = key
        t["enabled"] = t.get("enabled", True)
        out[key] = t
    return out


TEMPLATES = load_templates()


def field_keys(tpl: dict) -> list[str]:
    return [f["key"] for f in tpl.get("fields", [])]


def template_path(tpl: dict) -> pathlib.Path:
    return ROOT / tpl["docx"]
