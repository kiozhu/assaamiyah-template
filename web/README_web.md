# Generator Ijazah — Web App (100% client-side)

Aplikasi web statis untuk membuat Ijazah dari Excel / input manual, dengan
**preview langsung** dan **download PDF + Word**. Semua proses berjalan di
**browser guru** — tidak ada data yang dikirim/disimpan di server.

## Kenapa aman
- Server (nginx) hanya menyajikan file statis: HTML, JS, CSS, template, font.
- Excel yang diupload & data yang diketik **tidak pernah di-POST** ke server.
- Parsing Excel, isi template, render PDF/Word — semua via JavaScript di browser.
- Tidak ada database, tidak ada log data, tidak ada penyimpanan server.
- **Semua library disimpan lokal** (`lib/`) — tidak ambil dari internet/CDN.
- **Content-Security-Policy** mengunci halaman: browser hanya boleh menghubungi
  server ini sendiri (`connect-src 'self'`) → data **mustahil** terkirim ke luar.
- Field tetap (nama madrasah, kepala) opsional disimpan di `localStorage`
  browser guru sendiri (bukan server) supaya tak ketik ulang.

## Isi folder
```
index.html        tampilan
app.js            semua logika (parse Excel, preview, PDF, Word)
styles.css        gaya
lib/              library lokal (SheetJS, pdf-lib, fontkit, PizZip, docxtemplater)
templates/
  ijazah.json       peta koordinat (posisi/font/ukuran/bold) — sumber preview & PDF
  ijazah_form.json  label & default untuk input manual
  ijazah.docx       template Word (untuk output .docx)
assets/fonts/     (opsional) arial.ttf, times.ttf, century.ttf, dst — agar PDF identik
```

## Jalankan lokal (tes)
Harus lewat HTTP (bukan klik file langsung, karena `fetch`):
```bash
cd web
python -m http.server 8770
# buka http://localhost:8770
```

## Deploy ke VPS (nginx)
```bash
sudo mkdir -p /var/www/ijazah
sudo cp -r web/* /var/www/ijazah/
sudo cp deploy/nginx-sertifikat.conf /etc/nginx/sites-available/ijazah
sudo ln -s /etc/nginx/sites-available/ijazah /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
Lalu (disarankan) pasang HTTPS gratis:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d ijazah.domainkamu.com
```

## Font agar PDF 100% sama
Default PDF memakai font bawaan (Helvetica≈Arial, Times). Untuk identik dengan
format asli (termasuk **Century**), taruh file di `assets/fonts/`:
`arial.ttf, arialbd.ttf, times.ttf, timesbd.ttf, century.ttf, centurybd.ttf`.
Aplikasi otomatis memakainya bila ada.

## Batasi akses (opsional)
Karena ini dokumen resmi, lindungi URL-nya, misal Basic Auth nginx:
```bash
sudo apt install apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd guru
# tambahkan di server block: auth_basic "Login"; auth_basic_user_file /etc/nginx/.htpasswd;
```

## Catatan
- Cetak: hasil PDF dirancang untuk dicetak **di atas blangko** (border hijau + logo
  sudah tercetak). Preview hanya menampilkan teks isiannya.
- Untuk WYSIWYG, guru bisa unggah scan blangko kosong via "Pengaturan lanjutan"
  (hanya untuk tampilan, tidak ikut tercetak).
- Atur ulang posisi: ubah `tools/build_ijazah_template.py` lalu jalankan ulang
  (meng-update `ijazah.docx` + `ijazah.json` sekaligus).
