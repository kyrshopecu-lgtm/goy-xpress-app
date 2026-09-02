const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  calculateCourierWait,
  calculateDepositPrice,
  monthlyCycleKey,
  canReleaseCourierFunds,
  createRecurringTemplate,
} = require('../src/logisticsRules');
const {
  calculateDeliveryPrice,
  calculateExecutivePrice,
  calculateCollectTotal,
} = require('../src/domain');

function envConfig() {
  return {
    port: Number(process.env.PORT || 8787),
    adminEmail: String(process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
    adminPassword: String(process.env.ADMIN_PASSWORD || ''),
    tokenSecret: String(process.env.TOKEN_SECRET || ''),
    allowedOrigin: String(process.env.ALLOWED_ORIGIN || '*'),
    databaseUrl: String(process.env.DATABASE_URL || ''),
    dataFile: process.env.DATA_FILE || path.join(__dirname, 'data-v5.json'),
    googleMapsApiKey: String(process.env.GOOGLE_MAPS_API_KEY || ''),
  };
}

function emptyData() {
  return {
    users: [],
    clients: [],
    couriers: [],
    requests: [],
    payments: [],
    invites: [],
    templates: [],
    walletEntries: [],
    monthlyArchives: [],
  };
}

function normalizeData(value) {
  const base = {...emptyData(), ...(value || {})};
  for (const key of Object.keys(emptyData())) {
    if (!Array.isArray(base[key])) base[key] = [];
  }
  return base;
}

function createMemoryStore(initial = {}) {
  let value = normalizeData(initial);
  return {
    async read() {
      return JSON.parse(JSON.stringify(value));
    },
    async write(next) {
      value = normalizeData(JSON.parse(JSON.stringify(next)));
    },
  };
}

function createPersistentStore(config) {
  let sqlClient = null;
  let dbReady = false;

  async function getSql() {
    if (!config.databaseUrl) return null;
    if (!sqlClient) {
      const {neon} = require('@neondatabase/serverless');
      sqlClient = neon(config.databaseUrl);
    }
    if (!dbReady) {
      await sqlClient`CREATE TABLE IF NOT EXISTS goy_state (
        id INTEGER PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await sqlClient`INSERT INTO goy_state (id, data)
        VALUES (1, ${JSON.stringify(emptyData())}::jsonb)
        ON CONFLICT (id) DO NOTHING`;
      dbReady = true;
    }
    return sqlClient;
  }

  return {
    async read() {
      const sql = await getSql();
      if (sql) {
        const rows = await sql`SELECT data FROM goy_state WHERE id = 1 LIMIT 1`;
        return normalizeData(rows[0]?.data || {});
      }
      try {
        if (!fs.existsSync(config.dataFile)) return emptyData();
        return normalizeData(JSON.parse(fs.readFileSync(config.dataFile, 'utf8')));
      } catch (error) {
        console.error('GOY XPRESS storage read error', error);
        return emptyData();
      }
    },
    async write(data) {
      const normalized = normalizeData(data);
      const sql = await getSql();
      if (sql) {
        await sql`UPDATE goy_state
          SET data = ${JSON.stringify(normalized)}::jsonb, updated_at = NOW()
          WHERE id = 1`;
        return;
      }
      const dir = path.dirname(config.dataFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
      const tmp = `${config.dataFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2));
      fs.renameSync(tmp, config.dataFile);
    },
  };
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function signToken(payload, secret) {
  if (!secret) throw new Error('TOKEN_SECRET no configurado');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyToken(token, secret) {
  if (!token || !secret) return null;
  const [body, signature] = String(token).split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function bearerToken(req) {
  const auth = String(req.headers.authorization || '');
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'La contraseña debe incluir letras y números.';
  }
  return '';
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 180000, 64, 'sha512').toString('hex');
  return {salt, hash};
}

function verifyPassword(password, user) {
  if (!user?.passwordSalt || !user?.passwordHash) return false;
  const attempt = hashPassword(password, user.passwordSalt).hash;
  return safeEqual(attempt, user.passwordHash);
}

function validImageDataUrl(value) {
  if (!value) return true;
  const text = String(value);
  if (text.length > 1_800_000) return false;
  return /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(text);
}

function publicUser(user) {
  if (!user) return null;
  const {passwordHash, passwordSalt, ...safe} = user;
  return safe;
}

function userDisplayName(user) {
  return String(user?.businessName || user?.name || user?.email || 'Usuario').trim();
}

function syncUserMirror(data, user) {
  if (user.role === 'client') {
    const item = {
      id: user.id,
      userId: user.id,
      name: user.name,
      businessName: user.businessName,
      whatsapp: user.phone,
      phone: user.phone,
      email: user.email,
      documentId: user.documentId || '',
      address: user.address || '',
      logo: user.logo || '',
      status: user.active === false ? 'Inactivo' : 'Activo',
      registeredAt: user.createdAt,
    };
    const index = data.clients.findIndex(x => x.userId === user.id || x.id === user.id);
    if (index >= 0) data.clients[index] = {...data.clients[index], ...item};
    else data.clients.unshift(item);
  }
  if (user.role === 'courier') {
    const item = {
      id: user.id,
      userId: user.id,
      name: user.name,
      fullName: user.name,
      whatsapp: user.phone,
      phone: user.phone,
      email: user.email,
      photo: user.photo || '',
      approved: Boolean(user.approved),
      active: user.active !== false,
      status: user.active === false ? 'Inactivo' : user.approved ? 'Disponible' : 'Pendiente de aprobación',
      registeredAt: user.createdAt,
    };
    const index = data.couriers.findIndex(x => x.userId === user.id || x.id === user.id);
    if (index >= 0) data.couriers[index] = {...data.couriers[index], ...item};
    else data.couriers.unshift(item);
  }
}

function claimLegacyRequests(data, user) {
  const userPhone = cleanPhone(user.phone);
  const userEmail = normalizeEmail(user.email);
  let changed = false;
  for (const request of data.requests) {
    if (request.clientId) continue;
    const requestPhone = cleanPhone(request.phone || request.whatsapp);
    const requestEmail = normalizeEmail(request.email);
    if ((userPhone && requestPhone && userPhone === requestPhone) || (userEmail && requestEmail && userEmail === requestEmail)) {
      request.clientId = user.id;
      request.clientLogo = user.logo || '';
      request.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  return changed;
}

function json(res, status, body, allowedOrigin = '*') {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Secret',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 5_000_000) throw new Error('Payload demasiado grande');
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('JSON inválido');
  }
}

function publicPath(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = url.pathname.replace(/\/$/, '') || '/';
  if (pathname === '/api') pathname = '/';
  else if (pathname.startsWith('/api/')) pathname = pathname.slice(4);
  return pathname;
}

function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}

function makeSecret() {
  return crypto.randomBytes(24).toString('base64url');
}

function normalizeStatus(value) {
  const map = {'En ruta':'En camino', Entregado:'Entrega finalizada', Finalizado:'Entrega finalizada'};
  const normalized = map[value] || value;
  const allowed = ['Pendiente','Cotizado','Aceptado','Asignado','Recogido','En camino','Entrega finalizada','Cancelado'];
  return allowed.includes(normalized) ? normalized : 'Pendiente';
}

function appendEvent(request, type, payload = {}) {
  request.events = Array.isArray(request.events) ? request.events : [];
  request.events.unshift({id:crypto.randomUUID(), type, ...payload, at:new Date().toISOString()});
  request.updatedAt = new Date().toISOString();
}

function sanitizeRequest(request) {
  const copy = {...request};
  delete copy.accessSecretHash;
  delete copy.clientAccessHash;
  delete copy.courierAccessHash;
  return copy;
}

function findRequest(data, code) {
  return data.requests.findIndex(item => item.code === code || item.id === code);
}

function currentCycleRequests(data, cycle = monthlyCycleKey(new Date())) {
  return data.requests.filter(item => (item.cycleKey || monthlyCycleKey(item.createdAt || new Date())) === cycle);
}

function getUserFromRequest(req, data, config, role) {
  const payload = verifyToken(bearerToken(req), config.tokenSecret);
  if (!payload || !payload.userId || !payload.role) return null;
  if (role && payload.role !== role) return null;
  const user = data.users.find(item => item.id === payload.userId && item.role === payload.role);
  if (!user || user.active === false) return null;
  return user;
}

function requireAdmin(req, res, config) {
  const payload = verifyToken(bearerToken(req), config.tokenSecret);
  if (!payload || payload.role !== 'admin') {
    json(res, 401, {error:'No autorizado'}, config.allowedOrigin);
    return null;
  }
  return payload;
}

function requireUser(req, res, data, config, role) {
  const user = getUserFromRequest(req, data, config, role);
  if (!user) {
    json(res, 401, {error:'Inicia sesión para continuar.'}, config.allowedOrigin);
    return null;
  }
  return user;
}

function secretFrom(req) {
  return String(req.headers['x-request-secret'] || '');
}

function legacyClientAllowed(req, request) {
  const secret = secretFrom(req);
  const hash = request.clientAccessHash || request.accessSecretHash;
  return Boolean(secret && hash && safeEqual(hashSecret(secret), hash));
}

function legacyCourierAllowed(req, request) {
  const secret = secretFrom(req);
  return Boolean(secret && request.courierAccessHash && safeEqual(hashSecret(secret), request.courierAccessHash));
}

function clientAllowed(req, request, data, config) {
  const user = getUserFromRequest(req, data, config, 'client');
  return Boolean((user && request.clientId === user.id) || legacyClientAllowed(req, request));
}

function courierAllowed(req, request, data, config) {
  const user = getUserFromRequest(req, data, config, 'courier');
  return Boolean((user && user.approved && request.courierId === user.id) || legacyCourierAllowed(req, request));
}

function normalizeAddress(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/ecuador/i.test(text)) return text;
  return `${text}, Ecuador`;
}

function mapUrlFor(origin, destination) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

async function computeGoogleRoute(originValue, destinationValue, config, mapsFetch = globalThis.fetch) {
  const origin = normalizeAddress(originValue);
  const destination = normalizeAddress(destinationValue);
  if (origin.length < 4 || destination.length < 4) {
    const error = new Error('Ingresa direcciones completas de retiro y entrega.');
    error.status = 400;
    throw error;
  }
  if (!config.googleMapsApiKey) {
    const error = new Error('Google Maps aún no está configurado en el servidor.');
    error.status = 503;
    error.code = 'MAPS_NOT_CONFIGURED';
    throw error;
  }
  if (typeof mapsFetch !== 'function') {
    const error = new Error('Servicio de mapas no disponible.');
    error.status = 503;
    throw error;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 9000) : null;
  let response;
  try {
    response = await mapsFetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'X-Goog-Api-Key':config.googleMapsApiKey,
        'X-Goog-FieldMask':'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      },
      body:JSON.stringify({
        origin:{address:origin},
        destination:{address:destination},
        travelMode:'DRIVE',
        routingPreference:'TRAFFIC_AWARE',
        languageCode:'es-419',
        units:'METRIC',
      }),
      signal:controller?.signal,
    });
  } catch (error) {
    const wrapped = new Error(error?.name === 'AbortError' ? 'Google Maps tardó demasiado en responder.' : 'No se pudo consultar Google Maps.');
    wrapped.status = 502;
    throw wrapped;
  } finally {
    if (timer) clearTimeout(timer);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Google Maps no pudo calcular la ruta.');
    error.status = 502;
    throw error;
  }
  const route = payload.routes?.[0];
  if (!route || !Number.isFinite(Number(route.distanceMeters))) {
    const error = new Error('No se encontró una ruta vehicular válida entre las direcciones.');
    error.status = 422;
    throw error;
  }
  const distanceMeters = Number(route.distanceMeters);
  const durationSeconds = Number(String(route.duration || '0s').replace('s','')) || 0;
  return {
    provider:'google_routes',
    distanceMeters,
    distanceKm:Math.round((distanceMeters/1000)*100)/100,
    durationMinutes:Math.max(1,Math.ceil(durationSeconds/60)),
    encodedPolyline:route.polyline?.encodedPolyline || '',
    mapUrl:mapUrlFor(originValue,destinationValue),
    calculatedAt:new Date().toISOString(),
  };
}

function createUserFromBody(role, body) {
  const email = normalizeEmail(body.email);
  const phone = cleanPhone(body.phone || body.whatsapp);
  const passwordError = validatePassword(body.password);
  if (!validEmail(email)) { const error=new Error('Ingresa un correo electrónico válido.'); error.status=400; throw error; }
  if (phone.length < 9) { const error=new Error('Ingresa un número de WhatsApp válido.'); error.status=400; throw error; }
  if (passwordError) { const error=new Error(passwordError); error.status=400; throw error; }
  const name = String(body.name || '').trim();
  if (name.length < 2) { const error=new Error('Ingresa tu nombre completo.'); error.status=400; throw error; }
  const image = role === 'client' ? body.logo : body.photo;
  if (!validImageDataUrl(image)) { const error=new Error('La imagen de perfil no es válida o es demasiado grande.'); error.status=400; throw error; }
  const passwordRecord = hashPassword(body.password);
  const createdAt = new Date().toISOString();
  return {
    id:crypto.randomUUID(), role, name,
    businessName:role==='client'?String(body.businessName||body.companyName||'').trim():'',
    email, phone,
    documentId:role==='client'?String(body.documentId||'').trim():'',
    address:role==='client'?String(body.address||'').trim():'',
    logo:role==='client'?String(body.logo||''):'',
    photo:role==='courier'?String(body.photo||''):'',
    approved:role==='courier'?false:true,
    active:true,
    passwordSalt:passwordRecord.salt,
    passwordHash:passwordRecord.hash,
    createdAt,
    updatedAt:createdAt,
  };
}

function makeSession(user, config) {
  const expiresIn = 30*24*60*60;
  return {token:signToken({role:user.role,userId:user.id,exp:Date.now()+expiresIn*1000},config.tokenSecret),expiresIn,user:publicUser(user)};
}

async function buildClientRequest(body, user, config, mapsFetch) {
  const kind = String(body.kind || '').trim();
  if (!['shipment','procedure','deposit','diverse'].includes(kind)) { const error=new Error('Tipo de servicio no válido.'); error.status=400; throw error; }
  const createdAt = body.createdAt || new Date().toISOString();
  const code = String(body.code || `GOY-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`);
  const request = {
    ...body, code, kind, customer:userDisplayName(user), phone:user.phone, email:user.email,
    clientId:user.id, clientLogo:user.logo||'', status:'Pendiente', cycleKey:monthlyCycleKey(createdAt),
    courier:null,courierId:null,courierStage:null,
    wait:{freeMinutes:10,elapsedMinutes:0,extraMinutes:0,extraCost:0,decision:null},
    evidence:{},gps:{last:null,history:[]},wallet:{collected:0,depositPhoto:null,released:true},events:[],createdAt,updatedAt:new Date().toISOString(),
  };
  if (kind === 'shipment') {
    const route = await computeGoogleRoute(body.originAddress,body.destinationAddress,config,mapsFetch);
    const mode = body.deliveryMode === 'express' ? 'express' : 'scheduled';
    const pricing = calculateDeliveryPrice(mode,route.distanceKm);
    if (!pricing?.eligible) { const error=new Error('La ruta está fuera de la cobertura configurada para este servicio.'); error.status=422; throw error; }
    request.deliveryMode=mode; request.route=route; request.distanceKm=route.distanceKm;
    request.baseServiceCost=Number(pricing.total||0); request.serviceCost=Number(pricing.total||0);
    request.productValue=Math.max(0,Number(body.productValue||0)); request.cashOnDelivery=Boolean(body.cashOnDelivery);
    request.deliveryPayer=body.deliveryPayer==='sender'?'sender':'recipient';
    request.totalToCollect=calculateCollectTotal({productValue:request.productValue,deliveryCost:request.serviceCost,cashOnDelivery:request.cashOnDelivery,deliveryPayer:request.deliveryPayer});
    request.wallet={collected:Number(request.totalToCollect||0),depositPhoto:null,released:Number(request.totalToCollect||0)===0};
  } else if (kind === 'procedure') {
    const pricing=calculateExecutivePrice(body.waitMinutes||40); request.waitMinutes=pricing.requestedMinutes; request.baseServiceCost=Number(pricing.total||0); request.serviceCost=Number(pricing.total||0); request.totalToCollect=0;
  } else if (kind === 'deposit') {
    const deposit=calculateDepositPrice({checkCount:body.checkCount,cashAmount:body.cashAmount,method:body.depositMethod});
    if(!deposit.valid){const error=new Error(deposit.error);error.status=400;throw error;}
    request.depositPricing=deposit;request.baseServiceCost=deposit.total;request.serviceCost=deposit.total;request.totalToCollect=0;
  } else {
    request.baseServiceCost=0;request.serviceCost=0;request.totalToCollect=0;request.quote={status:'Pendiente de cotización',amount:null,acceptedAt:null};
  }
  appendEvent(request,'request_created',{cycleKey:request.cycleKey,clientId:user.id});
  return request;
}

function courierSummary(data,user){const jobs=data.requests.filter(r=>r.courierId===user.id&&!['Entrega finalizada','Cancelado'].includes(normalizeStatus(r.status))).length;return {...publicUser(user),jobs,status:user.active===false?'Inactivo':!user.approved?'Pendiente de aprobación':jobs>0?'En operación':'Disponible'};}
function clientSummary(user){return {...publicUser(user),status:user.active===false?'Inactivo':'Activo'};}

function createHandler(options = {}) {
  const config={...envConfig(),...(options.config||{})};
  const store=options.store||createPersistentStore(config);
  const mapsFetch=options.mapsFetch||globalThis.fetch;
  return async function handler(req,res){
    if(req.method==='OPTIONS')return json(res,204,{},config.allowedOrigin);
    const pathname=publicPath(req);
    try{
      if(req.method==='GET'&&pathname==='/health')return json(res,200,{ok:true,service:'goy-xpress-api',version:'5.0.0-accounts-maps',storage:config.databaseUrl?'postgres':'local',mapsConfigured:Boolean(config.googleMapsApiKey),auth:'client-courier-accounts'},config.allowedOrigin);
      if(req.method==='POST'&&pathname==='/admin/login'){
        const body=await readBody(req);if(!config.adminEmail||!config.adminPassword||!config.tokenSecret)return json(res,503,{error:'Servidor administrativo sin configurar.'},config.allowedOrigin);
        if(!safeEqual(normalizeEmail(body.email),config.adminEmail)||!safeEqual(String(body.password||''),config.adminPassword))return json(res,401,{error:'Usuario o contraseña incorrectos.'},config.allowedOrigin);
        const expiresIn=8*60*60;return json(res,200,{token:signToken({role:'admin',exp:Date.now()+expiresIn*1000},config.tokenSecret),expiresIn},config.allowedOrigin);
      }
      if(req.method==='GET'&&pathname==='/admin/data'){
        if(!requireAdmin(req,res,config))return;const data=await store.read();const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);const cycle=url.searchParams.get('cycle')||monthlyCycleKey(new Date());
        return json(res,200,{clients:data.users.filter(u=>u.role==='client').map(clientSummary),couriers:data.users.filter(u=>u.role==='courier').map(u=>courierSummary(data,u)),requests:currentCycleRequests(data,cycle).map(sanitizeRequest),payments:data.payments,invites:data.invites,templates:data.templates,walletEntries:data.walletEntries,monthlyArchives:data.monthlyArchives,activeCycle:cycle,availableCycles:[...new Set(data.requests.map(r=>r.cycleKey||monthlyCycleKey(r.createdAt||new Date())))].sort().reverse()},config.allowedOrigin);
      }
      if(req.method==='POST'&&pathname==='/admin/clients'){
        if(!requireAdmin(req,res,config))return;
        const body=await readBody(req);
        const data=await store.read();
        const email=normalizeEmail(body.email);
        if(data.users.some(user=>normalizeEmail(user.email)===email)){
          return json(res,409,{error:'Este correo ya está registrado.'},config.allowedOrigin);
        }
        const user=createUserFromBody('client',body);
        user.approved=true;
        user.active=true;
        user.registrationSource='admin';
        data.users.unshift(user);
        syncUserMirror(data,user);
        claimLegacyRequests(data,user);
        await store.write(data);
        return json(res,201,{user:clientSummary(user),message:'Cliente creado y habilitado para ingresar.'},config.allowedOrigin);
      }
      if(req.method==='POST'&&pathname==='/admin/invites'){
        if(!requireAdmin(req,res,config))return;const body=await readBody(req);const data=await store.read();const invite={token:crypto.randomBytes(18).toString('base64url'),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+7*24*60*60*1000).toISOString(),usedAt:null,label:String(body.label||'').trim(),email:normalizeEmail(body.email),whatsapp:String(body.whatsapp||body.phone||'').trim()};data.invites.unshift(invite);await store.write(data);return json(res,201,invite,config.allowedOrigin);
      }
      const approveMatch=pathname.match(/^\/admin\/couriers\/([^/]+)\/approve$/);
      if(req.method==='POST'&&approveMatch){
        if(!requireAdmin(req,res,config))return;const courierId=decodeURIComponent(approveMatch[1]);const body=await readBody(req);const data=await store.read();const user=data.users.find(u=>u.id===courierId&&u.role==='courier');if(!user)return json(res,404,{error:'Mensajero no encontrado.'},config.allowedOrigin);user.approved=body.approved!==false;if(Object.prototype.hasOwnProperty.call(body,'active'))user.active=Boolean(body.active);user.updatedAt=new Date().toISOString();syncUserMirror(data,user);await store.write(data);return json(res,200,{user:courierSummary(data,user)},config.allowedOrigin);
      }
      if(req.method==='PATCH'&&pathname.startsWith('/admin/requests/')){
        if(!requireAdmin(req,res,config))return;const code=decodeURIComponent(pathname.slice('/admin/requests/'.length));const body=await readBody(req);const data=await store.read();const index=findRequest(data,code);if(index<0)return json(res,404,{error:'Solicitud no encontrada.'},config.allowedOrigin);const current=data.requests[index],patch={};let legacyCourierAccess=null;
        if(body.status)patch.status=normalizeStatus(body.status);
        if(body.courierId){const courier=data.users.find(u=>u.id===String(body.courierId)&&u.role==='courier');if(!courier||courier.active===false||!courier.approved)return json(res,400,{error:'Selecciona un mensajero registrado y aprobado.'},config.allowedOrigin);patch.courierId=courier.id;patch.courier=userDisplayName(courier);patch.courierPhoto=courier.photo||'';patch.status='Asignado';patch.courierAccessHash=null;}
        else if(Object.prototype.hasOwnProperty.call(body,'courier')){patch.courier=String(body.courier||'').trim()||null;if(!patch.courier){patch.courierId=null;patch.courierPhoto='';patch.courierAccessHash=null;}}
        if(body.issueCourierAccess&&!body.courierId){if(!(patch.courier||current.courier))return json(res,400,{error:'Selecciona un mensajero antes de emitir acceso.'},config.allowedOrigin);legacyCourierAccess=makeSecret();patch.courierAccessHash=hashSecret(legacyCourierAccess);patch.status='Asignado';}
        if(body.kind)patch.kind=String(body.kind);if(body.serviceLabel)patch.serviceLabel=String(body.serviceLabel).trim();
        if(body.serviceCost!==undefined){const newCost=Math.max(0,Number(body.serviceCost||0));patch.serviceCost=Math.round(newCost*100)/100;patch.tariffAdjustment={previousCost:Number(current.serviceCost||0),newCost:patch.serviceCost,reason:String(body.reason||'Reajuste administrativo').trim(),adjustedAt:new Date().toISOString()};}
        if(body.quote)patch.quote={...(current.quote||{}),...body.quote,updatedAt:new Date().toISOString()};if(body.wallet)patch.wallet={...(current.wallet||{}),...body.wallet,updatedAt:new Date().toISOString()};if(body.adminNotes!==undefined)patch.adminNotes=String(body.adminNotes||'').trim();
        data.requests[index]={...current,...patch,updatedAt:new Date().toISOString()};appendEvent(data.requests[index],'admin_update',{fields:Object.keys(patch)});await store.write(data);return json(res,200,{request:sanitizeRequest(data.requests[index]),courierAccess:legacyCourierAccess},config.allowedOrigin);
      }
      if(req.method==='POST'&&pathname.startsWith('/admin/requests/')&&pathname.endsWith('/template')){if(!requireAdmin(req,res,config))return;const code=decodeURIComponent(pathname.slice('/admin/requests/'.length,-'/template'.length));const body=await readBody(req);const data=await store.read();const index=findRequest(data,code);if(index<0)return json(res,404,{error:'Solicitud no encontrada.'},config.allowedOrigin);const template=createRecurringTemplate(data.requests[index],body.name);data.templates.unshift(template);await store.write(data);return json(res,201,template,config.allowedOrigin);}
      if(req.method==='POST'&&pathname.startsWith('/admin/requests/')&&pathname.endsWith('/release-wallet')){if(!requireAdmin(req,res,config))return;const code=decodeURIComponent(pathname.slice('/admin/requests/'.length,-'/release-wallet'.length));const data=await store.read();const index=findRequest(data,code);if(index<0)return json(res,404,{error:'Solicitud no encontrada.'},config.allowedOrigin);const request=data.requests[index];if(!canReleaseCourierFunds(request))return json(res,409,{error:'Se requiere entrega finalizada y foto del depósito para liberar valores.'},config.allowedOrigin);request.wallet={...(request.wallet||{}),released:true,releasedAt:new Date().toISOString()};appendEvent(request,'wallet_released');await store.write(data);return json(res,200,sanitizeRequest(request),config.allowedOrigin);}
      if(req.method==='POST'&&(pathname==='/auth/client/register'||pathname==='/auth/courier/register')){
        if(!config.tokenSecret)return json(res,503,{error:'Autenticación del servidor sin configurar.'},config.allowedOrigin);const role=pathname.includes('/courier/')?'courier':'client';const body=await readBody(req);const data=await store.read();const email=normalizeEmail(body.email);if(data.users.some(u=>normalizeEmail(u.email)===email))return json(res,409,{error:'Este correo ya está registrado. Inicia sesión.'},config.allowedOrigin);const user=createUserFromBody(role,body);data.users.unshift(user);syncUserMirror(data,user);if(role==='client')claimLegacyRequests(data,user);await store.write(data);return json(res,201,makeSession(user,config),config.allowedOrigin);
      }
      if(req.method==='POST'&&pathname==='/auth/login'){
        if(!config.tokenSecret)return json(res,503,{error:'Autenticación del servidor sin configurar.'},config.allowedOrigin);const body=await readBody(req);const email=normalizeEmail(body.email);const role=body.role==='courier'?'courier':'client';const data=await store.read();const user=data.users.find(u=>u.role===role&&normalizeEmail(u.email)===email);if(!user||user.active===false||!verifyPassword(body.password,user))return json(res,401,{error:'Correo o contraseña incorrectos.'},config.allowedOrigin);if(role==='client'&&claimLegacyRequests(data,user))await store.write(data);return json(res,200,makeSession(user,config),config.allowedOrigin);
      }
      if(pathname==='/me'&&req.method==='GET'){const data=await store.read();const user=requireUser(req,res,data,config);if(!user)return;return json(res,200,{user:publicUser(user)},config.allowedOrigin);}
      if(pathname==='/me'&&req.method==='PATCH'){
        const body=await readBody(req),data=await store.read(),user=requireUser(req,res,data,config);if(!user)return;const allowed=['name','phone'];if(user.role==='client')allowed.push('businessName','documentId','address','logo');if(user.role==='courier')allowed.push('photo');for(const key of allowed){if(!Object.prototype.hasOwnProperty.call(body,key))continue;if((key==='logo'||key==='photo')&&!validImageDataUrl(body[key]))return json(res,400,{error:'La imagen no es válida o es demasiado grande.'},config.allowedOrigin);user[key]=String(body[key]||'').trim();}if(cleanPhone(user.phone).length<9)return json(res,400,{error:'WhatsApp inválido.'},config.allowedOrigin);user.phone=cleanPhone(user.phone);user.updatedAt=new Date().toISOString();syncUserMirror(data,user);for(const request of data.requests){if(request.clientId===user.id){request.customer=userDisplayName(user);request.phone=user.phone;request.clientLogo=user.logo||'';}if(request.courierId===user.id){request.courier=userDisplayName(user);request.courierPhoto=user.photo||'';}}await store.write(data);return json(res,200,{user:publicUser(user)},config.allowedOrigin);
      }
      if(req.method==='POST'&&pathname==='/maps/route'){const body=await readBody(req),data=await store.read(),user=requireUser(req,res,data,config,'client');if(!user)return;const route=await computeGoogleRoute(body.origin,body.destination,config,mapsFetch);const mode=body.mode==='express'?'express':'scheduled';const pricing=calculateDeliveryPrice(mode,route.distanceKm);return json(res,200,{route,pricing:{eligible:Boolean(pricing?.eligible),total:Number(pricing?.total||0),mode}},config.allowedOrigin);}
      if(req.method==='GET'&&pathname==='/client/requests'){const data=await store.read(),user=requireUser(req,res,data,config,'client');if(!user)return;return json(res,200,{requests:data.requests.filter(r=>r.clientId===user.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).map(sanitizeRequest)},config.allowedOrigin);}
      if(req.method==='POST'&&pathname==='/client/requests'){const body=await readBody(req),data=await store.read(),user=requireUser(req,res,data,config,'client');if(!user)return;const existing=body.code?data.requests.find(r=>r.code===body.code&&r.clientId===user.id):null;if(existing)return json(res,200,{request:sanitizeRequest(existing),duplicate:true},config.allowedOrigin);const request=await buildClientRequest(body,user,config,mapsFetch);data.requests.unshift(request);await store.write(data);return json(res,201,{request:sanitizeRequest(request)},config.allowedOrigin);}
      if(req.method==='GET'&&pathname==='/courier/jobs'){const data=await store.read(),user=requireUser(req,res,data,config,'courier');if(!user)return;if(!user.approved)return json(res,403,{error:'Tu cuenta de mensajero está pendiente de aprobación administrativa.',pendingApproval:true},config.allowedOrigin);return json(res,200,{jobs:data.requests.filter(r=>r.courierId===user.id).sort((a,b)=>String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt))).map(sanitizeRequest)},config.allowedOrigin);}
      const courierJobMatch=pathname.match(/^\/courier\/jobs\/([^/]+)$/);if(req.method==='GET'&&courierJobMatch){const code=decodeURIComponent(courierJobMatch[1]),data=await store.read(),user=requireUser(req,res,data,config,'courier');if(!user)return;if(!user.approved)return json(res,403,{error:'Cuenta pendiente de aprobación.'},config.allowedOrigin);const request=data.requests.find(r=>(r.code===code||r.id===code)&&r.courierId===user.id);if(!request)return json(res,404,{error:'Operación no asignada a tu cuenta.'},config.allowedOrigin);return json(res,200,{request:sanitizeRequest(request)},config.allowedOrigin);}
      if(req.method==='POST'&&pathname==='/requests')return json(res,401,{error:'Registro e inicio de sesión requeridos. Actualiza la app GOY XPRESS.'},config.allowedOrigin);
      if(req.method==='GET'&&pathname==='/request-status'){const url=new URL(req.url,`http://${req.headers.host||'localhost'}`),code=String(url.searchParams.get('code')||''),data=await store.read(),index=findRequest(data,code);if(index<0)return json(res,404,{error:'Solicitud no encontrada.'},config.allowedOrigin);const request=data.requests[index];if(!clientAllowed(req,request,data,config)&&!courierAllowed(req,request,data,config))return json(res,401,{error:'Acceso a solicitud no autorizado.'},config.allowedOrigin);return json(res,200,{request:sanitizeRequest(request)},config.allowedOrigin);}
      const actionMatch=pathname.match(/^\/requests\/([^/]+)\/(pickup|location|wait|wait-decision|delivery|deposit-evidence|quote-response)$/);
      if(req.method==='POST'&&actionMatch){
        const [,rawCode,action]=actionMatch,code=decodeURIComponent(rawCode),body=await readBody(req),data=await store.read(),index=findRequest(data,code);if(index<0)return json(res,404,{error:'Solicitud no encontrada.'},config.allowedOrigin);const request=data.requests[index];
        if(action==='quote-response'){if(!clientAllowed(req,request,data,config))return json(res,403,{error:'Esta acción pertenece al cliente registrado.'},config.allowedOrigin);if(!['accepted','rejected'].includes(body.response))return json(res,400,{error:'Respuesta inválida.'},config.allowedOrigin);if(!request.quote?.amount)return json(res,409,{error:'El administrador todavía no ha cotizado este servicio.'},config.allowedOrigin);request.quote={...request.quote,status:body.response==='accepted'?'Aceptado':'Rechazado',acceptedAt:body.response==='accepted'?new Date().toISOString():null};request.status=body.response==='accepted'?'Aceptado':'Cancelado';if(body.response==='accepted')request.serviceCost=Number(request.quote.amount);appendEvent(request,'quote_response',{response:body.response});}
        else{if(!courierAllowed(req,request,data,config))return json(res,403,{error:'Operación reservada al mensajero registrado y asignado.'},config.allowedOrigin);if(action==='pickup'){if(!body.photo||!validImageDataUrl(body.photo))return json(res,400,{error:'La foto de recogida es obligatoria.'},config.allowedOrigin);request.status='Recogido';request.courierStage='Recogido';request.evidence={...(request.evidence||{}),pickupPhoto:body.photo};appendEvent(request,'pickup',{note:String(body.note||'')});}else if(action==='location'){const latitude=Number(body.latitude),longitude=Number(body.longitude);if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return json(res,400,{error:'Ubicación inválida.'},config.allowedOrigin);if(request.status==='Recogido'||request.status==='Asignado')request.status='En camino';request.courierStage='En camino';request.gps=request.gps||{last:null,history:[]};request.gps.last={latitude,longitude,accuracy:Number(body.accuracy||0),at:new Date().toISOString()};request.gps.history=Array.isArray(request.gps.history)?request.gps.history.slice(-99):[];request.gps.history.push(request.gps.last);appendEvent(request,'location');}else if(action==='wait'){const wait=calculateCourierWait(body.elapsedMinutes);request.wait={...(request.wait||{}),...wait};request.serviceCost=Math.round((Number(request.baseServiceCost??request.serviceCost??0)+wait.extraCost)*100)/100;appendEvent(request,'wait_updated',{elapsedMinutes:wait.elapsedMinutes,extraCost:wait.extraCost});}else if(action==='wait-decision'){if(!['withdraw','continue'].includes(body.decision))return json(res,400,{error:'Decisión inválida.'},config.allowedOrigin);request.wait={...(request.wait||{}),decision:body.decision,decisionAt:new Date().toISOString()};appendEvent(request,'wait_decision',{decision:body.decision});}else if(action==='delivery'){if(!body.photo||!validImageDataUrl(body.photo))return json(res,400,{error:'La foto de entrega es obligatoria.'},config.allowedOrigin);request.status='Entrega finalizada';request.courierStage='Entrega finalizada';request.finishedAt=new Date().toISOString();request.evidence={...(request.evidence||{}),deliveryPhoto:body.photo};appendEvent(request,'delivery',{note:String(body.note||'')});}else if(action==='deposit-evidence'){if(!body.photo||!validImageDataUrl(body.photo))return json(res,400,{error:'La fotografía del depósito es obligatoria.'},config.allowedOrigin);const amount=Math.max(0,Number(body.amount||request.totalToCollect||0));request.wallet={...(request.wallet||{}),depositPhoto:body.photo,depositedAmount:amount,depositedAt:new Date().toISOString()};request.evidence={...(request.evidence||{}),depositPhoto:body.photo};appendEvent(request,'deposit_evidence',{amount});}}
        await store.write(data);return json(res,200,sanitizeRequest(request),config.allowedOrigin);
      }
      const inviteMatch=pathname.match(/^\/invite\/([^/]+)$/);
      if(inviteMatch&&req.method==='GET'){const token=decodeURIComponent(inviteMatch[1]),data=await store.read(),invite=data.invites.find(i=>i.token===token);if(!invite||invite.usedAt||new Date(invite.expiresAt).getTime()<Date.now())return json(res,404,{error:'Invitación inválida o vencida.'},config.allowedOrigin);return json(res,200,{label:invite.label,email:invite.email,whatsapp:invite.whatsapp,expiresAt:invite.expiresAt},config.allowedOrigin);}
      if(inviteMatch&&req.method==='POST'){if(!config.tokenSecret)return json(res,503,{error:'Autenticación del servidor sin configurar.'},config.allowedOrigin);const token=decodeURIComponent(inviteMatch[1]),body=await readBody(req),data=await store.read(),invite=data.invites.find(i=>i.token===token);if(!invite||invite.usedAt||new Date(invite.expiresAt).getTime()<Date.now())return json(res,404,{error:'Invitación inválida o vencida.'},config.allowedOrigin);const registration={...body,email:body.email||invite.email,phone:body.whatsapp||body.phone||invite.whatsapp,businessName:body.businessName||invite.label};const email=normalizeEmail(registration.email);if(data.users.some(u=>normalizeEmail(u.email)===email))return json(res,409,{error:'Este correo ya tiene una cuenta. Inicia sesión desde la app.'},config.allowedOrigin);const user=createUserFromBody('client',registration);data.users.unshift(user);syncUserMirror(data,user);invite.usedAt=new Date().toISOString();await store.write(data);return json(res,201,{ok:true,user:publicUser(user)},config.allowedOrigin);}
      return json(res,404,{error:'Ruta no encontrada.'},config.allowedOrigin);
    }catch(error){console.error('GOY XPRESS API v5',error);const status=Number(error.status||500);return json(res,status>=400&&status<600?status:500,{error:error.message||'Error interno del servidor.',...(error.code?{code:error.code}:{})},config.allowedOrigin);}
  };
}

const defaultHandler=createHandler();
defaultHandler.createHandler=createHandler;
defaultHandler.createMemoryStore=createMemoryStore;
defaultHandler.computeGoogleRoute=computeGoogleRoute;
defaultHandler.emptyData=emptyData;
module.exports=defaultHandler;
if(require.main===module){const config=envConfig();http.createServer(defaultHandler).listen(config.port,()=>console.log(`GOY XPRESS API v5 en http://localhost:${config.port}`));}
