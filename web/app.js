/* Generator Dokumen — multi-template, 100% client-side. Tidak ada data yang dikirim ke server. */
const PT = 96 / 72;
const CSS_FONT = {
  'Arial': 'Arial, Helvetica, sans-serif',
  'Calibri': "Calibri, 'Segoe UI', sans-serif",
  'Verdana': 'Verdana, Geneva, sans-serif',
  'Tahoma': 'Tahoma, Geneva, sans-serif',
  'Trebuchet MS': "'Trebuchet MS', sans-serif",
  'Times New Roman': "'Times New Roman', Times, serif",
  'Georgia': 'Georgia, serif',
  'Cambria': 'Cambria, Georgia, serif',
  'Garamond': "Garamond, 'Times New Roman', serif",
  'Book Antiqua': "'Book Antiqua', Palatino, serif",
  'Century': "'Century', 'Century Schoolbook', Georgia, serif",
  'Courier New': "'Courier New', monospace",
  'Consolas': 'Consolas, monospace',
  'Comic Sans MS': "'Comic Sans MS', cursive",
};
// kategori untuk fallback font PDF (standar pdf-lib)
const FONT_CAT = {
  'Arial': 'sans', 'Calibri': 'sans', 'Verdana': 'sans', 'Tahoma': 'sans', 'Trebuchet MS': 'sans', 'Comic Sans MS': 'sans',
  'Times New Roman': 'serif', 'Georgia': 'serif', 'Cambria': 'serif', 'Garamond': 'serif', 'Book Antiqua': 'serif', 'Century': 'serif',
  'Courier New': 'mono', 'Consolas': 'mono',
};

let MANIFEST = [];
let TKEY = null;       // key template aktif
let coord = null;      // peta koordinat template aktif
let form = null;       // metadata form (label/ask/default)
let baseDocx = null;   // kerangka docx (lazy)
let records = [];
const recordsByTpl = {};   // data per-template (ijazah/skhu/nilai_ijazah TERPISAH)
const statusByTpl = {};    // status upload Excel per-template
const draftByTpl = {};     // draft isian manual yang BELUM ditambahkan (per template)
const LS_DATA = 'assa_data_v1';   // autosave: agar data tidak hilang saat refresh/disconnect
function persist() {
  try { localStorage.setItem(LS_DATA, JSON.stringify({ records: recordsByTpl, drafts: draftByTpl })); } catch (e) {}
}
function loadPersisted() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_DATA) || '{}');
    if (d.records) Object.assign(recordsByTpl, d.records);
    if (d.drafts) Object.assign(draftByTpl, d.drafts);
  } catch (e) {}
}
let cur = 0;
let manualPreview = null;   // data input manual yang sedang dipratinjau (belum ditambahkan)
let pendingRecord = null;   // data menunggu diberi nama di dialog sebelum masuk daftar
let editingIdx = -1;        // index data yang sedang diedit lewat Input Manual (-1 = tambah baru)
let adminToken = null;      // token sesi admin (di memori + sessionStorage)
let bgUrl = null;
let showBg = true;
let editMode = false;
let editSample = null;     // data contoh saat mode edit (agar tampil teks, bukan placeholder)
let selIdx = -1;
let previewScale = 1;
let fdrag = null;
const OV = (k) => 'tpl_override_' + k;

const $ = (s) => document.querySelector(s);
const reqKeys = () => coord.fields.filter(f => f.isField && f.key).map(f => f.key);
// Key unik diurutkan mengikuti posisi placeholder di pratinjau: atas -> bawah
// (baseline kecil = lebih atas), lalu kiri -> kanan (x) untuk yang sebaris.
// Efek: placeholder baru otomatis menempati urutan sesuai letaknya di blangko,
// bukan selalu jadi kolom terakhir — konsisten untuk Excel & input manual.
function uniqueFieldKeys() {
  const pos = new Map();   // key -> posisi kemunculan paling atas
  coord.fields.forEach(f => {
    if (!f.isField || !f.key) return;
    const b = +f.baseline || 0, x = +f.x || 0;
    const prev = pos.get(f.key);
    if (!prev || b < prev.b || (b === prev.b && x < prev.x)) pos.set(f.key, { b, x });
  });
  return [...pos.entries()].sort((a, c) => a[1].b - c[1].b || a[1].x - c[1].x).map(e => e[0]);
}

/* ---------------- init ---------------- */
async function init() {
  bindStatic();
  loadPersisted();           // pulihkan data & draft tersimpan (anti-hilang saat refresh)
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

async function loadTemplate(key, forceShipped = false) {
  const entry = MANIFEST.find(t => t.key === key); if (!entry) return;
  TKEY = key;
  const ov = forceShipped ? null : localStorage.getItem(OV(key));
  coord = ov ? JSON.parse(ov) : await (await fetch('templates/' + entry.file)).json();
  selIdx = -1;
  try { form = await (await fetch(`templates/${key}_form.json`)).json(); }
  catch { form = autoForm(coord); }
  bgUrl = coord.background || null;
  showBg = true; if ($('#showBg')) $('#showBg').checked = true;
  records = recordsByTpl[key] || (recordsByTpl[key] = []);   // data milik template ini saja
  cur = 0; editingIdx = -1;                                  // mulai segar di tiap template
  renderPicker();
  // pulihkan status upload Excel khusus template ini (jangan bocor antar-template)
  const stEl = $('#excelStatus');
  if (stEl) { const sv = statusByTpl[key]; stEl.className = 'status' + (sv ? ' ' + sv.cls : ''); stEl.textContent = sv ? sv.text : ''; }
  if ($('#excelFile')) $('#excelFile').value = '';
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
  $('#sampleEmpty').onclick = () => downloadSample(false);
  $('#sampleFilled').onclick = () => downloadSample(true);
  $('#addRecord').onclick = addManual;
  $('#saveRecord').onclick = saveRecord;
  $('#cancelEdit').onclick = cancelEdit;
  $('#exportExcel').onclick = exportExcel;
  $('#manualForm').oninput = previewManual;   // pratinjau auto-refresh tiap kolom diisi
  $('#nameModalSave').onclick = confirmAddName;
  $('#nameModalCancel').onclick = closeNameModal;
  $('#nameModalInput').onkeydown = (e) => { if (e.key === 'Enter') confirmAddName(); else if (e.key === 'Escape') closeNameModal(); };
  $('#nameModal').onclick = (e) => { if (e.target.id === 'nameModal') closeNameModal(); };

  // --- admin tersembunyi: klik LOGO untuk login / keluar ---
  adminToken = sessionStorage.getItem('admin_token') || null;
  const logo = $('#brandLogo');
  if (logo) logo.onclick = () => { if (adminToken) { if (confirm('Keluar dari mode admin?')) adminLogout(); } else openAdminModal(); };
  $('#adminLoginBtn').onclick = doAdminLogin;
  $('#adminCancel').onclick = closeAdminModal;
  $('#adminPass').onkeydown = (e) => { if (e.key === 'Enter') doAdminLogin(); else if (e.key === 'Escape') closeAdminModal(); };
  $('#adminModal').onclick = (e) => { if (e.target.id === 'adminModal') closeAdminModal(); };
  $('#saveGlobal').onclick = saveDefaultGlobal;
  // pengaturan template (mode edit): ukuran halaman + ganti blangko
  $('#edPageSize').onchange = onPageSize;
  $('#edBgFile').onchange = onChangeBg;
  updateAdminUI();
  $('#clearRecords').onclick = () => {
    if (editingIdx >= 0) exitEditMode();
    records = []; cur = 0; recordsByTpl[TKEY] = records; delete statusByTpl[TKEY]; persist();
    const st = $('#excelStatus'); if (st) { st.className = 'status'; st.textContent = ''; }
    refreshRecords(); renderPreview();
  };
  $('#prev').onclick = () => { if (records.length) { cur = (cur - 1 + records.length) % records.length; refreshRecords(); renderPreview(); } };
  $('#next').onclick = () => { if (records.length) { cur = (cur + 1) % records.length; refreshRecords(); renderPreview(); } };
  $('#bgImage').onchange = onBg;
  $('#resetBg').onclick = resetBg;
  const donasi = $('#donasiBtn');
  if (donasi) donasi.onclick = () => alert('💝 Donasi akan segera dibuka.\nNomor rekening menyusul — terima kasih atas dukungannya! 🙏');
  $('#showBg').onchange = (e) => { showBg = e.target.checked; renderPreview(); };
  $('#printOne').onclick = () => printPdf(false);
  $('#printAll').onclick = () => printPdf(true);
  $('#dlPdfOne').onclick = () => makePdf(false);
  $('#dlPdfAll').onclick = () => makePdf(true);
  $('#dlDocxOne').onclick = () => makeDocx(false);
  $('#dlDocxAll').onclick = () => makeDocx(true);
  window.addEventListener('resize', fitPage);

  // --- kontrol edit halaman depan ---
  $('#editToggle').onclick = () => setEditMode(!editMode);
  $('#saveDefault').onclick = saveDefaultTpl;
  $('#resetDefault').onclick = resetDefaultTpl;
  $('#epUndo').onclick = undoEdit;
  $('#epRedo').onclick = redoEdit;
  $('#epAddField').onclick = () => addElementFront(true);
  $('#epAddText').onclick = () => addElementFront(false);
  $('#epDel').onclick = deleteSelField;
  $('#epFont').onchange = e => updateSel('font', e.target.value);
  $('#epSize').oninput = e => updateSel('size', +e.target.value || 12);
  $('#epColor').oninput = e => updateSel('color', e.target.value);
  $('#epX').oninput = e => { updateSel('x', +e.target.value || 0); reorderManualForm(); };
  $('#epY').oninput = e => { updateSel('baseline', +e.target.value || 0); reorderManualForm(); };
  $('#epBold').onclick = () => { const f = coord.fields[selIdx]; if (!f) return; f.bold = !f.bold; $('#epBold').classList.toggle('on', f.bold); const d = selDiv(); if (d) styleTextEl(d, f, currentRec()); histMark(); };
  $('#epItalic').onclick = () => { const f = coord.fields[selIdx]; if (!f) return; f.italic = !f.italic; $('#epItalic').classList.toggle('on', f.italic); const d = selDiv(); if (d) styleTextEl(d, f, currentRec()); histMark(); };
  document.querySelectorAll('.epAl').forEach(b => b.onclick = () => {
    const f = coord.fields[selIdx]; if (!f) return; f.align = b.dataset.al;
    document.querySelectorAll('.epAl').forEach(x => x.classList.toggle('on', x === b));
    const d = selDiv(); if (d) styleTextEl(d, f, currentRec()); histMark();
  });
  $('#page').addEventListener('pointerdown', ev => { if (editMode && (ev.target.id === 'page' || ev.target.classList.contains('bg'))) selectField(-1); });
  document.addEventListener('keydown', ev => {
    if (!editMode) return;
    const ctrl = ev.ctrlKey || ev.metaKey;
    if (ctrl && (ev.key === 'z' || ev.key === 'Z')) { ev.preventDefault(); ev.shiftKey ? redoEdit() : undoEdit(); return; }
    if (ctrl && (ev.key === 'y' || ev.key === 'Y')) { ev.preventDefault(); redoEdit(); return; }
    if (selIdx < 0) return;
    const tag = (document.activeElement.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select') return;
    const f = coord.fields[selIdx]; if (!f) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); deleteSelField(); return; }
    const step = ev.shiftKey ? 10 : 1;
    if (ev.key === 'ArrowLeft') f.x -= step; else if (ev.key === 'ArrowRight') f.x += step;
    else if (ev.key === 'ArrowUp') f.baseline -= step; else if (ev.key === 'ArrowDown') f.baseline += step; else return;
    ev.preventDefault(); f.x = Math.round(f.x * 10) / 10; f.baseline = Math.round(f.baseline * 10) / 10;
    const d = selDiv(); if (d) styleTextEl(d, f, currentRec());
    $('#epX').value = Math.round(f.x); $('#epY').value = Math.round(f.baseline);
    reorderManualForm(); histMark();
  });
}

/* ---------------- mode Excel ---------------- */
async function onExcel(e) {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;   // reset agar bisa pilih file sama lagi
  const st = $('#excelStatus');
  st.className = 'status'; st.textContent = '⏳ Membaca file…';
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
    records = data; cur = 0; recordsByTpl[TKEY] = data; editingIdx = -1;
    st.className = 'status ok'; st.textContent = `✅ ${data.length} data terbaca (sheet: ${name}).`;
    statusByTpl[TKEY] = { cls: 'ok', text: st.textContent };
    persist();
    refreshRecords(); renderPreview();
  } catch (err) {
    st.className = 'status err';
    st.textContent = '❌ Gagal membaca. Pastikan file Excel (.xlsx/.xls) yang benar — bukan PDF/gambar.';
  }
}

/* ---------------- mode Manual ---------------- */
function buildManualForm() {
  const meta = {}; (form.fields || []).forEach(m => meta[m.key] = m);
  const draft = draftByTpl[TKEY] || {};        // pulihkan ketikan yang belum ditambahkan
  const keys = uniqueFieldKeys();              // diturunkan dari placeholder terkini di coord
  const f = $('#manualForm'); f.innerHTML = '';
  keys.forEach(key => {
    const m = meta[key] || { key, label: key.replace(/_/g, ' '), ask: true };
    const wrap = document.createElement('div');
    wrap.className = 'fld' + (m.ask ? '' : ' const');
    // mulai kosong; kecuali ada draft tersimpan (anti-hilang saat refresh)
    wrap.innerHTML = `<label>${m.label || key.replace(/_/g, ' ')}${m.ask ? '' : ' (tetap)'}</label>
      <input data-key="${key}" data-ask="${m.ask ? 1 : 0}" value="${escapeAttr(draft[key] || '')}">`;
    f.appendChild(wrap);
  });
  $('#manualActions').style.display = keys.length ? '' : 'none';
  updateManualMode();
}
// Susun ulang urutan input manual mengikuti posisi placeholder TERKINI, tanpa
// membangun ulang form (memindah elemen yang sudah ada -> nilai yang sudah
// diketik tetap aman). Dipanggil tiap kali posisi placeholder berubah.
function reorderManualForm() {
  const f = $('#manualForm'); if (!f) return;
  const wraps = new Map();
  f.querySelectorAll('.fld').forEach(w => { const inp = w.querySelector('input'); if (inp) wraps.set(inp.dataset.key, w); });
  uniqueFieldKeys().forEach(key => { const w = wraps.get(key); if (w) f.appendChild(w); });
}
// Baca isi form manual jadi satu objek record (+ kumpulan field "tetap").
function readManualForm() {
  const o = {};
  $('#manualForm').querySelectorAll('input').forEach(inp => { o[inp.dataset.key] = inp.value.trim(); });
  return o;
}
// Klik "Tambah ke daftar": jangan langsung simpan — buka dialog beri nama dulu.
function addManual() {
  pendingRecord = readManualForm();
  const inp = $('#nameModalInput');
  inp.value = recordName(pendingRecord, records.length);   // pra-isi dari nama yang sudah diketik
  $('#nameModal').classList.remove('hidden');
  inp.focus(); inp.select();
}
// Simpan data dari dialog (dengan nama yang diberikan) ke daftar.
function confirmAddName() {
  if (!pendingRecord) return;
  const o = pendingRecord;
  const name = $('#nameModalInput').value.trim();
  if (name) o.__label = name;                  // label tampilan di daftar (tidak ikut tercetak)
  records.push(o); cur = records.length - 1;
  $('#manualForm').querySelectorAll('input').forEach(i => i.value = '');   // kosongkan utk entri berikutnya
  delete draftByTpl[TKEY]; persist();           // data tersimpan, draft selesai
  closeNameModal();
  refreshRecords(); renderPreview();           // refreshRecords() mereset manualPreview
}
function closeNameModal() {
  pendingRecord = null;
  $('#nameModal').classList.add('hidden');
}
// Pratinjau data yang sedang diketik TANPA menambahkannya ke daftar.
function previewManual() {
  const o = readManualForm();
  manualPreview = o;
  if (editingIdx < 0) {
    draftByTpl[TKEY] = o; persist();           // draft hanya untuk entri baru (anti-hilang)
    setManualNote('👁️ Pratinjau otomatis dari isian — <b>belum ditambahkan</b>. Klik “➕ Tambah ke daftar” bila sudah yakin.');
  } else {
    setManualNote('✏️ Mengedit <b>' + escapeHtml(recordName(o, editingIdx)) + '</b> — klik “💾 Simpan perubahan” untuk menyimpan.');
  }
  renderPreview();
}
function setManualNote(html) {
  const n = $('#manualPreviewNote'); if (!n) return;
  if (html == null) { n.classList.add('hidden'); return; }
  n.innerHTML = html; n.classList.remove('hidden');
}
// Klik salah satu data -> muat ke Input Manual untuk diedit langsung.
function editRecord(i) {
  if (i < 0 || i >= records.length) return;
  editingIdx = i; cur = i;
  // pindah ke tab Input Manual
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === 'manual'));
  $('#tab-excel').classList.add('hidden');
  $('#tab-manual').classList.remove('hidden');
  buildManualForm();                            // bangun ulang field sesuai template
  const rec = records[i] || {};
  $('#manualForm').querySelectorAll('input').forEach(inp => { const k = inp.dataset.key; inp.value = (rec[k] != null ? rec[k] : ''); });
  refreshRecords();                             // sorot baris aktif (mereset manualPreview/note)
  manualPreview = readManualForm();             // pratinjau pakai data yang dimuat
  updateManualMode();
  setManualNote('✏️ Mengedit <b>' + escapeHtml(recordName(rec, i)) + '</b> — ubah lalu klik “💾 Simpan perubahan”.');
  renderPreview();
  $('#tab-manual').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
// Simpan perubahan data yang sedang diedit ke daftar (langsung di web).
function saveRecord() {
  if (editingIdx < 0 || editingIdx >= records.length) return;
  const o = readManualForm();
  const old = records[editingIdx];
  if (old && old.__label) o.__label = old.__label;   // pertahankan nama tampilan kustom
  records[editingIdx] = o; cur = editingIdx;
  persist();
  exitEditMode();
  refreshRecords(); renderPreview();
  setManualNote('✅ Perubahan tersimpan di browser ini.');
  setTimeout(() => { const n = $('#manualPreviewNote'); if (n && n.textContent.startsWith('✅')) n.classList.add('hidden'); }, 2500);
}
function cancelEdit() { exitEditMode(); refreshRecords(); renderPreview(); setManualNote(null); }
function exitEditMode() {
  editingIdx = -1; manualPreview = null;
  $('#manualForm').querySelectorAll('input').forEach(i => i.value = '');
  updateManualMode();
}
// Tampilkan tombol sesuai mode: tambah-baru vs edit-data.
function updateManualMode() {
  const editing = editingIdx >= 0 && editingIdx < records.length;
  $('#addRecord').classList.toggle('hidden', editing);
  $('#saveRecord').classList.toggle('hidden', !editing);
  $('#cancelEdit').classList.toggle('hidden', !editing);
}
// Unduh semua data sebagai Excel (cadangan; header = nama placeholder agar bisa di-upload lagi).
function exportExcel() {
  if (!records.length) { alert('Belum ada data untuk diunduh.'); return; }
  const keys = uniqueFieldKeys();
  if (!keys.length) { alert('Template ini belum punya field.'); return; }
  const rows = [keys];
  records.forEach(r => rows.push(keys.map(k => (r[k] != null ? r[k] : ''))));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (form.sheet || 'DATA').slice(0, 31));
  XLSX.writeFile(wb, `data_${TKEY}.xlsx`);
}

/* ---------------- records ---------------- */
function recordName(r, i) {
  if (r.__label) return r.__label;             // nama kustom dari dialog
  const firstVal = Object.entries(r).find(([k, v]) => k !== '__label' && v != null && String(v).trim() !== '');
  return r.Nama_Lengkap || r.Nama || (firstVal ? firstVal[1] : null) || `(data ${i + 1})`;
}
function pageSizeLabel() {
  if (!coord || !coord.page) return '—';
  const w = Math.round(coord.page.w * 100) / 100, h = Math.round(coord.page.h * 100) / 100;
  const presets = { '595.28x841.89': 'A4 Potret', '841.89x595.28': 'A4 Lanskap', '612x792': 'Letter', '935.43x612.28': 'F4/Folio' };
  return presets[w + 'x' + h] || (Math.round(w) + '×' + Math.round(h) + ' pt');
}
function updateStats() {
  const t = $('#statTpl'); if (t) t.textContent = (coord && coord.name) || TKEY || '—';
  const s = $('#statSize'); if (s) s.textContent = pageSizeLabel();
  const c = $('#statCount'); if (c) c.textContent = String(records.length);
}
function refreshRecords() {
  manualPreview = null;                                   // keluar dari mode pratinjau manual
  const note = $('#manualPreviewNote'); if (note) note.classList.add('hidden');
  $('#recCount').textContent = records.length + ' data';
  const ol = $('#recordList'); ol.innerHTML = '';
  records.forEach((r, i) => {
    const li = document.createElement('li');
    if (i === cur) li.classList.add('active');
    if (i === editingIdx) li.classList.add('editing');
    li.title = 'Klik untuk edit data ini';
    li.onclick = () => editRecord(i);
    const name = document.createElement('span');
    name.className = 'rec-name';
    name.textContent = recordName(r, i);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'rec-del';
    del.textContent = '✕';
    del.title = 'Hapus data ini';
    del.onclick = (e) => { e.stopPropagation(); deleteRecord(i); };
    li.appendChild(name); li.appendChild(del);
    ol.appendChild(li);
  });
  const has = records.length > 0;
  const empty = $('#recordsEmpty'); if (empty) empty.classList.toggle('hidden', has);
  $('#recordList').style.display = has ? '' : 'none';
  $('#navLabel').textContent = has ? `${cur + 1} / ${records.length}` : '— / —';
  ['printOne', 'printAll', 'dlPdfOne', 'dlPdfAll', 'dlDocxOne', 'dlDocxAll', 'prev', 'next'].forEach(id => $('#' + id).disabled = !has);
  const ex = $('#exportExcel'); if (ex) ex.disabled = !has;
  updateManualMode();
  updateStats();
}
// Hapus satu data dari daftar (bukan kosongkan semua).
function deleteRecord(i) {
  records.splice(i, 1);
  if (editingIdx === i) exitEditMode();          // data yang diedit terhapus -> keluar mode edit
  else if (editingIdx > i) editingIdx--;         // index bergeser setelah penghapusan
  if (cur >= records.length) cur = Math.max(0, records.length - 1);
  persist();
  refreshRecords(); renderPreview();
}

/* ---------------- preview ---------------- */
function valueFor(fld, rec) {
  if (!fld.isField) return fld.text;
  if (rec && rec[fld.key] != null && rec[fld.key] !== '') return rec[fld.key];
  return rec ? '' : '«' + fld.key + '»';
}
function styleTextEl(div, fld, rec) {
  const sizePx = fld.size * PT;
  div.style.left = (fld.x * PT) + 'px';
  div.style.top = (fld.baseline * PT - sizePx * 0.80) + 'px';
  div.style.fontSize = sizePx + 'px';
  div.style.fontFamily = CSS_FONT[fld.font] || 'sans-serif';
  div.style.fontWeight = fld.bold ? '700' : '400';
  div.style.fontStyle = fld.italic ? 'italic' : 'normal';
  div.style.color = fld.color || '#000';
  div.style.transform = fld.align === 'center' ? 'translateX(-50%)' : fld.align === 'right' ? 'translateX(-100%)' : 'none';
  const val = valueFor(fld, rec);
  div.textContent = val;
  div.style.opacity = '';
  // Mode edit: elemen yang nilainya kosong (mis. field "tetap" seperti Nama Kepala)
  // tetap harus terlihat sebagai placeholder agar bisa dipilih & digeser.
  if (editMode && (val == null || val === '')) {
    div.textContent = fld.isField ? ('«' + fld.key + '»') : '«teks»';
    div.style.color = '#1f8fd0';
    div.style.opacity = '.9';
  } else if (!rec && fld.isField) {
    div.style.color = editMode ? '#1f8fd0' : '#9fb0c0';
  }
}
// Bangun 1 record contoh (semua field terisi) untuk mode edit.
function sampleRecord() {
  const meta = {}; (form.fields || []).forEach(m => meta[m.key] = m);
  const rec = {};
  uniqueFieldKeys().forEach(k => rec[k] = exampleValue(k, meta[k], 0));
  return rec;
}
// Record yang dipakai pratinjau: mode edit -> contoh terisi; selain itu -> data live/terpilih.
function currentRec() {
  return editMode ? editSample : (manualPreview || records[cur]);
}
function renderPreview() {
  const page = $('#page'); page.innerHTML = '';
  page.style.width = (coord.page.w * PT) + 'px';
  page.style.height = (coord.page.h * PT) + 'px';
  if (bgUrl && showBg) { const img = document.createElement('img'); img.className = 'bg'; img.src = bgUrl; page.appendChild(img); }
  const rec = currentRec();
  coord.fields.forEach((fld, i) => {
    const div = document.createElement('div');
    div.className = 't' + (editMode ? ' editable' : '') + (i === selIdx ? ' sel-edit' : '');
    div.dataset.idx = i;
    styleTextEl(div, fld, rec);
    if (editMode) div.addEventListener('pointerdown', startFieldDrag);
    page.appendChild(div);
  });
  if (editMode) {
    const del = document.createElement('button');
    del.id = 'delBadge'; del.className = 't-del hidden'; del.type = 'button';
    del.title = 'Hapus elemen ini'; del.textContent = '✕';
    del.addEventListener('pointerdown', e => e.stopPropagation());
    del.addEventListener('click', e => { e.stopPropagation(); deleteSelField(); });
    page.appendChild(del);
  }
  positionDelBadge();
}
// Posisikan tombol ✕ melayang di pojok kanan-atas elemen yang sedang dipilih.
function positionDelBadge() {
  const badge = document.getElementById('delBadge'); if (!badge) return;
  const d = selDiv();
  if (!editMode || !d) { badge.classList.add('hidden'); return; }
  const pr = $('#page').getBoundingClientRect();
  const r = d.getBoundingClientRect();
  const s = previewScale || 1;
  badge.style.left = ((r.right - pr.left) / s) + 'px';
  badge.style.top = ((r.top - pr.top) / s) + 'px';
  badge.classList.remove('hidden');
}
function fitPage() {
  const stage = document.querySelector('.stage');
  const cs = getComputedStyle(stage);
  const avail = stage.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  const w = coord.page.w * PT, h = coord.page.h * PT;
  const scale = Math.min(1, avail > 0 ? avail / w : 1);
  previewScale = scale;
  const page = $('#page');
  page.style.transformOrigin = 'top left';
  page.style.transform = `scale(${scale})`;
  // transform tidak mengubah ukuran layout -> kompensasi lebar & tinggi agar tidak meluber di HP
  page.style.marginRight = (w * (scale - 1)) + 'px';
  page.style.marginBottom = (h * (scale - 1)) + 'px';
  positionDelBadge();
}

/* ---------------- edit di halaman depan ---------------- */
function setEditMode(on) {
  editMode = on; selIdx = -1;
  editSample = on ? sampleRecord() : null;   // tampilkan contoh terisi saat edit
  manualPreview = null;
  const note = $('#manualPreviewNote'); if (note) note.classList.add('hidden');
  $('#editToggle').classList.toggle('on', on);
  $('#editToggle').textContent = on ? '✓ Mode Edit Aktif' : '✏️ Aktifkan Edit';
  ['saveDefault', 'resetDefault'].forEach(id => $('#' + id).classList.toggle('hidden', !on));
  $('#editPanel').classList.toggle('hidden', !on);
  $('#tplSettings').classList.toggle('hidden', !on);
  if (on) syncPageSizeSelect();
  updateAdminUI();                         // tombol "Simpan Global" ikut mode edit + status admin
  if (on) selectField(-1);
  renderPreview();
  if (on) histReset(); else { editHist = []; editHistIdx = -1; histTimer = null; }
}

/* ---------------- undo / redo (mode edit) ---------------- */
let editHist = [], editHistIdx = -1, histTimer = null;
const HIST_MAX = 80;
const snapCoord = () => JSON.stringify({ fields: coord.fields, page: coord.page });
function histReset() { editHist = coord ? [snapCoord()] : []; editHistIdx = editHist.length - 1; histTimer = null; updateUndoUI(); }
function histCommit() {
  if (!coord) return;
  const snap = snapCoord();
  if (editHist[editHistIdx] === snap) return;             // tidak ada perubahan nyata
  if (editHistIdx < editHist.length - 1) editHist = editHist.slice(0, editHistIdx + 1);  // buang cabang "ulangi"
  editHist.push(snap);
  if (editHist.length > HIST_MAX) editHist.shift();
  editHistIdx = editHist.length - 1;
  updateUndoUI();
}
// Tandai perubahan; rentetan perubahan cepat (geser, tahan panah) digabung jadi 1 langkah.
function histMark() { if (!editMode) return; if (histTimer) clearTimeout(histTimer); histTimer = setTimeout(() => { histTimer = null; histCommit(); }, 350); }
function histFlush() { if (histTimer) { clearTimeout(histTimer); histTimer = null; histCommit(); } }
function histRestore() {
  const s = JSON.parse(editHist[editHistIdx]);
  coord.fields = s.fields; coord.page = s.page; selIdx = -1;
  buildManualForm(); renderPreview(); fitPage(); syncPageSizeSelect(); selectField(-1);
  updateUndoUI();
}
function undoEdit() { if (!editMode) return; histFlush(); if (editHistIdx > 0) { editHistIdx--; histRestore(); } }
function redoEdit() { if (!editMode) return; histFlush(); if (editHistIdx < editHist.length - 1) { editHistIdx++; histRestore(); } }
function updateUndoUI() {
  const u = $('#epUndo'), r = $('#epRedo');
  if (u) u.disabled = !editMode || editHistIdx <= 0;
  if (r) r.disabled = !editMode || editHistIdx >= editHist.length - 1;
}
function selectField(idx) {
  selIdx = idx;
  document.querySelectorAll('#page .t').forEach(n => n.classList.toggle('sel-edit', +n.dataset.idx === idx));
  const f = coord.fields[idx];
  $('#epName').textContent = f ? (f.isField ? '«' + f.key + '»' : '“' + (f.text || '') + '”') : 'Pilih teks di pratinjau…';
  const dis = !f;
  ['epFont', 'epSize', 'epBold', 'epItalic', 'epColor', 'epX', 'epY', 'epDel'].forEach(id => $('#' + id).disabled = dis);
  document.querySelectorAll('.epAl').forEach(b => b.disabled = dis);
  if (!f) return;
  $('#epFont').value = f.font || 'Arial';
  $('#epSize').value = f.size;
  $('#epColor').value = (f.color || '#000000');
  $('#epX').value = Math.round(f.x); $('#epY').value = Math.round(f.baseline);
  $('#epBold').classList.toggle('on', !!f.bold);
  $('#epItalic').classList.toggle('on', !!f.italic);
  document.querySelectorAll('.epAl').forEach(b => b.classList.toggle('on', (f.align || 'left') === b.dataset.al));
  positionDelBadge();
}
function selDiv() { return document.querySelector(`#page .t[data-idx="${selIdx}"]`); }
function updateSel(prop, val) {
  const f = coord.fields[selIdx]; if (!f) return;
  f[prop] = val; const d = selDiv(); if (d) styleTextEl(d, f, currentRec()); histMark();
}
function startFieldDrag(ev) {
  const idx = +ev.currentTarget.dataset.idx;
  selectField(idx);
  const f = coord.fields[idx];
  fdrag = { idx, sx: ev.clientX, sy: ev.clientY, ox: f.x, oy: f.baseline };
  ev.currentTarget.setPointerCapture(ev.pointerId);
  ev.currentTarget.addEventListener('pointermove', onFieldDrag);
  ev.currentTarget.addEventListener('pointerup', endFieldDrag);
  ev.preventDefault();
}
function onFieldDrag(ev) {
  if (!fdrag) return;
  const f = coord.fields[fdrag.idx];
  f.x = Math.round((fdrag.ox + (ev.clientX - fdrag.sx) / (previewScale * PT)) * 10) / 10;
  f.baseline = Math.round((fdrag.oy + (ev.clientY - fdrag.sy) / (previewScale * PT)) * 10) / 10;
  const d = selDiv(); if (d) styleTextEl(d, f, currentRec());
  $('#epX').value = Math.round(f.x); $('#epY').value = Math.round(f.baseline);
  positionDelBadge();
}
function endFieldDrag(ev) {
  const n = ev.currentTarget; n.removeEventListener('pointermove', onFieldDrag); n.removeEventListener('pointerup', endFieldDrag);
  fdrag = null;
  reorderManualForm();   // posisi berubah -> urutan input manual ikut menyesuaikan
  histMark();
}
function saveDefaultTpl() {
  localStorage.setItem(OV(TKEY), JSON.stringify(coord));
  const b = $('#saveDefault'); const t = b.textContent; b.textContent = '✓ Tersimpan';
  setTimeout(() => b.textContent = t, 1500);
}
async function resetDefaultTpl() {
  if (!confirm('Kembalikan penempatan ' + (coord.name || TKEY) + ' ke bawaan? Perubahan tersimpan akan dihapus.')) return;
  localStorage.removeItem(OV(TKEY));
  await loadTemplate(TKEY, true);
  if (editMode) setEditMode(true);
}

/* ---------------- admin: simpan default global ---------------- */
function updateAdminUI() {
  const on = !!adminToken;
  const logo = $('#brandLogo');
  if (logo) logo.classList.toggle('admin-on', on);            // cincin hijau saat admin aktif
  const sg = $('#saveGlobal');
  if (sg) sg.classList.toggle('hidden', !(editMode && on));   // hanya saat mode edit + admin
}
function openAdminModal() {
  const m = $('#adminMsg'); m.textContent = ''; m.className = 'modal-msg';
  $('#adminPass').value = '';
  $('#adminModal').classList.remove('hidden');
  $('#adminPass').focus();
}
function closeAdminModal() { $('#adminModal').classList.add('hidden'); }
function adminLogout() { adminToken = null; sessionStorage.removeItem('admin_token'); updateAdminUI(); }
async function doAdminLogin() {
  const m = $('#adminMsg'); m.className = 'modal-msg'; m.textContent = 'Memeriksa…';
  try {
    const r = await fetch('/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#adminPass').value }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok && j.token) {
      adminToken = j.token; sessionStorage.setItem('admin_token', adminToken);
      closeAdminModal(); updateAdminUI();
      if (!editMode) setEditMode(true);     // langsung masuk mode edit agar tombol Simpan Global terlihat
    } else { m.className = 'modal-msg err'; m.textContent = j.error || 'Gagal login'; }
  } catch (e) { m.className = 'modal-msg err'; m.textContent = 'Gagal menghubungi server'; }
}
async function saveDefaultGlobal() {
  if (!adminToken) return openAdminModal();
  if (!confirm('Simpan tata letak "' + (coord.name || TKEY) + '" sebagai DEFAULT GLOBAL untuk SEMUA pengunjung?')) return;
  const sg = $('#saveGlobal'); const t0 = sg.textContent; sg.disabled = true; sg.textContent = '⏳ Menyimpan…';
  try {
    const r = await fetch('/admin/save-default', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ key: TKEY, coord }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) {
      localStorage.removeItem(OV(TKEY));    // hapus override lokal agar ikut versi global
      alert('✅ Tersimpan sebagai default global untuk semua pengunjung.\nStatus simpan ke GitHub: ' + (j.git || '-'));
    } else if (r.status === 401) {
      adminLogout(); openAdminModal();
      $('#adminMsg').className = 'modal-msg err'; $('#adminMsg').textContent = 'Sesi berakhir, login lagi.';
    } else {
      alert('❌ Gagal: ' + (j.error || ('HTTP ' + r.status)));
    }
  } catch (e) { alert('❌ Gagal menghubungi server: ' + e.message); }
  finally { sg.disabled = false; sg.textContent = t0; }
}

/* ---------------- pengaturan template: ukuran halaman & blangko ---------------- */
function syncPageSizeSelect() {
  const sel = $('#edPageSize'); if (!sel || !coord) return;
  const v = (Math.round(coord.page.w * 100) / 100) + 'x' + (Math.round(coord.page.h * 100) / 100);
  sel.value = [...sel.options].some(o => o.value === v) ? v : '';
}
function onPageSize(e) {
  const v = e.target.value; if (!v) return;
  const [w, h] = v.split('x').map(Number);
  if (!w || !h) return;
  coord.page.w = w; coord.page.h = h;          // tersimpan saat "Simpan Default"/"Simpan Global"
  renderPreview(); fitPage(); updateStats(); histMark();
}
// Re-encode gambar apa pun jadi JPEG (batasi dimensi & kompres) supaya ukuran terkendali.
function imageToJpegBlob(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const s = Math.min(1, maxDim / Math.max(w, h));
      w = Math.round(w * s); h = Math.round(h * s);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cv.toBlob(b => b ? resolve(b) : reject(new Error('encode gagal')), 'image/jpeg', quality);
    };
    img.onerror = () => reject(new Error('gambar tidak valid'));
    img.src = URL.createObjectURL(file);
  });
}
async function onChangeBg(e) {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  if (!adminToken) { openAdminModal(); return; }       // ganti blangko = aksi admin
  try {
    const blob = await imageToJpegBlob(file, 2200, 0.85);
    if (blob.size > 6 * 1024 * 1024) return alert('Gambar terlalu besar. Pakai gambar yang lebih kecil.');
    const r = await fetch('/admin/save-bg?key=' + encodeURIComponent(TKEY), {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + adminToken, 'Content-Type': 'image/jpeg' }, body: blob,
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) {
      coord.background = 'assets/blangko/' + TKEY + '.jpg';
      bgUrl = coord.background + '?v=' + Date.now();      // bust cache pratinjau
      showBg = true; if ($('#showBg')) $('#showBg').checked = true;
      renderPreview();
      alert('✅ Blangko diperbarui untuk semua pengunjung.\nGitHub: ' + (j.git || '-'));
    } else if (r.status === 401) { adminLogout(); openAdminModal(); }
    else { alert('❌ Gagal: ' + (j.error || ('HTTP ' + r.status))); }
  } catch (err) { alert('❌ Gagal memproses gambar: ' + err.message); }
}
function addElementFront(isField) {
  let key = '', text = '';
  if (isField) {
    key = (prompt('Nama placeholder (mis. Nama_Lengkap):', '') || '').trim();
    if (!key) return;
  } else {
    text = (prompt('Teks tetap:', '') || '').trim();
    if (!text) return;
  }
  coord.fields.push({
    key, text, x: Math.round(coord.page.w * 0.28), baseline: Math.round(coord.page.h * 0.18),
    size: 12, font: 'Times New Roman', bold: false, italic: false, color: '#000000', align: 'left', isField,
  });
  buildManualForm(); renderPreview();
  selectField(coord.fields.length - 1);
  histMark();
}
function deleteSelField() {
  if (selIdx < 0) return;
  const f = coord.fields[selIdx];
  if (!confirm('Hapus ' + (f.isField ? 'placeholder «' + f.key + '»' : 'teks ini') + '?')) return;
  coord.fields.splice(selIdx, 1); selIdx = -1;
  buildManualForm(); renderPreview(); selectField(-1);
  histMark();
}
function onBg(e) {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader(); r.onload = () => { bgUrl = r.result; renderPreview(); }; r.readAsDataURL(file);
}
// Kembalikan background pratinjau ke blangko default template (batalkan ganti lokal).
function resetBg() {
  bgUrl = coord.background || null;
  const bi = $('#bgImage'); if (bi) bi.value = '';
  showBg = true; if ($('#showBg')) $('#showBg').checked = true;
  renderPreview();
}

/* ---------------- PDF ---------------- */
async function buildFonts(pdf) {
  const S = PDFLib.StandardFonts;
  const E = (f) => pdf.embedFont(f);
  // tiap kategori: [regular, bold, italic, boldItalic]
  return {
    sans: [await E(S.Helvetica), await E(S.HelveticaBold), await E(S.HelveticaOblique), await E(S.HelveticaBoldOblique)],
    serif: [await E(S.TimesRoman), await E(S.TimesRomanBold), await E(S.TimesRomanItalic), await E(S.TimesRomanBoldItalic)],
    mono: [await E(S.Courier), await E(S.CourierBold), await E(S.CourierOblique), await E(S.CourierBoldOblique)],
  };
}
function pickPdfFont(fonts, name, bold, italic) {
  const arr = fonts[FONT_CAT[name] || 'sans'];
  return arr[(bold ? 1 : 0) + (italic ? 2 : 0)];
}
function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return PDFLib.rgb(0, 0, 0);
  const n = parseInt(m[1], 16); return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
async function buildPdfBlob(all) {
  const list = all ? records : [records[cur]];
  if (!list.length || !list[0]) return null;
  const pdf = await PDFLib.PDFDocument.create();
  const fonts = await buildFonts(pdf);
  const H = coord.page.h;
  for (const rec of list) {
    const pg = pdf.addPage([coord.page.w, H]);
    for (const fld of coord.fields) {
      const txt = valueFor(fld, rec) || '';
      if (txt === '') continue;
      const font = pickPdfFont(fonts, fld.font, fld.bold, fld.italic);
      let x = fld.x;
      if (fld.align === 'center' || fld.align === 'right') {
        const w = font.widthOfTextAtSize(String(txt), fld.size);
        x = fld.align === 'center' ? x - w / 2 : x - w;
      }
      pg.drawText(String(txt), { x, y: H - fld.baseline, size: fld.size, font, color: hexRgb(fld.color) });
    }
  }
  const bytes = await pdf.save();
  return { blob: new Blob([bytes], { type: 'application/pdf' }), name: `${TKEY}_${all ? 'semua' : safe(list[0].Nama_Lengkap)}.pdf` };
}
async function makePdf(all) {
  try { const r = await buildPdfBlob(all); if (r) download(r.blob, r.name); }
  catch (e) { alert('Gagal buat PDF: ' + e.message); }
}
// Cetak langsung: muat PDF di iframe tersembunyi lalu buka dialog Print browser.
async function printPdf(all) {
  try {
    const r = await buildPdfBlob(all); if (!r) return;
    const url = URL.createObjectURL(r.blob);
    const ifr = document.createElement('iframe');
    ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    ifr.onload = () => {
      try { ifr.contentWindow.focus(); ifr.contentWindow.print(); }
      catch (e) { window.open(url, '_blank'); }   // fallback: buka di tab baru, cetak via Ctrl+P
    };
    ifr.src = url;
    document.body.appendChild(ifr);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { alert('Gagal print: ' + e.message); }
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
const SAMPLE_NAMES = ['Ahmad Fauzi', 'Siti Nurhaliza', 'Muhammad Rizki', 'Aisyah Putri', 'Abdul Rahman',
  'Fatimah Zahra', 'Budi Santoso', 'Dewi Lestari', 'Yusuf Hidayat', 'Nur Aini', 'Hasan Basri',
  'Khadijah Salma', 'Ali Akbar', 'Maryam Husna', 'Umar Faruq', 'Zainab Azzahra', 'Ibrahim Malik',
  'Halimah Sadiyah', 'Usman Ghani', 'Rukayah Amani'];
const SAMPLE_PARENTS = ['H. Sulaiman', 'Hj. Maemunah', 'Bapak Sukarno', 'Ibu Sutinah', 'H. Abdul Karim',
  'Hj. Aminah', 'Bapak Carwadi', 'Ibu Rohmah', 'H. Tarmidzi', 'Hj. Sukaesih'];
const SAMPLE_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const SAMPLE_HIJRI = ['Muharram', 'Shafar', 'Rabiul Awal', 'Rabiul Akhir', 'Jumadil Awal', 'Jumadil Akhir', 'Rajab', 'Syaban', 'Ramadhan', 'Syawal', 'Dzulqodah', 'Dzulhijjah'];
const pad2 = (n) => String(n).padStart(2, '0');

// Nilai contoh untuk satu field, bervariasi per baris (i). Field "tetap" pakai default.
function exampleValue(key, meta, i) {
  if (meta && meta.ask === false) return meta.default ?? '';
  const k = key.toLowerCase();
  if (/(orang_?tua|wali|ayah|ibu)/.test(k)) return SAMPLE_PARENTS[i % SAMPLE_PARENTS.length];
  if (/kepala/.test(k)) return 'H. Abdullah, S.Pd.I';
  if (/nama/.test(k)) return SAMPLE_NAMES[i % SAMPLE_NAMES.length];
  if (/hijriah/.test(k)) return ((i % 29) + 1) + ' ' + SAMPLE_HIJRI[i % 12] + ' 1447';
  if (/tanggal.*masehi|masehi/.test(k)) return 'Indramayu, 06 Juni 2026';
  if (/ttl|tempat|lahir/.test(k)) return 'Indramayu, ' + pad2((i % 28) + 1) + ' ' + SAMPLE_MONTHS[i % 12] + ' ' + (2008 + (i % 5));
  if (/tanggal/.test(k)) return pad2((i % 28) + 1) + '/' + pad2((i % 12) + 1) + '/2026';
  if (/induk|nis/.test(k)) return '20' + String(2200 + i).padStart(6, '0');
  if (/statistik/.test(k)) return '111233' + String(1001 + i).padStart(5, '0');
  if (/no(mor|mer)?(_|\b)/.test(k)) return pad2(i + 1) + '/MDT/VII/2026';
  if (/desa.*kecamatan|kecamatan.*desa/.test(k)) return 'Pabean Udik, Indramayu';
  if (/desa/.test(k)) return 'Pabean Udik';
  if (/kecamatan|kabupaten/.test(k)) return 'Indramayu';
  if (/madrasah|sekolah/.test(k)) return "As'saamiyah";
  if (/alamat/.test(k)) return 'Jl. Masjid No. ' + (i + 1) + ', Pabean Udik';
  if (/nilai|skor|angka/.test(k)) return String(75 + (i % 21));
  if (/tahun|ajaran/.test(k)) return '2025/2026';
  return (meta && meta.label ? meta.label : key.replace(/_/g, ' ')) + ' ' + (i + 1);
}

// filled=false -> hanya header (format kosong). filled=true -> + 30 baris contoh terisi.
function downloadSample(filled) {
  const keys = uniqueFieldKeys();
  if (!keys.length) { alert('Template ini belum punya field.'); return; }
  const meta = {}; (form.fields || []).forEach(m => meta[m.key] = m);
  const rows = [keys];
  if (filled) for (let i = 0; i < 30; i++) rows.push(keys.map(k => exampleValue(k, meta[k], i)));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (form.sheet || 'DATA').slice(0, 31));
  XLSX.writeFile(wb, `${filled ? 'contoh_pengisian' : 'format_kosong'}_${TKEY}.xlsx`);
}

/* ---------------- util ---------------- */
function safe(s) { return (String(s || 'data').replace(/[^\w\- ]+/g, '_').trim()) || 'data'; }
function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }
function escapeHtml(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

init();
