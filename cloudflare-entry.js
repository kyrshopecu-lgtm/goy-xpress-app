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

async function writeState(env, state) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL no configurado');
  const sql = neon(String(env.DATABASE_URL));
  await sql`UPDATE goy_state SET data = ${JSON.stringify(state)}::jsonb, updated_at = NOW() WHERE id = 1`;
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
    approved: Boolean(user.approved),
    active: user.active !== false,
    status: user.active === false ? 'Inactivo' : user.approved ? 'Activo' : 'Pendiente de aprobación',
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
    status: user.active === false ? 'Inactivo' : user.approved ? (jobs ? 'En operación' : 'Disponible') : 'Pendiente de aprobación',
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

function normalizeStatus(value) {
  const map = {'En ruta':'En camino', Entregado:'Entrega finalizada', Finalizado:'Entrega finalizada'};
  const normalized = map[value] || value;
  const allowed = ['Pendiente','Cotizado','Aceptado','Asignado','Recogido','En camino','Entrega finalizada','Cancelado'];
  return allowed.includes(normalized) ? normalized : 'Pendiente';
}

function addEvent(item, type, payload = {}) {
  item.events = Array.isArray(item.events) ? item.events : [];
  item.events.unshift({id:crypto.randomUUID(), type, ...payload, at:new Date().toISOString()});
}

async function adminData(request, env, optionsOnly = false) {
  if (!(await verifyAdminToken(request, env))) return json({error:'No autorizado'}, 401);
  try {
    const state = await readState(env);
    const clients = state.users.filter(user => user.role === 'client').map(clientSummary);
    const couriers = state.users.filter(user => user.role === 'courier').map(user => courierSummary(state, user));

    if (optionsOnly) {
      return json({
        clients: clients.filter(item => item.approved && item.active !== false),
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

async function adminUpdateRequest(request, env, code) {
  if (!(await verifyAdminToken(request, env))) return json({error:'No autorizado'}, 401);
  try {
    const body = await request.json().catch(() => ({}));
    const state = await readState(env);
    const index = state.requests.findIndex(item => String(item.code || item.id) === String(code));
    if (index < 0) return json({error:'Solicitud no encontrada.'}, 404);

    const current = state.requests[index];
    const patch = {};

    if (body.status) patch.status = normalizeStatus(body.status);

    if (body.courierId) {
      const courier = state.users.find(user =>
        String(user.id) === String(body.courierId) &&
        user.role === 'courier' &&
        user.active !== false &&
        user.approved
      );
      if (!courier) return json({error:'Selecciona un mensajero registrado, activo y aprobado.'}, 400);
      patch.courierId = courier.id;
      patch.courier = String(courier.businessName || courier.name || courier.email || 'Mensajero').trim();
      patch.courierPhoto = courier.photo || '';
      patch.courierAccessHash = null;
      patch.status = 'Asignado';
    }

    if (Object.prototype.hasOwnProperty.call(body, 'courier') && !body.courierId) {
      patch.courier = String(body.courier || '').trim() || null;
      if (!patch.courier) {
        patch.courierId = null;
        patch.courierPhoto = '';
        patch.courierAccessHash = null;
      }
    }

    if (body.kind) patch.kind = String(body.kind);
    if (body.serviceLabel) patch.serviceLabel = String(body.serviceLabel).trim();
    if (body.serviceCost !== undefined) {
      const value = Math.max(0, Number(body.serviceCost || 0));
      patch.serviceCost = Math.round(value * 100) / 100;
      patch.tariffAdjustment = {
        previousCost:Number(current.serviceCost || 0),
        newCost:patch.serviceCost,
        reason:String(body.reason || 'Reajuste administrativo').trim(),
        adjustedAt:new Date().toISOString(),
      };
    }
    if (body.quote) patch.quote = {...(current.quote || {}), ...body.quote, updatedAt:new Date().toISOString()};
    if (body.wallet) patch.wallet = {...(current.wallet || {}), ...body.wallet, updatedAt:new Date().toISOString()};
    if (body.adminNotes !== undefined) patch.adminNotes = String(body.adminNotes || '').trim();

    const updated = {...current, ...patch, updatedAt:new Date().toISOString()};
    addEvent(updated, 'admin_update', {fields:Object.keys(patch)});
    state.requests[index] = updated;
    await writeState(env, state);

    return json({request:sanitizeRequest(updated)}, 200);
  } catch (error) {
    console.error('GOY XPRESS native admin update', error);
    return json({error:error.message || 'No se pudo actualizar la solicitud.'}, 503);
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

    if (path === '/api/admin/data' && request.method === 'GET') {
      return adminData(request, env, false);
    }
    if (path === '/api/admin/order-options' && request.method === 'GET') {
      return adminData(request, env, true);
    }
    const requestMatch = path.match(/^\/api\/admin\/requests\/([^/]+)$/);
    if (requestMatch && request.method === 'PATCH') {
      return adminUpdateRequest(request, env, decodeURIComponent(requestMatch[1]));
    }

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
