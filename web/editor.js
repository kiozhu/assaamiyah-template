/* Editor Template visual — 100% client-side. Menghasilkan JSON yang dipakai engine PDF/Word. */
const PT = 96 / 72;
const ASC = 0.8;                       // perkiraan ascent (baseline = top + size*ASC)
const FONT_CSS = {
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
const DRAFT_KEY = 'editor_draft';

let tpl = null;        // {name, page:{w,h,unit}, background, elements:[]}
let sel = null;        // id elemen terpilih
let scale = 0.7;
let previewFill = false;
let dragEnabled = false;   // default terkunci agar tidak bergeser tak sengaja
let bgHidden = false;
let uid = 1;

const $ = (s) => document.querySelector(s);
const canvas = () => $('#canvas');

/* ---------------- init ---------------- */
async function init() {
  const draft = localStorage.getItem(DRAFT_KEY);
  if (draft) {
    try { tpl = JSON.parse(draft); } catch { tpl = null; }
  }
  if (!tpl) {
    try {
      const j = await (await fetch('templates/ijazah.json')).json();
      tpl = fromEngineJson(j, 'Ijazah');
    } catch { tpl = blankTemplate(); }
  }
  uid = 1 + tpl.elements.reduce((m, e) => Math.max(m, +String(e.id).replace(/\D/g, '') || 0), 0);
  bindUI();
  $('#tplName').value = tpl.name || 'Template Baru';
  applyPageSize(); renderAll();
}

function blankTemplate() {
  return { name: 'Template Baru', page: { w: 595.28, h: 841.89, unit: 'pt' }, background: null, elements: [] };
}
function fromEngineJson(j, name) {
  return {
    name: name || j.name || 'Template', page: j.page || { w: 595.28, h: 841.89, unit: 'pt' },
    background: j.background || null,
    elements: (j.fields || j.elements || []).map(f => ({
      id: 'e' + (uid++), isField: !!f.isField, key: f.key || '', text: f.text || '',
      x: f.x, baseline: f.baseline ?? f.y, size: f.size || 12, font: f.font || 'Arial',
      bold: !!f.bold, italic: !!f.italic, color: f.color || '#000000', align: f.align || 'left',
    })),
  };
}
function toEngineJson() {
  return {
    name: tpl.name, page: tpl.page, background: tpl.background,
    fields: tpl.elements.map(e => ({
      key: e.isField ? e.key : null, text: e.isField ? null : e.text,
      x: round(e.x), baseline: round(e.baseline), size: e.size, font: e.font,
      bold: e.bold, italic: e.italic, color: e.color, align: e.align, isField: e.isField,
    })),
  };
}

/* ---------------- render ---------------- */
function applyPageSize() {
  const c = canvas();
  c.style.width = (tpl.page.w * PT) + 'px';
  c.style.height = (tpl.page.h * PT) + 'px';
  c.style.transform = `scale(${scale})`;
  const bg = $('#canvasBg');
  if (tpl.background && !bgHidden) { bg.src = tpl.background; bg.style.display = 'block'; }
  else { bg.style.display = 'none'; if (!tpl.background) bg.removeAttribute('src'); }
}
function elText(e) {
  if (!e.isField) return e.text || '';
  return previewFill ? (e.key || 'Field').replace(/_/g, ' ') : '«' + (e.key || 'Field') + '»';
}
function styleEl(div, e) {
  const sizePx = e.size * PT;
  div.style.left = (e.x * PT) + 'px';
  div.style.top = (e.baseline * PT - sizePx * ASC) + 'px';
  div.style.fontSize = sizePx + 'px';
  div.style.fontFamily = FONT_CSS[e.font] || 'sans-serif';
  div.style.fontWeight = e.bold ? '700' : '400';
  div.style.fontStyle = e.italic ? 'italic' : 'normal';
  div.style.color = e.isField && !previewFill ? '#1f8fd0' : e.color;
  div.style.transform = e.align === 'center' ? 'translateX(-50%)' : e.align === 'right' ? 'translateX(-100%)' : 'none';
  div.textContent = elText(e);
}
function renderAll() {
  const c = canvas();
  [...c.querySelectorAll('.el')].forEach(n => n.remove());
  tpl.elements.forEach(e => {
    const div = document.createElement('div');
    div.className = 'el' + (e.isField ? ' field' : '') + (e.id === sel ? ' sel' : '');
    div.dataset.id = e.id;
    styleEl(div, e);
    div.addEventListener('pointerdown', startDrag);
    c.appendChild(div);
  });
  $('#elCount').textContent = tpl.elements.length;
  saveDraft();
}
function rerenderOne(e) {
  const div = canvas().querySelector(`.el[data-id="${e.id}"]`);
  if (div) styleEl(div, e);
  saveDraft();
}

/* ---------------- selection & props ---------------- */
function select(id) {
  sel = id;
  canvas().querySelectorAll('.el').forEach(n => n.classList.toggle('sel', n.dataset.id === id));
  const e = elById(id);
  $('#propEmpty').classList.toggle('hidden', !!e);
  $('#propPanel').classList.toggle('hidden', !e);
  if (!e) return;
  $('#propTitle').textContent = e.isField ? 'Placeholder' : 'Teks';
  $('#pIsField').checked = e.isField;
  $('#pKey').value = e.key; $('#pText').value = e.text;
  $('#rowKey').style.display = e.isField ? '' : 'none';
  $('#rowText').style.display = e.isField ? 'none' : '';
  $('#pFont').value = e.font; $('#pSize').value = e.size;
  $('#pColor').value = e.color;
  $('#pX').value = round(e.x); $('#pY').value = round(e.baseline);
  $('#pBold').classList.toggle('on', e.bold);
  $('#pItalic').classList.toggle('on', e.italic);
  document.querySelectorAll('.tg.align').forEach(b => b.classList.toggle('on', b.dataset.al === e.align));
}
const elById = (id) => tpl.elements.find(e => e.id === id);

function addElement(isField) {
  const cx = tpl.page.w / 2, cy = tpl.page.h / 2;
  const e = {
    id: 'e' + (uid++), isField, key: isField ? 'Field_Baru' : '', text: isField ? '' : 'Teks baru',
    x: round(cx), baseline: round(cy), size: 12, font: 'Arial', bold: false, italic: false,
    color: '#000000', align: 'left',
  };
  tpl.elements.push(e); renderAll(); select(e.id);
}

/* ---------------- drag ---------------- */
let drag = null;
function startDrag(ev) {
  const id = ev.currentTarget.dataset.id;
  select(id);
  if (!dragEnabled) return;             // terkunci: hanya seleksi, tidak geser
  const e = elById(id);
  drag = { id, sx: ev.clientX, sy: ev.clientY, ox: e.x, oy: e.baseline };
  ev.currentTarget.classList.add('dragging');
  ev.currentTarget.setPointerCapture(ev.pointerId);
  ev.currentTarget.addEventListener('pointermove', onDrag);
  ev.currentTarget.addEventListener('pointerup', endDrag);
  ev.preventDefault();
}
function onDrag(ev) {
  if (!drag) return;
  const e = elById(drag.id);
  e.x = round(drag.ox + (ev.clientX - drag.sx) / (scale * PT));
  e.baseline = round(drag.oy + (ev.clientY - drag.sy) / (scale * PT));
  rerenderOne(e);
  $('#pX').value = round(e.x); $('#pY').value = round(e.baseline);
}
function endDrag(ev) {
  const n = ev.currentTarget; n.classList.remove('dragging');
  n.removeEventListener('pointermove', onDrag); n.removeEventListener('pointerup', endDrag);
  drag = null;
}

/* ---------------- UI bindings ---------------- */
function bindUI() {
  $('#addText').onclick = () => addElement(false);
  $('#addField').onclick = () => addElement(true);
  $('#delEl').onclick = () => { if (sel) { tpl.elements = tpl.elements.filter(e => e.id !== sel); sel = null; renderAll(); select(null); } };

  $('#tplName').oninput = e => { tpl.name = e.target.value; saveDraft(); };

  const upd = (prop, val, full) => { const e = elById(sel); if (!e) return; e[prop] = val; full ? renderAll() : rerenderOne(e); };
  $('#pIsField').onchange = e => { const el = elById(sel); if (!el) return; el.isField = e.target.checked; select(sel); rerenderOne(el); };
  $('#pKey').oninput = e => upd('key', e.target.value);
  $('#pText').oninput = e => upd('text', e.target.value);
  $('#pFont').onchange = e => upd('font', e.target.value);
  $('#pSize').oninput = e => upd('size', +e.target.value || 12);
  $('#pColor').oninput = e => upd('color', e.target.value);
  $('#pX').oninput = e => upd('x', +e.target.value || 0);
  $('#pY').oninput = e => upd('baseline', +e.target.value || 0);
  $('#pBold').onclick = () => { const el = elById(sel); if (!el) return; el.bold = !el.bold; $('#pBold').classList.toggle('on', el.bold); rerenderOne(el); };
  $('#pItalic').onclick = () => { const el = elById(sel); if (!el) return; el.italic = !el.italic; $('#pItalic').classList.toggle('on', el.italic); rerenderOne(el); };
  document.querySelectorAll('.tg.align').forEach(b => b.onclick = () => {
    const el = elById(sel); if (!el) return; el.align = b.dataset.al;
    document.querySelectorAll('.tg.align').forEach(x => x.classList.toggle('on', x === b));
    rerenderOne(el);
  });

  $('#pageSize').onchange = e => { const [w, h] = e.target.value.split('x').map(Number); tpl.page.w = w; tpl.page.h = h; applyPageSize(); saveDraft(); };
  $('#zoom').oninput = e => { scale = +e.target.value / 100; $('#zoomVal').textContent = e.target.value + '%'; canvas().style.transform = `scale(${scale})`; };

  $('#bgUpload').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { tpl.background = r.result; applyPageSize(); saveDraft(); }; r.readAsDataURL(f); };
  $('#bgClear').onclick = () => { tpl.background = null; applyPageSize(); saveDraft(); };

  $('#dragToggle').onclick = () => {
    dragEnabled = !dragEnabled;
    const b = $('#dragToggle');
    b.textContent = dragEnabled ? '✋ Geser: ON' : '🔒 Geser: OFF';
    b.classList.toggle('on', dragEnabled);
    canvas().classList.toggle('locked', !dragEnabled);
  };
  $('#hideBg').onclick = () => {
    bgHidden = !bgHidden;
    const b = $('#hideBg');
    b.textContent = bgHidden ? '👁️ Tampilkan BG' : '👁️ Sembunyikan BG';
    b.classList.toggle('on', bgHidden);
    applyPageSize();
  };
  canvas().classList.add('locked');     // mulai dalam keadaan terkunci

  $('#saveJson').onclick = saveJson;
  $('#loadJson').onchange = loadJson;
  $('#tryGen').onclick = () => { previewFill = !previewFill; $('#tryGen').classList.toggle('on', previewFill); $('#tryGen').textContent = previewFill ? '◼ Stop pratinjau' : '▶ Uji isi data'; renderAll(); };

  // klik area kosong kanvas -> deselect
  $('#canvas').addEventListener('pointerdown', ev => { if (ev.target.id === 'canvas' || ev.target.id === 'canvasBg') select(null); });
  // keyboard
  document.addEventListener('keydown', onKey);
}
function onKey(ev) {
  if (!sel) return;
  const tag = (document.activeElement.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  const e = elById(sel); if (!e) return;
  const step = ev.shiftKey ? 10 : 1;
  if (ev.key === 'Delete') { tpl.elements = tpl.elements.filter(x => x.id !== sel); sel = null; renderAll(); select(null); return; }
  if (ev.key === 'ArrowLeft') e.x -= step; else if (ev.key === 'ArrowRight') e.x += step;
  else if (ev.key === 'ArrowUp') e.baseline -= step; else if (ev.key === 'ArrowDown') e.baseline += step; else return;
  ev.preventDefault(); e.x = round(e.x); e.baseline = round(e.baseline);
  rerenderOne(e); $('#pX').value = round(e.x); $('#pY').value = round(e.baseline);
}

/* ---------------- save / load ---------------- */
function saveDraft() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(tpl)); } catch {} }
function saveJson() {
  const blob = new Blob([JSON.stringify(toEngineJson(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (tpl.name || 'template').replace(/[^\w\- ]+/g, '_').trim() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
async function loadJson(ev) {
  const f = ev.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    tpl = fromEngineJson(j, f.name.replace(/\.json$/i, ''));
    sel = null; $('#tplName').value = tpl.name;
    applyPageSize(); renderAll(); select(null);
  } catch (e) { alert('File JSON tidak valid: ' + e.message); }
  ev.target.value = '';
}

/* ---------------- util ---------------- */
function round(n) { return Math.round(n * 10) / 10; }

init();
