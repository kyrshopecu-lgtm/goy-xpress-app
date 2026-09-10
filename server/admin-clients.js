const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function normalizeEmail(value){return String(value||'').trim().toLowerCase();}
function normalizeUsername(value){return String(value||'').trim().toLowerCase();}
function cleanPhone(value){return String(value||'').replace(/\D/g,'');}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));}
function validUsername(value){return /^[a-z0-9._-]{3,30}$/.test(normalizeUsername(value));}
function validImage(value){if(!value)return true;const t=String(value);return t.length<=1800000&&/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(t);}
function validMapsUrl(value){if(!value)return true;try{const u=new URL(String(value).trim());return /^https?:$/.test(u.protocol)&&/(^|\.)google\.(com|[a-z.]+)$|(^|\.)goo\.gl$|(^|\.)maps\.app\.goo\.gl$/i.test(u.hostname);}catch{return false;}}
function parseMapLocation(value){const text=String(value||'').trim();if(!text)return null;const patterns=[/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,/query=(-?\d{1,2}\.\d+)%?2C(-?\d{1,3}\.\d+)/,/query=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,/q=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/];for(const re of patterns){const m=text.match(re);if(m){const latitude=Number(m[1]),longitude=Number(m[2]);if(Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180)return {latitude,longitude};}}return null;}
function validatePassword(value){const p=String(value||'');if(p.length<8)return 'La contraseña debe tener al menos 8 caracteres.';if(!/[A-Za-z]/.test(p)||!(/\d/.test(p)))return 'La contraseña debe incluir letras y números.';return '';}
function normalizeBankAccounts(value){
  if(value===undefined)return undefined;
  const list=Array.isArray(value)?value:[];
  return list.slice(0,8).map(item=>({
    id:String(item?.id||crypto.randomUUID()),
    bank:String(item?.bank||'').trim().slice(0,80),
    accountType:String(item?.accountType||'').trim().slice(0,40),
    accountNumber:String(item?.accountNumber||'').trim().replace(/\s+/g,'').slice(0,40),
    holderName:String(item?.holderName||'').trim().slice(0,120),
    holderDocument:String(item?.holderDocument||'').trim().slice(0,30),
    notes:String(item?.notes||'').trim().slice(0,180)
  })).filter(x=>x.bank||x.accountNumber||x.holderName);
}
function safeEqual(a,b){const x=Buffer.from(String(a));const y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function verifyToken(token,secret){if(!token||!secret)return null;const [body,sig]=String(token).split('.');if(!body||!sig)return null;const expected=crypto.createHmac('sha256',secret).update(body).digest('base64url');if(!safeEqual(sig,expected))return null;try{const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));if(!payload.exp||Date.now()>payload.exp)return null;return payload;}catch{return null;}}
function bearer(req){const a=String(req.headers?.authorization||'');return a.startsWith('Bearer ')?a.slice(7):'';}
function pathnameOf(req){const u=new URL(req.url,`http://${req.headers?.host||'localhost'}`);let p=u.pathname.replace(/\/$/,'')||'/';if(p==='/api')p='/';else if(p.startsWith('/api/'))p=p.slice(4);return p;}
function json(res,status,body,origin='*'){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-Request-Secret');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');res.end(JSON.stringify(body));}
async function readBody(req){if(req.body&&typeof req.body==='object')return req.body;let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2500000)throw new Error('Payload demasiado grande');}return raw?JSON.parse(raw):{};}
function cleanData(value){const data=value&&typeof value==='object'?value:{};for(const key of ['users','clients','couriers','requests','payments','invites','templates','walletEntries','monthlyArchives'])if(!Array.isArray(data[key]))data[key]=[];return data;}
let sqlClient;
async function readState(config){if(config.databaseUrl){if(!sqlClient){const {neon}=require('@neondatabase/serverless');sqlClient=neon(config.databaseUrl);}await sqlClient`CREATE TABLE IF NOT EXISTS goy_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;await sqlClient`INSERT INTO goy_state (id,data) VALUES (1,${JSON.stringify(cleanData({}))}::jsonb) ON CONFLICT (id) DO NOTHING`;const rows=await sqlClient`SELECT data FROM goy_state WHERE id=1 LIMIT 1`;return cleanData(rows[0]?.data||{});}try{if(!fs.existsSync(config.dataFile))return cleanData({});return cleanData(JSON.parse(fs.readFileSync(config.dataFile,'utf8')));}catch{return cleanData({});}}
async function writeState(config,data){const normalized=cleanData(data);if(config.databaseUrl){if(!sqlClient){const {neon}=require('@neondatabase/serverless');sqlClient=neon(config.databaseUrl);}await sqlClient`UPDATE goy_state SET data=${JSON.stringify(normalized)}::jsonb, updated_at=NOW() WHERE id=1`;return;}const dir=path.dirname(config.dataFile);if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});const tmp=`${config.dataFile}.tmp`;fs.writeFileSync(tmp,JSON.stringify(normalized,null,2));fs.renameSync(tmp,config.dataFile);}
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){return {salt,hash:crypto.pbkdf2Sync(String(password),salt,180000,64,'sha512').toString('hex')};}
function publicUser(user){const {passwordHash,passwordSalt,...safe}=user;return safe;}
function syncClient(data,user){const item={id:user.id,userId:user.id,name:user.name,businessName:user.businessName,username:user.username||'',whatsapp:user.phone,phone:user.phone,email:user.email||'',documentId:user.documentId||'',address:user.address||'',mapUrl:user.mapUrl||'',location:user.location||null,logo:user.logo||'',bankAccounts:Array.isArray(user.bankAccounts)?user.bankAccounts:[],approved:true,active:user.active!==false,status:user.active===false?'Inactivo':'Activo',registeredAt:user.createdAt};const i=data.clients.findIndex(x=>x.userId===user.id||x.id===user.id);if(i>=0)data.clients[i]={...data.clients[i],...item};else data.clients.unshift(item);}
function isActiveStatus(status){const s=String(status||'').trim().toLowerCase();return !['finished','cancelled','entregado','finalizado','cancelado','entrega finalizada'].includes(s);}
function belongsToClient(request,client,user){const ids=[client?.id,client?.userId,user?.id].filter(Boolean).map(String);const requestIds=[request?.clientId,request?.userId,request?.customerId,request?.clientUserId].filter(Boolean).map(String);if(ids.some(id=>requestIds.includes(id)))return true;const phone=cleanPhone(client?.phone||client?.whatsapp||user?.phone);if(phone&&phone===cleanPhone(request?.phone||request?.whatsapp))return true;const email=normalizeEmail(client?.email||user?.email);if(email&&email===normalizeEmail(request?.email))return true;return false;}

function wrap(next, overrides={}){
  return async function handler(req,res){
    const p=pathnameOf(req);
    const match=p.match(/^\/admin\/clients(?:\/([^/]+))?$/);
    if(!match||!['POST','PATCH','DELETE'].includes(req.method))return next(req,res);
    const config={databaseUrl:String(overrides.databaseUrl??process.env.DATABASE_URL??''),tokenSecret:String(overrides.tokenSecret??process.env.TOKEN_SECRET??''),allowedOrigin:String(overrides.allowedOrigin??process.env.ALLOWED_ORIGIN??'*'),dataFile:overrides.dataFile||process.env.DATA_FILE||path.join(__dirname,'data-v5.json')};
    try{
      if(!config.tokenSecret)return json(res,503,{error:'Autenticación del servidor sin configurar.'},config.allowedOrigin);
      const payload=verifyToken(bearer(req),config.tokenSecret);if(!payload||payload.role!=='admin')return json(res,401,{error:'No autorizado'},config.allowedOrigin);
      const data=await readState(config);

      if(req.method==='POST'&&!match[1]){
        const body=await readBody(req);const email=normalizeEmail(body.email),username=normalizeUsername(body.username),phone=cleanPhone(body.phone||body.whatsapp),name=String(body.name||'').trim(),businessName=String(body.businessName||'').trim(),documentId=String(body.documentId||'').trim(),address=String(body.address||'').trim(),mapUrl=String(body.mapUrl||'').trim(),logo=String(body.logo||''),bankAccounts=normalizeBankAccounts(body.bankAccounts)||[];
        if(name.length<2)return json(res,400,{error:'Ingresa el nombre del cliente.'},config.allowedOrigin);
        if(!validUsername(username))return json(res,400,{error:'El usuario debe tener entre 3 y 30 caracteres y usar solo letras, números, punto, guion o guion bajo.'},config.allowedOrigin);
        if(email&&!validEmail(email))return json(res,400,{error:'Ingresa un correo electrónico válido o déjalo vacío.'},config.allowedOrigin);
        if(phone.length<9)return json(res,400,{error:'Ingresa un número de WhatsApp válido.'},config.allowedOrigin);
        if(!validMapsUrl(mapUrl))return json(res,400,{error:'Pega un enlace válido de Google Maps.'},config.allowedOrigin);
        if(!validImage(logo))return json(res,400,{error:'La imagen no es válida o es demasiado grande.'},config.allowedOrigin);
        const passwordError=validatePassword(body.password);if(passwordError)return json(res,400,{error:passwordError},config.allowedOrigin);
        if(data.users.some(u=>normalizeUsername(u.username)===username))return json(res,409,{error:'Ya existe una cuenta con este nombre de usuario.'},config.allowedOrigin);
        if(email&&data.users.some(u=>normalizeEmail(u.email)===email))return json(res,409,{error:'Ya existe una cuenta con este correo.'},config.allowedOrigin);
        const pwd=hashPassword(body.password),now=new Date().toISOString(),location=parseMapLocation(mapUrl);
        const user={id:crypto.randomUUID(),role:'client',name,businessName,username,email,phone,documentId,address,mapUrl,location,logo,bankAccounts,approved:true,active:true,passwordSalt:pwd.salt,passwordHash:pwd.hash,createdAt:now,updatedAt:now,createdBy:'admin'};
        data.users.unshift(user);syncClient(data,user);await writeState(config,data);
        return json(res,201,{user:publicUser(user),message:'Cliente creado y habilitado para iniciar sesión.'},config.allowedOrigin);
      }

      const id=decodeURIComponent(match[1]||'');
      if(!id)return json(res,400,{error:'Cliente no especificado.'},config.allowedOrigin);
      const userIndex=data.users.findIndex(u=>u.role==='client'&&String(u.id)===id);
      const clientIndex=data.clients.findIndex(c=>String(c.id)===id||String(c.userId)===id);
      if(userIndex<0&&clientIndex<0)return json(res,404,{error:'Cliente no encontrado.'},config.allowedOrigin);
      const currentUser=userIndex>=0?data.users[userIndex]:null;
      const currentClient=clientIndex>=0?data.clients[clientIndex]:null;

      if(req.method==='PATCH'){
        const body=await readBody(req);const base=currentUser||currentClient||{};
        const email=normalizeEmail(body.email!==undefined?body.email:base.email),username=normalizeUsername(body.username!==undefined?body.username:base.username),phone=cleanPhone(body.phone!==undefined?body.phone:(body.whatsapp!==undefined?body.whatsapp:(base.phone||base.whatsapp))),name=String(body.name!==undefined?body.name:base.name||'').trim(),businessName=String(body.businessName!==undefined?body.businessName:base.businessName||'').trim(),documentId=String(body.documentId!==undefined?body.documentId:base.documentId||'').trim(),address=String(body.address!==undefined?body.address:base.address||'').trim(),mapUrl=String(body.mapUrl!==undefined?body.mapUrl:base.mapUrl||'').trim(),logo=String(body.logo!==undefined?body.logo:base.logo||''),bankAccounts=body.bankAccounts!==undefined?(normalizeBankAccounts(body.bankAccounts)||[]):(Array.isArray(base.bankAccounts)?base.bankAccounts:[]);
        if(name.length<2)return json(res,400,{error:'Ingresa el nombre del cliente.'},config.allowedOrigin);
        if(username&&!validUsername(username))return json(res,400,{error:'El usuario debe tener entre 3 y 30 caracteres y usar solo letras, números, punto, guion o guion bajo.'},config.allowedOrigin);
        if(email&&!validEmail(email))return json(res,400,{error:'Ingresa un correo electrónico válido o déjalo vacío.'},config.allowedOrigin);
        if(phone.length<9)return json(res,400,{error:'Ingresa un número de WhatsApp válido.'},config.allowedOrigin);
        if(!validMapsUrl(mapUrl))return json(res,400,{error:'Pega un enlace válido de Google Maps.'},config.allowedOrigin);
        if(!validImage(logo))return json(res,400,{error:'La imagen no es válida o es demasiado grande.'},config.allowedOrigin);
        if(username&&data.users.some((u,i)=>i!==userIndex&&normalizeUsername(u.username)===username))return json(res,409,{error:'Ya existe una cuenta con este nombre de usuario.'},config.allowedOrigin);
        if(email&&data.users.some((u,i)=>i!==userIndex&&normalizeEmail(u.email)===email))return json(res,409,{error:'Ya existe una cuenta con este correo.'},config.allowedOrigin);
        const location=parseMapLocation(mapUrl)||(mapUrl?base.location:null),now=new Date().toISOString();
        let user=currentUser;
        if(user){user={...user,name,businessName,username,email,phone,documentId,address,mapUrl,location,logo,bankAccounts,updatedAt:now};if(body.password){const passwordError=validatePassword(body.password);if(passwordError)return json(res,400,{error:passwordError},config.allowedOrigin);const pwd=hashPassword(body.password);user.passwordSalt=pwd.salt;user.passwordHash=pwd.hash;}data.users[userIndex]=user;syncClient(data,user);}else{data.clients[clientIndex]={...currentClient,name,businessName,username,email,phone,whatsapp:phone,documentId,address,mapUrl,location,logo,bankAccounts,updatedAt:now};}
        await writeState(config,data);return json(res,200,{client:clientIndex>=0?data.clients.find(c=>String(c.id)===id||String(c.userId)===id):null,user:user?publicUser(user):null,message:'Cliente actualizado.'},config.allowedOrigin);
      }

      if(req.method==='DELETE'){
        const active=data.requests.filter(r=>belongsToClient(r,currentClient,currentUser)&&isActiveStatus(r.status));
        if(active.length)return json(res,409,{error:`No se puede borrar este cliente porque tiene ${active.length} solicitud(es) activa(s). Finalízalas o cancélalas primero.`},config.allowedOrigin);
        if(userIndex>=0)data.users.splice(userIndex,1);if(clientIndex>=0)data.clients.splice(clientIndex,1);await writeState(config,data);
        return json(res,200,{message:'Cliente eliminado. El historial de solicitudes finalizadas se conserva.'},config.allowedOrigin);
      }
    }catch(error){console.error('GOY XPRESS admin clients',error);return json(res,Number(error.status||500),{error:error.message||'No se pudo procesar el cliente.'},config.allowedOrigin);}
  };
}

module.exports={wrap,verifyToken,hashPassword};