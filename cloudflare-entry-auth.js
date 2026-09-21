import base from './cloudflare-entry.js';
import {
  authChallenge,
  authLoginProof,
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

    // Las versiones antiguas intentan PBKDF2 de 180.000 iteraciones dentro de
    // Cloudflare, que no es compatible. Evitamos mostrar el error técnico y
    // pedimos instalar la versión corregida.
    if (path === '/api/auth/login' && request.method === 'POST') {
      return new Response(JSON.stringify({
        error:'Actualiza GOY XPRESS a la versión más reciente para iniciar sesión.',
        code:'APP_UPDATE_REQUIRED',
      }), {
        status:426,
        headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
      });
    }

    return base.fetch(request, env, ctx);
  },
};
