/* Generator Dokumen — multi-template, 100% client-side. Tidak ada data yang dikirim ke server. */
const PT = 96 / 72;
const CSS_FONT = {
  'Arial': 'Arial, Helvetica, sans-serif',
  'Times New Roman': "'Times New Roman', Times, serif",
  'Century': "'Century', 'Century Schoolbook', Georgia, serif",
  'Courier New': "'Courier New', monospace",
};

let MANIFEST = [];
let TKEY = null;       // key template aktif
let coord = null;      // peta koordinat template aktif
let form = null;       // metadata form (label/ask/default)
let baseDocx = null;   // kerangka docx (lazy)
let records = [];
let cur = 0;
let bgUrl = null;
let showBg = true;

const $ = (s) => document.querySelector(s);
const reqKeys = () => coord.fields.filter(f => f.isField && f.key).map(f => f.key);
const uniqueFieldKeys = () => [...new Set(reqKeys())];

/* ---------------- init ---------------- */
async function init() {
  bindStatic();
  try {
    MANIFEST = (await (await fetch('templates/manifest.json')).json()).templates;
  } catch {
    alert('Gagal memuat daftar template. Buka lewat server (bukan file://). Lihat README_web.md.');
    return;
  }
  renderPicker();
  const start = MANIFEST.find(t => t.ready) || MANIFEST[0];
  await loadTemplate(start.key);
}

function renderPicker() {
  const box = $('#tplPicker'); box.innerHTML = '';
  MANIFEST.forEach(t => {
    const b = document.createElement('button');
    b.className = 'tpl-pill' + (t.ready ? ' ready' : '') + (t.key === TKEY ? ' active' : '');
    b.innerHTML = `<span class="dot"></span>${t.name}`;
    b.onclick = () => loadTemplate(t.key);
    box.appendChild(b);
  });
}

async function loadTemplate(key) {
  const entry = MANIFEST.find(t => t.key === key); if (!entry) return;
  TKEY = key;
  coord = await (await fetch('templates/' + entry.file)).json();
  try { form = await (await fetch(`templates/${key}_form.json`)).json(); }
  catch { form = autoForm(coord); }
  bgUrl = coord.background || null;
  showBg = true; if ($('#showBg')) $('#showBg').checked = true;
  records = []; cur = 0;
  renderPicker();
  // notice kalau template belum punya field
  const note = $('#tplNotice');
  if (uniqueFieldKeys().length === 0) {
    note.classList.remove('hidden');
    note.innerHTML = `⚠️ Template <b>${coord.name || entry.name}</b> belum punya penempatan field. ` +
      `Buka <a href="editor.html">🎨 Editor Template</a> untuk menambah & atur posisinya.`;
  } else note.classList.add('hidden');
  buildManualForm();
  refreshRecords();
  renderPreview();
  fitPage();
}

function autoForm(c) {
  const seen = new Set(), fields = [];
  c.fields.forEach(f => { if (f.isField && f.key && !seen.has(f.key)) { seen.add(f.key); fields.push({ key: f.key, label: f.key.replace(/_/g, ' '), ask: true }); } });
  return { label: c.name, sheet: c.name, fields };
}

/* ---------------- UI bindings ---------------- */
function bindStatic() {
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    $('#tab-excel').classList.toggle('hidden', t.dataset.tab !== 'excel');
    $('#tab-manual').classList.toggle('hidden', t.dataset.tab !== 'manual');
  });
  $('#excelFile').onchange = onExcel;
  $('#sampleXlsx').onclick = downloadSample;
  $('#addRecord').onclick = addManual;
  $('#clearRecords').onclick = () => { records = []; cur = 0; refreshRecords(); renderPreview(); };
  $('#prev').onclick = () => { if (records.length) { cur = (cur - 1 + records.length) % records.length; refreshRecords(); renderPreview(); } };
  $('#next').onclick = () => { if (records.length) { cur = (cur + 1) % records.length; refreshRecords(); renderPreview(); } };
  $('#bgImage').onchange = onBg;
  $('#showBg').onchange = (e) => { showBg = e.target.checked; renderPreview(); };
  $('#dlPdfOne').onclick = () => makePdf(false);
  $('#dlPdfAll').onclick = () => makePdf(true);
  $('#dlDocxOne').onclick = () => makeDocx(false);
  $('#dlDocxAll').onclick = () => makeDocx(true);
  window.addEventListener('resize', fitPage);
}

/* ---------------- mode Excel ---------------- */
async function onExcel(e) {
  const file = e.target.files[0]; if (!file) return;
  const st = $('#excelStatus');
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const name = (form.sheet && wb.SheetNames.includes(form.sheet)) ? form.sheet : wb.SheetNames[0];
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    let hi = grid.findIndex(r => r.filter(c => String(c).trim() !== '').length >= 2);
    if (hi < 0) throw new Error('Header tidak ditemukan');
    const headers = grid[hi].map(c => String(c).trim());
    const data = [];
    for (let i = hi + 1; i < grid.length; i++) {
      const r = grid[i];
      if (!r.some(c => String(c).trim() !== '')) continue;
      const o = {};
      headers.forEach((h, j) => { if (h) o[h] = (r[j] == null ? '' : String(r[j]).trim()); });
      data.push(o);
    }
    const miss = uniqueFieldKeys().filter(k => !headers.includes(k));
    if (miss.length) { st.className = 'status err'; st.textContent = '⚠️ Kolom belum ada: ' + miss.join(', '); return; }
    if (!data.length) { st.className = 'status err'; st.textContent = 'Tidak ada baris data.'; return; }
    records = data; cur = 0;
    st.className = 'status ok'; st.textContent = `✅ ${data.length} data terbaca (sheet: ${name}).`;
    refreshRecords(); renderPreview();
  } catch (err) {
    st.className = 'status err'; st.textContent = 'Gagal baca Excel: ' + err.message;
  }
}

/* ---------------- mode Manual ---------------- */
function buildManualForm() {
  const saved = JSON.parse(localStorage.getItem('const_' + TKEY) || '{}');
  const f = $('#manualForm'); f.innerHTML = '';
  (form.fields || []).forEach(fld => {
    const wrap = document.createElement('div');
    wrap.className = 'fld' + (fld.ask ? '' : ' const');
    const val = fld.ask ? '' : (saved[fld.key] ?? fld.default ?? '');
    wrap.innerHTML = `<label>${fld.label}${fld.ask ? '' : ' (tetap)'}</label>
      <input data-key="${fld.key}" data-ask="${fld.ask ? 1 : 0}" value="${escapeAttr(val)}">`;
    f.appendChild(wrap);
  });
  $('#addRecord').style.display = (form.fields || []).length ? '' : 'none';
}
function addManual() {
  const o = {}, consts = {};
  $('#manualForm').querySelectorAll('input').forEach(inp => {
    o[inp.dataset.key] = inp.value.trim();
    if (inp.dataset.ask === '0') consts[inp.dataset.key] = inp.value.trim();
  });
  localStorage.setItem('const_' + TKEY, JSON.stringify(consts));
  records.push(o); cur = records.length - 1;
  $('#manualForm').querySelectorAll('input[data-ask="1"]').forEach(i => i.value = '');
  refreshRecords(); renderPreview();
}

/* ---------------- records ---------------- */
function refreshRecords() {
  $('#recCount').textContent = records.length + ' data';
  const ol = $('#recordList'); ol.innerHTML = '';
  records.forEach((r, i) => {
    const li = document.createElement('li');
    li.textContent = r.Nama_Lengkap || r.Nama || `(data ${i + 1})`;
    if (i === cur) li.classList.add('active');
    li.onclick = () => { cur = i; refreshRecords(); renderPreview(); };
    ol.appendChild(li);
  });
  const has = records.length > 0;
  $('#navLabel').textContent = has ? `${cur + 1} / ${records.length}` : '— / —';
  ['dlPdfOne', 'dlPdfAll', 'dlDocxOne', 'dlDocxAll', 'prev', 'next'].forEach(id => $('#' + id).disabled = !has);
}

/* ---------------- preview ---------------- */
function valueFor(fld, rec) {
  if (!fld.isField) return fld.text;
  if (rec && rec[fld.key] != null && rec[fld.key] !== '') return rec[fld.key];
  return rec ? '' : '«' + fld.key + '»';
}
function renderPreview() {
  const page = $('#page'); page.innerHTML = '';
  page.style.width = (coord.page.w * PT) + 'px';
  page.style.height = (coord.page.h * PT) + 'px';
  if (bgUrl && showBg) { const img = document.createElement('img'); img.className = 'bg'; img.src = bgUrl; page.appendChild(img); }
  const rec = records[cur];
  coord.fields.forEach(fld => {
    const div = document.createElement('div');
    div.className = 't';
    const sizePx = fld.size * PT;
    div.style.left = (fld.x * PT) + 'px';
    div.style.top = (fld.baseline * PT - sizePx * 0.80) + 'px';
    div.style.fontSize = sizePx + 'px';
    div.style.fontFamily = CSS_FONT[fld.font] || 'sans-serif';
    div.style.fontWeight = fld.bold ? '700' : '400';
    div.style.fontStyle = fld.italic ? 'italic' : 'normal';
    div.style.color = fld.color || '#000';
    div.style.transform = fld.align === 'center' ? 'translateX(-50%)' : fld.align === 'right' ? 'translateX(-100%)' : 'none';
    div.textContent = valueFor(fld, rec);
    if (!rec && fld.isField) div.style.color = '#9fb0c0';
    page.appendChild(div);
  });
}
function fitPage() {
  const stage = document.querySelector('.stage');
  const w = coord.page.w * PT, h = coord.page.h * PT;
  const scale = Math.min(1, (stage.clientWidth - 36) / w);
  const page = $('#page');
  page.style.transform = `scale(${scale})`;
  page.style.marginBottom = (h * (scale - 1)) + 'px';
}
function onBg(e) {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader(); r.onload = () => { bgUrl = r.result; renderPreview(); }; r.readAsDataURL(file);
}

/* ---------------- PDF ---------------- */
async function buildFonts(pdf) {
  pdf.registerFontkit(window.fontkit);
  const S = PDFLib.StandardFonts;
  const tryEmbed = async (url) => {
    try { const r = await fetch(url); if (!r.ok) return null; return await pdf.embedFont(await r.arrayBuffer(), { subset: true }); }
    catch { return null; }
  };
  const aR = await tryEmbed('assets/fonts/arial.ttf') || await pdf.embedFont(S.Helvetica);
  const aB = await tryEmbed('assets/fonts/arialbd.ttf') || await pdf.embedFont(S.HelveticaBold);
  const tR = await tryEmbed('assets/fonts/times.ttf') || await pdf.embedFont(S.TimesRoman);
  const tB = await tryEmbed('assets/fonts/timesbd.ttf') || await pdf.embedFont(S.TimesRomanBold);
  const cR = await tryEmbed('assets/fonts/century.ttf') || tR;
  const cB = await tryEmbed('assets/fonts/centurybd.ttf') || tB;
  const courR = await pdf.embedFont(S.Courier), courB = await pdf.embedFont(S.CourierBold);
  return { 'Arial': [aR, aB], 'Times New Roman': [tR, tB], 'Century': [cR, cB], 'Courier New': [courR, courB] };
}
function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return PDFLib.rgb(0, 0, 0);
  const n = parseInt(m[1], 16); return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
async function makePdf(all) {
  try {
    const list = all ? records : [records[cur]];
    if (!list.length || !list[0]) return;
    const pdf = await PDFLib.PDFDocument.create();
    const fonts = await buildFonts(pdf);
    const H = coord.page.h;
    for (const rec of list) {
      const pg = pdf.addPage([coord.page.w, H]);
      for (const fld of coord.fields) {
        const txt = valueFor(fld, rec) || '';
        if (txt === '') continue;
        const fam = fonts[fld.font] || fonts['Arial'];
        const font = fld.bold ? fam[1] : fam[0];
        let x = fld.x;
        if (fld.align === 'center' || fld.align === 'right') {
          const w = font.widthOfTextAtSize(String(txt), fld.size);
          x = fld.align === 'center' ? x - w / 2 : x - w;
        }
        pg.drawText(String(txt), { x, y: H - fld.baseline, size: fld.size, font, color: hexRgb(fld.color) });
      }
    }
    const bytes = await pdf.save();
    download(new Blob([bytes], { type: 'application/pdf' }), `${TKEY}_${all ? 'semua' : safe(list[0].Nama_Lengkap)}.pdf`);
  } catch (e) { alert('Gagal buat PDF: ' + e.message); }
}

/* ---------------- Word (di-generate dari JSON) ---------------- */
async function loadBaseDocx() {
  if (!baseDocx) baseDocx = await (await fetch('templates/_base.docx')).arrayBuffer();
  return baseDocx;
}
function escXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function buildDocumentXml(rec) {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const st = '<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>';
  let shapes = '';
  coord.fields.forEach((f, i) => {
    const val = f.isField ? (rec[f.key] ?? '') : (f.text || '');
    const size = f.size, top = f.baseline - size, x = f.x;
    const width = Math.max(150, Math.min(360, 595 - x)), height = size * 1.7;
    const font = f.font || 'Arial';
    const col = (f.color && f.color.toLowerCase() !== '#000000') ? `<w:color w:val="${f.color.replace('#', '')}"/>` : '';
    const jc = f.align === 'center' ? 'center' : f.align === 'right' ? 'right' : 'left';
    const rpr = `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>${f.bold ? '<w:b/><w:bCs/>' : ''}${f.italic ? '<w:i/><w:iCs/>' : ''}<w:sz w:val="${size * 2}"/><w:szCs w:val="${size * 2}"/>${col}</w:rPr>`;
    const inner = `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="${jc}"/></w:pPr><w:r>${rpr}<w:t xml:space="preserve">${escXml(val)}</w:t></w:r></w:p>`;
    shapes += `<w:r><w:pict>${i === 0 ? st : ''}<v:shape id="S${i}" type="#_x0000_t202" style="position:absolute;left:0;margin-left:${x}pt;margin-top:${top}pt;width:${width}pt;height:${height}pt;mso-position-horizontal-relative:page;mso-position-vertical-relative:page" filled="f" stroked="f"><v:textbox inset="0,0,0,0"><w:txbxContent>${inner}</w:txbxContent></v:textbox></v:shape></w:pict></w:r>`;
  });
  const pw = coord.page.w, ph = coord.page.h;
  const body = `<w:p xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w10="urn:schemas-microsoft-com:office:word"><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${shapes}</w:p>`;
  const sect = `<w:sectPr><w:pgSz w:w="${Math.round(pw * 20)}" w:h="${Math.round(ph * 20)}"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="${W}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}${sect}</w:body></w:document>`;
}
function docxBytesFor(rec, type) {
  const zip = new PizZip(baseDocx);
  zip.file('word/document.xml', buildDocumentXml(rec));
  return zip.generate({ type, compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
async function makeDocx(all) {
  try {
    await loadBaseDocx();
    if (!all) {
      const rec = records[cur]; if (!rec) return;
      download(docxBytesFor(rec, 'blob'), `${TKEY}_${safe(rec.Nama_Lengkap)}.docx`);
      return;
    }
    const out = new PizZip();
    records.forEach((rec, i) => out.file(`${String(i + 1).padStart(3, '0')}_${safe(rec.Nama_Lengkap)}.docx`, docxBytesFor(rec, 'uint8array')));
    download(out.generate({ type: 'blob', compression: 'DEFLATE' }), `${TKEY}_semua_word.zip`);
  } catch (e) { alert('Gagal buat Word: ' + e.message); }
}

/* ---------------- contoh Excel ---------------- */
function downloadSample() {
  const keys = uniqueFieldKeys();
  if (!keys.length) { alert('Template ini belum punya field.'); return; }
  const ws = XLSX.utils.aoa_to_sheet([keys, keys.map(k => '(' + k + ')')]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (form.sheet || 'DATA').slice(0, 31));
  XLSX.writeFile(wb, `contoh_${TKEY}.xlsx`);
}

/* ---------------- util ---------------- */
function safe(s) { return (String(s || 'data').replace(/[^\w\- ]+/g, '_').trim()) || 'data'; }
function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

init();
