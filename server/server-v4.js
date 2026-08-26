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
  res.writeHead(status, {
    'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers':'Content-Type, Authorization, X-Request-Secret, X-Client-Id',
    'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS',
    'Cache-Control':'no-store',
  });
  res.end(JSON.stringify(body));
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function normalizedPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) digits = `593${digits.slice(1)}`;
  if (digits.length === 9) digits = `593${digits}`;
  return digits;
}

function tokenHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return {salt, hash};
}

function verifyPassword(password, salt, expected) {
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return safeEqual(actual, expected);
}

function signToken(payload) {
  if (!TOKEN_SECRET) return null;
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

async function requireClient(req, res, data) {
  const clientId = String(req.headers['x-client-id'] || '');
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const client = data.clients.find(item => item.id === clientId);
  if (!client || client.status === 'Inactivo' || !token || !client.sessionHash || !safeEqual(tokenHash(token), client.sessionHash) || Date.now() > Date.parse(client.sessionExpiresAt || 0)) {
    json(res, 401, {error:'Sesión de cliente inválida o vencida'});
    return null;
  }
  return client;
}

async function requireCourier(req, res, data) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const courier = data.couriers.find(item => item.sessionHash && token && safeEqual(tokenHash(token), item.sessionHash));
  if (!courier || courier.status !== 'Activo' || Date.now() > Date.parse(courier.sessionExpiresAt || 0)) {
    json(res, 401, {error:'Sesión de mensajero inválida o vencida'});
    return null;
  }
  return courier;
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

function appendEvent(request, type, payload = {}) {
  request.events = Array.isArray(request.events) ? request.events : [];
  request.events.unshift({id:crypto.randomUUID(), type, ...payload, at:new Date().toISOString()});
  request.updatedAt = new Date().toISOString();
}

function sanitizeRequest(request) {
  const copy = {...request};
  delete copy.accessSecretHash;
  delete copy.accessSecret;
  return copy;
}

function sanitizeClientRequest(request) {
  const copy = sanitizeRequest(request);
  delete copy.gps;
  return copy;
}

function sanitizeCourier(courier) {
  const copy = {...courier};
  delete copy.passwordHash;
  delete copy.passwordSalt;
  delete copy.sessionHash;
  delete copy.sessionExpiresAt;
  return copy;
}

function sanitizeClient(client) {
  const copy = {...client};
  delete copy.sessionHash;
  delete copy.sessionExpiresAt;
  return copy;
}

function currentCycleRequests(data, cycle = monthlyCycleKey(new Date())) {
  return data.requests.filter(item => (item.cycleKey || monthlyCycleKey(item.createdAt || new Date())) === cycle);
}

function createMobileSession(hours = 24 * 30) {
  const token = crypto.randomBytes(32).toString('base64url');
  return {token, hash:tokenHash(token), expiresAt:new Date(Date.now()+hours*60*60*1000).toISOString()};
}

function prepareNewRequest(body, client) {
  const input = {...body};
  if (!input.code || !input.kind) throw Object.assign(new Error('Solicitud incompleta'), {statusCode:400});
  if (input.kind === 'deposit') {
    const deposit = calculateDepositPrice({checkCount:input.checkCount, cashAmount:input.cashAmount, method:input.depositMethod});
    if (!deposit.valid) throw Object.assign(new Error(deposit.error), {statusCode:400});
    input.serviceCost = deposit.total;
    input.depositPricing = deposit;
  }
  const createdAt = input.createdAt || new Date().toISOString();
  const request = {
    ...input,
    clientId: client?.id || input.clientId || null,
    customer: client?.name || input.customer || '',
    phone: client?.whatsapp || input.phone || '',
    status:'Pendiente',
    cycleKey:monthlyCycleKey(createdAt),
    courierId:null,
    courier:null,
    courierStage:null,
    wait:{freeMinutes:10, elapsedMinutes:0, extraMinutes:0, extraCost:0, decision:null},
    evidence:{},
    gps:{last:null, history:[]},
    quote:input.kind === 'diverse' ? {status:'Pendiente de cotización', amount:null, acceptedAt:null} : (input.quote || null),
    wallet:{collected:Number(input.totalToCollect||0), depositPhoto:null, released:Number(input.totalToCollect||0)===0},
    events:[],
    createdAt,
    updatedAt:new Date().toISOString(),
  };
  appendEvent(request,'request_created',{cycleKey:request.cycleKey,clientId:request.clientId});
  return request;
}

function requestAssignedToCourier(request, courier) {
  return request.courierId === courier.id || (!request.courierId && request.courier && request.courier === courier.name);
}

async function applyCourierAction(request, action, body = {}) {
  if (action === 'pickup') {
    if (!body.photo) throw Object.assign(new Error('La foto de recogida es obligatoria'), {statusCode:400});
    request.status = 'Recogido'; request.courierStage = 'Recogido';
    request.evidence = {...(request.evidence || {}), pickupPhoto:body.photo};
    appendEvent(request,'pickup',{note:String(body.note||'')});
  } else if (action === 'location') {
    const lat = Number(body.latitude); const lng = Number(body.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw Object.assign(new Error('Ubicación inválida'), {statusCode:400});
    request.status = request.status === 'Recogido' ? 'En camino' : request.status;
    request.courierStage = 'En camino';
    request.gps = request.gps || {last:null,history:[]};
    request.gps.last = {latitude:lat, longitude:lng, accuracy:Number(body.accuracy||0), at:new Date().toISOString()};
    request.gps.history = Array.isArray(request.gps.history) ? request.gps.history.slice(-99) : [];
    request.gps.history.push(request.gps.last);
    appendEvent(request,'location');
  } else if (action === 'wait') {
    const wait = calculateCourierWait(body.elapsedMinutes);
    request.wait = {...(request.wait || {}), ...wait};
    request.serviceCost = Math.round((Number(request.baseServiceCost ?? request.serviceCost ?? 0)+wait.extraCost)*100)/100;
    appendEvent(request,'wait_updated',{elapsedMinutes:wait.elapsedMinutes,extraCost:wait.extraCost});
  } else if (action === 'wait-decision') {
    if (!['withdraw','continue'].includes(body.decision)) throw Object.assign(new Error('Decisión inválida'), {statusCode:400});
    request.wait = {...(request.wait || {}), decision:body.decision, decisionAt:new Date().toISOString()};
    appendEvent(request,'wait_decision',{decision:body.decision});
  } else if (action === 'delivery') {
    if (!body.photo) throw Object.assign(new Error('La foto de entrega es obligatoria'), {statusCode:400});
    request.status = 'Entrega finalizada'; request.courierStage = 'Entrega finalizada';
    request.evidence = {...(request.evidence || {}), deliveryPhoto:body.photo};
    request.finishedAt = new Date().toISOString();
    appendEvent(request,'delivery_completed',{note:String(body.note||'')});
  } else if (action === 'deposit-evidence') {
    if (!body.photo) throw Object.assign(new Error('La foto del depósito es obligatoria'), {statusCode:400});
    request.evidence = {...(request.evidence || {}), depositPhoto:body.photo};
    request.wallet = {...(request.wallet || {}), depositPhoto:body.photo, depositedAmount:Number(body.amount||request.wallet?.collected||0), depositedAt:new Date().toISOString()};
    appendEvent(request,'deposit_evidence',{amount:request.wallet.depositedAmount});
  }
  request.updatedAt = new Date().toISOString();
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const pathname = publicPath(req);
  try {
    if (req.method === 'GET' && pathname === '/health') return json(res,200,{ok:true,service:'goy-xpress-api',version:'4.0.0',storage:DATABASE_URL?'postgres':'local',apps:['client','courier','admin-web']});

    if (req.method === 'POST' && pathname === '/admin/login') {
      const body = await readBody(req); const email=String(body.email||'').trim().toLowerCase(); const password=String(body.password||'');
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !TOKEN_SECRET) return json(res,503,{error:'Servidor sin configurar'});
      if (!safeEqual(email,ADMIN_EMAIL)||!safeEqual(password,ADMIN_PASSWORD)) return json(res,401,{error:'Usuario o contraseña incorrectos'});
      return json(res,200,{token:signToken({role:'admin',email:ADMIN_EMAIL,exp:Date.now()+8*60*60*1000}),expiresIn:28800});
    }

    if (req.method === 'GET' && pathname === '/admin/data') {
      if (!requireAdmin(req,res)) return; const data=await readData(); const url=new URL(req.url,`http://${req.headers.host||'localhost'}`); const cycle=url.searchParams.get('cycle')||monthlyCycleKey(new Date());
      return json(res,200,{...data,clients:data.clients.map(sanitizeClient),couriers:data.couriers.map(sanitizeCourier),requests:currentCycleRequests(data,cycle).map(sanitizeRequest),activeCycle:cycle,availableCycles:[...new Set(data.requests.map(r=>r.cycleKey||monthlyCycleKey(r.createdAt)))].sort().reverse()});
    }

    if (req.method === 'POST' && pathname === '/admin/invites') {
      if (!requireAdmin(req,res)) return; const body=await readBody(req); const data=await readData(); const invite={token:crypto.randomBytes(18).toString('base64url'),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+7*24*60*60*1000).toISOString(),usedAt:null,label:String(body.label||'').trim(),email:String(body.email||'').trim().toLowerCase(),whatsapp:normalizedPhone(body.whatsapp)}; data.invites.unshift(invite); await writeData(data); return json(res,201,invite);
    }

    if (req.method === 'POST' && pathname === '/admin/couriers') {
      if (!requireAdmin(req,res)) return; const body=await readBody(req); const name=String(body.name||'').trim(); const phone=normalizedPhone(body.phone); const username=String(body.username||'').trim().toLowerCase(); const password=String(body.password||'');
      if(name.length<3||username.length<4||password.length<8)return json(res,400,{error:'Nombre, usuario (mínimo 4) y contraseña (mínimo 8) son obligatorios'}); const data=await readData(); if(data.couriers.some(c=>c.username===username))return json(res,409,{error:'Ese usuario de mensajero ya existe'}); const pw=hashPassword(password); const courier={id:crypto.randomUUID(),name,phone,username,passwordSalt:pw.salt,passwordHash:pw.hash,status:'Activo',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; data.couriers.unshift(courier); await writeData(data); return json(res,201,sanitizeCourier(courier));
    }

    if (req.method === 'PATCH' && pathname.startsWith('/admin/couriers/')) {
      if (!requireAdmin(req,res)) return; const id=decodeURIComponent(pathname.slice('/admin/couriers/'.length)); const body=await readBody(req); const data=await readData(); const courier=data.couriers.find(c=>c.id===id); if(!courier)return json(res,404,{error:'Mensajero no encontrado'});
      if(body.name!==undefined)courier.name=String(body.name).trim(); if(body.phone!==undefined)courier.phone=normalizedPhone(body.phone); if(body.status!==undefined&&['Activo','Inactivo'].includes(body.status))courier.status=body.status;
      if(body.username!==undefined){const username=String(body.username).trim().toLowerCase();if(data.couriers.some(c=>c.id!==id&&c.username===username))return json(res,409,{error:'Ese usuario ya existe'});courier.username=username;}
      if(body.password){if(String(body.password).length<8)return json(res,400,{error:'La contraseña debe tener al menos 8 caracteres'});const pw=hashPassword(body.password);courier.passwordSalt=pw.salt;courier.passwordHash=pw.hash;courier.sessionHash=null;courier.sessionExpiresAt=null;}
      courier.updatedAt=new Date().toISOString();await writeData(data);return json(res,200,sanitizeCourier(courier));
    }

    if (req.method === 'PATCH' && pathname.startsWith('/admin/requests/')) {
      if (!requireAdmin(req,res)) return; const code=decodeURIComponent(pathname.slice('/admin/requests/'.length)); const body=await readBody(req); const data=await readData(); const index=findRequest(data,code); if(index<0)return json(res,404,{error:'Solicitud no encontrada'}); const current=data.requests[index]; const patch={};
      if(body.status)patch.status=normalizeStatus(body.status); if(body.courierId!==undefined){const courier=data.couriers.find(c=>c.id===body.courierId&&c.status==='Activo');if(body.courierId&&!courier)return json(res,400,{error:'Mensajero inválido o inactivo'});patch.courierId=courier?.id||null;patch.courier=courier?.name||null;if(courier&&['Pendiente','Cotizado','Aceptado'].includes(current.status))patch.status='Asignado';}else if(Object.prototype.hasOwnProperty.call(body,'courier'))patch.courier=body.courier||null;
      if(body.kind)patch.kind=String(body.kind);if(body.serviceLabel)patch.serviceLabel=String(body.serviceLabel).trim();if(body.serviceCost!==undefined){const newCost=Math.max(0,Number(body.serviceCost||0));patch.serviceCost=Math.round(newCost*100)/100;patch.tariffAdjustment={previousCost:Number(current.serviceCost||0),newCost:patch.serviceCost,reason:String(body.reason||'Reajuste administrativo').trim(),adjustedAt:new Date().toISOString()};}if(body.quote)patch.quote={...(current.quote||{}),...body.quote,updatedAt:new Date().toISOString()};if(body.wallet)patch.wallet={...(current.wallet||{}),...body.wallet,updatedAt:new Date().toISOString()};if(body.adminNotes!==undefined)patch.adminNotes=String(body.adminNotes||'').trim();data.requests[index]={...current,...patch,updatedAt:new Date().toISOString()};appendEvent(data.requests[index],'admin_update',{fields:Object.keys(patch)});await writeData(data);return json(res,200,sanitizeRequest(data.requests[index]));
    }

    if (req.method === 'POST' && pathname.startsWith('/admin/requests/') && pathname.endsWith('/template')) {if(!requireAdmin(req,res))return;const code=decodeURIComponent(pathname.slice('/admin/requests/'.length,-'/template'.length));const body=await readBody(req);const data=await readData();const index=findRequest(data,code);if(index<0)return json(res,404,{error:'Solicitud no encontrada'});const template=createRecurringTemplate(data.requests[index],body.name);data.templates.unshift(template);await writeData(data);return json(res,201,template);}
    if (req.method === 'POST' && pathname.startsWith('/admin/requests/') && pathname.endsWith('/release-wallet')) {if(!requireAdmin(req,res))return;const code=decodeURIComponent(pathname.slice('/admin/requests/'.length,-'/release-wallet'.length));const data=await readData();const index=findRequest(data,code);if(index<0)return json(res,404,{error:'Solicitud no encontrada'});const request=data.requests[index];if(!canReleaseCourierFunds(request))return json(res,409,{error:'Se requiere entrega finalizada y foto del depósito para liberar valores.'});request.wallet={...(request.wallet||{}),released:true,releasedAt:new Date().toISOString()};appendEvent(request,'wallet_released');await writeData(data);return json(res,200,sanitizeRequest(request));}

    if (req.method === 'POST' && pathname === '/client/login') {const body=await readBody(req);const phone=normalizedPhone(body.whatsapp);const doc=String(body.documentId||'').replace(/\s/g,'');const email=String(body.email||'').trim().toLowerCase();const data=await readData();const client=data.clients.find(c=>normalizedPhone(c.whatsapp)===phone&&String(c.documentId||'').replace(/\s/g,'')===doc&&String(c.email||'').toLowerCase()===email&&c.status!=='Inactivo');if(!client)return json(res,401,{error:'Datos de acceso no coinciden con un cliente activo'});const session=createMobileSession(24*30);client.sessionHash=session.hash;client.sessionExpiresAt=session.expiresAt;client.lastLoginAt=new Date().toISOString();await writeData(data);return json(res,200,{token:session.token,expiresAt:session.expiresAt,client:sanitizeClient(client)});}
    if (req.method === 'GET' && pathname === '/client/me') {const data=await readData();const client=await requireClient(req,res,data);if(!client)return;return json(res,200,{client:sanitizeClient(client)});}
    if (req.method === 'GET' && pathname === '/client/requests') {const data=await readData();const client=await requireClient(req,res,data);if(!client)return;const requests=data.requests.filter(r=>r.clientId===client.id).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).map(sanitizeClientRequest);return json(res,200,{requests});}
    if (req.method === 'POST' && pathname === '/client/requests') {const data=await readData();const client=await requireClient(req,res,data);if(!client)return;const body=await readBody(req);if(data.requests.some(item=>item.code===body.code))return json(res,409,{error:'El código de solicitud ya existe'});const request=prepareNewRequest(body,client);data.requests.unshift(request);await writeData(data);return json(res,201,{ok:true,request:sanitizeClientRequest(request)});}
    const clientRequestMatch=pathname.match(/^\/client\/requests\/([^/]+)$/);if(req.method==='GET'&&clientRequestMatch){const data=await readData();const client=await requireClient(req,res,data);if(!client)return;const code=decodeURIComponent(clientRequestMatch[1]);const request=data.requests.find(r=>(r.code===code||r.id===code)&&r.clientId===client.id);if(!request)return json(res,404,{error:'Solicitud no encontrada'});return json(res,200,{request:sanitizeClientRequest(request)});}
    const clientQuoteMatch=pathname.match(/^\/client\/requests\/([^/]+)\/quote-response$/);if(req.method==='POST'&&clientQuoteMatch){const data=await readData();const client=await requireClient(req,res,data);if(!client)return;const body=await readBody(req);const request=data.requests.find(r=>r.code===decodeURIComponent(clientQuoteMatch[1])&&r.clientId===client.id);if(!request)return json(res,404,{error:'Solicitud no encontrada'});if(!['accepted','rejected'].includes(body.response))return json(res,400,{error:'Respuesta inválida'});if(!request.quote?.amount)return json(res,409,{error:'El administrador todavía no ha cotizado este servicio'});request.quote={...request.quote,status:body.response==='accepted'?'Aceptado':'Rechazado',acceptedAt:body.response==='accepted'?new Date().toISOString():null};request.status=body.response==='accepted'?'Aceptado':'Cancelado';if(body.response==='accepted')request.serviceCost=Number(request.quote.amount);appendEvent(request,'quote_response',{response:body.response,clientId:client.id});await writeData(data);return json(res,200,{request:sanitizeClientRequest(request)});}

    if (req.method === 'POST' && pathname === '/courier/login') {const body=await readBody(req);const username=String(body.username||'').trim().toLowerCase();const password=String(body.password||'');const data=await readData();const courier=data.couriers.find(c=>c.username===username&&c.status==='Activo');if(!courier||!verifyPassword(password,courier.passwordSalt,courier.passwordHash))return json(res,401,{error:'Usuario o contraseña incorrectos'});const session=createMobileSession(24);courier.sessionHash=session.hash;courier.sessionExpiresAt=session.expiresAt;courier.lastLoginAt=new Date().toISOString();await writeData(data);return json(res,200,{token:session.token,expiresAt:session.expiresAt,courier:sanitizeCourier(courier)});}
    if (req.method === 'GET' && pathname === '/courier/me') {const data=await readData();const courier=await requireCourier(req,res,data);if(!courier)return;return json(res,200,{courier:sanitizeCourier(courier)});}
    if (req.method === 'GET' && pathname === '/courier/jobs') {const data=await readData();const courier=await requireCourier(req,res,data);if(!courier)return;const jobs=data.requests.filter(r=>requestAssignedToCourier(r,courier)&&r.status!=='Cancelado').sort((a,b)=>Date.parse(b.updatedAt||b.createdAt)-Date.parse(a.updatedAt||a.createdAt)).map(sanitizeRequest);return json(res,200,{jobs});}
    const courierJobMatch=pathname.match(/^\/courier\/jobs\/([^/]+)$/);if(req.method==='GET'&&courierJobMatch){const data=await readData();const courier=await requireCourier(req,res,data);if(!courier)return;const code=decodeURIComponent(courierJobMatch[1]);const request=data.requests.find(r=>(r.code===code||r.id===code)&&requestAssignedToCourier(r,courier));if(!request)return json(res,404,{error:'Trabajo no asignado a este mensajero'});return json(res,200,{job:sanitizeRequest(request)});}
    const courierActionMatch=pathname.match(/^\/courier\/jobs\/([^/]+)\/(pickup|location|wait|wait-decision|delivery|deposit-evidence)$/);if(req.method==='POST'&&courierActionMatch){const data=await readData();const courier=await requireCourier(req,res,data);if(!courier)return;const code=decodeURIComponent(courierActionMatch[1]);const request=data.requests.find(r=>r.code===code&&requestAssignedToCourier(r,courier));if(!request)return json(res,404,{error:'Trabajo no asignado a este mensajero'});const body=await readBody(req);await applyCourierAction(request,courierActionMatch[2],body);appendEvent(request,'courier_action',{courierId:courier.id,action:courierActionMatch[2]});await writeData(data);return json(res,200,{job:sanitizeRequest(request)});}

    if (req.method === 'POST' && pathname === '/requests') {const body=await readBody(req);const data=await readData();const existing=data.requests.find(item=>item.code===body.code);if(existing)return json(res,200,{ok:true,duplicate:true,request:sanitizeRequest(existing)});const request=prepareNewRequest(body,null);const accessSecret=crypto.randomBytes(18).toString('base64url');request.accessSecretHash=tokenHash(accessSecret);data.requests.unshift(request);await writeData(data);return json(res,201,{ok:true,request:sanitizeRequest(request),accessSecret});}
    const legacyActionMatch=pathname.match(/^\/requests\/([^/]+)\/(pickup|location|wait|wait-decision|delivery|deposit-evidence|quote-response)$/);if(req.method==='POST'&&legacyActionMatch){const data=await readData();const code=decodeURIComponent(legacyActionMatch[1]);const request=data.requests.find(r=>r.code===code);const secret=String(req.headers['x-request-secret']||'');if(!request)return json(res,404,{error:'Solicitud no encontrada'});if(!secret||!request.accessSecretHash||!safeEqual(tokenHash(secret),request.accessSecretHash))return json(res,401,{error:'Acceso a solicitud no autorizado'});const body=await readBody(req);if(legacyActionMatch[2]==='quote-response'){if(!['accepted','rejected'].includes(body.response))return json(res,400,{error:'Respuesta inválida'});if(!request.quote?.amount)return json(res,409,{error:'El administrador todavía no ha cotizado este servicio'});request.quote={...request.quote,status:body.response==='accepted'?'Aceptado':'Rechazado',acceptedAt:body.response==='accepted'?new Date().toISOString():null};request.status=body.response==='accepted'?'Aceptado':'Cancelado';if(body.response==='accepted')request.serviceCost=Number(request.quote.amount);}else await applyCourierAction(request,legacyActionMatch[2],body);await writeData(data);return json(res,200,sanitizeRequest(request));}

    if (req.method === 'GET' && pathname.startsWith('/invite/')) {const token=decodeURIComponent(pathname.slice('/invite/'.length));const invite=(await readData()).invites.find(item=>item.token===token);if(!invite||invite.usedAt||Date.now()>Date.parse(invite.expiresAt))return json(res,404,{error:'Invitación inválida o vencida'});return json(res,200,{valid:true,label:invite.label,email:invite.email,whatsapp:invite.whatsapp,expiresAt:invite.expiresAt});}
    if (req.method === 'POST' && pathname.startsWith('/invite/')) {const token=decodeURIComponent(pathname.slice('/invite/'.length));const body=await readBody(req);const required=['name','whatsapp','address','contactPhone','documentId','email'];const missing=required.filter(key=>!String(body[key]||'').trim());if(missing.length)return json(res,400,{error:'Faltan datos obligatorios',missing});const data=await readData();const invite=data.invites.find(item=>item.token===token);if(!invite||invite.usedAt||Date.now()>Date.parse(invite.expiresAt))return json(res,404,{error:'Invitación inválida o vencida'});const doc=String(body.documentId).trim();const email=String(body.email).trim().toLowerCase();if(data.clients.some(c=>c.documentId===doc||c.email===email))return json(res,409,{error:'El cliente ya está registrado'});const client={id:crypto.randomUUID(),name:String(body.name).trim(),whatsapp:normalizedPhone(body.whatsapp),address:String(body.address).trim(),contactPhone:normalizedPhone(body.contactPhone),documentId:doc,email,status:'Activo',createdAt:new Date().toISOString()};const session=createMobileSession(24*30);client.sessionHash=session.hash;client.sessionExpiresAt=session.expiresAt;data.clients.unshift(client);invite.usedAt=new Date().toISOString();await writeData(data);return json(res,201,{ok:true,clientId:client.id,token:session.token,expiresAt:session.expiresAt,client:sanitizeClient(client)});}

    return json(res,404,{error:'Ruta no encontrada'});
  } catch (error) {
    console.error(error);
    return json(res,error.statusCode||500,{error:error.statusCode?error.message:'Error interno del servidor'});
  }
}

module.exports = handler;
if (require.main === module) {
  const server = http.createServer(handler);
  server.listen(PORT, () => console.log(`GOY XPRESS API v4.0 escuchando en puerto ${PORT}`));
}
