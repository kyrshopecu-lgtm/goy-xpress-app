import { neon } from '@neondatabase/serverless';

const enc = new TextEncoder();
const dec = new TextDecoder();
const jsonHeaders = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};

function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:jsonHeaders});}
function b64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function b64decode(text){const b64=text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4);return Uint8Array.from(atob(b64),c=>c.charCodeAt(0));}
async function hmac(text,secret){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(text))));}
async function signToken(payload,secret){const body=b64url(enc.encode(JSON.stringify(payload)));return `${body}.${await hmac(body,secret)}`;}
async function verifyToken(token,secret){try{const [body,sig]=String(token||'').split('.');if(!body||!sig||!secret)return null;const expected=await hmac(body,secret);if(sig!==expected)return null;const payload=JSON.parse(dec.decode(b64decode(body)));return payload.exp&&Date.now()<payload.exp?payload:null;}catch{return null;}}
function bearer(request){const value=request.headers.get('Authorization')||'';return value.startsWith('Bearer ')?value.slice(7):'';}
function cleanData(value){const data=value&&typeof value==='object'?value:{};for(const key of ['users','clients','couriers','requests','payments','invites','templates','walletEntries','monthlyArchives'])if(!Array.isArray(data[key]))data[key]=[];return data;}
async function db(env){if(!env.DATABASE_URL)throw new Error('DATABASE_URL no configurado');const sql=neon(env.DATABASE_URL);await sql`CREATE TABLE IF NOT EXISTS goy_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;await sql`INSERT INTO goy_state (id,data) VALUES (1,${JSON.stringify(cleanData({}))}::jsonb) ON CONFLICT (id) DO NOTHING`;return sql;}
async function readState(env){const sql=await db(env);const rows=await sql`SELECT data FROM goy_state WHERE id=1 LIMIT 1`;return cleanData(rows[0]?.data||{});}
async function writeState(env,data){const sql=await db(env);await sql`UPDATE goy_state SET data=${JSON.stringify(cleanData(data))}::jsonb, updated_at=NOW() WHERE id=1`;}
async function requireAdmin(request,env){const payload=await verifyToken(bearer(request),env.TOKEN_SECRET);return payload?.role==='admin'?payload:null;}
function cycles(data){return [...new Set(data.requests.map(x=>x.cycleKey).filter(Boolean))].sort().reverse();}
async function api(request,env,url){
  const p=url.pathname.replace(/^\/api/,'')||'/';
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...jsonHeaders,'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Request-Secret','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'}});
  if(request.method==='GET'&&p==='/health'){
    try{const data=await readState(env);return json({ok:true,database:'connected',counts:{clients:data.clients.length,couriers:data.couriers.length,requests:data.requests.length}});}catch(error){return json({ok:false,error:error.message},503);}
  }
  if(request.method==='POST'&&p==='/admin/login'){
    if(!env.ADMIN_EMAIL||!env.ADMIN_PASSWORD||!env.TOKEN_SECRET)return json({error:'Credenciales del administrador sin configurar.'},503);
    const body=await request.json().catch(()=>({}));
    const email=String(body.email||'').trim().toLowerCase();
    if(email!==String(env.ADMIN_EMAIL).trim().toLowerCase()||String(body.password||'')!==String(env.ADMIN_PASSWORD))return json({error:'Correo o contraseña incorrectos.'},401);
    const expiresIn=12*60*60;const token=await signToken({role:'admin',exp:Date.now()+expiresIn*1000},env.TOKEN_SECRET);return json({token,expiresIn});
  }
  const admin=await requireAdmin(request,env);if(!admin)return json({error:'No autorizado'},401);
  const data=await readState(env);
  if(request.method==='GET'&&p==='/admin/data'){
    const availableCycles=cycles(data);const requested=url.searchParams.get('cycle');const activeCycle=requested||availableCycles[0]||'';const requests=activeCycle?data.requests.filter(x=>x.cycleKey===activeCycle):data.requests;
    return json({clients:data.clients,couriers:data.couriers,requests,payments:data.payments,activeCycle,availableCycles});
  }
  const match=p.match(/^\/admin\/requests\/([^/]+)$/);
  if(request.method==='PATCH'&&match){const code=decodeURIComponent(match[1]);const body=await request.json().catch(()=>({}));const item=data.requests.find(x=>x.code===code||x.id===code);if(!item)return json({error:'Solicitud no encontrada.'},404);Object.assign(item,body,{updatedAt:new Date().toISOString()});await writeState(env,data);return json({request:item});}
  return json({error:'Ruta API aún no migrada.',path:p},404);
}

async function asset(request,env,url,path){const u=new URL(url);u.pathname=path;return env.ASSETS.fetch(new Request(u,request));}
export default {async fetch(request,env){const url=new URL(request.url);let path=url.pathname;
  try{
    if(path.startsWith('/api/'))return await api(request,env,url);
    if(path==='/admin'||path==='/admin/')return asset(request,env,url,'/admin/index.html');
    if(path.startsWith('/admin/'))return asset(request,env,url,path);
    if(path==='/inicio')path='/';if(path==='/servicio')path='/service.html';if(path.startsWith('/web/'))path=path.slice(4)||'/';
    return asset(request,env,url,path);
  }catch(error){console.error('GOY XPRESS Worker',error);return json({error:'Error interno del servidor.',detail:error.message},500);}
}};
