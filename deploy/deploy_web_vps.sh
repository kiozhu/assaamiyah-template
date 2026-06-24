#!/usr/bin/env bash
# Deploy web app statis dari GitHub ke VPS (Ubuntu/Debian).
# Jalankan di VPS: sudo bash deploy_web_vps.sh
set -e

REPO="https://github.com/kiozhu/assaamiyah-template.git"
DIR="/var/www/assaamiyah"

echo ">> Pastikan nginx & git terpasang"
apt-get update -y
apt-get install -y nginx git

echo ">> Ambil / update kode dari GitHub"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  git clone "$REPO" "$DIR"
fi

echo ">> Pasang konfigurasi nginx"
cp "$DIR/deploy/nginx-sertifikat.conf" /etc/nginx/sites-available/assaamiyah
ln -sf /etc/nginx/sites-available/assaamiyah /etc/nginx/sites-enabled/assaamiyah
rm -f /etc/nginx/sites-enabled/default   # nonaktifkan halaman default nginx

nginx -t
systemctl reload nginx

IP=$(hostname -I | awk '{print $1}')
echo ">> Selesai. Buka:  http://$IP/"
echo ">> Update berikutnya cukup jalankan ulang script ini (akan git pull)."
echo ">> (opsional) Pasang HTTPS: sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx -d domainkamu.com"
