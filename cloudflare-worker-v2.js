import { neon } from '@neondatabase/serverless';

const enc=new TextEncoder(),dec=new TextDecoder();
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const out=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
const b64=b=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=t=>Uint8Array.from(atob(t.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-t.length%4)%4)),c=>c.charCodeAt(0));
async function mac(t,s){const k=await crypto.subtle.importKey('raw',enc.encode(s),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(t))));}
async function sign(p,s){const body=b64(enc.encode(JSON.stringify(p)));return `${body}.${await mac(body,s)}`;}
async function verify(t,s){try{const [b,m]=String(t||'').split('.');if(!b||!m||m!==await mac(b,s))return null;const p=JSON.parse(dec.decode(unb64(b)));return p.exp>Date.now()?p:null;}catch{return null;}}
const bearer=r=>(r.headers.get('Authorization')||'').replace(/^Bearer\s+/,'');
function clean(v){const d=v&&typeof v==='object'?v:{};for(const k of ['users','clients','couriers','requests','payments','invites','templates','walletEntries','monthlyArchives'])if(!Array.isArray(d[k]))d[k]=[];return d;}
async function sql(env){if(!env.DATABASE_URL)throw new Error('DATABASE_URL no configurado');const s=neon(env.DATABASE_URL);await s`CREATE TABLE IF NOT EXISTS goy_state (id INTEGER PRIMARY KEY,data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;await s`INSERT INTO goy_state (id,data) VALUES (1,${JSON.stringify(clean({}))}::jsonb) ON CONFLICT (id) DO NOTHING`;return s;}
async function read(env){const s=await sql(env),r=await s`SELECT data FROM goy_state WHERE id=1 LIMIT 1`;return clean(r[0]?.data||{});}
async function write(env,d){const s=await sql(env);await s`UPDATE goy_state SET data=${JSON.stringify(clean(d))}::jsonb,updated_at=NOW() WHERE id=1`;}
async function admin(r,e){const p=await verify(bearer(r),e.TOKEN_SECRET);return p?.role==='admin';}
async function api(r,e,u){const p=u.pathname.slice(4)||'/';
 if(r.method==='GET'&&p==='/health'){try{const d=await read(e);return out({ok:true,database:'connected',counts:{clients:d.clients.length,couriers:d.couriers.length,requests:d.requests.length}});}catch(x){return out({ok:false,error:x.message},503);}}
 if(r.method==='POST'&&p==='/admin/login'){const b=await r.json().catch(()=>({}));if(!e.ADMIN_EMAIL||!e.ADMIN_PASSWORD||!e.TOKEN_SECRET)return out({error:'Credenciales del administrador sin configurar.'},503);if(String(b.email||'').trim().toLowerCase()!==String(e.ADMIN_EMAIL).trim().toLowerCase()||String(b.password||'')!==String(e.ADMIN_PASSWORD))return out({error:'Correo o contraseña incorrectos.'},401);const expiresIn=43200;return out({token:await sign({role:'admin',exp:Date.now()+expiresIn*1000},e.TOKEN_SECRET),expiresIn});}
 if(!await admin(r,e))return out({error:'No autorizado'},401);const d=await read(e);
 if(r.method==='GET'&&p==='/admin/data'){const cycles=[...new Set(d.requests.map(x=>x.cycleKey).filter(Boolean))].sort().reverse(),active=u.searchParams.get('cycle')||cycles[0]||'';return out({clients:d.clients,couriers:d.couriers,requests:active?d.requests.filter(x=>x.cycleKey===active):d.requests,payments:d.payments,activeCycle:active,availableCycles:cycles});}
 const m=p.match(/^\/admin\/requests\/([^/]+)$/);if(r.method==='PATCH'&&m){const b=await r.json().catch(()=>({})),item=d.requests.find(x=>x.code===decodeURIComponent(m[1])||x.id===decodeURIComponent(m[1]));if(!item)return out({error:'Solicitud no encontrada.'},404);Object.assign(item,b,{updatedAt:new Date().toISOString()});await write(e,d);return out({request:item});}
 return out({error:'Ruta API aún no migrada.',path:p},404);
}
async function asset(r,e,u,p){const a=new URL(u);a.pathname=p;return e.ASSETS.fetch(new Request(a,r));}
export default{async fetch(r,e){const u=new URL(r.url),p=u.pathname;try{if(p.startsWith('/api/'))return api(r,e,u);if(p==='/admin'||p==='/admin/')return asset(r,e,u,'/');if(p.startsWith('/admin/'))return asset(r,e,u,p.slice(6));let q=p;if(q==='/inicio')q='/';if(q==='/servicio')q='/service.html';if(q.startsWith('/web/'))q=q.slice(4)||'/';return asset(r,e,u,q);}catch(x){console.error(x);return out({error:'Error interno del servidor.',detail:x.message},500);}}};
