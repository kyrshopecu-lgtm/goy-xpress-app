const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8787);
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const TOKEN_SECRET = String(process.env.TOKEN_SECRET || '');
const ALLOWED_ORIGIN = String(process.env.ALLOWED_ORIGIN || '*');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !TOKEN_SECRET) {
  console.warn('GOY XPRESS API: define ADMIN_EMAIL, ADMIN_PASSWORD y TOKEN_SECRET antes de producción.');
}

function emptyData() {
  return { clients: [], requests: [], couriers: [], payments: [], invites: [] };
}

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return emptyData();
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {...emptyData(), ...parsed};
  } catch (error) {
    console.error('No se pudo leer data.json', error);
    return emptyData();
  }
}

function writeData(data) {
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

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signToken(payload) {
  const body = base64url(JSON.stringify(payload));
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
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function requireAdmin(req, res) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload || payload.role !== 'admin') {
    json(res, 401, {error: 'No autorizado'});
    return null;
  }
  return payload;
}

async function readBody(req) {
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

function createInvite(data, body) {
  const token = crypto.randomBytes(18).toString('base64url');
  const invite = {
    token,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    usedAt: null,
    label: String(body.label || '').trim(),
    email: String(body.email || '').trim().toLowerCase()
  };
  data.invites.unshift(invite);
  writeData(data);
  return invite;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/\/$/, '') || '/';

  try {
    if (req.method === 'GET' && pathname === '/health') {
      return json(res, 200, {ok: true, service: 'goy-xpress-api'});
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
      const token = signToken({
        role: 'admin',
        email: ADMIN_EMAIL,
        exp: Date.now() + 8 * 60 * 60 * 1000
      });
      return json(res, 200, {token, expiresIn: 28800});
    }

    if (req.method === 'GET' && pathname === '/admin/data') {
      if (!requireAdmin(req, res)) return;
      return json(res, 200, readData());
    }

    if (req.method === 'POST' && pathname === '/admin/invites') {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const data = readData();
      const invite = createInvite(data, body);
      return json(res, 201, invite);
    }

    if (req.method === 'PATCH' && pathname.startsWith('/admin/requests/')) {
      if (!requireAdmin(req, res)) return;
      const code = decodeURIComponent(pathname.slice('/admin/requests/'.length));
      const body = await readBody(req);
      const data = readData();
      const index = data.requests.findIndex(item => item.code === code || item.id === code);
      if (index < 0) return json(res, 404, {error: 'Solicitud no encontrada'});
      const current = data.requests[index];
      data.requests[index] = {
        ...current,
        ...(body.status ? {status: normalizeStatus(body.status)} : {}),
        ...(Object.prototype.hasOwnProperty.call(body, 'courier') ? {courier: body.courier || null} : {}),
        updatedAt: new Date().toISOString()
      };
      writeData(data);
      return json(res, 200, data.requests[index]);
    }

    if (req.method === 'POST' && pathname === '/requests') {
      const body = await readBody(req);
      if (!body.code || !body.kind) return json(res, 400, {error: 'Solicitud incompleta'});
      const data = readData();
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
      writeData(data);
      return json(res, 201, {ok: true, request});
    }

    if (req.method === 'GET' && pathname.startsWith('/invite/')) {
      const token = decodeURIComponent(pathname.slice('/invite/'.length));
      const invite = readData().invites.find(item => item.token === token);
      if (!invite || invite.usedAt || Date.now() > Date.parse(invite.expiresAt)) {
        return json(res, 404, {error: 'Invitación inválida o vencida'});
      }
      return json(res, 200, {valid: true, label: invite.label, email: invite.email, expiresAt: invite.expiresAt});
    }

    if (req.method === 'POST' && pathname.startsWith('/invite/')) {
      const token = decodeURIComponent(pathname.slice('/invite/'.length));
      const body = await readBody(req);
      const required = ['name', 'whatsapp', 'address', 'contactPhone', 'documentId', 'email'];
      const missing = required.filter(key => !String(body[key] || '').trim());
      if (missing.length) return json(res, 400, {error: 'Faltan datos obligatorios', missing});
      const data = readData();
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
      writeData(data);
      return json(res, 201, {ok: true, clientId: client.id});
    }

    return json(res, 404, {error: 'Ruta no encontrada'});
  } catch (error) {
    console.error(error);
    return json(res, 500, {error: 'Error interno del servidor'});
  }
});

server.listen(PORT, () => {
  console.log(`GOY XPRESS API escuchando en puerto ${PORT}`);
});
