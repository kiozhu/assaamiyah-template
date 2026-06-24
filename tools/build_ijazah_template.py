"""Bangun templates/ijazah.docx (versi docxtpl / Jinja {{ }}).

Layout, font, ukuran, bold diekstrak presisi dari Format_teks.pdf (Ijazah).
Tiap teks = 1 text box posisi absolut (page-relative) berisi tag {{ Field }}.
Dipakai oleh docxtpl -> render -> LibreOffice -> PDF.
"""
import os
from docx import Document
from docx.shared import Cm
from lxml import etree

OUT = os.path.join(os.path.dirname(__file__), '..', 'templates', 'ijazah.docx')
VOFF = 0.0  # koreksi vertikal global (pt) bila perlu setel ulang

FN = {'ArialMT': 'Arial', 'Century': 'Century', 'TimesNewRomanPSMT': 'Times New Roman'}

# (jinja_var, x0, baseline_oy, size, pdffont, bold, is_field)
F = [
 ('Nomor',              214.5, 329.0, 12, 'ArialMT', True,  True),
 ('Nama_Lengkap',       260.9, 400.6, 14, 'ArialMT', True,  True),
 ('Nomor_Induk_Santri', 260.9, 419.9, 14, 'ArialMT', False, True),
 ('TTL',                260.9, 437.0, 14, 'ArialMT', False, True),
 ('Madrasah1',          339.9, 355.8, 16, 'Century', False, True),
 ('Nama_Orang_Tua',     260.9, 456.1, 14, 'ArialMT', False, True),
 ('Desa',               118.2, 375.6, 12, 'Century', False, True),
 ('Desa_Kecamatan',     118.2, 545.8, 12, 'Century', False, True),
 ('Madrasah2',          386.4, 528.2, 16, 'Century', False, True),
 ('Kabupaten Indramayu',118.2, 564.7, 12, 'Century', False, False),  # teks tetap
 ('Nomor_Statistik',    207.5, 581.6, 12, 'Century', True,  True),
 ('Tanggal_Masehi',     354.5, 630.2, 12, 'Times New Roman', True, True),
 ('Tanggal_Hijriah',    381.5, 654.7, 12, 'Times New Roman', True, True),
 ('Madrasah3',          331.8, 678.9, 12, 'Century', False, True),
 ('Nama_Kepala',        339.1, 738.2, 12, 'Century', False, True),
]

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
wq = lambda t: '{%s}%s' % (W, t)

doc = Document()
sec = doc.sections[0]
sec.page_width = Cm(21); sec.page_height = Cm(29.7)
sec.left_margin = sec.right_margin = sec.top_margin = sec.bottom_margin = Cm(0)
sec.header_distance = Cm(0); sec.footer_distance = Cm(0); sec.gutter = Cm(0)

def run_xml(text, size, fontname, bold, is_field):
    body = ('{{%s}}' % text) if is_field else text
    rpr = ('<w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/>%s'
           '<w:sz w:val="%d"/><w:szCs w:val="%d"/></w:rPr>') % (
        fontname, fontname, fontname, ('<w:b/><w:bCs/>' if bold else ''), size*2, size*2)
    return '<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>' % (rpr, body)

shapetype = ('<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" '
   'path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/>'
   '<v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>')

shapes = []
for i, (name, x0, oy, size, pf, bold, isf) in enumerate(F):
    fontname = FN.get(pf, pf)
    top = oy - size + VOFF
    width = max(150.0, min(360.0, 595.0 - x0))
    height = size * 1.7
    inner = ('<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>'
             '<w:jc w:val="left"/></w:pPr>%s</w:p>') % run_xml(name, size, fontname, bold, isf)
    shape = (
      '<w:r><w:pict>%s'
      '<v:shape id="S%d" type="#_x0000_t202" '
      'style="position:absolute;left:0;margin-left:%.2fpt;margin-top:%.2fpt;width:%.2fpt;height:%.2fpt;'
      'mso-position-horizontal-relative:page;mso-position-vertical-relative:page" '
      'filled="f" stroked="f"><v:textbox inset="0,0,0,0">'
      '<w:txbxContent>%s</w:txbxContent></v:textbox></v:shape></w:pict></w:r>'
    ) % (shapetype if i == 0 else '', i, x0, top, width, height, inner)
    shapes.append(shape)

p_xml = ('<w:p xmlns:w="%s" xmlns:v="urn:schemas-microsoft-com:vml" '
  'xmlns:o="urn:schemas-microsoft-com:office:office" '
  'xmlns:w10="urn:schemas-microsoft-com:office:word">'
  '<w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>'
  '%s</w:p>') % (W, ''.join(shapes))

body = doc.element.body
for p in list(body.findall(wq('p'))):
    body.remove(p)
sectPr = body.find(wq('sectPr'))
body.insert(list(body).index(sectPr), etree.fromstring(p_xml))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
doc.save(OUT)
print('saved', os.path.normpath(OUT))

# ---- ekspor peta koordinat ke JSON (dipakai web app untuk preview & PDF) ----
import json
fields = []
for name, x0, oy, size, pf, bold, isf in F:
    fields.append({
        'key': name if isf else None,
        'text': None if isf else name,   # teks statis bila bukan field
        'x': x0, 'baseline': oy, 'size': size,
        'font': FN.get(pf, pf), 'bold': bool(bold), 'isField': bool(isf),
    })
meta = {'page': {'w': 595.28, 'h': 841.89, 'unit': 'pt'}, 'fields': fields}
for out_json in (
    os.path.join(os.path.dirname(__file__), '..', 'web', 'templates', 'ijazah.json'),
    os.path.join(os.path.dirname(__file__), '..', 'templates', 'ijazah.json'),
):
    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print('saved', os.path.normpath(out_json))
