const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const PORT = 8080;
const APP_DIR = '/home/ubuntu/assaamiyah';
// Pin ROOT ke path kanonik (resolve symlink) agar perbandingan path akurat.
const ROOT = fs.realpathSync(path.join(APP_DIR, 'web'));
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const SECRET_FILE = path.join(APP_DIR, '.admin_secret');   // di luar web root, di luar git
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;                   // token admin berlaku 2 jam
const MAX_BODY = 1024 * 1024;                              // batas body 1 MB
const ALLOWED_KEY = /^[a-z0-9_]+$/;                        // nama template aman

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

// Header keamanan disetel di edge oleh nginx (sumber tunggal, hindari dobel).
const SECURITY_HEADERS = {};

function deny(res, code, msg) {
  res.writeHead(code, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
  res.end(msg);
}
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
  res.end(JSON.stringify(obj));
}

// True jika ada segmen path yang diawali titik (dotfile/dotdir: .git, .env, ...).
function hasDotSegment(p) {
  return p.split(path.sep).some((seg) => seg.startsWith('.') && seg !== '..' && seg !== '.');
}

function serveIndexFallback(res) {
  const indexPath = path.join(ROOT, 'index.html');
  fs.stat(indexPath, (err, st) => {
    if (err || !st.isFile()) return deny(res, 404, 'Not Found');
    res.writeHead(200, { 'Content-Type': 'text/html', ...SECURITY_HEADERS });
    fs.createReadStream(indexPath).pipe(res);
  });
}

/* ================= ADMIN: autentikasi ================= */
function readSecret() {
  try { return fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch { return null; }
}
// Verifikasi sandi terhadap hash "scrypt$<saltHex>$<hashHex>".
function passwordOk(pwd) {
  const sec = readSecret();
  if (!sec || typeof pwd !== 'string') return false;
  const [algo, saltHex, hashHex] = sec.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  let got;
  try { got = crypto.scryptSync(pwd, Buffer.from(saltHex, 'hex'), expected.length); } catch { return false; }
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}
// Kunci tanda tangan token diturunkan dari isi secret -> stabil lintas restart,
// dan otomatis berubah (token lama invalid) bila sandi diganti.
function signingKey() {
  return crypto.createHash('sha256').update((readSecret() || '') + '|token-v1').digest();
}
function makeToken() {
  const exp = Date.now() + TOKEN_TTL_MS;
  const sig = crypto.createHmac('sha256', signingKey()).update(String(exp)).digest('hex');
  return `${exp}.${sig}`;
}
function tokenOk(tok) {
  if (typeof tok !== 'string' || tok.indexOf('.') < 0) return false;
  const [expStr, sig] = tok.split('.');
  const exp = +expStr;
  if (!exp || exp < Date.now()) return false;
  const want = crypto.createHmac('sha256', signingKey()).update(expStr).digest('hex');
  const a = Buffer.from(String(sig), 'hex'), b = Buffer.from(want, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Rate-limit login per IP (anti brute force).
const loginFails = new Map();
function rateBlocked(ip) { const e = loginFails.get(ip); return !!(e && e.until > Date.now()); }
function noteFail(ip) {
  const e = loginFails.get(ip) || { count: 0, until: 0 };
  e.count++;
  if (e.count >= 5) { e.until = Date.now() + 10 * 60 * 1000; e.count = 0; }  // kunci 10 menit
  loginFails.set(ip, e);
}
function clientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket.remoteAddress || 'unknown';
}
function readJsonBody(req, cb) {
  let buf = '', tooBig = false;
  req.on('data', (c) => { buf += c; if (buf.length > MAX_BODY) { tooBig = true; req.destroy(); } });
  req.on('end', () => { if (tooBig) return cb(new Error('too big')); try { cb(null, JSON.parse(buf || '{}')); } catch (e) { cb(e); } });
  req.on('error', () => cb(new Error('read error')));
}

/* ================= ADMIN: handler ================= */
function handleLogin(req, res) {
  const ip = clientIp(req);
  if (rateBlocked(ip)) return sendJson(res, 429, { ok: false, error: 'Terlalu banyak percobaan. Coba lagi ~10 menit.' });
  if (!readSecret()) return sendJson(res, 503, { ok: false, error: 'Sandi admin belum diset di server.' });
  readJsonBody(req, (err, body) => {
    if (err) return sendJson(res, 400, { ok: false, error: 'Permintaan tidak valid' });
    if (passwordOk(body && body.password)) {
      loginFails.delete(ip);
      return sendJson(res, 200, { ok: true, token: makeToken() });
    }
    noteFail(ip);
    return sendJson(res, 401, { ok: false, error: 'Sandi salah' });
  });
}

function handleSaveDefault(req, res) {
  const auth = req.headers['authorization'] || '';
  const tok = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!tokenOk(tok)) return sendJson(res, 401, { ok: false, error: 'Sesi admin tidak valid/kedaluwarsa. Login lagi.' });
  readJsonBody(req, (err, body) => {
    if (err) return sendJson(res, 400, { ok: false, error: 'Permintaan tidak valid' });
    const key = body && body.key;
    const coord = body && body.coord;
    if (typeof key !== 'string' || !ALLOWED_KEY.test(key)) return sendJson(res, 400, { ok: false, error: 'Template tidak dikenal' });
    const target = path.join(TEMPLATES_DIR, key + '.json');
    // hanya boleh menimpa template yang SUDAH ada (whitelist + anti traversal)
    if (target !== path.join(TEMPLATES_DIR, key + '.json') || !target.startsWith(TEMPLATES_DIR + path.sep) || !fs.existsSync(target)) {
      return sendJson(res, 400, { ok: false, error: 'Template tidak dikenal' });
    }
    if (!coord || typeof coord !== 'object' || !coord.page || !Array.isArray(coord.fields)) {
      return sendJson(res, 400, { ok: false, error: 'Data template tidak valid' });
    }
    let out;
    try { out = JSON.stringify(coord, null, 2); } catch { return sendJson(res, 400, { ok: false, error: 'Data template tidak valid' }); }
    if (out.length > MAX_BODY) return sendJson(res, 413, { ok: false, error: 'Data terlalu besar' });
    // tulis atomik: temp di luar web root lalu rename
    const tmp = path.join(APP_DIR, '.tpl_tmp_' + key + '.json');
    try { fs.writeFileSync(tmp, out, { mode: 0o644 }); fs.renameSync(tmp, target); }
    catch (e) { try { fs.unlinkSync(tmp); } catch {} return sendJson(res, 500, { ok: false, error: 'Gagal menyimpan' }); }
    // commit + push best-effort (tidak memengaruhi keberhasilan simpan)
    gitCommitPush('web/templates/' + key + '.json', 'chore(template): update default ' + key + ' via admin web',
      (gitMsg) => sendJson(res, 200, { ok: true, git: gitMsg }));
  });
}

function gitCommitPush(rel, msg, done) {
  const env = { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/home/ubuntu', GIT_TERMINAL_PROMPT: '0' };
  const opt = { env, timeout: 25000 };
  execFile('git', ['-C', APP_DIR, 'add', rel], opt, (e1) => {
    if (e1) return done('git add gagal');
    execFile('git', ['-C', APP_DIR, '-c', 'user.name=Assaamiyah Admin', '-c', 'user.email=admin@assaamiyah.local',
      'commit', '-m', msg], opt, (e2) => {
      if (e2) return done('tidak ada perubahan untuk di-commit');
      execFile('git', ['-C', APP_DIR, 'push', 'origin', 'HEAD'], opt, (e3) => done(e3 ? 'commit ok, push gagal' : 'commit & push ok'));
    });
  });
}

// Baca body biner (untuk unggah gambar) dengan batas ukuran.
function readRawBody(req, maxBytes, cb) {
  const chunks = []; let len = 0, tooBig = false;
  req.on('data', (c) => { len += c.length; if (len > maxBytes) { tooBig = true; req.destroy(); } else chunks.push(c); });
  req.on('end', () => { if (tooBig) return cb(new Error('too big')); cb(null, Buffer.concat(chunks)); });
  req.on('error', () => cb(new Error('read error')));
}

// Unggah gambar blangko (JPEG) -> timpa web/assets/blangko/<key>.jpg, lalu commit+push.
function handleSaveBg(req, res) {
  const auth = req.headers['authorization'] || '';
  const tok = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!tokenOk(tok)) return sendJson(res, 401, { ok: false, error: 'Sesi admin tidak valid/kedaluwarsa. Login lagi.' });
  let key = '';
  try { key = new URL(req.url, 'http://x').searchParams.get('key') || ''; } catch {}
  if (!ALLOWED_KEY.test(key) || !fs.existsSync(path.join(TEMPLATES_DIR, key + '.json'))) {
    return sendJson(res, 400, { ok: false, error: 'Template tidak dikenal' });
  }
  readRawBody(req, 6 * 1024 * 1024, (err, buf) => {
    if (err) return sendJson(res, 413, { ok: false, error: 'Gambar terlalu besar (maks 6MB)' });
    if (buf.length < 3 || buf[0] !== 0xFF || buf[1] !== 0xD8 || buf[2] !== 0xFF) {
      return sendJson(res, 400, { ok: false, error: 'Gambar harus berformat JPEG' });
    }
    const dir = path.join(ROOT, 'assets', 'blangko');
    const target = path.join(dir, key + '.jpg');
    if (!target.startsWith(dir + path.sep)) return sendJson(res, 400, { ok: false, error: 'Path tidak valid' });
    const tmp = path.join(APP_DIR, '.bg_tmp_' + key + '.jpg');
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(tmp, buf); fs.renameSync(tmp, target); }
    catch (e) { try { fs.unlinkSync(tmp); } catch {} return sendJson(res, 500, { ok: false, error: 'Gagal menyimpan' }); }
    gitCommitPush('web/assets/blangko/' + key + '.jpg', 'chore(template): update background ' + key + ' via admin web',
      (gitMsg) => sendJson(res, 200, { ok: true, git: gitMsg }));
  });
}

/* ================= SERVER ================= */
const server = http.createServer((req, res) => {
  // --- Endpoint admin (POST). Auth & validasi di dalam handler. ---
  if (req.method === 'POST') {
    if (req.url === '/admin/login') return handleLogin(req, res);
    if (req.url === '/admin/save-default') return handleSaveDefault(req, res);
    if (req.url.startsWith('/admin/save-bg')) return handleSaveBg(req, res);
    return deny(res, 404, 'Not Found');
  }

  // --- Selain itu: hanya layani GET/HEAD statis ---
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', ...SECURITY_HEADERS });
    return res.end('Method Not Allowed');
  }

  // Decode & buang query string DULU supaya '..' ber-encode tidak lolos.
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
  catch (e) { return deny(res, 400, 'Bad Request'); }
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) return deny(res, 403, 'Forbidden');
  if (hasDotSegment(filePath)) return deny(res, 403, 'Forbidden');

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) return serveIndexFallback(res);
    fs.realpath(filePath, (rerr, real) => {
      if (rerr) return deny(res, 404, 'Not Found');
      if (real !== ROOT && !real.startsWith(ROOT + path.sep)) return deny(res, 403, 'Forbidden');

      const ext = path.extname(real).toLowerCase();
      const contentType = MIME[ext] || 'application/octet-stream';
      const etag = `"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
      const cacheHdr = { 'Cache-Control': 'no-cache', 'ETag': etag, 'Last-Modified': stats.mtime.toUTCString() };
      const ims = Date.parse(req.headers['if-modified-since'] || '');
      const fresh = req.headers['if-none-match'] === etag ||
        (!isNaN(ims) && Math.floor(stats.mtimeMs / 1000) * 1000 <= ims);
      if (fresh) { res.writeHead(304, { ...cacheHdr, ...SECURITY_HEADERS }); return res.end(); }

      res.writeHead(200, { 'Content-Type': contentType, ...cacheHdr, ...SECURITY_HEADERS });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(real).pipe(res);
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Assaamiyah web running on 127.0.0.1:${PORT}`);
});
