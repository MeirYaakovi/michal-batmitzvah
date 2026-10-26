'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 4310;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'rsvps.json');
const PW_FILE = path.join(DATA_DIR, 'admin-password.txt');
const CONFIG_FILE = path.join(ROOT, 'config.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadAdminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (fs.existsSync(PW_FILE)) return fs.readFileSync(PW_FILE, 'utf8').trim();
  const pw = crypto.randomBytes(5).toString('hex');
  fs.writeFileSync(PW_FILE, pw);
  console.log(`\n  New admin password: ${pw}\n  (saved in ${PW_FILE})\n`);
  return pw;
}
const ADMIN_PASSWORD = loadAdminPassword();

const readConfig = () => JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const readDb = () => {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return []; }
};
function writeDb(rows) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

const sessions = new Map();
const SESSION_MS = 12 * 3600 * 1000;
const hits = new Map();

function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}

const ip = req => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const safeEq = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
const getCookie = (req, name) => {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? m[1] : null;
};
const isAdmin = req => {
  const t = getCookie(req, 'sid');
  const exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
};

function send(res, code, body, headers = {}) {
  const isObj = typeof body === 'object';
  res.writeHead(code, {
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(isObj ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => {
      data += c;
      if (data.length > 10000) { reject(new Error('too large')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max);

function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

const STATUS_HE = { yes: 'מגיעים', no: 'לא מגיעים', maybe: 'אולי' };

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json'
};

function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin') pathname = '/admin.html';
  const file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      ...(pathname === '/admin.html' ? { 'X-Robots-Tag': 'noindex', 'X-Frame-Options': 'DENY' } : {})
    });
    res.end(buf);
  });
}

async function handleApi(req, res, pathname) {
  const m = req.method;

  if (m === 'GET' && pathname === '/api/config') return send(res, 200, readConfig());

  if (m === 'POST' && pathname === '/api/rsvp') {
    if (rateLimited('rsvp:' + ip(req), 12, 3600e3)) return send(res, 429, { error: 'יותר מדי ניסיונות, נסו שוב מאוחר יותר' });
    const b = await readBody(req);
    if (b.website) return send(res, 200, { ok: true }); // honeypot
    const cfg = readConfig();
    const name = clean(b.name, 80);
    const phone = clean(b.phone, 20).replace(/[^\d+\-\s]/g, '');
    const attending = ['yes', 'no', 'maybe'].includes(b.attending) ? b.attending : null;
    let guests = parseInt(b.guests, 10);
    if (!Number.isFinite(guests)) guests = 1;
    guests = Math.min(Math.max(guests, 1), cfg.maxGuestsPerRsvp || 10);
    if (attending === 'no') guests = 0;
    if (name.length < 2) return send(res, 400, { error: 'נא להזין שם מלא' });
    if (!attending) return send(res, 400, { error: 'נא לבחור סטטוס הגעה' });
    if (phone.replace(/\D/g, '').length < 9) return send(res, 400, { error: 'נא להזין מספר טלפון תקין' });
    const rows = readDb();
    rows.push({
      id: crypto.randomBytes(6).toString('hex'),
      createdAt: new Date().toISOString(),
      name, phone, attending, guests,
      note: clean(b.note, 500),
      seen: false
    });
    writeDb(rows);
    return send(res, 200, { ok: true });
  }

  if (m === 'POST' && pathname === '/api/admin/login') {
    if (rateLimited('login:' + ip(req), 8, 15 * 60e3)) return send(res, 429, { error: 'נסו שוב בעוד כמה דקות' });
    const b = await readBody(req);
    if (!safeEq(b.password || '', ADMIN_PASSWORD)) return send(res, 401, { error: 'סיסמה שגויה' });
    const sid = crypto.randomBytes(24).toString('hex');
    sessions.set(sid, Date.now() + SESSION_MS);
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    return send(res, 200, { ok: true }, {
      'Set-Cookie': `sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`
    });
  }

  if (m === 'POST' && pathname === '/api/admin/logout') {
    sessions.delete(getCookie(req, 'sid'));
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0' });
  }

  if (pathname.startsWith('/api/admin/')) {
    if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });

    if (m === 'GET' && pathname === '/api/admin/rsvps') return send(res, 200, readDb().reverse());

    if (m === 'GET' && pathname === '/api/admin/export.csv') {
      const rows = readDb();
      const head = ['תאריך', 'שם', 'טלפון', 'סטטוס', 'מספר אורחים', 'הערה'];
      const lines = [head.map(csvCell).join(',')].concat(rows.map(r => [
        new Date(r.createdAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }),
        r.name, r.phone, STATUS_HE[r.attending], r.guests, r.note
      ].map(csvCell).join(',')));
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="rsvps.csv"',
        'Cache-Control': 'no-store'
      });
      return res.end('﻿' + lines.join('\r\n'));
    }

    const mm = pathname.match(/^\/api\/admin\/rsvps\/([a-f0-9]+)$/);
    if (mm && m === 'DELETE') {
      const rows = readDb();
      const next = rows.filter(r => r.id !== mm[1]);
      if (next.length === rows.length) return send(res, 404, { error: 'not found' });
      writeDb(next);
      return send(res, 200, { ok: true });
    }
    if (mm && m === 'PATCH') {
      const b = await readBody(req);
      const rows = readDb();
      const r = rows.find(x => x.id === mm[1]);
      if (!r) return send(res, 404, { error: 'not found' });
      if (typeof b.seen === 'boolean') r.seen = b.seen;
      writeDb(rows);
      return send(res, 200, r);
    }
  }
  return send(res, 404, { error: 'not found' });
}

http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    serveStatic(req, res, decodeURIComponent(pathname));
  } catch (e) {
    send(res, 400, { error: 'bad request' });
  }
}).listen(PORT, () => {
  console.log(`Site:   http://localhost:${PORT}`);
  console.log(`Admin:  http://localhost:${PORT}/admin`);
});
