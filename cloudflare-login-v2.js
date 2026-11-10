import { neon } from '@neondatabase/serverless';
import {ensureStateTable, readVersionedState, writeVersionedState} from './cloudflare-versioned-state.js';
import { derivePasswordHashHex, secureHexEqual } from './cloudflare-password.mjs';

const JSON_HEADERS = {
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'Content-Type, Authorization',
  'Access-Control-Allow-Methods':'POST,OPTIONS',
};

const LEGACY_PASSWORD_ITERATIONS = 180000;
const WORKER_PASSWORD_ITERATIONS = 100000;
const DEFAULT_ROLE_PERMISSIONS = {
  sales:['crm.contacts.read','crm.contacts.update','crm.contacts.assign','sales.prospects.read','sales.prospects.create','sales.prospects.update','procedures.read'],
  accounting:['crm.contacts.read_billing','operations.requests.read_billing','operations.evidence.read','accounting.read','accounting.entries.create','accounting.entries.update','accounting.reconcile','accounting.reports','procedures.read'],
  courier:['courier.jobs.read_assigned','courier.jobs.update_assigned','courier.evidence.upload','procedures.read'],
};
const LEGACY_AUTH_URL = 'https://br-proud-mouse-aw0hj9yz-legacyauth.compute.c-12.us-east-1.aws.neon.tech/';

function json(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
}
function normalizeEmail(value){return String(value||'').trim().toLowerCase();}
function normalizeUsername(value){return String(value||'').trim().toLowerCase();}
function cleanPhone(value){return String(value||'').replace(/\D/g,'');}
function bytesToBase64url(bytes){
  let binary='';
  for(const byte of bytes) binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function bytesToHex(bytes){return Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');}
function randomHex(size=16){const bytes=new Uint8Array(size);crypto.getRandomValues(bytes);return bytesToHex(bytes);}

async function signPayload(payload,secret){
  if(!secret) throw new Error('TOKEN_SECRET no configurado');
  const body=bytesToBase64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key=await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret)),
    {name:'HMAC',hash:'SHA-256'},
    false,
    ['sign'],
  );
  const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body));
  return `${body}.${bytesToBase64url(new Uint8Array(signature))}`;
}

async function hmacSha256Hex(secret,message){
  const key=await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret)),
    {name:'HMAC',hash:'SHA-256'},
    false,
    ['sign'],
  );
  const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(String(message)));
  return bytesToHex(new Uint8Array(signature));
}

function normalizeState(state){
  const normalized=state&&typeof state==='object'?state:{};
  for(const key of ['users','clients','couriers','requests','payments','invites','templates','walletEntries','monthlyArchives','customServices']){
    if(!Array.isArray(normalized[key]))normalized[key]=[];
  }
  return normalized;
}
async function readState(env){
  if(!env.DATABASE_URL)throw new Error('DATABASE_URL no configurado');
  const sql=neon(String(env.DATABASE_URL));
  await ensureStateTable(sql,normalizeState({}));
  return readVersionedState(sql,normalizeState);
}
async function writeState(env,state){
  if(!env.DATABASE_URL)throw new Error('DATABASE_URL no configurado');
  const sql=neon(String(env.DATABASE_URL));
  await writeVersionedState(sql,state,normalizeState);
}

function publicUser(user){
  const {passwordHash,passwordSalt,passwordIterations,pushTokens,...safe}=user||{};
  return safe;
}

function claimLegacyRequests(state,user){
  const userPhone=cleanPhone(user.phone),userEmail=normalizeEmail(user.email);
  let changed=false;
  for(const item of state.requests){
    if(item.clientId) continue;
    const phone=cleanPhone(item.phone||item.whatsapp),email=normalizeEmail(item.email);
    if((userPhone&&phone&&userPhone===phone)||(userEmail&&email&&userEmail===email)){
      item.clientId=user.id;
      item.clientLogo=user.logo||'';
      item.updatedAt=new Date().toISOString();
      changed=true;
    }
  }
  return changed;
}

async function sessionFor(user,env){
  const expiresIn=30*24*60*60;
  const token=await signPayload(
    {role:user.role,userId:user.id,exp:Date.now()+expiresIn*1000},
    env.TOKEN_SECRET,
  );
  return {token,expiresIn,user:publicUser(user),permissions:Array.isArray(user.permissions)?user.permissions:(DEFAULT_ROLE_PERMISSIONS[user.role]||[])};
}

function requestedStaffOrCourierRole(value){
  const role=String(value||'').trim().toLowerCase();
  return ['courier','sales','accounting'].includes(role)?role:'';
}

function findUser(state,role,identifier){
  return state.users.find(item=>item.role===role&&(
    (item.email&&normalizeEmail(item.email)===identifier)||
    (item.username&&normalizeUsername(item.username)===identifier)
  ));
}

async function verifyLegacyPassword(password,user){
  const body=JSON.stringify({
    password:String(password||''),
    salt:String(user.passwordSalt||''),
    hash:String(user.passwordHash||''),
  });
  const timestamp=String(Date.now());
  const signature=await hmacSha256Hex(user.passwordHash,`${timestamp}.${body}`);
  const controller=typeof AbortController!=='undefined'?new AbortController():null;
  const timer=controller?setTimeout(()=>controller.abort(),15000):null;
  try{
    const response=await fetch(LEGACY_AUTH_URL,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-goy-timestamp':timestamp,
        'x-goy-signature':signature,
      },
      body,
      signal:controller?.signal,
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      throw new Error(data.error||'No se pudo verificar la contraseña anterior.');
    }
    return Boolean(data.valid);
  }finally{
    if(timer) clearTimeout(timer);
  }
}

async function verifyPassword(password,user){
  const iterations=Number(user.passwordIterations||LEGACY_PASSWORD_ITERATIONS);
  if(!Number.isInteger(iterations)||iterations<1){
    throw new Error('La configuración de seguridad de esta cuenta no es válida.');
  }
  if(iterations>WORKER_PASSWORD_ITERATIONS){
    if(iterations!==LEGACY_PASSWORD_ITERATIONS){
      throw new Error('La contraseña de esta cuenta requiere migración administrativa.');
    }
    return {valid:await verifyLegacyPassword(password,user),iterations,legacy:true};
  }
  const passwordHash=await derivePasswordHashHex(password,user.passwordSalt,iterations);
  return {valid:secureHexEqual(passwordHash,user.passwordHash),iterations,legacy:false};
}

export async function authPasswordLoginV2(request,env){
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:JSON_HEADERS});
  try{
    if(!env.TOKEN_SECRET) return json({error:'Autenticación del servidor sin configurar.'},503);
    const body=await request.json().catch(()=>({}));
    const role=requestedStaffOrCourierRole(body.role);
    if(!role) return json({error:body.role==='client'?'El acceso de la app de clientes está deshabilitado. Gestiona tus órdenes por GOY XPRESS.':'Tipo de usuario no válido.'},body.role==='client'?410:400);
    const identifier=String(body.identifier||body.username||body.email||'').trim().toLowerCase();
    const password=String(body.password||'');
    if(!identifier||!password) return json({error:'Ingresa tu usuario/correo y contraseña.'},400);

    const state=await readState(env);
    const user=findUser(state,role,identifier);
    if(!user||user.active===false||!user.passwordSalt||!user.passwordHash){
      return json({error:'Usuario/correo o contraseña incorrectos.'},401);
    }

    const verification=await verifyPassword(password,user);
    if(!verification.valid){
      return json({error:'Usuario/correo o contraseña incorrectos.'},401);
    }
    if(!user.approved){
      return json({error:'Tu cuenta está pendiente de aprobación por el administrador.',pendingApproval:true,user:publicUser(user)},403);
    }

    let changed=false;
    if(verification.legacy){
      const newSalt=randomHex(16);
      user.passwordSalt=newSalt;
      user.passwordHash=await derivePasswordHashHex(password,newSalt,WORKER_PASSWORD_ITERATIONS);
      user.passwordIterations=WORKER_PASSWORD_ITERATIONS;
      user.updatedAt=new Date().toISOString();
      changed=true;
    }
    if(user.role==='client'&&claimLegacyRequests(state,user)) changed=true;
    if(changed) await writeState(env,state);

    return json(await sessionFor(user,env),200);
  }catch(error){
    console.error('GOY XPRESS password login v2',error);
    if(error?.name==='AbortError'){
      return json({error:'La verificación está tardando demasiado. Intenta nuevamente.'},503);
    }
    return json({error:'No se pudo completar el ingreso. Intenta nuevamente.'},503);
  }
}

export async function authChallengeV2(request,env){
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:JSON_HEADERS});
  try{
    if(!env.TOKEN_SECRET) return json({error:'Autenticación del servidor sin configurar.'},503);
    const body=await request.json().catch(()=>({}));
    const role=requestedStaffOrCourierRole(body.role);
    if(!role) return json({error:body.role==='client'?'El acceso de la app de clientes está deshabilitado. Gestiona tus órdenes por GOY XPRESS.':'Tipo de usuario no válido.'},body.role==='client'?410:400);
    const identifier=String(body.identifier||body.username||body.email||'').trim().toLowerCase();
    if(!identifier) return json({error:'Ingresa tu usuario o correo.'},400);

    const state=await readState(env);
    const user=findUser(state,role,identifier);
    if(!user||user.active===false||!user.passwordSalt||!user.passwordHash){
      return json({error:'Usuario/correo o contraseña incorrectos.'},401);
    }

    const iterations=Number(user.passwordIterations||LEGACY_PASSWORD_ITERATIONS);
    const expiresIn=5*60;
    const challenge=await signPayload(
      {kind:'password-proof',role,uid:user.id,nonce:crypto.randomUUID(),exp:Date.now()+expiresIn*1000},
      env.TOKEN_SECRET,
    );
    return json({challenge,salt:user.passwordSalt,iterations,hash:'sha512',expiresIn},200);
  }catch(error){
    console.error('GOY XPRESS auth challenge v2',error);
    return json({error:'No se pudo iniciar la verificación de acceso.'},503);
  }
}


function hexToBytes(value){
  const hex=String(value||'').trim();
  if(!hex||hex.length%2!==0||!/^[0-9a-f]+$/i.test(hex)) return new Uint8Array();
  const out=new Uint8Array(hex.length/2);
  for(let i=0;i<out.length;i++) out[i]=parseInt(hex.slice(i*2,i*2+2),16);
  return out;
}

async function verifyChallengePayload(token,secret){
  try{
    if(!token||!secret) return null;
    const [body,signature]=String(token).split('.');
    if(!body||!signature) return null;
    const normalized=signature.replace(/-/g,'+').replace(/_/g,'/');
    const padded=normalized+'='.repeat((4-(normalized.length%4))%4);
    const signatureBytes=Uint8Array.from(atob(padded),c=>c.charCodeAt(0));
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(secret)),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    const valid=await crypto.subtle.verify('HMAC',key,signatureBytes,new TextEncoder().encode(body));
    if(!valid) return null;
    const normalizedBody=body.replace(/-/g,'+').replace(/_/g,'/');
    const paddedBody=normalizedBody+'='.repeat((4-(normalizedBody.length%4))%4);
    const payload=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(paddedBody),c=>c.charCodeAt(0))));
    if(!payload.exp||Number(payload.exp)<=Date.now()) return null;
    return payload;
  }catch{return null;}
}

export async function authLoginProofV2(request,env){
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:JSON_HEADERS});
  try{
    if(!env.TOKEN_SECRET) return json({error:'Autenticación del servidor sin configurar.'},503);
    const body=await request.json().catch(()=>({}));
    const challenge=String(body.challenge||''),proof=String(body.proof||'').toLowerCase();
    const payload=await verifyChallengePayload(challenge,env.TOKEN_SECRET);
    if(!payload||payload.kind!=='password-proof'||!payload.uid||!['courier','sales','accounting'].includes(payload.role)){
      return json({error:'La verificación de acceso venció. Intenta nuevamente.'},401);
    }
    const state=await readState(env);
    const user=state.users.find(item=>String(item.id)===String(payload.uid)&&item.role===payload.role);
    if(!user||user.active===false||user.blocked===true||!user.passwordHash){
      return json({error:'Usuario/correo o contraseña incorrectos.'},401);
    }
    const storedKey=hexToBytes(user.passwordHash);
    if(storedKey.length!==64) return json({error:'Usuario/correo o contraseña incorrectos.'},401);
    const expected=await hmacSha256Hex(storedKey,challenge);
    if(!secureHexEqual(expected,proof)) return json({error:'Usuario/correo o contraseña incorrectos.'},401);
    if(!user.approved) return json({error:'Tu cuenta está pendiente de aprobación por el administrador.',pendingApproval:true,user:publicUser(user)},403);
    return json(await sessionFor(user,env),200);
  }catch(error){
    console.error('GOY XPRESS login proof v2',error);
    return json({error:'No se pudo completar el ingreso. Intenta nuevamente.'},503);
  }
}
