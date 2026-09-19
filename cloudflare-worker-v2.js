import process from 'node:process';
import { Buffer } from 'node:buffer';
import { neon } from '@neondatabase/serverless';
import backendV5 from './server/server-v5.js';
import serverV6 from './server/server-v6.js';
import adminClients from './server/admin-clients.js';
import adminManagement from './server/admin-management.js';
import courierProfile from './server/courier-profile.js';
import courierOtp from './server/courierOtp.js';
import adminCreateRequest from './api/admin-create-request.js';
import publicTracking from './api/public-tracking.js';
import additionalEvidence from './api/additional-evidence.js';
import courierAdditionalEvidence from './api/courier-additional-evidence.js';
import courierClientInfo from './api/courier-client-info.js';
import notificationSound from './api/goy-notification-sound.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function syncProcessEnv(env) {
  const keys = [
    'DATABASE_URL','TOKEN_SECRET','ADMIN_EMAIL','ADMIN_PASSWORD','ALLOWED_ORIGIN',
    'GOOGLE_MAPS_API_KEY','BREVO_API_KEY','BREVO_SENDER_EMAIL','BREVO_SENDER_NAME',
    'WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_OTP_TEMPLATE',
    'WHATSAPP_OTP_TEMPLATE_LANG','WHATSAPP_GRAPH_VERSION','OPENAI_API_KEY'
  ];
  for (const key of keys) {
    if (env[key] === undefined || env[key] === null) delete process.env[key];
    else process.env[key] = String(env[key]);
  }
}

function backendConfig(env) {
  return {
    adminEmail: String(env.ADMIN_EMAIL || '').trim().toLowerCase(),
    adminPassword: String(env.ADMIN_PASSWORD || ''),
    tokenSecret: String(env.TOKEN_SECRET || ''),
    allowedOrigin: String(env.ALLOWED_ORIGIN || '*'),
    databaseUrl: String(env.DATABASE_URL || ''),
    googleMapsApiKey: String(env.GOOGLE_MAPS_API_KEY || ''),
    dataFile: '/tmp/goy-xpress-data.json',
  };
}

function buildBackend(env) {
  const config = backendConfig(env);
  const overrides = {
    databaseUrl: config.databaseUrl,
    tokenSecret: config.tokenSecret,
    allowedOrigin: config.allowedOrigin,
    dataFile: config.dataFile,
  };
  const base = backendV5.createHandler({ config });
  const withClients = adminClients.wrap(base, overrides);
  const withManagement = adminManagement.wrap(withClients, overrides);
  const full = courierProfile.wrap(withManagement, overrides);
  return { base, full, config };
}

async function nodeRequest(request) {
  const url = new URL(request.url);
  const headers = {};
  for (const [key, value] of request.headers.entries()) headers[key.toLowerCase()] = value;
  if (!headers.host) headers.host = url.host;

  let raw = Buffer.alloc(0);
  let parsedBody;
  if (!['GET', 'HEAD'].includes(request.method)) {
    raw = Buffer.from(await request.arrayBuffer());
    const type = String(headers['content-type'] || '').toLowerCase();
    if (raw.length && (type.includes('application/json') || type.includes('+json'))) {
      try { parsedBody = JSON.parse(raw.toString('utf8')); } catch { parsedBody = undefined; }
    }
  }

  return {
    method: request.method,
    url: `${url.pathname}${url.search}`,
    headers,
    query: Object.fromEntries(url.searchParams.entries()),
    body: parsedBody,
    async *[Symbol.asyncIterator]() {
      if (raw.length) yield raw;
    },
  };
}

async function invokeNode(handler, request) {
  const req = await nodeRequest(request);
  let statusCode = 200;
  const responseHeaders = new Headers();
  const chunks = [];
  let ended = false;

  const res = {
    get statusCode() { return statusCode; },
    set statusCode(value) { statusCode = Number(value) || 200; },
    setHeader(name, value) {
      if (Array.isArray(value)) responseHeaders.set(name, value.join(', '));
      else if (value !== undefined && value !== null) responseHeaders.set(name, String(value));
    },
    getHeader(name) { return responseHeaders.get(name); },
    writeHead(status, nextHeaders = {}) {
      statusCode = Number(status) || statusCode;
      for (const [name, value] of Object.entries(nextHeaders || {})) this.setHeader(name, value);
      return this;
    },
    write(value = '') {
      if (value !== undefined && value !== null) chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
      return true;
    },
    end(value = '') {
      if (value !== undefined && value !== null && value !== '') this.write(value);
      ended = true;
      return this;
    },
    status(value) { statusCode = Number(value) || statusCode; return this; },
    json(value) {
      if (!responseHeaders.has('Content-Type')) responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
      this.end(JSON.stringify(value));
      return this;
    },
    send(value) { this.end(value); return this; },
  };

  await handler(req, res);
  if (!ended) res.end();
  const noBody = statusCode === 204 || statusCode === 304 || request.method === 'HEAD';
  const body = noBody ? null : (chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0));
  return new Response(body, { status: statusCode, headers: responseHeaders });
}

async function health(env) {
  if (!env.DATABASE_URL) return json({ ok: false, error: 'DATABASE_URL no configurado' }, 503);
  try {
    const sql = neon(String(env.DATABASE_URL));
    const rows = await sql`SELECT data, updated_at FROM goy_state WHERE id = 1 LIMIT 1`;
    const data = rows[0]?.data || {};
    return json({
      ok: true,
      service: 'goy-xpress-cloudflare',
      database: 'connected',
      updatedAt: rows[0]?.updated_at || null,
      counts: {
        users: Array.isArray(data.users) ? data.users.length : 0,
        clients: Array.isArray(data.clients) ? data.clients.length : 0,
        couriers: Array.isArray(data.couriers) ? data.couriers.length : 0,
        requests: Array.isArray(data.requests) ? data.requests.length : 0,
      },
    });
  } catch (error) {
    console.error('GOY health', error);
    return json({ ok: false, database: 'error', error: error.message || 'No se pudo conectar con Neon' }, 503);
  }
}

async function handleApi(request, env) {
  syncProcessEnv(env);
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/health' && request.method === 'GET') return health(env);

  if (path === '/api/courier/otp/request') return invokeNode(courierOtp.requestOtp, request);
  if (path === '/api/courier/otp/verify') return invokeNode(courierOtp.verifyOtp, request);

  if (path === '/api/public-tracking') return invokeNode(publicTracking, request);
  if (path === '/api/additional-evidence') return invokeNode(additionalEvidence, request);
  if (path === '/api/courier-additional-evidence') return invokeNode(courierAdditionalEvidence, request);
  if (path === '/api/courier-client-info') return invokeNode(courierClientInfo, request);
  if (path === '/api/goy-notification-sound') return invokeNode(notificationSound, request);

  const { base, full } = buildBackend(env);

  if (path === '/api/admin-create-request') {
    const handler = adminCreateRequest.createHandler({ backend: base, tokenSecret: String(env.TOKEN_SECRET || '') });
    return invokeNode(handler, request);
  }

  // Estas rutas pertenecen a v6 porque agregan acceso por usuario y aprobación de clientes.
  if (
    path === '/api/auth/login' ||
    /^\/api\/admin\/(clients|couriers)\/[^/]+\/approve$/.test(path)
  ) {
    return invokeNode(serverV6, request);
  }

  return invokeNode(full, request);
}

async function asset(request, env, url, pathname) {
  const target = new URL(url);
  target.pathname = pathname;
  const response = await env.ASSETS.fetch(new Request(target, request));
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  if (pathname.startsWith('/admin/') || pathname === '/admin/index.html') headers.set('Referrer-Policy', 'same-origin');
  else headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function handleStatic(request, env) {
  const url = new URL(request.url);
  let path = url.pathname;

  if (path === '/inicio') path = '/';
  else if (path === '/servicio') path = '/service.html';
  else if (path === '/admin' || path === '/admin/') path = '/admin/index.html';
  else if (path === '/tracking' || path === '/tracking/') path = '/tracking/index.html';
  else if (/^\/registro\/[^/]+\/?$/.test(path)) path = '/register.html';
  else if (path.startsWith('/web/')) path = path.slice(4) || '/';

  return asset(request, env, url, path);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return await handleApi(request, env);
      return await handleStatic(request, env);
    } catch (error) {
      console.error('GOY XPRESS Cloudflare Worker', error);
      return json({ error: 'Error interno del servidor.', detail: error.message || null }, 500);
    }
  },
};
