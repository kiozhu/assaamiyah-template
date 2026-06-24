/* Generator Ijazah — 100% client-side. Tidak ada data yang dikirim ke server. */
const PT = 96 / 72;                  // 1pt -> px @96dpi
const TPL = 'ijazah';
const CSS_FONT = {
  'Arial': 'Arial, Helvetica, sans-serif',
  'Times New Roman': "'Times New Roman', Times, serif",
  'Century': "'Century', 'Century Schoolbook', Georgia, serif",
};

let coord = null;      // peta koordinat (ijazah.json)
let form = null;       // metadata form (ijazah_form.json)
let docxBuf = null;    // arraybuffer template .docx (lazy)
let records = [];      // data
let cur = 0;
let bgUrl = null;

const $ = (s) => document.querySelector(s);
const reqKeys = () => coord.fields.filter(f => f.isField).map(f => f.key);

/* ---------------- init ---------------- */
async function init() {
  try {
    coord = await (await fetch(`templates/${TPL}.json`)).json();
    form = await (await fetch(`templates/${TPL}_form.json`)).json();
  } catch (e) {
    alert('Gagal memuat template. Buka lewat server (bukan file://). Lihat README_web.md.');
    return;
  }
  buildManualForm();
  bindUI();
  renderPreview();
  fitPage();
}

/* ---------------- UI bindings ---------------- */
function bindUI() {
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
    const miss = reqKeys().filter(k => !(headers.includes(k)));
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
  const saved = JSON.parse(localStorage.getItem('ijazah_const') || '{}');
  const f = $('#manualForm'); f.innerHTML = '';
  form.fields.forEach(fld => {
    const wrap = document.createElement('div');
    wrap.className = 'fld' + (fld.ask ? '' : ' const');
    const val = fld.ask ? '' : (saved[fld.key] ?? fld.default ?? '');
    wrap.innerHTML = `<label>${fld.label}${fld.ask ? '' : ' (tetap)'}</label>
      <input data-key="${fld.key}" data-ask="${fld.ask ? 1 : 0}" value="${escapeAttr(val)}">`;
    f.appendChild(wrap);
  });
}
function addManual() {
  const o = {};
  const consts = {};
  $('#manualForm').querySelectorAll('input').forEach(inp => {
    o[inp.dataset.key] = inp.value.trim();
    if (inp.dataset.ask === '0') consts[inp.dataset.key] = inp.value.trim();
  });
  localStorage.setItem('ijazah_const', JSON.stringify(consts));
  records.push(o); cur = records.length - 1;
  // kosongkan hanya field yang diisi manual
  $('#manualForm').querySelectorAll('input[data-ask="1"]').forEach(i => i.value = '');
  refreshRecords(); renderPreview();
}

/* ---------------- records list ---------------- */
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
  return rec ? '' : '«' + fld.key + '»';   // placeholder kalau belum ada data
}
function renderPreview() {
  const page = $('#page'); page.innerHTML = '';
  if (bgUrl) { const img = document.createElement('img'); img.className = 'bg'; img.src = bgUrl; page.appendChild(img); }
  const rec = records[cur];
  coord.fields.forEach(fld => {
    const div = document.createElement('div');
    div.className = 't';
    const sizePx = fld.size * PT;
    div.style.left = (fld.x * PT) + 'px';
    div.style.top = (fld.baseline * PT - sizePx * 0.80) + 'px'; // dekati baseline
    div.style.fontSize = sizePx + 'px';
    div.style.fontFamily = CSS_FONT[fld.font] || 'sans-serif';
    div.style.fontWeight = fld.bold ? '700' : '400';
    div.textContent = valueFor(fld, rec);
    if (!rec && fld.isField) div.style.color = '#b0b8c0';
    page.appendChild(div);
  });
}
function fitPage() {
  const stage = document.querySelector('.stage');
  const scale = Math.min(1, (stage.clientWidth - 36) / 793.7);
  const page = $('#page');
  page.style.transform = `scale(${scale})`;
  page.style.marginBottom = (1122.5 * (scale - 1)) + 'px';
}
function onBg(e) {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader(); r.onload = () => { bgUrl = r.result; renderPreview(); }; r.readAsDataURL(file);
}

/* ---------------- PDF (pdf-lib, koordinat presisi) ---------------- */
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
  return { 'Arial': [aR, aB], 'Times New Roman': [tR, tB], 'Century': [cR, cB] };
}
async function makePdf(all) {
  try {
    const list = all ? records : [records[cur]];
    if (!list.length || !list[0]) return;
    const pdf = await PDFLib.PDFDocument.create();
    const fonts = await buildFonts(pdf);
    const black = PDFLib.rgb(0, 0, 0);
    const H = coord.page.h;
    for (const rec of list) {
      const pg = pdf.addPage([coord.page.w, H]);
      for (const fld of coord.fields) {
        const txt = valueFor(fld, rec) || '';
        if (txt === '') continue;
        const fam = fonts[fld.font] || fonts['Arial'];
        const font = fld.bold ? fam[1] : fam[0];
        pg.drawText(String(txt), { x: fld.x, y: H - fld.baseline, size: fld.size, font, color: black });
      }
    }
    const bytes = await pdf.save();
    download(new Blob([bytes], { type: 'application/pdf' }),
      `ijazah_${all ? 'semua' : safe(list[0].Nama_Lengkap)}.pdf`);
  } catch (e) { alert('Gagal buat PDF: ' + e.message); }
}

/* ---------------- Word (docxtemplater) ---------------- */
async function loadDocxBuf() {
  if (!docxBuf) docxBuf = await (await fetch(`templates/${TPL}.docx`)).arrayBuffer();
  return docxBuf;
}
function renderOneDocx(rec) {
  const zip = new PizZip(docxBuf);
  const doc = new window.docxtemplater(zip, {
    paragraphLoop: true, linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: () => '',
  });
  const ctx = {}; coord.fields.forEach(f => { if (f.isField) ctx[f.key] = rec[f.key] ?? ''; });
  doc.render(ctx);
  return doc.getZip().generate({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
async function makeDocx(all) {
  try {
    await loadDocxBuf();
    if (!all) {
      const rec = records[cur]; if (!rec) return;
      download(renderOneDocx(rec), `ijazah_${safe(rec.Nama_Lengkap)}.docx`);
      return;
    }
    // semua -> zip berisi banyak docx
    const out = new PizZip();
    records.forEach((rec, i) => {
      const blobZip = new PizZip(docxBuf);
      const doc = new window.docxtemplater(blobZip, { delimiters: { start: '{{', end: '}}' }, nullGetter: () => '' });
      const ctx = {}; coord.fields.forEach(f => { if (f.isField) ctx[f.key] = rec[f.key] ?? ''; });
      doc.render(ctx);
      const content = doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' });
      out.file(`${String(i + 1).padStart(3, '0')}_${safe(rec.Nama_Lengkap)}.docx`, content);
    });
    download(out.generate({ type: 'blob', compression: 'DEFLATE' }), 'ijazah_semua_word.zip');
  } catch (e) { alert('Gagal buat Word: ' + e.message); }
}

/* ---------------- contoh Excel ---------------- */
function downloadSample() {
  const keys = reqKeys();
  const ws = XLSX.utils.aoa_to_sheet([keys, keys.map(k => '(' + k + ')')]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, form.sheet || 'DATA');
  XLSX.writeFile(wb, 'contoh_data_ijazah.xlsx');
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
