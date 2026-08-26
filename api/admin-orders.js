const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function verifyToken(token, secret) {
  if (!token || !secret) return null;
  const [body, signature] = String(token).split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp && Date.now() <= payload.exp ? payload : null;
  } catch {
    return null;
  }
}

function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.status(status).end(JSON.stringify(body));
}

function cycleKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function orderCode() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  return `GX-${stamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function cleanText(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function normalizeAddress(value) {
  const text = cleanText(value, 350);
  if (!text) return '';
  return /ecuador/i.test(text) ? text : `${text}, Ecuador`;
}

async function computeRoute(originValue, destinationValue) {
  const apiKey = String(process.env.GOOGLE_MAPS_API_KEY || '');
  const origin = normalizeAddress(originValue);
  const destination = normalizeAddress(destinationValue);
  if (!apiKey || !origin || !destination) return null;
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration'
    },
    body: JSON.stringify({
      origin: { address: origin },
      destination: { address: destination },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      languageCode: 'es-419'
    })
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const route = payload.routes?.[0];
  if (!route) return null;
  const seconds = Number(String(route.duration || '0s').replace('s', '')) || 0;
  return {
    distanceKm: Math.round((Number(route.distanceMeters || 0) / 1000) * 100) / 100,
    durationMinutes: Math.max(1, Math.ceil(seconds / 60)),
    mapUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`
  };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido' });

  const secret = String(process.env.TOKEN_SECRET || '');
  const auth = String(req.headers.authorization || '');
  const payload = verifyToken(auth.startsWith('Bearer ') ? auth.slice(7) : '', secret);
  if (!payload || payload.role !== 'admin') return send(res, 401, { error: 'No autorizado' });

  const databaseUrl = String(process.env.DATABASE_URL || '');
  if (!databaseUrl) return send(res, 503, { error: 'Base de datos no configurada' });

  const body = typeof req.body === 'object' && req.body ? req.body : {};
  const clientId = cleanText(body.clientId, 120);
  const courierId = cleanText(body.courierId, 120);
  const kind = cleanText(body.kind, 40) || 'shipment';
  const serviceLabel = cleanText(body.serviceLabel, 120) || 'Orden administrativa';
  const pickupAddress = cleanText(body.pickupAddress, 350);
  const destinationAddress = cleanText(body.destinationAddress, 350);
  const notes = cleanText(body.notes, 1200);
  const serviceCost = Number(body.serviceCost);

  if (!clientId) return send(res, 400, { error: 'Selecciona el cliente de la orden.' });
  if (!Number.isFinite(serviceCost) || serviceCost < 0) return send(res, 400, { error: 'Ingresa una tarifa válida.' });

  const sql = neon(databaseUrl);
  await sql`CREATE TABLE IF NOT EXISTS goy_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  const rows = await sql`SELECT data FROM goy_state WHERE id = 1 LIMIT 1`;
  const state = rows[0]?.data || {};
  const clients = Array.isArray(state.clients) ? state.clients : [];
  const couriers = Array.isArray(state.couriers) ? state.couriers : [];
  const client = clients.find(item => item.id === clientId || item.userId === clientId);
  if (!client) return send(res, 404, { error: 'El cliente seleccionado ya no existe.' });

  let courier = null;
  if (courierId) {
    courier = couriers.find(item => item.id === courierId || item.userId === courierId);
    if (!courier) return send(res, 404, { error: 'El mensajero seleccionado ya no existe.' });
    if (courier.active === false || courier.approved !== true) {
      return send(res, 409, { error: 'Solo puedes asignar mensajeros aprobados y activos.' });
    }
  }

  let route = null;
  if (pickupAddress && destinationAddress) {
    try { route = await computeRoute(pickupAddress, destinationAddress); } catch { route = null; }
  }

  const now = new Date().toISOString();
  const code = orderCode();
  const order = {
    id: code,
    code,
    source: 'admin',
    createdBy: 'admin',
    clientId: client.userId || client.id,
    customer: client.businessName || client.name || 'Cliente',
    businessName: client.businessName || '',
    whatsapp: client.whatsapp || client.phone || '',
    phone: client.whatsapp || client.phone || '',
    email: client.email || '',
    clientLogo: client.logo || '',
    kind,
    serviceLabel,
    pickupAddress,
    destinationAddress,
    address: destinationAddress || pickupAddress,
    notes,
    serviceCost,
    value: serviceCost,
    route,
    distanceKm: route?.distanceKm || 0,
    durationMinutes: route?.durationMinutes || 0,
    courierId: courier ? (courier.userId || courier.id) : '',
    courier: courier ? (courier.name || courier.fullName || 'Mensajero') : '',
    courierPhone: courier ? (courier.whatsapp || courier.phone || '') : '',
    status: courier ? 'Asignado' : 'Pendiente',
    cycleKey: cycleKey(new Date()),
    createdAt: now,
    updatedAt: now,
    events: [{
      id: crypto.randomUUID(),
      type: 'admin_order_created',
      by: 'admin',
      courierId: courier ? (courier.userId || courier.id) : '',
      at: now
    }]
  };

  await sql`UPDATE goy_state
    SET data = jsonb_set(
      COALESCE(data, '{}'::jsonb),
      '{requests}',
      COALESCE(data->'requests', '[]'::jsonb) || ${JSON.stringify([order])}::jsonb,
      true
    ), updated_at = NOW()
    WHERE id = 1`;

  return send(res, 201, { ok: true, request: order });
};
