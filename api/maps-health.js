const api = require('../server/server-v5');

module.exports = async function mapsHealth(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ok:false,error:'Método no permitido'}));
  }
  try {
    const route = await api.computeGoogleRoute(
      'Jorge Juan y Av. Mariana de Jesús, Quito',
      'Plaza Foch, Quito',
      {googleMapsApiKey:String(process.env.GOOGLE_MAPS_API_KEY || '')},
      globalThis.fetch,
    );
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({
      ok:true,
      provider:route.provider,
      distanceKm:route.distanceKm,
      durationMinutes:route.durationMinutes,
    }));
  } catch (error) {
    res.statusCode = Number(error.status || 500);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({ok:false,error:error.message,code:error.code || null}));
  }
};
