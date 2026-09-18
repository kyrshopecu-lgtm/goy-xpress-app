export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let path = url.pathname;

    // Mantiene las mismas rutas públicas que usaba Vercel.
    if (path === '/inicio') path = '/';
    if (path === '/servicio') path = '/service.html';
    if (path.startsWith('/web/')) path = path.slice(4) || '/';

    const assetUrl = new URL(url);
    assetUrl.pathname = path;
    return env.ASSETS.fetch(new Request(assetUrl, request));
  }
};
