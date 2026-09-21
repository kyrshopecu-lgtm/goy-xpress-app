import { neon } from '@neondatabase/serverless';
import base from './cloudflare-entry.js';
import { derivePasswordHashHex } from './cloudflare-password.mjs';
import {
  adminClientAccounts,
  authChallenge,
  authLoginProof,
  authPasswordLogin,
  authPasswordRegister,
  authRegisterParams,
  authRegisterProof,
} from './cloudflare-auth-proof.js';

const HEALTH_HEADERS = {
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Access-Control-Allow-Origin':'*',
};

async function authHealth(env) {
  const status = {
    ok:false,
    databaseConfigured:Boolean(env.DATABASE_URL),
    tokenSecretConfigured:Boolean(env.TOKEN_SECRET),
    databaseReachable:false,
    stateReady:false,
    passwordCryptoReady:false,
  };

  try {
    const probe = await derivePasswordHashHex('goy-health-check','goy-health-salt',1);
    status.passwordCryptoReady = typeof probe === 'string' && probe.length === 128;
  } catch (error) {
    status.passwordCryptoError = String(error?.name || 'CRYPTO_ERROR');
  }

  if (status.databaseConfigured) {
    try {
      const sql = neon(String(env.DATABASE_URL));
      const rows = await sql`
        SELECT
          id,
          jsonb_typeof(data) AS data_type,
          jsonb_array_length(COALESCE(data->'users','[]'::jsonb)) AS users_count
        FROM goy_state
        WHERE id = 1
        LIMIT 1
      `;
      status.databaseReachable = true;
      status.stateReady = rows.length === 1 && rows[0]?.data_type === 'object';
      status.usersAvailable = Number(rows[0]?.users_count || 0) > 0;
    } catch (error) {
      status.databaseError = String(error?.code || error?.name || 'DATABASE_ERROR');
    }
  }

  status.ok = Boolean(
    status.databaseConfigured &&
    status.tokenSecretConfigured &&
    status.databaseReachable &&
    status.stateReady &&
    status.passwordCryptoReady
  );

  return new Response(JSON.stringify(status), {
    status: status.ok ? 200 : 503,
    headers: HEALTH_HEADERS,
  });
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;

    if (path === '/api/auth/health' && request.method === 'GET') {
      return authHealth(env);
    }
    if (path === '/api/auth/challenge' && (request.method === 'POST' || request.method === 'OPTIONS')) {
      return authChallenge(request, env);
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
      return authPasswordLogin(request, env);
    }
    if (path === '/api/auth/client/register' && (request.method === 'POST' || request.method === 'OPTIONS')) {
      return authPasswordRegister(request, env, 'client');
    }
    if (path === '/api/auth/courier/register' && (request.method === 'POST' || request.method === 'OPTIONS')) {
      return authPasswordRegister(request, env, 'courier');
    }
    const clientMatch = path.match(/^\/api\/admin\/clients(?:\/([^/]+))?$/);
    if (clientMatch && ['POST','PATCH','DELETE','OPTIONS'].includes(request.method)) {
      return adminClientAccounts(request, env, clientMatch[1] || '');
    }

    return base.fetch(request, env, ctx);
  },
};