const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function normalizeEmail(value){return String(value||'').trim().toLowerCase();}
function cleanPhone(value){return String(value||'').replace(/\D/g,'');}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));}
function validatePassword(value){const p=String(value||'');if(p.length<8)return 'La contraseña debe tener al menos 8 caracteres.';if(!/[A-Za-z]/.test(p)||!(/\d/.test(p)))return 'La contraseña debe incluir letras y números.';return '';}
function safeEqual(a,b){const x=Buffer.from(String(a));const y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function verifyToken(token,secret){if(!token||!secret)return null;const [body,sig]=String(token).split('.');if(!body||!sig)return null;const expected=crypto.createHmac('sha256',secret).update(body).digest('base64url');if(!safeEqual(sig,expected))return null;try{const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));if(!payload.exp||Date.now()>payload.exp)return null;return payload;}catch{return null;}}
function bearer(req){const a=String(req.headers?.authorization||'');return a.startsWith('Bearer ')?a.slice(7):'';}
function pathnameOf(req){const u=new URL(req.url,`http://${req.headers?.host||'localhost'}`);let p=u.pathname.replace(/\/$/,'')||'/';if(p==='/api')p='/';else if(p.startsWith('/api/'))p=p.slice(4);return p;}
function json(res,status,body,origin='*'){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-Request-Secret');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');res.end(JSON.stringify(body));}
async function readBody(req){if(req.body&&typeof req.body==='object')return req.body;let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1000000)throw new Error('Payload demasiado grande');}return raw?JSON.parse(raw):{};}
function cleanData(value){const data=value&&typeof value==='object'?value:{};for(const key of ['users','clients','couriers','requests','payments','invites','templates','walletEntries','monthlyArchives'])if(!Array.isArray(data[key]))data[key]=[];return data;}
let sqlClient;
async function readState(config){if(config.databaseUrl){if(!sqlClient){const {neon}=require('@neondatabase/serverless');sqlClient=neon(config.databaseUrl);}await sqlClient`CREATE TABLE IF NOT EXISTS goy_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;await sqlClient`INSERT INTO goy_state (id,data) VALUES (1,${JSON.stringify(cleanData({}))}::jsonb) ON CONFLICT (id) DO NOTHING`;const rows=await sqlClient`SELECT data FROM goy_state WHERE id=1 LIMIT 1`;return cleanData(rows[0]?.data||{});}try{if(!fs.existsSync(config.dataFile))return cleanData({});return cleanData(JSON.parse(fs.readFileSync(config.dataFile,'utf8')));}catch{return cleanData({});}}
async function writeState(config,data){const normalized=cleanData(data);if(config.databaseUrl){if(!sqlClient){const {neon}=require('@neondatabase/serverless');sqlClient=neon(config.databaseUrl);}await sqlClient`UPDATE goy_state SET data=${JSON.stringify(normalized)}::jsonb, updated_at=NOW() WHERE id=1`;return;}const dir=path.dirname(config.dataFile);if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});const tmp=`${config.dataFile}.tmp`;fs.writeFileSync(tmp,JSON.stringify(normalized,null,2));fs.renameSync(tmp,config.dataFile);}
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){return {salt,hash:crypto.pbkdf2Sync(String(password),salt,180000,64,'sha512').toString('hex')};}
function publicUser(user){const {passwordHash,passwordSalt,...safe}=user;return safe;}
function syncClient(data,user){const item={id:user.id,userId:user.id,name:user.name,businessName:user.businessName,whatsapp:user.phone,phone:user.phone,email:user.email,documentId:user.documentId||'',address:user.address||'',logo:'',approved:true,active:true,status:'Activo',registeredAt:user.createdAt};const i=data.clients.findIndex(x=>x.userId===user.id||x.id===user.id);if(i>=0)data.clients[i]={...data.clients[i],...item};else data.clients.unshift(item);}

function wrap(next, overrides={}){
  return async function handler(req,res){
    const p=pathnameOf(req);
    if(!(req.method==='POST'&&p==='/admin/clients'))return next(req,res);
    const config={databaseUrl:String(overrides.databaseUrl??process.env.DATABASE_URL??''),tokenSecret:String(overrides.tokenSecret??process.env.TOKEN_SECRET??''),allowedOrigin:String(overrides.allowedOrigin??process.env.ALLOWED_ORIGIN??'*'),dataFile:overrides.dataFile||process.env.DATA_FILE||path.join(__dirname,'data-v5.json')};
    try{
      if(!config.tokenSecret)return json(res,503,{error:'Autenticación del servidor sin configurar.'},config.allowedOrigin);
      const payload=verifyToken(bearer(req),config.tokenSecret);if(!payload||payload.role!=='admin')return json(res,401,{error:'No autorizado'},config.allowedOrigin);
      const body=await readBody(req);const email=normalizeEmail(body.email),phone=cleanPhone(body.phone||body.whatsapp),name=String(body.name||'').trim(),businessName=String(body.businessName||'').trim(),documentId=String(body.documentId||'').trim(),address=String(body.address||'').trim();
      if(name.length<2)return json(res,400,{error:'Ingresa el nombre del cliente.'},config.allowedOrigin);
      if(!validEmail(email))return json(res,400,{error:'Ingresa un correo electrónico válido.'},config.allowedOrigin);
      if(phone.length<9)return json(res,400,{error:'Ingresa un número de WhatsApp válido.'},config.allowedOrigin);
      const passwordError=validatePassword(body.password);if(passwordError)return json(res,400,{error:passwordError},config.allowedOrigin);
      const data=await readState(config);if(data.users.some(u=>normalizeEmail(u.email)===email))return json(res,409,{error:'Ya existe una cuenta con este correo.'},config.allowedOrigin);
      const pwd=hashPassword(body.password),now=new Date().toISOString();
      const user={id:crypto.randomUUID(),role:'client',name,businessName,email,phone,documentId,address,logo:'',approved:true,active:true,passwordSalt:pwd.salt,passwordHash:pwd.hash,createdAt:now,updatedAt:now,createdBy:'admin'};
      data.users.unshift(user);syncClient(data,user);await writeState(config,data);
      return json(res,201,{user:publicUser(user),message:'Cliente creado y habilitado para iniciar sesión.'},config.allowedOrigin);
    }catch(error){console.error('GOY XPRESS admin clients',error);return json(res,Number(error.status||500),{error:error.message||'No se pudo crear el cliente.'},config.allowedOrigin);}
  };
}

module.exports={wrap,verifyToken,hashPassword};
