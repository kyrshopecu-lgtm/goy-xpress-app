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
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data-v4.json');
let sqlClient = null;
let dbReady = false;

function emptyData(){return {clients:[],requests:[],couriers:[],payments:[],invites:[],templates:[],walletEntries:[],monthlyArchives:[]};}
async function getSql(){
  if(!DATABASE_URL) return null;
  if(!sqlClient){const {neon}=require('@neondatabase/serverless');sqlClient=neon(DATABASE_URL);}
  if(!dbReady){
    await sqlClient`CREATE TABLE IF NOT EXISTS goy_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await sqlClient`INSERT INTO goy_state (id,data) VALUES (1,${JSON.stringify(emptyData())}::jsonb) ON CONFLICT (id) DO NOTHING`;
    dbReady=true;
  }
  return sqlClient;
}
async function readData(){
  const sql=await getSql();
  if(sql){const rows=await sql`SELECT data FROM goy_state WHERE id=1 LIMIT 1`;return {...emptyData(),...(rows[0]?.data||{})};}
  try{if(!fs.existsSync(DATA_FILE))return emptyData();return {...emptyData(),...JSON.parse(fs.readFileSync(DATA_FILE,'utf8'))};}catch{return emptyData();}
}
async function writeData(data){
  const sql=await getSql();
  if(sql){await sql`UPDATE goy_state SET data=${JSON.stringify(data)}::jsonb, updated_at=NOW() WHERE id=1`;return;}
  const tmp=`${DATA_FILE}.tmp`;fs.writeFileSync(tmp,JSON.stringify(data,null,2));fs.renameSync(tmp,DATA_FILE);
}
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':ALLOWED_ORIGIN,'Access-Control-Allow-Headers':'Content-Type, Authorization, X-Request-Secret','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
function safeEqual(a,b){const x=Buffer.from(String(a));const y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function hashSecret(secret){return crypto.createHash('sha256').update(String(secret)).digest('hex');}
function makeSecret(){return crypto.randomBytes(24).toString('base64url');}
function signToken(payload){const body=Buffer.from(JSON.stringify(payload)).toString('base64url');const sig=crypto.createHmac('sha256',TOKEN_SECRET).update(body).digest('base64url');return `${body}.${sig}`;}
function verifyToken(token){if(!token||!TOKEN_SECRET)return null;const [body,sig]=token.split('.');if(!body||!sig)return null;const expected=crypto.createHmac('sha256',TOKEN_SECRET).update(body).digest('base64url');if(!safeEqual(sig,expected))return null;try{const p=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));return p.exp&&Date.now()<=p.exp?p:null;}catch{return null;}}
function requireAdmin(req,res){const auth=String(req.headers.authorization||'');const p=verifyToken(auth.startsWith('Bearer ')?auth.slice(7):'');if(!p||p.role!=='admin'){json(res,401,{error:'No autorizado'});return null;}return p;}
async function readBody(req){if(req.body&&typeof req.body==='object')return req.body;let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4_000_000)throw new Error('Payload demasiado grande');}return raw?JSON.parse(raw):{};}
function publicPath(req){const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);let p=u.pathname.replace(/\/$/,'')||'/';if(p==='/api')p='/';else if(p.startsWith('/api/'))p=p.slice(4);return p;}
function findRequest(data,code){return data.requests.findIndex(r=>r.code===code||r.id===code);}
function normalizeStatus(v){const map={'En ruta':'En camino',Entregado:'Entrega finalizada',Finalizado:'Entrega finalizada'};const n=map[v]||v;return ['Pendiente','Cotizado','Aceptado','Asignado','Recogido','En camino','Entrega finalizada','Cancelado'].includes(n)?n:'Pendiente';}
function appendEvent(r,type,payload={}){r.events=Array.isArray(r.events)?r.events:[];r.events.unshift({id:crypto.randomUUID(),type,...payload,at:new Date().toISOString()});r.updatedAt=new Date().toISOString();}
function sanitizeRequest(r){const c={...r};delete c.clientAccessHash;delete c.courierAccessHash;delete c.accessSecretHash;delete c.clientAccess;delete c.courierAccess;return c;}
function secretFrom(req){return String(req.headers['x-request-secret']||'');}
function clientAllowed(req,r){const s=secretFrom(req);const hash=r.clientAccessHash||r.accessSecretHash;return Boolean(s&&hash&&safeEqual(hashSecret(s),hash));}
function courierAllowed(req,r){const s=secretFrom(req);return Boolean(s&&r.courier&&r.courierAccessHash&&safeEqual(hashSecret(s),r.courierAccessHash));}
function currentCycleRequests(data,cycle=monthlyCycleKey(new Date())){return data.requests.filter(r=>(r.cycleKey||monthlyCycleKey(r.createdAt||new Date()))===cycle);}

async function handler(req,res){
  if(req.method==='OPTIONS')return json(res,204,{});
  const pathname=publicPath(req);
  try{
    if(req.method==='GET'&&pathname==='/health')return json(res,200,{ok:true,service:'goy-xpress-api',version:'4.0.0-role-security',storage:DATABASE_URL?'postgres':'local'});

    if(req.method==='POST'&&pathname==='/admin/login'){
      const b=await readBody(req);const email=String(b.email||'').trim().toLowerCase();const password=String(b.password||'');
      if(!ADMIN_EMAIL||!ADMIN_PASSWORD||!TOKEN_SECRET)return json(res,503,{error:'Servidor sin configurar'});
      if(!safeEqual(email,ADMIN_EMAIL)||!safeEqual(password,ADMIN_PASSWORD))return json(res,401,{error:'Usuario o contraseña incorrectos'});
      return json(res,200,{token:signToken({role:'admin',email:ADMIN_EMAIL,exp:Date.now()+8*60*60*1000}),expiresIn:28800});
    }

    if(req.method==='GET'&&pathname==='/admin/data'){
      if(!requireAdmin(req,res))return;const data=await readData();const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);const cycle=u.searchParams.get('cycle')||monthlyCycleKey(new Date());
      return json(res,200,{...data,requests:currentCycleRequests(data,cycle).map(sanitizeRequest),activeCycle:cycle,availableCycles:[...new Set(data.requests.map(r=>r.cycleKey||monthlyCycleKey(r.createdAt)))].sort().reverse()});
    }

    if(req.method==='POST'&&pathname==='/admin/invites'){
      if(!requireAdmin(req,res))return;const b=await readBody(req);const data=await readData();const invite={token:crypto.randomBytes(18).toString('base64url'),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+7*86400000).toISOString(),usedAt:null,label:String(b.label||'').trim(),email:String(b.email||'').trim().toLowerCase(),whatsapp:String(b.whatsapp||b.phone||'').trim()};data.invites.unshift(invite);await writeData(data);return json(res,201,invite);
    }

    if(req.method==='PATCH'&&pathname.startsWith('/admin/requests/')){
      if(!requireAdmin(req,res))return;const code=decodeURIComponent(pathname.slice('/admin/requests/'.length));const b=await readBody(req);const data=await readData();const i=findRequest(data,code);if(i<0)return json(res,404,{error:'Solicitud no encontrada'});const r=data.requests[i];const patch={};let courierAccess=null;
      if(b.status)patch.status=normalizeStatus(b.status);
      if(Object.prototype.hasOwnProperty.call(b,'courier')){
        patch.courier=String(b.courier||'').trim()||null;
        if(!patch.courier){patch.courierAccessHash=null;}
      }
      if(b.issueCourierAccess||((b.status==='Asignado'||patch.status==='Asignado')&&patch.courier)){
        if(!(patch.courier||r.courier))return json(res,400,{error:'Selecciona un mensajero antes de emitir acceso'});
        courierAccess=makeSecret();patch.courierAccessHash=hashSecret(courierAccess);patch.status='Asignado';
      }
      if(b.kind)patch.kind=String(b.kind);
      if(b.serviceLabel)patch.serviceLabel=String(b.serviceLabel).trim();
      if(b.serviceCost!==undefined){const n=Math.max(0,Number(b.serviceCost||0));patch.serviceCost=Math.round(n*100)/100;patch.tariffAdjustment={previousCost:Number(r.serviceCost||0),newCost:patch.serviceCost,reason:String(b.reason||'Reajuste administrativo').trim(),adjustedAt:new Date().toISOString()};}
      if(b.quote)patch.quote={...(r.quote||{}),...b.quote,updatedAt:new Date().toISOString()};
      if(b.wallet)patch.wallet={...(r.wallet||{}),...b.wallet,updatedAt:new Date().toISOString()};
      if(b.adminNotes!==undefined)patch.adminNotes=String(b.adminNotes||'').trim();
      data.requests[i]={...r,...patch,updatedAt:new Date().toISOString()};appendEvent(data.requests[i],'admin_update',{fields:Object.keys(patch)});if(courierAccess)appendEvent(data.requests[i],'courier_access_issued',{courier:data.requests[i].courier});await writeData(data);
      return json(res,200,{request:sanitizeRequest(data.requests[i]),courierAccess});
    }

    if(req.method==='POST'&&pathname.startsWith('/admin/requests/')&&pathname.endsWith('/template')){
      if(!requireAdmin(req,res))return;const code=decodeURIComponent(pathname.slice('/admin/requests/'.length,-'/template'.length));const b=await readBody(req);const data=await readData();const i=findRequest(data,code);if(i<0)return json(res,404,{error:'Solicitud no encontrada'});const t=createRecurringTemplate(data.requests[i],b.name);data.templates.unshift(t);await writeData(data);return json(res,201,t);
    }
    if(req.method==='POST'&&pathname.startsWith('/admin/requests/')&&pathname.endsWith('/release-wallet')){
      if(!requireAdmin(req,res))return;const code=decodeURIComponent(pathname.slice('/admin/requests/'.length,-'/release-wallet'.length));const data=await readData();const i=findRequest(data,code);if(i<0)return json(res,404,{error:'Solicitud no encontrada'});const r=data.requests[i];if(!canReleaseCourierFunds(r))return json(res,409,{error:'Se requiere entrega finalizada y foto del depósito para liberar valores.'});r.wallet={...(r.wallet||{}),released:true,releasedAt:new Date().toISOString()};appendEvent(r,'wallet_released');await writeData(data);return json(res,200,sanitizeRequest(r));
    }

    if(req.method==='POST'&&pathname==='/requests'){
      const b=await readBody(req);if(!b.code||!b.kind)return json(res,400,{error:'Solicitud incompleta'});const data=await readData();const existing=data.requests.find(r=>r.code===b.code);if(existing)return json(res,200,{ok:true,duplicate:true,request:sanitizeRequest(existing)});
      if(b.kind==='deposit'){const dep=calculateDepositPrice({checkCount:b.checkCount,cashAmount:b.cashAmount,method:b.depositMethod});if(!dep.valid)return json(res,400,{error:dep.error});b.serviceCost=dep.total;b.depositPricing=dep;}
      const clientAccess=makeSecret();const createdAt=b.createdAt||new Date().toISOString();const r={...b,status:'Pendiente',cycleKey:monthlyCycleKey(createdAt),courier:null,courierStage:null,wait:{freeMinutes:10,elapsedMinutes:0,extraMinutes:0,extraCost:0,decision:null},evidence:{},gps:{last:null,history:[]},quote:b.kind==='diverse'?{status:'Pendiente de cotización',amount:null,acceptedAt:null}:null,wallet:{collected:Number(b.totalToCollect||0),depositPhoto:null,released:Number(b.totalToCollect||0)===0},events:[],clientAccessHash:hashSecret(clientAccess),courierAccessHash:null,createdAt,updatedAt:new Date().toISOString()};appendEvent(r,'request_created',{cycleKey:r.cycleKey});data.requests.unshift(r);await writeData(data);return json(res,201,{ok:true,request:sanitizeRequest(r),accessSecret:clientAccess,clientAccess});
    }

    if(req.method==='GET'&&pathname==='/request-status'){
      const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);const code=String(u.searchParams.get('code')||'');const data=await readData();const i=findRequest(data,code);if(i<0)return json(res,404,{error:'Solicitud no encontrada'});const r=data.requests[i];if(!clientAllowed(req,r)&&!courierAllowed(req,r))return json(res,401,{error:'Acceso a solicitud no autorizado'});return json(res,200,{request:sanitizeRequest(r),accessRole:courierAllowed(req,r)?'courier':'client'});
    }

    const m=pathname.match(/^\/requests\/([^/]+)\/(pickup|location|wait|wait-decision|delivery|deposit-evidence|quote-response)$/);
    if(req.method==='POST'&&m){
      const [,rawCode,action]=m;const code=decodeURIComponent(rawCode);const b=await readBody(req);const data=await readData();const i=findRequest(data,code);if(i<0)return json(res,404,{error:'Solicitud no encontrada'});const r=data.requests[i];
      if(action==='quote-response'){
        if(!clientAllowed(req,r))return json(res,403,{error:'Esta acción pertenece al cliente'});
        if(!['accepted','rejected'].includes(b.response))return json(res,400,{error:'Respuesta inválida'});if(!r.quote?.amount)return json(res,409,{error:'El administrador todavía no ha cotizado este servicio'});r.quote={...r.quote,status:b.response==='accepted'?'Aceptado':'Rechazado',acceptedAt:b.response==='accepted'?new Date().toISOString():null};r.status=b.response==='accepted'?'Aceptado':'Cancelado';if(b.response==='accepted')r.serviceCost=Number(r.quote.amount);appendEvent(r,'quote_response',{response:b.response});
      } else {
        if(!courierAllowed(req,r))return json(res,403,{error:'Operación reservada al mensajero asignado'});
        if(action==='pickup'){if(!b.photo)return json(res,400,{error:'La foto de recogida es obligatoria'});r.status='Recogido';r.courierStage='Recogido';r.evidence.pickupPhoto=b.photo;appendEvent(r,'pickup',{note:String(b.note||'')});}
        else if(action==='location'){const lat=Number(b.latitude),lng=Number(b.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lng))return json(res,400,{error:'Ubicación inválida'});if(r.status==='Recogido')r.status='En camino';r.courierStage='En camino';r.gps.last={latitude:lat,longitude:lng,accuracy:Number(b.accuracy||0),at:new Date().toISOString()};r.gps.history=Array.isArray(r.gps.history)?r.gps.history.slice(-99):[];r.gps.history.push(r.gps.last);appendEvent(r,'location');}
        else if(action==='wait'){const w=calculateCourierWait(b.elapsedMinutes);r.wait={...r.wait,...w};r.serviceCost=Math.round((Number(r.baseServiceCost??r.serviceCost??0)+w.extraCost)*100)/100;appendEvent(r,'wait_updated',{elapsedMinutes:w.elapsedMinutes,extraCost:w.extraCost});}
        else if(action==='wait-decision'){if(!['withdraw','continue'].includes(b.decision))return json(res,400,{error:'Decisión inválida'});r.wait={...r.wait,decision:b.decision,decisionAt:new Date().toISOString()};appendEvent(r,'wait_decision',{decision:b.decision});}
        else if(action==='delivery'){if(!b.photo)return json(res,400,{error:'La foto de entrega es obligatoria'});r.status='Entrega finalizada';r.courierStage='Entrega finalizada';r.evidence.deliveryPhoto=b.photo;r.finishedAt=new Date().toISOString();appendEvent(r,'delivery_completed',{note:String(b.note||'')});}
        else if(action==='deposit-evidence'){if(!b.photo)return json(res,400,{error:'La foto del depósito es obligatoria'});r.evidence.depositPhoto=b.photo;r.wallet={...r.wallet,depositPhoto:b.photo,depositedAmount:Number(b.amount||r.wallet?.collected||0),depositedAt:new Date().toISOString()};appendEvent(r,'deposit_evidence',{amount:r.wallet.depositedAmount});}
      }
      r.updatedAt=new Date().toISOString();await writeData(data);return json(res,200,sanitizeRequest(r));
    }

    if(req.method==='GET'&&pathname.startsWith('/invite/')){const token=decodeURIComponent(pathname.slice('/invite/'.length));const invite=(await readData()).invites.find(x=>x.token===token);if(!invite||invite.usedAt||Date.now()>Date.parse(invite.expiresAt))return json(res,404,{error:'Invitación inválida o vencida'});return json(res,200,{valid:true,label:invite.label,email:invite.email,whatsapp:invite.whatsapp,expiresAt:invite.expiresAt});}
    if(req.method==='POST'&&pathname.startsWith('/invite/')){const token=decodeURIComponent(pathname.slice('/invite/'.length));const b=await readBody(req);const required=['name','whatsapp','address','contactPhone','documentId','email'];const missing=required.filter(k=>!String(b[k]||'').trim());if(missing.length)return json(res,400,{error:'Faltan datos obligatorios',missing});const data=await readData();const invite=data.invites.find(x=>x.token===token);if(!invite||invite.usedAt||Date.now()>Date.parse(invite.expiresAt))return json(res,404,{error:'Invitación inválida o vencida'});const client={id:crypto.randomUUID(),name:String(b.name).trim(),whatsapp:String(b.whatsapp).trim(),address:String(b.address).trim(),contactPhone:String(b.contactPhone).trim(),documentId:String(b.documentId).trim(),email:String(b.email).trim().toLowerCase(),status:'Activo',createdAt:new Date().toISOString()};data.clients.unshift(client);invite.usedAt=new Date().toISOString();await writeData(data);return json(res,201,{ok:true,clientId:client.id});}
    return json(res,404,{error:'Ruta no encontrada'});
  }catch(error){console.error(error);return json(res,500,{error:'Error interno del servidor'});}
}
module.exports=handler;
if(require.main===module){http.createServer(handler).listen(PORT,()=>console.log(`GOY XPRESS API v4 escuchando en ${PORT}`));}
