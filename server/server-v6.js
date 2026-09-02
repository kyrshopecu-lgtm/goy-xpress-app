const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const v5 = require('./server-v5');

function cfg() {
  return {
    databaseUrl: String(process.env.DATABASE_URL || ''),
    tokenSecret: String(process.env.TOKEN_SECRET || ''),
    allowedOrigin: String(process.env.ALLOWED_ORIGIN || '*'),
    dataFile: process.env.DATA_FILE || path.join(__dirname, 'data-v5.json'),
  };
}

function cleanData(value) {
  const data = value && typeof value === 'object' ? value : {};
  for (const key of ['users','clients','couriers','requests','payments','invites','templates','walletEntries','monthlyArchives']) {
    if (!Array.isArray(data[key])) data[key] = [];
  }
  return data;
}

let sqlClient;
async function readState(config) {
  if (config.databaseUrl) {
    if (!sqlClient) {
      const {neon} = require('@neondatabase/serverless');
      sqlClient = neon(config.databaseUrl);
    }
    await sqlClient`CREATE TABLE IF NOT EXISTS goy_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await sqlClient`INSERT INTO goy_state (id,data) VALUES (1,${JSON.stringify(cleanData({}))}::jsonb) ON CONFLICT (id) DO NOTHING`;
    const rows = await sqlClient`SELECT data FROM goy_state WHERE id=1 LIMIT 1`;
    return cleanData(rows[0]?.data || {});
  }
  try {
    if (!fs.existsSync(config.dataFile)) return cleanData({});
    return cleanData(JSON.parse(fs.readFileSync(config.dataFile,'utf8')));
  } catch {
    return cleanData({});
  }
}

async function writeState(config,data) {
  const normalized = cleanData(data);
  if (config.databaseUrl) {
    if (!sqlClient) {
      const {neon} = require('@neondatabase/serverless');
      sqlClient = neon(config.databaseUrl);
    }
    await sqlClient`UPDATE goy_state SET data=${JSON.stringify(normalized)}::jsonb, updated_at=NOW() WHERE id=1`;
    return;
  }
  const dir = path.dirname(config.dataFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(config.dataFile,JSON.stringify(normalized,null,2));
}

function safeEqual(a,b) {
  const x=Buffer.from(String(a)); const y=Buffer.from(String(b));
  return x.length===y.length && crypto.timingSafeEqual(x,y);
}
function normalizeEmail(v){return String(v||'').trim().toLowerCase();}
function normalizeUsername(v){return String(v||'').trim().toLowerCase();}
function cleanPhone(v){return String(v||'').replace(/\D/g,'');}
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(v));}
function validatePassword(v){const p=String(v||'');if(p.length<8)return 'La contraseña debe tener al menos 8 caracteres.';if(!/[A-Za-z]/.test(p)||!(/\d/.test(p)))return 'La contraseña debe incluir letras y números.';return '';}
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){return {salt,hash:crypto.pbkdf2Sync(String(password),salt,180000,64,'sha512').toString('hex')};}
function verifyPassword(password,user){if(!user?.passwordSalt||!user?.passwordHash)return false;return safeEqual(hashPassword(password,user.passwordSalt).hash,user.passwordHash);}
function validImage(v){if(!v)return true;const t=String(v);return t.length<=1800000&&/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(t);}
function publicUser(user){if(!user)return null;const {passwordHash,passwordSalt,...safe}=user;return safe;}
function signToken(payload,secret){const body=Buffer.from(JSON.stringify(payload)).toString('base64url');const sig=crypto.createHmac('sha256',secret).update(body).digest('base64url');return `${body}.${sig}`;}
function verifyToken(token,secret){if(!token||!secret)return null;const [body,sig]=String(token).split('.');if(!body||!sig)return null;const expected=crypto.createHmac('sha256',secret).update(body).digest('base64url');if(!safeEqual(sig,expected))return null;try{const p=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));if(!p.exp||Date.now()>p.exp)return null;return p;}catch{return null;}}
function bearer(req){const a=String(req.headers.authorization||'');return a.startsWith('Bearer ')?a.slice(7):'';}
function pathname(req){const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);let p=u.pathname.replace(/\/$/,'')||'/';if(p==='/api')p='/';else if(p.startsWith('/api/'))p=p.slice(4);return p;}
function json(res,status,body,origin='*'){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-Request-Secret');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');res.end(JSON.stringify(body));}
async function readBody(req){if(req.body&&typeof req.body==='object')return req.body;let raw='';for await(const c of req){raw+=c;if(raw.length>5000000)throw new Error('Payload demasiado grande');}return raw?JSON.parse(raw):{};}

function createUser(role,body){
  const email=normalizeEmail(body.email),phone=cleanPhone(body.phone||body.whatsapp),name=String(body.name||'').trim();
  const pe=validatePassword(body.password);
  if(!validEmail(email))throw Object.assign(new Error('Ingresa un correo electrónico válido.'),{status:400});
  if(phone.length<9)throw Object.assign(new Error('Ingresa un número de WhatsApp válido.'),{status:400});
  if(name.length<2)throw Object.assign(new Error('Ingresa tu nombre completo.'),{status:400});
  if(pe)throw Object.assign(new Error(pe),{status:400});
  const image=role==='client'?body.logo:body.photo;if(!validImage(image))throw Object.assign(new Error('La imagen de perfil no es válida o es demasiado grande.'),{status:400});
  const pwd=hashPassword(body.password),now=new Date().toISOString();
  return {
    id:crypto.randomUUID(),role,name,
    businessName:role==='client'?String(body.businessName||body.companyName||'').trim():'',
    email,phone,
    documentId:role==='client'?String(body.documentId||'').trim():'',
    address:role==='client'?String(body.address||'').trim():'',
    logo:role==='client'?String(body.logo||''):'',photo:role==='courier'?String(body.photo||''):'',
    approved:false,active:true,passwordSalt:pwd.salt,passwordHash:pwd.hash,createdAt:now,updatedAt:now,
  };
}

function syncMirror(data,user){
  if(user.role==='client'){
    const item={id:user.id,userId:user.id,name:user.name,businessName:user.businessName,username:user.username||'',whatsapp:user.phone,phone:user.phone,email:user.email||'',documentId:user.documentId||'',address:user.address||'',logo:user.logo||'',approved:Boolean(user.approved),active:user.active!==false,status:user.active===false?'Inactivo':user.approved?'Activo':'Pendiente de aprobación',registeredAt:user.createdAt};
    const i=data.clients.findIndex(x=>x.userId===user.id||x.id===user.id);if(i>=0)data.clients[i]={...data.clients[i],...item};else data.clients.unshift(item);
  } else {
    const item={id:user.id,userId:user.id,name:user.name,fullName:user.name,whatsapp:user.phone,phone:user.phone,email:user.email,photo:user.photo||'',approved:Boolean(user.approved),active:user.active!==false,status:user.active===false?'Inactivo':user.approved?'Disponible':'Pendiente de aprobación',registeredAt:user.createdAt};
    const i=data.couriers.findIndex(x=>x.userId===user.id||x.id===user.id);if(i>=0)data.couriers[i]={...data.couriers[i],...item};else data.couriers.unshift(item);
  }
}

function session(user,config){const expiresIn=30*24*60*60;return {token:signToken({role:user.role,userId:user.id,exp:Date.now()+expiresIn*1000},config.tokenSecret),expiresIn,user:publicUser(user),pendingApproval:!user.approved};}

async function handler(req,res){
  const config=cfg(); const p=pathname(req);
  if(req.method==='OPTIONS')return json(res,204,{},config.allowedOrigin);
  try{
    if(req.method==='POST'&&(p==='/auth/client/register'||p==='/auth/courier/register')){
      if(!config.tokenSecret)return json(res,503,{error:'Autenticación del servidor sin configurar.'},config.allowedOrigin);
      const role=p.includes('/courier/')?'courier':'client',body=await readBody(req),data=await readState(config),email=normalizeEmail(body.email);
      if(data.users.some(u=>normalizeEmail(u.email)===email))return json(res,409,{error:'Este correo ya está registrado. Inicia sesión.'},config.allowedOrigin);
      const user=createUser(role,body);data.users.unshift(user);syncMirror(data,user);await writeState(config,data);
      return json(res,201,{...session(user,config),message:'Registro recibido. Tu cuenta debe ser aprobada por el administrador antes de usar la aplicación.'},config.allowedOrigin);
    }
    if(req.method==='POST'&&p==='/auth/login'){
      if(!config.tokenSecret)return json(res,503,{error:'Autenticación del servidor sin configurar.'},config.allowedOrigin);
      const body=await readBody(req),role=body.role==='courier'?'courier':'client',data=await readState(config);
      const identifier=String(body.username||body.email||body.identifier||'').trim().toLowerCase();
      const user=data.users.find(u=>u.role===role&&(normalizeEmail(u.email)===identifier||normalizeUsername(u.username)===identifier));
      if(!user||user.active===false||!verifyPassword(body.password,user))return json(res,401,{error:'Usuario/correo o contraseña incorrectos.'},config.allowedOrigin);
      if(!user.approved)return json(res,403,{error:'Tu cuenta está pendiente de aprobación por el administrador.',pendingApproval:true,user:publicUser(user)},config.allowedOrigin);
      return json(res,200,session(user,config),config.allowedOrigin);
    }
    const approve=p.match(/^\/admin\/(clients|couriers)\/([^/]+)\/approve$/);
    if(req.method==='POST'&&approve){
      const payload=verifyToken(bearer(req),config.tokenSecret);if(!payload||payload.role!=='admin')return json(res,401,{error:'No autorizado'},config.allowedOrigin);
      const role=approve[1]==='clients'?'client':'courier',id=decodeURIComponent(approve[2]),body=await readBody(req),data=await readState(config),user=data.users.find(u=>u.id===id&&u.role===role);
      if(!user)return json(res,404,{error:role==='client'?'Cliente no encontrado.':'Mensajero no encontrado.'},config.allowedOrigin);
      user.approved=body.approved!==false;if(Object.prototype.hasOwnProperty.call(body,'active'))user.active=Boolean(body.active);user.updatedAt=new Date().toISOString();syncMirror(data,user);await writeState(config,data);
      return json(res,200,{user:publicUser(user)},config.allowedOrigin);
    }

    const payload=verifyToken(bearer(req),config.tokenSecret);
    if(payload?.userId&&['client','courier'].includes(payload.role)&&p!=='/me'){
      const data=await readState(config),user=data.users.find(u=>u.id===payload.userId&&u.role===payload.role);
      if(user&&user.active!==false&&!user.approved)return json(res,403,{error:'Tu cuenta está pendiente de aprobación por el administrador.',pendingApproval:true},config.allowedOrigin);
    }
    return v5(req,res);
  }catch(error){console.error('GOY XPRESS API v6',error);return json(res,Number(error.status||500),{error:error.message||'Error interno del servidor.',code:error.code||null},config.allowedOrigin);}
}

handler.createHandler=v5.createHandler;
handler.createMemoryStore=v5.createMemoryStore;
handler.computeGoogleRoute=v5.computeGoogleRoute;
handler.emptyData=v5.emptyData;
module.exports=handler;
