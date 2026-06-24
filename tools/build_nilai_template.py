"""Susun penempatan template Nilai Ijazah (koordinat dari scan grid/baris tabel)."""
import json, os
from PIL import Image, ImageDraw, ImageFont
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), '..')
WEB = os.path.join(ROOT, 'web', 'templates')
TNR = 'Times New Roman'
XV = 240          # x nilai header (setelah titik dua)
XA = 282          # kolom Angka (rata tengah)
XH = 320          # kolom Huruf (rata kiri)
XML = 122         # nama mapel Muatan Lokal (kolom Bidang Studi)

def F(key, x, y, italic=False, bold=False, align='left'):
    return {'key': key, 'text': None, 'x': x, 'baseline': round(y, 1), 'size': 12,
            'font': TNR, 'bold': bold, 'italic': italic, 'color': '#000000',
            'align': align, 'isField': True}

fields = []
# Header (Nama bold; nomor tegak)
fields += [F('No_Induk', XV, 192), F('Nama_Lengkap', XV, 212, bold=True), F('No_UA', XV, 232)]

# Keagamaan: pusat sel terdeteksi + 4 (baseline). Baris 1 (295.5) = sub-header Angka/Huruf,
# data mulai dari Al-Qur'an (344).
keagamaan = [('Quran', 344.0), ('Hadits', 368.0), ('Aqidah', 392.2), ('Akhlaq', 416.5),
             ('Fiqih', 440.5), ('TarikhIslam', 464.8), ('BahasaArab', 489.0)]
for subj, c in keagamaan:
    fields.append(F(subj + '_Angka', XA, c + 4, italic=True, align='center'))
    fields.append(F(subj + '_Huruf', XH, c + 4, italic=True))

# Muatan Lokal: nama mapel (dotted) + Angka + Huruf
muatan = [('ML1', 537.5), ('ML2', 561.5), ('ML3', 585.8)]
for ml, c in muatan:
    fields.append(F(ml + '_Nama', XML, c + 4, italic=True))
    fields.append(F(ml + '_Angka', XA, c + 4, italic=True, align='center'))
    fields.append(F(ml + '_Huruf', XH, c + 4, italic=True))

# Jumlah (baris di bawah border 598)
fields.append(F('Jumlah_Angka', XA, 610.0, italic=True, align='center'))
fields.append(F('Jumlah_Huruf', XH, 610.0, italic=True))

# Nama Kepala (footer) — di garis titik BAWAH judul "Kepala Madrasah..." (y~693)
_full = os.path.join(ROOT, 'nilai_full.png')
fields.append(F('Nama_Kepala', 410, 691.0, bold=True, align='center'))

tpl = {'name': 'Nilai Ijazah', 'page': {'w': 595.28, 'h': 841.89, 'unit': 'pt'},
       'background': 'assets/blangko/nilai_ijazah.jpg', 'fields': fields}
json.dump(tpl, open(os.path.join(WEB, 'nilai_ijazah.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

# form metadata
const = {'Nama_Kepala': ''}
formf = [
    {'key': 'No_Induk', 'label': 'No. Induk', 'ask': True},
    {'key': 'Nama_Lengkap', 'label': 'Nama Lengkap', 'ask': True},
    {'key': 'No_UA', 'label': 'No. UA', 'ask': True},
]
slabel = {'Quran': "Al-Qur'an", 'Hadits': 'Hadits', 'Aqidah': 'Aqidah', 'Akhlaq': 'Akhlaq',
          'Fiqih': 'Fiqih', 'TarikhIslam': 'Tarikh Islam', 'BahasaArab': 'Bahasa Arab'}
for subj, _ in keagamaan:
    formf.append({'key': subj + '_Angka', 'label': f'{slabel[subj]} — Angka', 'ask': True})
    formf.append({'key': subj + '_Huruf', 'label': f'{slabel[subj]} — Huruf', 'ask': True})
for i, (ml, _) in enumerate(muatan, 1):
    formf.append({'key': ml + '_Nama', 'label': f'Muatan Lokal {i} — Nama', 'ask': True})
    formf.append({'key': ml + '_Angka', 'label': f'Muatan Lokal {i} — Angka', 'ask': True})
    formf.append({'key': ml + '_Huruf', 'label': f'Muatan Lokal {i} — Huruf', 'ask': True})
formf.append({'key': 'Jumlah_Angka', 'label': 'JUMLAH — Angka', 'ask': True})
formf.append({'key': 'Jumlah_Huruf', 'label': 'JUMLAH — Huruf', 'ask': True})
formf.append({'key': 'Nama_Kepala', 'label': 'Nama Kepala Madrasah', 'ask': False, 'default': ''})
json.dump({'label': 'Nilai Ijazah', 'sheet': 'NILAI', 'fields': formf},
          open(os.path.join(WEB, 'nilai_ijazah_form.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

# manifest ready
mpath = os.path.join(WEB, 'manifest.json')
man = json.load(open(mpath, encoding='utf-8'))
for t in man['templates']:
    if t['key'] == 'nilai_ijazah':
        t['ready'] = True
json.dump(man, open(mpath, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

# overlay verifikasi
if os.path.exists(_full):
    sample = {'No_Induk': '12346789', 'Nama_Lengkap': 'DAFFA NAMA LENGKAP', 'No_UA': '12-34-56-1234',
              'Nama_Kepala': 'ACING MUNASIR, S.Pd'}
    for f in fields:
        k = f['key']
        if k.endswith('_Angka'): sample[k] = '6,25'
        elif k.endswith('_Huruf'): sample[k] = 'Enam koma dua lima'
        elif k.endswith('_Nama'): sample[k] = 'Bahasa Inggris'
    sample['Jumlah_Angka'] = '49,00'; sample['Jumlah_Huruf'] = 'Empat sembilan koma nol nol'
    img = Image.open(_full).convert('RGB'); dr = ImageDraw.Draw(img)
    def fnt(b, i):
        n = 'timesbi' if (b and i) else 'timesbd' if b else 'timesi' if i else 'times'
        return ImageFont.truetype(f'C:/Windows/Fonts/{n}.ttf', 12 * 2)
    for f in fields:
        val = sample.get(f['key'], '?'); x = f['x'] * 2; y = f['baseline'] * 2
        anchor = 'ms' if f['align'] == 'center' else 'ls'
        dr.text((x, y), val, fill=(190, 0, 0), font=fnt(f['bold'], f['italic']), anchor=anchor)
    img.save(os.path.join(ROOT, 'nilai_overlay.png'))
print('OK fields:', len(fields), '| nilai_ijazah.json + form + manifest + overlay')
