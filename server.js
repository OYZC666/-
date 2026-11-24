'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8000);
const HOST = '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const TMP_DIR = process.env.TMPDIR || '/tmp';
const DATA_FILE = path.join(TMP_DIR, 'timehub-state.json');
const MAX_BODY = 4 * 1024 * 1024;

const COLLECTIONS = ['events', 'birthdays', 'ledger', 'habits', 'reviews', 'capsules', 'picks'];
const ALLOWED = new Set(COLLECTIONS);
const INSTANCE_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function emptyData() {
  const d = {};
  COLLECTIONS.forEach((k) => {
    d[k] = [];
  });
  return d;
}

function emptyState() {
  return { rev: 0, data: emptyData() };
}

function sanitizeData(raw) {
  const data = emptyData();
  if (!raw || typeof raw !== 'object') return data;
  COLLECTIONS.forEach((k) => {
    const list = Array.isArray(raw[k]) ? raw[k] : [];
    data[k] = list
      .filter((x) => x && typeof x === 'object' && typeof x.id === 'string' && x.id.length <= 128)
      .slice(0, 5000);
  });
  return data;
}

function loadState() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyState();
    return { rev: Number(parsed.rev) || 0, data: sanitizeData(parsed.data) };
  } catch (e) {
    return emptyState();
  }
}

let state = loadState();

function persist() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) {
    /* 临时目录不可写时忽略：内存态仍可用，客户端会保留副本 */
  }
}

function upsertItem(coll, item) {
  if (!ALLOWED.has(coll) || !item || typeof item.id !== 'string') return false;
  const arr = state.data[coll];
  const copy = Object.assign({}, item);
  const i = arr.findIndex((x) => x.id === copy.id);
  if (i < 0) {
    arr.push(copy);
    return true;
  }
  if ((Number(copy.updatedAt) || 0) >= (Number(arr[i].updatedAt) || 0)) {
    arr[i] = copy;
    return true;
  }
  return false;
}

function applyOps(ops) {
  let changed = false;
  (Array.isArray(ops) ? ops : []).slice(0, 300).forEach((op) => {
    if (!op || !ALLOWED.has(op.coll)) return;
    if (op.op === 'upsert') {
      if (upsertItem(op.coll, op.item)) changed = true;
    } else if (op.op === 'delete' && typeof op.id === 'string') {
      const arr = state.data[op.coll];
      const i = arr.findIndex((x) => x.id === op.id);
      if (i >= 0) {
        arr[i] = Object.assign({}, arr[i], { deleted: true, updatedAt: Number(op.ts) || Date.now() });
        changed = true;
      }
    }
  });
  if (changed) {
    state.rev += 1;
    persist();
  }
  return changed;
}

function mergeData(raw) {
  if (!raw || typeof raw !== 'object') return;
  COLLECTIONS.forEach((k) => {
    (Array.isArray(raw[k]) ? raw[k] : []).forEach((item) => {
      if (item && typeof item === 'object' && typeof item.id === 'string' && item.id.length <= 128) {
        upsertItem(k, item);
      }
    });
  });
}

function sendJSON(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (e) {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch (e) {
    res.writeHead(400).end('Bad Request');
    return;
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== PUBLIC_DIR) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': /\.(html|js)$/i.test(file) ? 'no-cache' : 'public, max-age=300'
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(file).pipe(res);
  });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (pathname === '/api/state' && req.method === 'GET') {
    sendJSON(res, 200, { ok: true, rev: state.rev, instanceId: INSTANCE_ID, data: state.data });
    return;
  }

  if (pathname === '/api/mutate' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      applyOps(body.ops);
      sendJSON(res, 200, { ok: true, rev: state.rev, instanceId: INSTANCE_ID, data: state.data });
    } catch (e) {
      sendJSON(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  if (pathname === '/api/restore' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const before = state.rev;
      mergeData(body && body.data);
      if (state.rev === before) state.rev += 1;
      persist();
      sendJSON(res, 200, { ok: true, rev: state.rev, instanceId: INSTANCE_ID, data: state.data });
    } catch (e) {
      sendJSON(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  if (pathname === '/api/health') {
    sendJSON(res, 200, { ok: true, rev: state.rev, instanceId: INSTANCE_ID });
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res, pathname);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Method Not Allowed');
}

function createServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      try {
        sendJSON(res, 500, { ok: false, error: 'server error' });
      } catch (err) {
        /* 忽略 */
      }
    });
  });
}

module.exports = { createServer, applyOps, sanitizeData, emptyState };

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log('TimeHub listening on http://' + HOST + ':' + PORT);
  });
  process.on('SIGTERM', () => {
    persist();
    server.close(() => process.exit(0));
  });
}
