import { neon } from '@neondatabase/serverless';

const JSON_HEADERS = {
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'Content-Type, Authorization',
  'Access-Control-Allow-Methods':'POST,OPTIONS',
};

function json(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
}

function normalizeEmail(value){
  return String(value||'').trim().toLowerCase();
}

function cleanPhone(value){
  return String(value||'').replace(/\D/g,'');
}

function base64urlToBytes(value){
  const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=text+'='.repeat((4-(text.length%4))%4);
  return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));
}

function bytesToBase64url(bytes){
  let binary='';
  for(const byte of bytes) binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function hexToBytes(value){
  const hex=String(value||'').trim();
  if(!hex || hex.length%2!==0 || !/^[0-9a-f]+$/i.test(hex)) return new Uint8Array();
  const out=new Uint8Array(hex.length/2);
  for(let i=0;i<out.length;i++) out[i]=parseInt(hex.slice(i*2,i*2+2),16);
  return out;
}

function bytesToHex(bytes){
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}

function safeHexEqual(a,b){
  const x=hexToBytes(a),y=hexToBytes(b);
  if(!x.length || x.length!==y.length) return false;
  let diff=0;
  for(let i=0;i<x.length;i++) diff|=x[i]^y[i];
  return diff===0;
}

async function hmacSha256Hex(keyBytes,message){
  const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(String(message)));
  return bytesToHex(new Uint8Array(sig));
}

async function signPayload(payload,secret){
  if(!secret) throw new Error('TOKEN_SECRET no configurado');
  const bodyBytes=new TextEncoder().encode(JSON.stringify(payload));
  const body=bytesToBase64url(bodyBytes);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(secret)),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body));
  return `${body}.${bytesToBase64url(new Uint8Array(sig))}`;
}

async function verifyPayload(token,secret){
  try{
    if(!token||!secret) return null;
    const [body,signature]=String(token).split('.');
    if(!body||!signature) return null;
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(secret)),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    const valid=await crypto.subtle.verify('HMAC',key,base64urlToBytes(signature),new TextEncoder().encode(body));
    if(!valid) return null;
    const payload=JSON.parse(new TextDecoder().decode(base64urlToBytes(body)));
    if(!payload.exp||Number(payload.exp)<=Date.now()) return null;
    return payload;
  }catch{return null;}
}

async function readState(env){
  if(!env.DATABASE_URL) throw new Error('DATABASE_URL no configurado');
  const sql=neon(String(env.DATABASE_URL));
  const rows=await sql`SELECT data FROM goy_state WHERE id=1 LIMIT 1`;
  const state=rows[0]?.data||{};
  for(const key of ['users','clients','couriers','requests','payments','invites','templates','walletEntries','monthlyArchives']){
    if(!Array.isArray(state[key])) state[key]=[];
  }
  return state;
}

async function writeState(env,state){
  if(!env.DATABASE_URL) throw new Error('DATABASE_URL no configurado');
  const sql=neon(String(env.DATABASE_URL));
  await sql`UPDATE goy_state SET data=${JSON.stringify(state)}::jsonb, updated_at=NOW() WHERE id=1`;
}

function publicUser(user){
  const {passwordHash,passwordSalt,...safe}=user||{};
  return safe;
}

function claimLegacyRequests(state,user){
  const userPhone=cleanPhone(user.phone);
  const userEmail=normalizeEmail(user.email);
  let changed=false;
  for(const item of state.requests){
    if(item.clientId) continue;
    const phone=cleanPhone(item.phone||item.whatsapp);
    const email=normalizeEmail(item.email);
    if((userPhone&&phone&&userPhone===phone)||(userEmail&&email&&userEmail===email)){
      item.clientId=user.id;
      item.clientLogo=user.logo||'';
      item.updatedAt=new Date().toISOString();
      changed=true;
    }
  }
  return changed;
}

export async function authChallenge(request,env){
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:JSON_HEADERS});
  try{
    if(!env.TOKEN_SECRET) return json({error:'Autenticación del servidor sin configurar.'},503);
    const body=await request.json().catch(()=>({}));
    const role=body.role==='courier'?'courier':'client';
    const email=normalizeEmail(body.email);
    const state=await readState(env);
    const user=state.users.find(item=>item.role===role&&normalizeEmail(item.email)===email);
    if(!user||user.active===false||!user.passwordSalt||!user.passwordHash){
      return json({error:'Correo o contraseña incorrectos.'},401);
    }
    const iterations=Math.max(1,Number(user.passwordIterations||180000));
    const expiresIn=5*60;
    const challenge=await signPayload({
      kind:'password-proof',role,uid:user.id,
      nonce:crypto.randomUUID(),
      exp:Date.now()+expiresIn*1000,
    },env.TOKEN_SECRET);
    return json({challenge,salt:user.passwordSalt,iterations,hash:'sha512',expiresIn},200);
  }catch(error){
    console.error('GOY XPRESS auth challenge',error);
    return json({error:'No se pudo iniciar la verificación de acceso.'},503);
  }
}

export async function authLoginProof(request,env){
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:JSON_HEADERS});
  try{
    if(!env.TOKEN_SECRET) return json({error:'Autenticación del servidor sin configurar.'},503);
    const body=await request.json().catch(()=>({}));
    const challenge=String(body.challenge||'');
    const proof=String(body.proof||'').toLowerCase();
    const payload=await verifyPayload(challenge,env.TOKEN_SECRET);
    if(!payload||payload.kind!=='password-proof'||!payload.uid||!['client','courier'].includes(payload.role)){
      return json({error:'La verificación de acceso venció. Intenta nuevamente.'},401);
    }
    const state=await readState(env);
    const user=state.users.find(item=>String(item.id)===String(payload.uid)&&item.role===payload.role);
    if(!user||user.active===false||!user.passwordHash) return json({error:'Correo o contraseña incorrectos.'},401);
    const storedKey=hexToBytes(user.passwordHash);
    if(!storedKey.length) return json({error:'Correo o contraseña incorrectos.'},401);
    const expected=await hmacSha256Hex(storedKey,challenge);
    if(!safeHexEqual(expected,proof)) return json({error:'Correo o contraseña incorrectos.'},401);

    if(user.role==='client'&&claimLegacyRequests(state,user)) await writeState(env,state);
    const expiresIn=30*24*60*60;
    const token=await signPayload({role:user.role,userId:user.id,exp:Date.now()+expiresIn*1000},env.TOKEN_SECRET);
    return json({token,expiresIn,user:publicUser(user)},200);
  }catch(error){
    console.error('GOY XPRESS auth proof',error);
    return json({error:'No se pudo completar el ingreso. Intenta nuevamente.'},503);
  }
}
