const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8787);
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const TOKEN_SECRET = String(process.env.TOKEN_SECRET || '');
const ALLOWED_ORIGIN = String(process.env.ALLOWED_ORIGIN || '*');
const DATABASE_URL = String(process.env.DATABASE_URL || '');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

let sqlClient = null;
let dbReady = false;

function emptyData() {
  return {clients: [], requests: [], couriers: [], payments: [], invites: []};
}

async function getSql() {
  if (!DATABASE_URL) return null;
  if (!sqlClient) {
    const {neon} = require('@neondatabase/serverless');
    sqlClient = neon(DATABASE_URL);
  }
  if (!dbReady) {
    await sqlClient`CREATE TABLE IF NOT EXISTS goy_state (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sqlClient`INSERT INTO goy_state (id, data)
      VALUES (1, ${JSON.stringify(emptyData())}::jsonb)
      ON CONFLICT (id) DO NOTHING`;
    dbReady = true;
  }
  return sqlClient;
}

async function readData() {
  const sql = await getSql();
  if (sql) {
    const rows = await sql`SELECT data FROM goy_state WHERE id = 1 LIMIT 1`;
    return {...emptyData(), ...(rows[0]?.data || {})};
  }
  try {
    if (!fs.existsSync(DATA_FILE)) return emptyData();
    return {...emptyData(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))};
  } catch (error) {
    console.error('No se pudo leer el almacenamiento local', error);
    return emptyData();
  }
}

async function writeData(data) {
  const sql = await getSql();
  if (sql) {
    await sql`UPDATE goy_state
      SET data = ${JSON.stringify(data)}::jsonb, updated_at = NOW()
      WHERE id = 1`;
    return;
  }
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || !TOKEN_SECRET) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp && Date.now() <= payload.exp ? payload : null;
  } catch {
    return null;
  }
}

function requireAdmin(req, res) {
  const auth = String(req.headers.authorization || '');
  const payload = verifyToken(auth.startsWith('Bearer ') ? auth.slice(7) : '');
  if (!payload || payload.role !== 'admin') {
    json(res, 401, {error: 'No autorizado'});
    return null;
  }
  return payload;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('Payload demasiado grande');
  }
  return raw ? JSON.parse(raw) : {};
}

function normalizeStatus(value) {
  const allowed = ['Pendiente', 'Asignado', 'En ruta', 'Entregado', 'Cancelado'];
  return allowed.includes(value) ? value : 'Pendiente';
}

function publicPath(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = url.pathname.replace(/\/$/, '') || '/';
  if (pathname === '/api') pathname = '/';
  else if (pathname.startsWith('/api/')) pathname = pathname.slice(4);
  return pathname;
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const pathname = publicPath(req);

  try {
    if (req.method === 'GET' && pathname === '/health') {
      return json(res, 200, {
        ok: true,
        service: 'goy-xpress-api',
        storage: DATABASE_URL ? 'postgres' : 'local'
      });
    }

    if (req.method === 'POST' && pathname === '/admin/login') {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !TOKEN_SECRET) {
        return json(res, 503, {error: 'Servidor sin configurar'});
      }
      if (!safeEqual(email, ADMIN_EMAIL) || !safeEqual(password, ADMIN_PASSWORD)) {
        return json(res, 401, {error: 'Usuario o contraseña incorrectos'});
      }
      return json(res, 200, {
        token: signToken({role: 'admin', email: ADMIN_EMAIL, exp: Date.now() + 8 * 60 * 60 * 1000}),
        expiresIn: 28800
      });
    }

    if (req.method === 'GET' && pathname === '/admin/data') {
      if (!requireAdmin(req, res)) return;
      return json(res, 200, await readData());
    }

    if (req.method === 'POST' && pathname === '/admin/invites') {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const data = await readData();
      const invite = {
        token: crypto.randomBytes(18).toString('base64url'),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        usedAt: null,
        label: String(body.label || '').trim(),
        email: String(body.email || '').trim().toLowerCase()
      };
      data.invites.unshift(invite);
      await writeData(data);
      return json(res, 201, invite);
    }

    if (req.method === 'PATCH' && pathname.startsWith('/admin/requests/')) {
      if (!requireAdmin(req, res)) return;
      const code = decodeURIComponent(pathname.slice('/admin/requests/'.length));
      const body = await readBody(req);
      const data = await readData();
      const index = data.requests.findIndex(item => item.code === code || item.id === code);
      if (index < 0) return json(res, 404, {error: 'Solicitud no encontrada'});
      data.requests[index] = {
        ...data.requests[index],
        ...(body.status ? {status: normalizeStatus(body.status)} : {}),
        ...(Object.prototype.hasOwnProperty.call(body, 'courier') ? {courier: body.courier || null} : {}),
        updatedAt: new Date().toISOString()
      };
      await writeData(data);
      return json(res, 200, data.requests[index]);
    }

    if (req.method === 'POST' && pathname === '/requests') {
      const body = await readBody(req);
      if (!body.code || !body.kind) return json(res, 400, {error: 'Solicitud incompleta'});
      const data = await readData();
      if (data.requests.some(item => item.code === body.code)) {
        return json(res, 200, {ok: true, duplicate: true});
      }
      const request = {
        ...body,
        status: 'Pendiente',
        createdAt: body.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.requests.unshift(request);
      await writeData(data);
      return json(res, 201, {ok: true, request});
    }

    if (req.method === 'GET' && pathname.startsWith('/invite/')) {
      const token = decodeURIComponent(pathname.slice('/invite/'.length));
      const invite = (await readData()).invites.find(item => item.token === token);
      if (!invite || invite.usedAt || Date.now() > Date.parse(invite.expiresAt)) {
        return json(res, 404, {error: 'Invitación inválida o vencida'});
      }
      return json(res, 200, {
        valid: true,
        label: invite.label,
        email: invite.email,
        expiresAt: invite.expiresAt
      });
    }

    if (req.method === 'POST' && pathname.startsWith('/invite/')) {
      const token = decodeURIComponent(pathname.slice('/invite/'.length));
      const body = await readBody(req);
      const required = ['name', 'whatsapp', 'address', 'contactPhone', 'documentId', 'email'];
      const missing = required.filter(key => !String(body[key] || '').trim());
      if (missing.length) return json(res, 400, {error: 'Faltan datos obligatorios', missing});
      const data = await readData();
      const invite = data.invites.find(item => item.token === token);
      if (!invite || invite.usedAt || Date.now() > Date.parse(invite.expiresAt)) {
        return json(res, 404, {error: 'Invitación inválida o vencida'});
      }
      const client = {
        id: crypto.randomUUID(),
        name: String(body.name).trim(),
        whatsapp: String(body.whatsapp).trim(),
        address: String(body.address).trim(),
        contactPhone: String(body.contactPhone).trim(),
        documentId: String(body.documentId).trim(),
        email: String(body.email).trim().toLowerCase(),
        status: 'Activo',
        createdAt: new Date().toISOString()
      };
      data.clients.unshift(client);
      invite.usedAt = new Date().toISOString();
      await writeData(data);
      return json(res, 201, {ok: true, clientId: client.id});
    }

    return json(res, 404, {error: 'Ruta no encontrada'});
  } catch (error) {
    console.error(error);
    return json(res, 500, {error: 'Error interno del servidor'});
  }
}

module.exports = handler;

if (require.main === module) {
  const server = http.createServer(handler);
  server.listen(PORT, () => console.log(`GOY XPRESS API escuchando en puerto ${PORT}`));
}
