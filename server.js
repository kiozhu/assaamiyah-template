const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
// Pin ROOT ke path kanonik (resolve symlink) agar perbandingan path akurat.
const ROOT = fs.realpathSync('/home/ubuntu/assaamiyah/web');

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
// Biarkan kosong di sini; node hanya melayani di balik nginx (127.0.0.1).
const SECURITY_HEADERS = {};

function deny(res, code, msg) {
  res.writeHead(code, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
  res.end(msg);
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

const server = http.createServer((req, res) => {
  // 1) Hanya izinkan metode baca.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', ...SECURITY_HEADERS });
    return res.end('Method Not Allowed');
  }

  // 2) Decode & buang query string DULU (sebelum join/normalize) supaya
  //    '..' ber-encode (%2e%2e / %2f) tidak bisa lolos pengecekan.
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    return deny(res, 400, 'Bad Request');
  }
  if (urlPath === '/') urlPath = '/index.html';

  // 3) Susun path absolut lalu normalize.
  const filePath = path.normalize(path.join(ROOT, urlPath));

  // 4) Wajib tetap di dalam ROOT (cegah path traversal keluar web root).
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    return deny(res, 403, 'Forbidden');
  }

  // 5) Tolak akses ke dotfile/dotdir (mis. .git, .env, .htaccess).
  if (hasDotSegment(filePath)) {
    return deny(res, 403, 'Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback SPA: kembalikan index.html untuk path yang tak ada.
      return serveIndexFallback(res);
    }

    // 6) Resolve symlink & pastikan target nyata MASIH di dalam ROOT
    //    (cegah file symlink di web/ yang menunjuk keluar).
    fs.realpath(filePath, (rerr, real) => {
      if (rerr) return deny(res, 404, 'Not Found');
      if (real !== ROOT && !real.startsWith(ROOT + path.sep)) {
        return deny(res, 403, 'Forbidden');
      }

      const ext = path.extname(real).toLowerCase();
      const contentType = MIME[ext] || 'application/octet-stream';

      // Validasi cache: 'no-cache' = browser boleh simpan TAPI wajib cek ke server
      // dulu. ETag/Last-Modified bikin pengecekan itu murah (304 bila tak berubah),
      // sekaligus memastikan update file langsung terlihat (tidak kesangkut cache lama).
      const etag = `"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
      const cacheHdr = {
        'Cache-Control': 'no-cache',
        'ETag': etag,
        'Last-Modified': stats.mtime.toUTCString(),
      };
      const ims = Date.parse(req.headers['if-modified-since'] || '');
      const fresh = req.headers['if-none-match'] === etag ||
        (!isNaN(ims) && Math.floor(stats.mtimeMs / 1000) * 1000 <= ims);
      if (fresh) {
        res.writeHead(304, { ...cacheHdr, ...SECURITY_HEADERS });
        return res.end();
      }

      res.writeHead(200, { 'Content-Type': contentType, ...cacheHdr, ...SECURITY_HEADERS });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(real).pipe(res);
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Assaamiyah web running on 127.0.0.1:${PORT}`);
});
