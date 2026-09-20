import { neon } from '@neondatabase/serverless';
import worker from './cloudflare-worker-v2.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: JSON_HEADERS});
}

function base64urlToBytes(value) {
  const text = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

async function verifyAdminToken(request, env) {
  try {
    const auth = String(request.headers.get('Authorization') || '');
    if (!auth.startsWith('Bearer ') || !env.TOKEN_SECRET) return false;
    const token = auth.slice(7);
    const [body, signature] = token.split('.');
    if (!body || !signature) return false;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(String(env.TOKEN_SECRET)),
      {name:'HMAC', hash:'SHA-256'},
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64urlToBytes(signature),
      new TextEncoder().encode(body)
    );
    if (!valid) return false;
    const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(body)));
    return payload?.role === 'admin' && Number(payload.exp || 0) > Date.now();
  } catch {
    return false;
  }
}

async function readState(env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL no configurado');
  const sql = neon(String(env.DATABASE_URL));
  const rows = await sql`SELECT data FROM goy_state WHERE id = 1 LIMIT 1`;
  const state = rows[0]?.data || {};
  for (const key of ['users','clients','couriers','requests','payments','invites','templates','walletEntries','monthlyArchives']) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  return state;
}

function publicUser(user) {
  const {passwordHash, passwordSalt, ...safe} = user || {};
  return safe;
}

function clientSummary(user) {
  const safe = publicUser(user);
  return {
    ...safe,
    id: user.id,
    userId: user.id,
    name: user.name || '',
    businessName: user.businessName || '',
    phone: user.phone || '',
    whatsapp: user.phone || '',
    email: user.email || '',
    documentId: user.documentId || '',
    address: user.address || '',
    mapUrl: user.mapUrl || '',
    location: user.location || null,
    logo: user.logo || '',
    approved: true,
    active: user.active !== false,
    status: user.active === false ? 'Inactivo' : 'Activo',
  };
}

function courierSummary(state, user) {
  const safe = publicUser(user);
  const jobs = state.requests.filter(item =>
    String(item.courierId || '') === String(user.id) &&
    !['Entrega finalizada','Cancelado','finished','cancelled'].includes(String(item.status || ''))
  ).length;
  return {
    ...safe,
    id: user.id,
    userId: user.id,
    name: user.name || '',
    fullName: user.name || '',
    phone: user.phone || '',
    whatsapp: user.phone || '',
    email: user.email || '',
    approved: Boolean(user.approved),
    active: user.active !== false,
    status: user.active === false ? 'Inactivo' : user.approved ? 'Disponible' : 'Pendiente de aprobación',
    jobs,
  };
}

function sanitizeRequest(item) {
  const copy = {...item};
  delete copy.accessSecretHash;
  delete copy.clientAccessHash;
  delete copy.courierAccessHash;
  return copy;
}

function requestCycle(item) {
  return item.cycleKey || String(item.createdAt || '').slice(0, 7);
}

async function adminData(request, env, optionsOnly = false) {
  if (!(await verifyAdminToken(request, env))) return json({error:'No autorizado'}, 401);
  try {
    const state = await readState(env);
    const clients = state.users.filter(user => user.role === 'client').map(clientSummary);
    const couriers = state.users.filter(user => user.role === 'courier').map(user => courierSummary(state, user));

    if (optionsOnly) {
      return json({
        clients: clients.filter(item => item.active !== false),
        couriers: couriers.filter(item => item.approved && item.active !== false),
      });
    }

    const url = new URL(request.url);
    const fallbackCycle = new Date().toISOString().slice(0, 7);
    const cycle = url.searchParams.get('cycle') || fallbackCycle;
    const requests = state.requests.filter(item => requestCycle(item) === cycle).map(sanitizeRequest);
    const availableCycles = [...new Set(state.requests.map(requestCycle).filter(Boolean))].sort().reverse();

    return json({
      clients,
      couriers,
      requests,
      payments: state.payments,
      invites: state.invites,
      templates: state.templates,
      walletEntries: state.walletEntries,
      monthlyArchives: state.monthlyArchives,
      activeCycle: cycle,
      availableCycles,
    });
  } catch (error) {
    console.error('GOY XPRESS native admin data', error);
    return json({error:error.message || 'No se pudo cargar la información administrativa.'}, 503);
  }
}

async function serveAsset(request, env, pathname) {
  const target = new URL(request.url);
  target.pathname = pathname;
  const response = await env.ASSETS.fetch(new Request(target, request));
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', pathname.startsWith('/admin/') ? 'same-origin' : 'strict-origin-when-cross-origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Datos críticos del panel se leen directamente desde Neon para evitar
    // dependencias de compatibilidad Node en Cloudflare Workers.
    if (path === '/api/admin/data' && request.method === 'GET') {
      return adminData(request, env, false);
    }
    if (path === '/api/admin/order-options' && request.method === 'GET') {
      return adminData(request, env, true);
    }

    // Cloudflare Static Assets normaliza */index.html hacia */.
    // Servir directamente la ruta canónica evita el bucle /admin <-> /admin/index.html.
    if (path === '/admin' || path === '/admin/') {
      return serveAsset(request, env, '/admin/');
    }
    if (path === '/tracking' || path === '/tracking/') {
      return serveAsset(request, env, '/tracking/');
    }
    if (path === '/servicio') {
      return serveAsset(request, env, '/service');
    }
    if (/^\/registro\/[^/]+\/?$/.test(path)) {
      return serveAsset(request, env, '/register');
    }

    return worker.fetch(request, env, ctx);
  },
};
