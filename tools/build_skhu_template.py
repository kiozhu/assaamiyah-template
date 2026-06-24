"""Susun penempatan template SKHU dari acuan SKHU+TEKS.pdf (koordinat & gaya eksak)."""
import json, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..')
WEB = os.path.join(ROOT, 'web', 'templates')
TNR = 'Times New Roman'

def F(key, x, y, italic=False, bold=False, align='left'):
    return {'key': key, 'text': None, 'x': x, 'baseline': y, 'size': 12,
            'font': TNR, 'bold': bold, 'italic': italic, 'color': '#000000',
            'align': align, 'isField': True}

# --- Header (9) --- koordinat & gaya dari acuan (Nama bold; angka tegak; teks italic)
header = [
    ('Nama',                 265.6, 253.8, False, True),
    ('Nomor_Induk_Siswa',    265.1, 269.8, False, False),
    ('Nomor_Peserta',        264.6, 284.0, False, False),
    ('Tempat_Tanggal_Lahir', 264.7, 298.1, True,  False),
    ('Jenis_Kelamin',        264.6, 313.8, True,  False),
    ('Anak_Dari',            264.3, 329.3, True,  False),
    ('Asal_MDTU',            264.6, 342.8, True,  False),
    ('Nomor_Statistik',      264.6, 358.3, False, False),
    ('Kecamatan',            264.4, 371.6, True,  False),
]
fields = [F(k, x, y, italic=i, bold=b) for k, x, y, i, b in header]

# --- Tabel nilai 7 mapel (Angka + Huruf), semua italic ---
subjects = ['Quran', 'Hadits', 'Aqidah', 'Akhlaq', 'Fiqih', 'TarikhIslam', 'BahasaArab']
angkaY = [483.4, 498.6, 513.6, 529.1, 544.6, 559.7, 575.2]
hurufY = [484.3, 500.4, 515.8, 529.7, 545.7, 561.2, 576.7]
for subj, ya, yh in zip(subjects, angkaY, hurufY):
    fields.append(F(subj + '_Angka', 246.0, ya, italic=True))
    fields.append(F(subj + '_Huruf', 293.8, yh, italic=True))
fields.append(F('Jumlah_Angka', 241.9, 594.6, italic=True))
fields.append(F('Jumlah_Huruf', 293.6, 597.3, italic=True))

tpl = {'name': 'SKHU', 'page': {'w': 595.28, 'h': 841.89, 'unit': 'pt'},
       'background': 'assets/blangko/skhu.jpg', 'fields': fields}
json.dump(tpl, open(os.path.join(WEB, 'skhu.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

# --- form metadata ---
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
for k, *_ in header:
    formf.append({'key': k, 'label': labels[k], 'ask': k not in const,
                  **({'default': const[k]} if k in const else {})})
for subj in subjects:
    formf.append({'key': subj + '_Angka', 'label': f'{subj_label[subj]} — Angka', 'ask': True})
    formf.append({'key': subj + '_Huruf', 'label': f'{subj_label[subj]} — Huruf', 'ask': True})
formf.append({'key': 'Jumlah_Angka', 'label': 'JUMLAH — Angka', 'ask': True})
formf.append({'key': 'Jumlah_Huruf', 'label': 'JUMLAH — Huruf', 'ask': True})
json.dump({'label': 'SKHU', 'sheet': 'SKHU', 'fields': formf},
          open(os.path.join(WEB, 'skhu_form.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

# --- manifest: SKHU ready ---
mpath = os.path.join(WEB, 'manifest.json')
man = json.load(open(mpath, encoding='utf-8'))
for t in man['templates']:
    if t['key'] == 'skhu':
        t['ready'] = True
json.dump(man, open(mpath, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

# --- overlay verifikasi (opsional, butuh skhu_full.png) ---
_ov = os.path.join(ROOT, 'skhu_full.png')
if not os.path.exists(_ov):
    print('OK fields:', len(fields), '| skhu.json + skhu_form.json ditulis (overlay dilewati)')
    raise SystemExit
sample = {'Nama': 'DAFFA NAMA LENGKAP', 'Nomor_Induk_Siswa': '12346789', 'Nomor_Peserta': '12-34-56-1234',
          'Tempat_Tanggal_Lahir': 'Indramayu, 23 Januari 2024', 'Jenis_Kelamin': 'Laki-laki',
          'Anak_Dari': 'Wali murid', 'Asal_MDTU': "As'saamiyah", 'Nomor_Statistik': '3123456789',
          'Kecamatan': 'Indramayu'}
for f in fields:
    k = f['key']
    if k.endswith('_Angka'): sample[k] = '6,25'
    elif k.endswith('_Huruf'): sample[k] = 'Enam koma dua lima'
sample['Jumlah_Angka'] = '49,00'; sample['Jumlah_Huruf'] = 'Empat sembilan koma nol nol'
img = Image.open(_ov).convert('RGB'); dr = ImageDraw.Draw(img)
def fnt(b, i):
    n = 'timesbi' if (b and i) else 'timesbd' if b else 'timesi' if i else 'times'
    return ImageFont.truetype(f'C:/Windows/Fonts/{n}.ttf', 12 * 2)
for f in fields:
    val = sample.get(f['key'], '?'); x = f['x'] * 2; y = f['baseline'] * 2
    anchor = 'ms' if f['align'] == 'center' else 'ls'
    dr.text((x, y), val, fill=(190, 0, 0), font=fnt(f['bold'], f['italic']), anchor=anchor)
img.save(os.path.join(ROOT, 'skhu_overlay.png'))
print('OK fields:', len(fields), '| skhu.json + skhu_form.json + overlay ditulis')
