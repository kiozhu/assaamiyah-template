#!/usr/bin/env bash
# Setup VPS (Ubuntu/Debian) untuk sertifikat-bot.
# Jalankan sebagai root: sudo bash deploy/setup_vps.sh
set -e

APP_DIR="/opt/sertifikat-bot"

echo ">> Install LibreOffice + tools + font"
apt-get update
apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-core \
    python3 python3-venv python3-pip \
    fontconfig fonts-crosextra-carlito fonts-liberation cabextract wget unzip

# Microsoft core fonts (Arial, Times New Roman, dll)
echo ">> Install MS core fonts (Arial, Times New Roman)"
DEBIAN_FRONTEND=noninteractive apt-get install -y ttf-mscorefonts-installer || true

# Century: bukan font bawaan Linux. Taruh file century.ttf di deploy/fonts/ lalu:
if ls "$(dirname "$0")"/fonts/*.ttf >/dev/null 2>&1; then
  echo ">> Memasang font kustom dari deploy/fonts/"
  mkdir -p /usr/share/fonts/truetype/custom
  cp "$(dirname "$0")"/fonts/*.ttf /usr/share/fonts/truetype/custom/
fi
fc-cache -f

echo ">> Setup Python venv"
mkdir -p "$APP_DIR"
# (asumsikan source code sudah disalin ke $APP_DIR)
cd "$APP_DIR"
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

echo ">> Cek font terpasang:"
fc-list | grep -iE "arial|times|century|carlito|liberation" || true

echo ">> Selesai. Isi $APP_DIR/.env lalu:"
echo "   cp deploy/sertifikat-bot.service /etc/systemd/system/"
echo "   systemctl daemon-reload && systemctl enable --now sertifikat-bot"
