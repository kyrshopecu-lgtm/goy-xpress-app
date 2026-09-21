import base from './cloudflare-entry.js';
import {
  adminClientAccounts,
  authChallenge,
  authLoginProof,
  authPasswordLogin,
  authPasswordRegister,
  authRegisterParams,
  authRegisterProof,
} from './cloudflare-auth-proof.js';

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;

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
