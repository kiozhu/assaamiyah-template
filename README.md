# Assaamiyah — Generator Sertifikat (Ijazah/SKHU)

Membuat sertifikat (Ijazah, dst) dari data Excel, dengan **preview langsung** dan
**download PDF + Word**. Dua cara pakai:

- **🌐 Web app (utama)** — diakses guru lewat browser. **100% client-side**: data
  diproses di browser, **tidak dikirim/disimpan di server**. Server hanya nginx
  yang menyajikan file statis → otomatis nyala 24 jam, tidak ada proses yang dijaga.
- **🤖 Bot Telegram (opsional)** — alternatif via chat. Butuh proses `systemd`.

```
web/        aplikasi browser (HTML/JS) — INI yang dideploy ke publik
app/        bot Telegram (opsional)
templates/  ijazah.docx + ijazah.json (peta koordinat presisi)
tools/      generator template dari koordinat
config/     daftar template + field
deploy/     nginx + script deploy + systemd
```

## Deploy web ke VPS (lewat GitHub)
Di VPS (Ubuntu/Debian), cukup:
```bash
curl -fsSL https://raw.githubusercontent.com/kiozhu/assaamiyah-template/main/deploy/deploy_web_vps.sh -o d.sh
sudo bash d.sh
# buka http://IP_VPS/
```
Script ini: install nginx, `git clone` repo, pasang config nginx, reload.
**Update berikutnya**: jalankan ulang script (otomatis `git pull`).

Domain **tidak wajib** (bisa pakai IP). Kalau mau HTTPS/gembok:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d ijazah.domainkamu.com
```

## Jalankan web lokal (tes)
```bash
cd web && python -m http.server 8770   # buka http://localhost:8770
```

## Detail
- Web app: lihat [`web/README_web.md`](web/README_web.md)
- Font agar PDF identik: taruh `*.ttf` di `web/assets/fonts/` (lihat README web)
- Template baru / setel posisi: ubah `tools/build_ijazah_template.py` lalu jalankan
  (meng-update `ijazah.docx` + `ijazah.json`)
- Bot Telegram: butuh LibreOffice + `.env` (lihat `deploy/setup_vps.sh`)

## Keamanan data
Web app tidak punya backend: Excel yang diupload & data yang diketik guru tidak
pernah di-POST ke server. Semua parsing/render PDF/Word terjadi di browser.
Tidak ada database, tidak ada log data.
