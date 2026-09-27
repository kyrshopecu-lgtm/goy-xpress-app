const {ensureStateTable,readVersionedState,writeVersionedState}=require('./versioned-state');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

function safeEqual(a,b){const x=Buffer.from(String(a));const y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function verifyToken(token,secret){if(!token||!secret)return null;const [body,sig]=String(token).split('.');if(!body||!sig)return null;const expected=crypto.createHmac('sha256',secret).update(body).digest('base64url');if(!safeEqual(sig,expected))return null;try{const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));if(!payload.exp||Date.now()>payload.exp)return null;return payload;}catch{return null;}}
function bearer(req){const a=String(req.headers?.authorization||'');return a.startsWith('Bearer ')?a.slice(7):'';}
function pathnameOf(req){const u=new URL(req.url,`http://${req.headers?.host||'localhost'}`);let p=u.pathname.replace(/\/$/,'')||'/';if(p==='/api')p='/';else if(p.startsWith('/api/'))p=p.slice(4);return p;}
function json(res,status,body,origin='*'){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-Request-Secret');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');res.end(JSON.stringify(body));}
async function readBody(req){if(req.body&&typeof req.body==='object')return req.body;let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1000000)throw new Error('Payload demasiado grande');}return raw?JSON.parse(raw):{};}
function cleanData(value){const data=value&&typeof value==='object'?value:{};for(const key of ['users','clients','couriers','requests','payments','invites','templates','walletEntries','monthlyArchives','customServices','prospects'])if(!Array.isArray(data[key]))data[key]=[];return data;}
let sqlClient;
async function readState(config){if(config.databaseUrl){if(!sqlClient){const {neon}=require('@neondatabase/serverless');sqlClient=neon(config.databaseUrl);}await ensureStateTable(sqlClient,cleanData({}));return readVersionedState(sqlClient,cleanData);}try{if(!fs.existsSync(config.dataFile))return cleanData({});return cleanData(JSON.parse(fs.readFileSync(config.dataFile,'utf8')));}catch{return cleanData({});}}
async function writeState(config,data){const normalized=cleanData(data);if(config.databaseUrl){if(!sqlClient){const {neon}=require('@neondatabase/serverless');sqlClient=neon(config.databaseUrl);}await writeVersionedState(sqlClient,data,cleanData);return;}const dir=path.dirname(config.dataFile);if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});const tmp=`${config.dataFile}.tmp`;fs.writeFileSync(tmp,JSON.stringify(normalized,null,2));fs.renameSync(tmp,config.dataFile);}
function activeStatus(value){return !['Entrega finalizada','Cancelado','Entregado','Finalizado'].includes(String(value||''));}
function cleanMoney(value){const n=Number(String(value??'').replace(',','.'));return Number.isFinite(n)&&n>=0?Math.round(n*100)/100:null;}
function publicService(item){return {id:item.id,name:item.name,price:Number(item.price||0),description:item.description||'',active:item.active!==false,createdAt:item.createdAt,updatedAt:item.updatedAt};}

function wrap(next,overrides={}){
 return async function handler(req,res){
  const p=pathnameOf(req);
  const accountMatch=p.match(/^\/admin\/(clients|couriers)\/([^/]+)$/);
  const serviceMatch=p.match(/^\/admin\/services\/([^/]+)$/);
  const prospectMatch=p.match(/^\/admin\/prospects\/([^/]+)$/);
  const handles=(p==='/admin/services'&&['GET','POST'].includes(req.method))||(serviceMatch&&['PATCH','DELETE'].includes(req.method))||(p==='/admin/prospects'&&['GET','POST'].includes(req.method))||(prospectMatch&&['GET','PATCH','DELETE'].includes(req.method))||(accountMatch&&req.method==='DELETE');
  if(!handles)return next(req,res);
  const config={databaseUrl:String(overrides.databaseUrl??process.env.DATABASE_URL??''),tokenSecret:String(overrides.tokenSecret??process.env.TOKEN_SECRET??''),allowedOrigin:String(overrides.allowedOrigin??process.env.ALLOWED_ORIGIN??'*'),dataFile:overrides.dataFile||process.env.DATA_FILE||path.join(__dirname,'data-v5.json')};
  try{
   const payload=verifyToken(bearer(req),config.tokenSecret);if(!payload||payload.role!=='admin')return json(res,401,{error:'No autorizado'},config.allowedOrigin);
   const data=await readState(config);
   if(accountMatch){
    const role=accountMatch[1]==='clients'?'client':'courier',id=decodeURIComponent(accountMatch[2]);
    const user=data.users.find(u=>u.id===id&&u.role===role);if(!user)return json(res,404,{error:role==='client'?'Cliente no encontrado.':'Mensajero no encontrado.'},config.allowedOrigin);
    const active=data.requests.filter(r=>activeStatus(r.status)&&(role==='client'?r.clientId===id:r.courierId===id));
    if(active.length)return json(res,409,{error:`No se puede eliminar: tiene ${active.length} solicitud(es) activa(s). Finaliza o cancela esas operaciones primero.`,activeRequests:active.map(r=>r.code||r.id)},config.allowedOrigin);
    data.users=data.users.filter(u=>u.id!==id);
    if(role==='client')data.clients=data.clients.filter(x=>x.userId!==id&&x.id!==id);else data.couriers=data.couriers.filter(x=>x.userId!==id&&x.id!==id);
    await writeState(config,data);return json(res,200,{ok:true,message:role==='client'?'Cliente eliminado.':'Mensajero eliminado.'},config.allowedOrigin);
   }
   if(p==='/admin/prospects'&&req.method==='GET')return json(res,200,{prospects:data.prospects},config.allowedOrigin);
   if(p==='/admin/prospects'&&req.method==='POST'){
    const body=await readBody(req),business=String(body.business||body.name||'').trim(),sourceUrl=String(body.sourceUrl||'').trim(),channel=String(body.channel||'').trim(),contact=String(body.contact||'').trim();
    if(business.length<2)return json(res,400,{error:'Ingresa el nombre del negocio o prospecto.'},config.allowedOrigin);
    const now=new Date().toISOString(),item={id:crypto.randomUUID(),business,city:String(body.city||'').trim(),category:String(body.category||'').trim(),source:String(body.source||'web').trim(),sourceUrl,channel,contact,fitReason:String(body.fitReason||'').trim(),score:Math.max(0,Math.min(100,Number(body.score||0))),status:'Pendiente de revisión',draftMessage:String(body.draftMessage||'').trim(),approvedMessage:'',doNotContact:false,conversation:[],createdAt:now,updatedAt:now};
    data.prospects.unshift(item);await writeState(config,data);return json(res,201,{prospect:item},config.allowedOrigin);
   }
   if(prospectMatch){
    const id=decodeURIComponent(prospectMatch[1]),item=data.prospects.find(x=>x.id===id);if(!item)return json(res,404,{error:'Prospecto no encontrado.'},config.allowedOrigin);
    if(req.method==='GET')return json(res,200,{prospect:item},config.allowedOrigin);
    if(req.method==='DELETE'){data.prospects=data.prospects.filter(x=>x.id!==id);await writeState(config,data);return json(res,200,{ok:true},config.allowedOrigin);}
    const body=await readBody(req);
    for(const key of ['business','city','category','source','sourceUrl','channel','contact','fitReason','draftMessage'])if(Object.prototype.hasOwnProperty.call(body,key))item[key]=String(body[key]||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'score'))item.score=Math.max(0,Math.min(100,Number(body.score||0)));
    if(Object.prototype.hasOwnProperty.call(body,'doNotContact'))item.doNotContact=Boolean(body.doNotContact);
    if(Object.prototype.hasOwnProperty.call(body,'status')){
      const allowed=['Pendiente de revisión','Aprobado para contacto','Contactado','Respondió','Interesado','Solicita llamada','Cliente','Descartado'];
      if(!allowed.includes(String(body.status)))return json(res,400,{error:'Estado de prospecto no válido.'},config.allowedOrigin);
      if(String(body.status)==='Aprobado para contacto'&&item.doNotContact)return json(res,409,{error:'Este prospecto está marcado como no contactar.'},config.allowedOrigin);
      item.status=String(body.status);
    }
    if(Object.prototype.hasOwnProperty.call(body,'approvedMessage'))item.approvedMessage=String(body.approvedMessage||'').trim();
    item.updatedAt=new Date().toISOString();await writeState(config,data);return json(res,200,{prospect:item},config.allowedOrigin);
   }
   if(p==='/admin/services'&&req.method==='GET')return json(res,200,{services:data.customServices.map(publicService)},config.allowedOrigin);
   if(p==='/admin/services'&&req.method==='POST'){
    const body=await readBody(req),name=String(body.name||'').trim(),price=cleanMoney(body.price),description=String(body.description||'').trim();
    if(name.length<2)return json(res,400,{error:'Ingresa el nombre del servicio.'},config.allowedOrigin);if(price===null)return json(res,400,{error:'Ingresa un valor válido para el servicio.'},config.allowedOrigin);
    if(data.customServices.some(s=>String(s.name||'').trim().toLowerCase()===name.toLowerCase()))return json(res,409,{error:'Ya existe un servicio con ese nombre.'},config.allowedOrigin);
    const now=new Date().toISOString(),item={id:crypto.randomUUID(),name,price,description,active:body.active!==false,createdAt:now,updatedAt:now};data.customServices.unshift(item);await writeState(config,data);return json(res,201,{service:publicService(item)},config.allowedOrigin);
   }
   const id=decodeURIComponent(serviceMatch[1]),item=data.customServices.find(s=>s.id===id);if(!item)return json(res,404,{error:'Servicio no encontrado.'},config.allowedOrigin);
   if(req.method==='DELETE'){data.customServices=data.customServices.filter(s=>s.id!==id);await writeState(config,data);return json(res,200,{ok:true},config.allowedOrigin);}
   const body=await readBody(req);if(Object.prototype.hasOwnProperty.call(body,'name')){const name=String(body.name||'').trim();if(name.length<2)return json(res,400,{error:'Ingresa el nombre del servicio.'},config.allowedOrigin);if(data.customServices.some(s=>s.id!==id&&String(s.name||'').trim().toLowerCase()===name.toLowerCase()))return json(res,409,{error:'Ya existe un servicio con ese nombre.'},config.allowedOrigin);item.name=name;}if(Object.prototype.hasOwnProperty.call(body,'price')){const price=cleanMoney(body.price);if(price===null)return json(res,400,{error:'Ingresa un valor válido.'},config.allowedOrigin);item.price=price;}if(Object.prototype.hasOwnProperty.call(body,'description'))item.description=String(body.description||'').trim();if(Object.prototype.hasOwnProperty.call(body,'active'))item.active=Boolean(body.active);item.updatedAt=new Date().toISOString();await writeState(config,data);return json(res,200,{service:publicService(item)},config.allowedOrigin);
  }catch(error){console.error('GOY XPRESS admin management',error);return json(res,Number(error.status||500),{error:error.message||'No se pudo completar la operación.'},config.allowedOrigin);}
 };
}
module.exports={wrap};
