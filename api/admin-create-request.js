const crypto = require('crypto');
const backendV5 = require('../server/server-v5');
const {
  notifyAdminNewOrder,
  notifyCourierAssigned,
  safeNotify,
} = require('../server/whatsappNotifications');

function signToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) throw new Error('Payload demasiado grande');
  }
  if (!raw) return {};
  return JSON.parse(raw);
}

function invokeBackend(handler, {method = 'GET', url = '/', body, headers = {}} = {}) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    let responseHeaders = {};
    const req = {
      method,
      url,
      body,
      headers: {
        host: 'internal.goy-xpress',
        ...Object.fromEntries(Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), value])),
      },
    };
    const res = {
      writeHead(status, nextHeaders = {}) {
        statusCode = status;
        responseHeaders = nextHeaders;
      },
      end(value = '') {
        let parsed = {};
        try { parsed = value ? JSON.parse(String(value)) : {}; } catch { parsed = {raw:String(value || '')}; }
        resolve({status:statusCode, headers:responseHeaders, body:parsed});
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
  });
  res.end(JSON.stringify(body));
}

function createHandler(options = {}) {
  const backend = options.backend || backendV5;
  const tokenSecret = options.tokenSecret || process.env.TOKEN_SECRET || '';

  return async function adminCreateRequest(req, res) {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (req.method !== 'POST') return send(res, 405, {error:'Método no permitido'});
    if (!tokenSecret) return send(res, 503, {error:'TOKEN_SECRET no configurado en el servidor.'});

    try {
      const authorization = String(req.headers?.authorization || '');
      const adminData = await invokeBackend(backend, {
        method:'GET',
        url:'/api/admin/data',
        headers:{authorization},
      });
      if (adminData.status !== 200) return send(res, adminData.status, adminData.body);

      const body = await readBody(req);
      const clientId = String(body.clientId || '').trim();
      const courierId = String(body.courierId || '').trim();
      const isCustomService = body.customService === true;
      const client = (adminData.body.clients || []).find(item => String(item.id || item.userId) === clientId && item.active !== false);
      if (!client) return send(res, 400, {error:'Selecciona un cliente registrado y activo.'});

      let courier = null;
      if (courierId) {
        courier = (adminData.body.couriers || []).find(item => String(item.id || item.userId) === courierId && item.approved && item.active !== false);
        if (!courier) return send(res, 400, {error:'Selecciona un mensajero registrado, activo y aprobado.'});
        if (String(body.kind || '') === 'diverse' && !isCustomService) {
          return send(res, 400, {error:'Los servicios diversos deben cotizarse y ser aceptados por el cliente antes de asignar mensajero.'});
        }
      }

      const clientToken = signToken({
        role:'client',
        userId:clientId,
        exp:Date.now() + (10 * 60 * 1000),
        issuedBy:'admin-order-proxy',
      }, tokenSecret);

      const requestBody = {
        ...body,
        adminCreated:true,
        createdBy:'admin',
        adminNotes:String(body.adminNotes || '').trim(),
      };
      delete requestBody.clientId;
      delete requestBody.courierId;

      const created = await invokeBackend(backend, {
        method:'POST',
        url:'/api/client/requests',
        body:requestBody,
        headers:{authorization:`Bearer ${clientToken}`},
      });
      if (created.status < 200 || created.status >= 300) return send(res, created.status, created.body);

      let request = created.body.request;
      let assignmentWarning = '';

      if (isCustomService) {
        const customCost = Number(body.serviceCost);
        if (!Number.isFinite(customCost) || customCost < 0) return send(res, 400, {error:'La tarifa del servicio personalizado no es válida.'});
        const adjusted = await invokeBackend(backend, {
          method:'PATCH',
          url:`/api/admin/requests/${encodeURIComponent(request.code || request.id)}`,
          body:{serviceLabel:String(body.serviceLabel || 'Servicio personalizado').trim(),serviceCost:customCost,status:'Aceptado',reason:'Tarifa de servicio personalizado'},
          headers:{authorization},
        });
        if (adjusted.status >= 200 && adjusted.status < 300) request = adjusted.body.request;
        else return send(res, adjusted.status, adjusted.body);
      }

      if (courier) {
        const assigned = await invokeBackend(backend, {
          method:'PATCH',
          url:`/api/admin/requests/${encodeURIComponent(request.code || request.id)}`,
          body:{courierId},
          headers:{authorization},
        });
        if (assigned.status >= 200 && assigned.status < 300) request = assigned.body.request;
        else assignmentWarning = assigned.body?.error || 'La orden se creó, pero no pudo asignarse automáticamente.';
      }

      const whatsapp = {};
      whatsapp.admin = await safeNotify('admin-new-order', () => notifyAdminNewOrder({request, client}));
      if (courier && !assignmentWarning) {
        whatsapp.courier = await safeNotify('courier-assigned', () => notifyCourierAssigned({request, courier}));
      }

      return send(res, 201, {
        ok:true,
        request,
        client:{id:clientId,name:client.businessName || client.name || client.email || 'Cliente'},
        assigned:Boolean(courier && !assignmentWarning),
        whatsapp,
        ...(assignmentWarning ? {assignmentWarning} : {}),
      });
    } catch (error) {
      console.error('GOY XPRESS admin create request', error);
      return send(res, 500, {error:error.message || 'No se pudo crear la orden administrativa.'});
    }
  };
}

const handler = createHandler();
handler.createHandler = createHandler;
handler.invokeBackend = invokeBackend;
module.exports = handler;
