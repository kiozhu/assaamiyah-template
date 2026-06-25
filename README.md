# Assaamiyah — Generator Sertifikat (Ijazah/SKHU)

Membuat sertifikat (Ijazah, Nilai, SKHU) dari data Excel **atau** input manual,
dengan **preview langsung** dan **download PDF + Word**.

**🌐 Web app — 100% client-side**: semua data diproses di browser pengunjung,
**tidak dikirim/disimpan di server**. Server hanya menyajikan file statis, jadi
otomatis nyala 24 jam tanpa proses yang perlu dijaga.

```
web/        aplikasi browser (HTML/JS) — INI yang dideploy ke publik
templates/  ijazah.docx + ijazah.json (peta koordinat presisi)
tools/      generator file template dari koordinat (Python, opsional)
config/     daftar template + field (referensi)
deploy/     config nginx + script deploy ke VPS
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
- Template baru / setel posisi: paling mudah lewat **🎨 Editor Template** di web app.
  Alternatif (Python): ubah `tools/build_ijazah_template.py` lalu jalankan
  (meng-update `ijazah.docx` + `web/templates/ijazah.json`).

## Keamanan data
Web app tidak punya backend untuk data: Excel yang diupload & data yang diketik
tidak pernah di-POST ke server. Semua parsing/render PDF/Word terjadi di browser.
Tidak ada database, tidak ada log data. Server (`server.js`) hanya menyajikan file
statis read-only.
