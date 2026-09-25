import base from './cloudflare-entry.js';
import { authChallengeV2, authPasswordLoginV2 } from './cloudflare-login-v2.js';
import { createAdminClient } from './cloudflare-admin-client-create.js';
import {
  adminClientAccounts,
  authLoginProof,
  authPasswordRegister,
  authRegisterParams,
  authRegisterProof,
} from './cloudflare-auth-proof.js';

const MAX_API_BODY_BYTES = 3_000_000;
const RATE_BUCKETS = new Map();

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store',
      ...extraHeaders,
    },
  });
}

function clientIp(request) {
  return String(
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For') ||
    ''
  ).split(',')[0].trim();
}

function rateRule(path) {
  if (path === '/api/admin/login') return {key:'admin-login', limit:8, windowMs:10*60_000};
  if (path === '/api/auth/login') return {key:'app-login', limit:15, windowMs:10*60_000};
  if (path === '/api/auth/challenge' || path === '/api/auth/login-proof') return {key:'app-proof', limit:30, windowMs:10*60_000};
  if (
    path === '/api/auth/client/register' ||
    path === '/api/auth/courier/register' ||
    path === '/api/auth/register-params' ||
    path === '/api/auth/register-proof'
  ) return {key:'app-register', limit:10, windowMs:60*60_000};
  if (path === '/api/courier/otp/request') return {key:'otp-request', limit:6, windowMs:10*60_000};
  if (path === '/api/public-tracking') return {key:'public-tracking', limit:120, windowMs:10*60_000};
  return null;
}

function checkRateLimit(request, path) {
  if (request.method === 'OPTIONS') return null;
  const rule = rateRule(path);
  const ip = clientIp(request);
  if (!rule || !ip) return null;

  const now = Date.now();
  const key = `${rule.key}:${ip}`;
  const recent = (RATE_BUCKETS.get(key) || []).filter(ts => now - ts < rule.windowMs);

  if (recent.length >= rule.limit) {
    const retryMs = Math.max(1_000, rule.windowMs - (now - recent[0]));
    RATE_BUCKETS.set(key, recent);
    return json(
      {error:'Demasiados intentos. Espera un momento e intenta nuevamente.'},
      429,
      {'Retry-After':String(Math.ceil(retryMs/1000))}
    );
  }

  recent.push(now);
  RATE_BUCKETS.set(key, recent);

  if (RATE_BUCKETS.size > 1500) {
    for (const [bucketKey, values] of RATE_BUCKETS.entries()) {
      const newest = values[values.length - 1] || 0;
      if (now - newest > 60*60_000) RATE_BUCKETS.delete(bucketKey);
    }
  }
  return null;
}

async function checkBodySize(request, path) {
  if (!path.startsWith('/api/')) return null;
  if (!['POST','PUT','PATCH','DELETE'].includes(request.method)) return null;

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_API_BODY_BYTES) {
    return json({error:'La solicitud es demasiado grande.'}, 413);
  }

  if (!contentLength) {
    try {
      const copy = request.clone();
      const bytes = await copy.arrayBuffer();
      if (bytes.byteLength > MAX_API_BODY_BYTES) {
        return json({error:'La solicitud es demasiado grande.'}, 413);
      }
    } catch {
      return json({error:'No se pudo validar el tamaño de la solicitud.'}, 400);
    }
  }
  return null;
}

function allowedOrigin(request, env) {
  const origin = String(request.headers.get('Origin') || '').trim();
  if (!origin) return '';
  const ownOrigin = new URL(request.url).origin;
  const configured = String(env.ALLOWED_ORIGIN || '')
    .split(',')
    .map(value => value.trim())
    .filter(value => value && value !== '*');
  return origin === ownOrigin || configured.includes(origin) ? origin : '';
}

function hardenResponse(response, request, env) {
  const headers = new Headers(response.headers);
  const url = new URL(request.url);
  const path = url.pathname;
  const contentType = String(headers.get('Content-Type') || '').toLowerCase();

  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', path.startsWith('/admin') || path.startsWith('/api/') ? 'no-referrer' : 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  if (contentType.includes('text/html')) {
    headers.set(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; manifest-src 'self'; worker-src 'self' blob:; upgrade-insecure-requests"
    );
  }

  if (path.startsWith('/api/') || path.startsWith('/admin')) {
    headers.set('Cache-Control', 'no-store, max-age=0');
    headers.set('Pragma', 'no-cache');
  }

  const origin = allowedOrigin(request, env);
  headers.delete('Access-Control-Allow-Origin');
  headers.delete('Access-Control-Allow-Credentials');
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.append('Vary', 'Origin');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function dispatch(request, env, ctx) {
  const path = new URL(request.url).pathname;

  const rateLimited = checkRateLimit(request, path);
  if (rateLimited) return rateLimited;

  const oversized = await checkBodySize(request, path);
  if (oversized) return oversized;

  if (path === '/api/auth/challenge' && (request.method === 'POST' || request.method === 'OPTIONS')) {
    return authChallengeV2(request, env);
  }
  if (path === '/api/auth/login-proof' && (request.method === 'POST' || request.method === 'OPTIONS')) {
    return authLoginProof(request, env);
  }
  if (path === '/api/auth/register-params' && (request.method === 'POST' || request.method === 'OPTIONS')) {
    return authRegisterParams(request, env);
  }
  if (path === '/api/auth/register-proof' && (request.method === 'POST' || request.method === 'OPTIONS')) {
    return authRegisterProof(request, env);
  }
  if (path === '/api/auth/login' && (request.method === 'POST' || request.method === 'OPTIONS')) {
    return authPasswordLoginV2(request, env);
  }
  if (path === '/api/auth/client/register' && (request.method === 'POST' || request.method === 'OPTIONS')) {
    return authPasswordRegister(request, env, 'client');
  }
  if (path === '/api/auth/courier/register' && (request.method === 'POST' || request.method === 'OPTIONS')) {
    return authPasswordRegister(request, env, 'courier');
  }
  if (path === '/api/admin/clients' && request.method === 'POST') {
    return createAdminClient(request, env);
  }
  const clientMatch = path.match(/^\/api\/admin\/clients(?:\/([^/]+))?$/);
  if (clientMatch && ['PATCH','DELETE','OPTIONS'].includes(request.method)) {
    return adminClientAccounts(request, env, clientMatch[1] || '');
  }

  return base.fetch(request, env, ctx);
}

export default {
  async fetch(request, env, ctx) {
    try {
      const response = await dispatch(request, env, ctx);
      return hardenResponse(response, request, env);
    } catch (error) {
      console.error('GOY XPRESS edge security', error);
      return hardenResponse(
        json({error:'No se pudo completar la solicitud.'}, 500),
        request,
        env,
      );
    }
  },
};
