const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

function safeEqual(a,b){const x=Buffer.from(String(a));const y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function verifyToken(token,secret){if(!token||!secret)return null;const [body,sig]=String(token).split('.');if(!body||!sig)return null;const expected=crypto.createHmac('sha256',secret).update(body).digest('base64url');if(!safeEqual(sig,expected))return null;try{const p=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));if(!p.exp||Date.now()>p.exp)return null;return p;}catch{return null;}}
function signToken(payload,secret){const body=Buffer.from(JSON.stringify(payload)).toString('base64url');const sig=crypto.createHmac('sha256',secret).update(body).digest('base64url');return `${body}.${sig}`;}
function bearer(req){const a=String(req.headers?.authorization||'');return a.startsWith('Bearer ')?a.slice(7):'';}
function pathnameOf(req){const u=new URL(req.url,`http://${req.headers?.host||'localhost'}`);let p=u.pathname.replace(/\/$/,'')||'/';if(p==='/api')p='/';else if(p.startsWith('/api/'))p=p.slice(4);return p;}
function json(res,status,body,origin='*'){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-Request-Secret');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');res.end(JSON.stringify(body));}
async function readBody(req){if(req.body&&typeof req.body==='object')return req.body;let raw='';for await(const c of req){raw+=c;if(raw.length>5000000)throw new Error('Payload demasiado grande');}return raw?JSON.parse(raw):{};}
function cleanData(value){const data=value&&typeof value==='object'?value:{};for(const key of ['users','clients','couriers','requests','payments','invites','templates','walletEntries','monthlyArchives','customServices'])if(!Array.isArray(data[key]))data[key]=[];return data;}
let sqlClient;
async function readState(config){if(config.databaseUrl){if(!sqlClient){const {neon}=require('@neondatabase/serverless');sqlClient=neon(config.databaseUrl);}await sqlClient`CREATE TABLE IF NOT EXISTS goy_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;await sqlClient`INSERT INTO goy_state (id,data) VALUES (1,${JSON.stringify(cleanData({}))}::jsonb) ON CONFLICT (id) DO NOTHING`;const rows=await sqlClient`SELECT data FROM goy_state WHERE id=1 LIMIT 1`;return cleanData(rows[0]?.data||{});}try{if(!fs.existsSync(config.dataFile))return cleanData({});return cleanData(JSON.parse(fs.readFileSync(config.dataFile,'utf8')));}catch{return cleanData({});}}
async function writeState(config,data){const normalized=cleanData(data);if(config.databaseUrl){if(!sqlClient){const {neon}=require('@neondatabase/serverless');sqlClient=neon(config.databaseUrl);}await sqlClient`UPDATE goy_state SET data=${JSON.stringify(normalized)}::jsonb, updated_at=NOW() WHERE id=1`;return;}const dir=path.dirname(config.dataFile);if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});const tmp=`${config.dataFile}.tmp`;fs.writeFileSync(tmp,JSON.stringify(normalized,null,2));fs.renameSync(tmp,config.dataFile);}
function normalizeEmail(v){return String(v||'').trim().toLowerCase();}
function cleanPhone(v){return String(v||'').replace(/\D/g,'');}
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(v));}
function validatePassword(v){const p=String(v||'');if(p.length<8)return 'La contraseña debe tener al menos 8 caracteres.';if(!/[A-Za-z]/.test(p)||!(/\d/.test(p)))return 'La contraseña debe incluir letras y números.';return '';}
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){return {salt,hash:crypto.pbkdf2Sync(String(password),salt,180000,64,'sha512').toString('hex')};}
function validImage(v){if(!v)return true;const t=String(v);return t.length<=1800000&&/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(t);}
function normalizeBloodType(v){const raw=String(v||'').trim().toUpperCase().replace(/\s+/g,'');if(!raw)return '';return ['A+','A-','B+','B-','AB+','AB-','O+','O-'].includes(raw)?raw:'';}
function publicUser(user){if(!user)return null;const {passwordHash,passwordSalt,...safe}=user;return safe;}
function finishedStatus(v){return ['Entrega finalizada','Entregado','Finalizado'].includes(String(v||''));}
function requestService(r){return String(r.serviceLabel||r.serviceName||r.kind||r.type||'Servicio GOY XPRESS');}
function requestPlace(r){return String(r.destinationAddress||r.procedureAddress||r.destination||r.address||r.depositDestination||'');}

function wrap(next,overrides={}){
 return async function handler(req,res){
  const p=pathnameOf(req);
  const profileMatch=p.match(/^\/admin\/couriers\/([^/]+)\/profile$/);
  const isCourierRegister=req.method==='POST'&&p==='/auth/courier/register';
  if(!profileMatch&&!isCourierRegister)return next(req,res);
  const config={databaseUrl:String(overrides.databaseUrl??process.env.DATABASE_URL??''),tokenSecret:String(overrides.tokenSecret??process.env.TOKEN_SECRET??''),allowedOrigin:String(overrides.allowedOrigin??process.env.ALLOWED_ORIGIN??'*'),dataFile:overrides.dataFile||process.env.DATA_FILE||path.join(__dirname,'data-v5.json')};
  try{
   if(isCourierRegister){
    if(!config.tokenSecret)return json(res,503,{error:'Autenticación del servidor sin configurar.'},config.allowedOrigin);
    const body=await readBody(req),data=await readState(config),email=normalizeEmail(body.email),phone=cleanPhone(body.phone||body.whatsapp),name=String(body.name||'').trim(),passwordError=validatePassword(body.password),photo=String(body.photo||'');
    if(!validEmail(email))return json(res,400,{error:'Ingresa un correo electrónico válido.'},config.allowedOrigin);
    if(phone.length<9)return json(res,400,{error:'Ingresa un número de WhatsApp válido.'},config.allowedOrigin);
    if(name.length<2)return json(res,400,{error:'Ingresa tu nombre completo.'},config.allowedOrigin);
    if(passwordError)return json(res,400,{error:passwordError},config.allowedOrigin);
    if(!validImage(photo))return json(res,400,{error:'La imagen de perfil no es válida o es demasiado grande.'},config.allowedOrigin);
    if(data.users.some(u=>normalizeEmail(u.email)===email))return json(res,409,{error:'Este correo ya está registrado. Inicia sesión.'},config.allowedOrigin);
    const pwd=hashPassword(body.password),now=new Date().toISOString(),documentId=String(body.documentId||body.cedula||'').trim(),bloodType=normalizeBloodType(body.bloodType||body.tipoSangre);
    const user={id:crypto.randomUUID(),role:'courier',name,email,phone,documentId,bloodType,photo,approved:false,active:true,passwordSalt:pwd.salt,passwordHash:pwd.hash,createdAt:now,updatedAt:now};
    data.users.unshift(user);
    data.couriers.unshift({id:user.id,userId:user.id,name,fullName:name,whatsapp:phone,phone,email,documentId,bloodType,photo,approved:false,active:true,status:'Pendiente de aprobación',registeredAt:now});
    await writeState(config,data);
    const expiresIn=30*24*60*60,token=signToken({role:'courier',userId:user.id,exp:Date.now()+expiresIn*1000},config.tokenSecret);
    return json(res,201,{token,expiresIn,user:publicUser(user),pendingApproval:true,message:'Registro recibido. Tu cuenta debe ser aprobada por el administrador antes de usar la aplicación.'},config.allowedOrigin);
   }

   const payload=verifyToken(bearer(req),config.tokenSecret);if(!payload||payload.role!=='admin')return json(res,401,{error:'No autorizado'},config.allowedOrigin);
   const data=await readState(config),id=decodeURIComponent(profileMatch[1]);
   const user=data.users.find(u=>u.id===id&&u.role==='courier');
   const mirror=data.couriers.find(c=>c.userId===id||c.id===id);
   if(!user&&!mirror)return json(res,404,{error:'Mensajero no encontrado.'},config.allowedOrigin);
   const source=user||mirror,name=String(source.name||source.fullName||mirror?.name||'Mensajero');
   const services=data.requests.filter(r=>r.courierId===id||(!r.courierId&&String(r.courier||'').trim().toLowerCase()===name.trim().toLowerCase())).sort((a,b)=>new Date(b.createdAt||b.updatedAt||0)-new Date(a.createdAt||a.updatedAt||0));
   const completed=services.filter(r=>finishedStatus(r.status));
   const profile={id,name,email:String(user?.email||mirror?.email||''),phone:String(user?.phone||mirror?.phone||mirror?.whatsapp||''),documentId:String(user?.documentId||mirror?.documentId||''),bloodType:String(user?.bloodType||mirror?.bloodType||''),photo:String(user?.photo||mirror?.photo||''),approved:Boolean(user?.approved??mirror?.approved),active:(user?.active??mirror?.active)!==false,status:String(mirror?.status||((user?.active??true)===false?'Inactivo':user?.approved?'Disponible':'Pendiente de aprobación')),cargo:'Operador logístico',registeredAt:user?.createdAt||mirror?.registeredAt||null};
   return json(res,200,{profile,stats:{totalServices:services.length,completedServices:completed.length,activeServices:services.length-completed.length},services:services.map(r=>({id:r.id||r.code,code:r.code||r.id||'',service:requestService(r),status:String(r.status||''),client:String(r.customer||r.clientName||r.businessName||''),destination:requestPlace(r),createdAt:r.createdAt||null,finishedAt:r.finishedAt||null,serviceCost:Number(r.serviceCost||0)}))},config.allowedOrigin);
  }catch(error){console.error('GOY XPRESS courier profile',error);return json(res,Number(error.status||500),{error:error.message||'No se pudo completar la operación.'},config.allowedOrigin);}
 };
}
module.exports={wrap,normalizeBloodType};
