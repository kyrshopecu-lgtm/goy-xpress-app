import worker from './cloudflare-worker-v2.js';

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
