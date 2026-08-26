const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {calculateCourierWait, calculateDepositPrice, monthlyCycleKey, canReleaseCourierFunds, createRecurringTemplate} = require('../src/logisticsRules');

const PORT = Number(process.env.PORT || 8787);
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const TOKEN_SECRET = String(process.env.TOKEN_SECRET || '');
const ALLOWED_ORIGIN = String(process.env.ALLOWED_ORIGIN || '*');
const DATABASE_URL = String(process.env.DATABASE_URL || '');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

let sqlClient = null;
let dbReady = false;

function emptyData() {
  return {clients: [], requests: [], couriers: [], payments: [], invites: [], templates: [], walletEntries: [], monthlyArchives: []};
}

async function getSql() {
  if (!DATABASE_URL) return null;
  if (!sqlClient) {
    const {neon} = require('@neondatabase/serverless');
    sqlClient = neon(DATABASE_URL);
  }
  if (!dbReady) {
    await sqlClient`CREATE TABLE IF NOT EXISTS goy_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await sqlClient`INSERT INTO goy_state (id, data) VALUES (1, ${JSON.stringify(emptyData())}::jsonb) ON CONFLICT (id) DO NOTHING`;
    dbReady = true;
  }
  return sqlClient;
}

async function readData() {
  const sql = await getSql();
  if (sql) {
    const rows = await sql`SELECT data FROM goy_state WHERE id = 1 LIMIT 1`;
    return {...emptyData(), ...(rows[0]?.data || {})};
  }
  try {
    if (!fs.existsSync(DATA_FILE)) return emptyData();
    return {...emptyData(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))};
  } catch (error) {
    console.error('No se pudo leer el almacenamiento local', error);
    return emptyData();
  }
}

async function writeData(data) {
  const sql = await getSql();
  if (sql) {
    await sql`UPDATE goy_state SET data = ${JSON.stringify(data)}::jsonb, updated_at = NOW() WHERE id = 1`;
    return;
  }
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function json(res, status, body) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':ALLOWED_ORIGIN,'Access-Control-Allow-Headers':'Content-Type, Authorization, X-Request-Secret','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Cache-Control':'no-store'});
  res.end(JSON.stringify(body));
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || !TOKEN_SECRET) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp && Date.now() <= payload.exp ? payload : null;
  } catch { return null; }
}

function requireAdmin(req, res) {
  const auth = String(req.headers.authorization || '');
  const payload = verifyToken(auth.startsWith('Bearer ') ? auth.slice(7) : '');
  if (!payload || payload.role !== 'admin') {
    json(res, 401, {error:'No autorizado'});
    return null;
  }
  return payload;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4_000_000) throw new Error('Payload demasiado grande');
  }
  return raw ? JSON.parse(raw) : {};
}

function normalizeStatus(value) {
  const map = {'En ruta':'En camino','Entregado':'Entrega finalizada','Finalizado':'Entrega finalizada'};
  const normalized = map[value] || value;
  const allowed = ['Pendiente','Cotizado','Aceptado','Asignado','Recogido','En camino','Entrega finalizada','Cancelado'];
  return allowed.includes(normalized) ? normalized : 'Pendiente';
}

function publicPath(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = url.pathname.replace(/\/$/, '') || '/';
  if (pathname === '/api') pathname = '/';
  else if (pathname.startsWith('/api/')) pathname = pathname.slice(4);
  return pathname;
}

function findRequest(data, code) {
  return data.requests.findIndex(item => item.code === code || item.id === code);
}

function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}

function hasRequestAccess(req, request) {
  const secret = String(req.headers['x-request-secret'] || '');
  return Boolean(secret && request?.accessSecretHash && safeEqual(hashSecret(secret), request.accessSecretHash));
}

function appendEvent(request, type, payload = {}) {
  request.events = Array.isArray(request.events) ? request.events : [];
  request.events.unshift({id:crypto.randomUUID(), type, ...payload, at:new Date().toISOString()});
  request.updatedAt = new Date().toISOString();
}

function sanitizeRequest(request, includeSecret = false) {
  const copy = {...request};
  delete copy.accessSecretHash;
  if (!includeSecret) delete copy.accessSecret;
  return copy;
}

function currentCycleRequests(data, cycle = monthlyCycleKey(new Date())) {
  return data.requests.filter(item => (item.cycleKey || monthlyCycleKey(item.createdAt || new Date())) === cycle);
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const pathname = publicPath(req);

  try {
    if (req.method === 'GET' && pathname === '/health') {
      return json(res, 200, {ok:true, service:'goy-xpress-api', version:'3.3.0', storage:DATABASE_URL ? 'postgres' : 'local'});
    }

    if (req.method === 'POST' && pathname === '/admin/login') {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !TOKEN_SECRET) return json(res, 503, {error:'Servidor sin configurar'});
      if (!safeEqual(email, ADMIN_EMAIL) || !safeEqual(password, ADMIN_PASSWORD)) return json(res, 401, {error:'Usuario o contraseña incorrectos'});
      return json(res, 200, {token:signToken({role:'admin', email:ADMIN_EMAIL, exp:Date.now()+8*60*60*1000}), expiresIn:28800});
    }

    if (req.method === 'GET' && pathname === '/admin/data') {
      if (!requireAdmin(req, res)) return;
      const data = await readData();
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const cycle = url.searchParams.get('cycle') || monthlyCycleKey(new Date());
      return json(res, 200, {...data, requests:currentCycleRequests(data, cycle), activeCycle:cycle, availableCycles:[...new Set(data.requests.map(r => r.cycleKey || monthlyCycleKey(r.createdAt)))].sort().reverse()});
    }

    if (req.method === 'POST' && pathname === '/admin/invites') {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const data = await readData();
      const invite = {token:crypto.randomBytes(18).toString('base64url'), createdAt:new Date().toISOString(), expiresAt:new Date(Date.now()+7*24*60*60*1000).toISOString(), usedAt:null, label:String(body.label||'').trim(), email:String(body.email||'').trim().toLowerCase()};
      data.invites.unshift(invite);
      await writeData(data);
      return json(res, 201, invite);
    }

    if (req.method === 'PATCH' && pathname.startsWith('/admin/requests/')) {
      if (!requireAdmin(req, res)) return;
      const code = decodeURIComponent(pathname.slice('/admin/requests/'.length));
      const body = await readBody(req);
      const data = await readData();
      const index = findRequest(data, code);
      if (index < 0) return json(res, 404, {error:'Solicitud no encontrada'});
      const current = data.requests[index];
      const patch = {};
      if (body.status) patch.status = normalizeStatus(body.status);
      if (Object.prototype.hasOwnProperty.call(body,'courier')) patch.courier = body.courier || null;
      if (body.kind) patch.kind = String(body.kind);
      if (body.serviceLabel) patch.serviceLabel = String(body.serviceLabel).trim();
      if (body.serviceCost !== undefined) {
        const newCost = Math.max(0, Number(body.serviceCost || 0));
        patch.serviceCost = Math.round(newCost*100)/100;
        patch.tariffAdjustment = {previousCost:Number(current.serviceCost||0), newCost:patch.serviceCost, reason:String(body.reason||'Reajuste administrativo').trim(), adjustedAt:new Date().toISOString()};
      }
      if (body.quote) patch.quote = {...(current.quote||{}), ...body.quote, updatedAt:new Date().toISOString()};
      if (body.wallet) patch.wallet = {...(current.wallet||{}), ...body.wallet, updatedAt:new Date().toISOString()};
      if (body.adminNotes !== undefined) patch.adminNotes = String(body.adminNotes||'').trim();
      data.requests[index] = {...current, ...patch, updatedAt:new Date().toISOString()};
      appendEvent(data.requests[index], 'admin_update', {fields:Object.keys(patch)});
      await writeData(data);
      return json(res, 200, sanitizeRequest(data.requests[index]));
    }

    if (req.method === 'POST' && pathname.startsWith('/admin/requests/') && pathname.endsWith('/template')) {
      if (!requireAdmin(req, res)) return;
      const code = decodeURIComponent(pathname.slice('/admin/requests/'.length, -'/template'.length));
      const body = await readBody(req);
      const data = await readData();
      const index = findRequest(data, code);
      if (index < 0) return json(res,404,{error:'Solicitud no encontrada'});
      const template = createRecurringTemplate(data.requests[index], body.name);
      data.templates.unshift(template);
      await writeData(data);
      return json(res,201,template);
    }

    if (req.method === 'POST' && pathname.startsWith('/admin/requests/') && pathname.endsWith('/release-wallet')) {
      if (!requireAdmin(req, res)) return;
      const code = decodeURIComponent(pathname.slice('/admin/requests/'.length, -'/release-wallet'.length));
      const data = await readData();
      const index = findRequest(data, code);
      if (index < 0) return json(res,404,{error:'Solicitud no encontrada'});
      const request = data.requests[index];
      if (!canReleaseCourierFunds(request)) return json(res,409,{error:'Se requiere entrega finalizada y foto del depósito para liberar valores.'});
      request.wallet = {...(request.wallet||{}), released:true, releasedAt:new Date().toISOString()};
      appendEvent(request,'wallet_released');
      await writeData(data);
      return json(res,200,sanitizeRequest(request));
    }

    if (req.method === 'POST' && pathname === '/requests') {
      const body = await readBody(req);
      if (!body.code || !body.kind) return json(res,400,{error:'Solicitud incompleta'});
      const data = await readData();
      const existing = data.requests.find(item => item.code === body.code);
      if (existing) return json(res,200,{ok:true, duplicate:true, request:sanitizeRequest(existing)});
      if (body.kind === 'deposit') {
        const deposit = calculateDepositPrice({checkCount:body.checkCount, cashAmount:body.cashAmount, method:body.depositMethod});
        if (!deposit.valid) return json(res,400,{error:deposit.error});
        body.serviceCost = deposit.total;
        body.depositPricing = deposit;
      }
      const accessSecret = crypto.randomBytes(18).toString('base64url');
      const createdAt = body.createdAt || new Date().toISOString();
      const request = {...body, status:body.kind === 'diverse' ? 'Pendiente' : 'Pendiente', cycleKey:monthlyCycleKey(createdAt), courierStage:null, wait:{freeMinutes:10, elapsedMinutes:0, extraMinutes:0, extraCost:0, decision:null}, evidence:{}, gps:{last:null, history:[]}, quote:body.kind === 'diverse' ? {status:'Pendiente de cotización', amount:null, acceptedAt:null} : null, wallet:{collected:Number(body.totalToCollect||0), depositPhoto:null, released:Number(body.totalToCollect||0)===0}, events:[], accessSecretHash:hashSecret(accessSecret), createdAt, updatedAt:new Date().toISOString()};
      appendEvent(request,'request_created',{cycleKey:request.cycleKey});
      data.requests.unshift(request);
      await writeData(data);
      return json(res,201,{ok:true, request:sanitizeRequest(request), accessSecret});
    }

    const requestActionMatch = pathname.match(/^\/requests\/([^/]+)\/(pickup|location|wait|wait-decision|delivery|deposit-evidence|quote-response)$/);
    if (req.method === 'POST' && requestActionMatch) {
      const [, rawCode, action] = requestActionMatch;
      const code = decodeURIComponent(rawCode);
      const body = await readBody(req);
      const data = await readData();
      const index = findRequest(data, code);
      if (index < 0) return json(res,404,{error:'Solicitud no encontrada'});
      const request = data.requests[index];
      if (!hasRequestAccess(req, request)) return json(res,401,{error:'Acceso a solicitud no autorizado'});

      if (action === 'pickup') {
        if (!body.photo) return json(res,400,{error:'La foto de recogida es obligatoria'});
        request.status = 'Recogido'; request.courierStage = 'Recogido'; request.evidence.pickupPhoto = body.photo;
        appendEvent(request,'pickup',{note:String(body.note||'')});
      } else if (action === 'location') {
        const lat = Number(body.latitude); const lng = Number(body.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json(res,400,{error:'Ubicación inválida'});
        request.status = request.status === 'Recogido' ? 'En camino' : request.status;
        request.courierStage = 'En camino'; request.gps.last = {latitude:lat, longitude:lng, accuracy:Number(body.accuracy||0), at:new Date().toISOString()};
        request.gps.history = Array.isArray(request.gps.history) ? request.gps.history.slice(-99) : [];
        request.gps.history.push(request.gps.last);
        appendEvent(request,'location');
      } else if (action === 'wait') {
        const wait = calculateCourierWait(body.elapsedMinutes);
        request.wait = {...request.wait, ...wait};
        request.serviceCost = Math.round((Number(request.baseServiceCost ?? request.serviceCost ?? 0)+wait.extraCost)*100)/100;
        appendEvent(request,'wait_updated',{elapsedMinutes:wait.elapsedMinutes,extraCost:wait.extraCost});
      } else if (action === 'wait-decision') {
        if (!['withdraw','continue'].includes(body.decision)) return json(res,400,{error:'Decisión inválida'});
        request.wait = {...request.wait, decision:body.decision, decisionAt:new Date().toISOString()};
        appendEvent(request,'wait_decision',{decision:body.decision});
      } else if (action === 'delivery') {
        if (!body.photo) return json(res,400,{error:'La foto de entrega es obligatoria'});
        request.status = 'Entrega finalizada'; request.courierStage = 'Entrega finalizada'; request.evidence.deliveryPhoto = body.photo; request.finishedAt = new Date().toISOString();
        appendEvent(request,'delivery_completed',{note:String(body.note||'')});
      } else if (action === 'deposit-evidence') {
        if (!body.photo) return json(res,400,{error:'La foto del depósito es obligatoria'});
        request.evidence.depositPhoto = body.photo; request.wallet = {...request.wallet, depositPhoto:body.photo, depositedAmount:Number(body.amount||request.wallet?.collected||0), depositedAt:new Date().toISOString()};
        appendEvent(request,'deposit_evidence',{amount:request.wallet.depositedAmount});
      } else if (action === 'quote-response') {
        if (!['accepted','rejected'].includes(body.response)) return json(res,400,{error:'Respuesta inválida'});
        if (!request.quote?.amount) return json(res,409,{error:'El administrador todavía no ha cotizado este servicio'});
        request.quote = {...request.quote, status:body.response === 'accepted' ? 'Aceptado' : 'Rechazado', acceptedAt:body.response === 'accepted' ? new Date().toISOString() : null};
        request.status = body.response === 'accepted' ? 'Aceptado' : 'Cancelado';
        if (body.response === 'accepted') request.serviceCost = Number(request.quote.amount);
        appendEvent(request,'quote_response',{response:body.response});
      }
      request.updatedAt = new Date().toISOString();
      await writeData(data);
      return json(res,200,sanitizeRequest(request));
    }

    if (req.method === 'GET' && pathname.startsWith('/invite/')) {
      const token = decodeURIComponent(pathname.slice('/invite/'.length));
      const invite = (await readData()).invites.find(item => item.token === token);
      if (!invite || invite.usedAt || Date.now() > Date.parse(invite.expiresAt)) return json(res,404,{error:'Invitación inválida o vencida'});
      return json(res,200,{valid:true,label:invite.label,email:invite.email,expiresAt:invite.expiresAt});
    }

    if (req.method === 'POST' && pathname.startsWith('/invite/')) {
      const token = decodeURIComponent(pathname.slice('/invite/'.length));
      const body = await readBody(req);
      const required = ['name','whatsapp','address','contactPhone','documentId','email'];
      const missing = required.filter(key => !String(body[key]||'').trim());
      if (missing.length) return json(res,400,{error:'Faltan datos obligatorios',missing});
      const data = await readData();
      const invite = data.invites.find(item => item.token === token);
      if (!invite || invite.usedAt || Date.now() > Date.parse(invite.expiresAt)) return json(res,404,{error:'Invitación inválida o vencida'});
      const client = {id:crypto.randomUUID(),name:String(body.name).trim(),whatsapp:String(body.whatsapp).trim(),address:String(body.address).trim(),contactPhone:String(body.contactPhone).trim(),documentId:String(body.documentId).trim(),email:String(body.email).trim().toLowerCase(),status:'Activo',createdAt:new Date().toISOString()};
      data.clients.unshift(client); invite.usedAt = new Date().toISOString(); await writeData(data);
      return json(res,201,{ok:true,clientId:client.id});
    }

    return json(res,404,{error:'Ruta no encontrada'});
  } catch (error) {
    console.error(error);
    return json(res,500,{error:'Error interno del servidor'});
  }
}

module.exports = handler;
if (require.main === module) {
  const server = http.createServer(handler);
  server.listen(PORT, () => console.log(`GOY XPRESS API v3.3 escuchando en puerto ${PORT}`));
}
