"""Susun penempatan template SKHU + tulis skhu.json/skhu_form.json + overlay verifikasi."""
import json, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..')
WEB = os.path.join(ROOT, 'web', 'templates')

XV = 215           # x mulai nilai header (setelah titik dua)
XA = 262           # x kolom Angka (rata tengah)
XH = 312           # x kolom Huruf (rata kiri)
TNR = 'Times New Roman'

def F(key, x, y, size=11, font=TNR, bold=False, align='left'):
    return {'key': key, 'text': None, 'x': x, 'baseline': y, 'size': size,
            'font': font, 'bold': bold, 'italic': False, 'color': '#000000',
            'align': align, 'isField': True}

# --- Header (9) --- y = garis titik terdeteksi (scan piksel) - 1.5
header = [
    ('Nama', 256.0), ('Nomor_Induk_Siswa', 270.5), ('Nomor_Peserta', 285.0),
    ('Tempat_Tanggal_Lahir', 300.0), ('Jenis_Kelamin', 315.0), ('Anak_Dari', 329.5),
    ('Asal_MDTU', 344.0), ('Nomor_Statistik', 359.0), ('Kecamatan', 373.5),
]
fields = [F(k, XV, y) for k, y in header]

# --- Tabel nilai 7 mapel (Angka + Huruf) --- baris terdeteksi presisi
subjects = ['Quran', 'Hadits', 'Aqidah', 'Akhlaq', 'Fiqih', 'TarikhIslam', 'BahasaArab']
rowY = [484.5, 500.0, 515.5, 531.0, 546.0, 561.5, 577.0]
for subj, y in zip(subjects, rowY):
    fields.append(F(subj + '_Angka', XA, y, align='center'))
    fields.append(F(subj + '_Huruf', XH, y))
# JUMLAH (bold)
fields.append(F('Jumlah_Angka', XA, 597.5, bold=True, align='center'))
fields.append(F('Jumlah_Huruf', XH, 597.5, bold=True))

tpl = {'name': 'SKHU', 'page': {'w': 595.28, 'h': 841.89, 'unit': 'pt'},
       'background': 'assets/blangko/skhu.jpg', 'fields': fields}
json.dump(tpl, open(os.path.join(WEB, 'skhu.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

# --- form metadata (label ramah + konstanta) ---
labels = {
    'Nama': 'Nama', 'Nomor_Induk_Siswa': 'Nomor Induk Siswa', 'Nomor_Peserta': 'Nomor Peserta',
    'Tempat_Tanggal_Lahir': 'Tempat, Tanggal Lahir', 'Jenis_Kelamin': 'Jenis Kelamin',
    'Anak_Dari': 'Anak dari', 'Asal_MDTU': 'Asal MDTU', 'Nomor_Statistik': 'Nomor Statistik',
    'Kecamatan': 'Kecamatan',
}
subj_label = {'Quran': "Qur'an", 'Hadits': 'Hadits', 'Aqidah': 'Aqidah', 'Akhlaq': 'Akhlaq',
              'Fiqih': 'Fiqih', 'TarikhIslam': 'Tarikh Islam', 'BahasaArab': 'Bahasa Arab'}
const = {'Asal_MDTU': "As'saamiyah", 'Kecamatan': 'Indramayu', 'Nomor_Statistik': ''}
formf = []
for k, _ in header:
    formf.append({'key': k, 'label': labels[k], 'ask': k not in const,
                  **({'default': const[k]} if k in const else {})})
for subj in subjects:
    formf.append({'key': subj + '_Angka', 'label': f'{subj_label[subj]} — Angka', 'ask': True})
    formf.append({'key': subj + '_Huruf', 'label': f'{subj_label[subj]} — Huruf', 'ask': True})
formf.append({'key': 'Jumlah_Angka', 'label': 'JUMLAH — Angka', 'ask': True})
formf.append({'key': 'Jumlah_Huruf', 'label': 'JUMLAH — Huruf', 'ask': True})
json.dump({'label': 'SKHU', 'sheet': 'SKHU', 'fields': formf},
          open(os.path.join(WEB, 'skhu_form.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

# --- manifest: tandai skhu ready ---
mpath = os.path.join(WEB, 'manifest.json')
man = json.load(open(mpath, encoding='utf-8'))
for t in man['templates']:
    if t['key'] == 'skhu':
        t['ready'] = True
json.dump(man, open(mpath, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

# --- overlay verifikasi di atas blangko (opsional, butuh skhu_full.png) ---
_ov = os.path.join(ROOT, 'skhu_full.png')
if not os.path.exists(_ov):
    print('OK fields:', len(fields), '| skhu.json + skhu_form.json ditulis (overlay dilewati)')
    raise SystemExit
img = Image.open(_ov).convert('RGB')  # 1pt=2px
dr = ImageDraw.Draw(img)
try:
    fnt = ImageFont.truetype('C:/Windows/Fonts/times.ttf', 11 * 2)
    fntb = ImageFont.truetype('C:/Windows/Fonts/timesbd.ttf', 11 * 2)
except Exception:
    fnt = fntb = ImageFont.load_default()
for f in fields:
    val = '«' + f['key'] + '»'
    x = f['x'] * 2; y = f['baseline'] * 2
    anchor = 'ms' if f['align'] == 'center' else 'ls'
    use = fntb if f['bold'] else fnt
    dr.text((x, y), val, fill=(200, 0, 0), font=use, anchor=anchor)
img.save(os.path.join(ROOT, 'skhu_overlay.png'))
print('OK fields:', len(fields), '| skhu.json + skhu_form.json + overlay ditulis')
