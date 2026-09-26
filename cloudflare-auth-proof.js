import { neon } from '@neondatabase/serverless';
import {
  DEFAULT_PASSWORD_ITERATIONS,
  derivePasswordHashHex,
  secureHexEqual,
} from './cloudflare-password.mjs';

const JSON_HEADERS = {
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'Content-Type, Authorization',
  'Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS',
};
const DEFAULT_ITERATIONS = DEFAULT_PASSWORD_ITERATIONS;

function json(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
}
function normalizeEmail(value){return String(value||'').trim().toLowerCase();}
function normalizeUsername(value){return String(value||'').trim().toLowerCase();}
function cleanPhone(value){return String(value||'').replace(/\D/g,'');}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));}
function validUsername(value){return /^[a-z0-9._-]{3,30}$/.test(normalizeUsername(value));}
function validatePassword(value){
  const password=String(value||'');
  if(password.length<8) return 'La contraseña debe tener al menos 8 caracteres.';
  if(!/[A-Za-z]/.test(password)||!/\d/.test(password)) return 'La contraseña debe incluir letras y números.';
  return '';
}
function validImageDataUrl(value){
  if(!value) return true;
  const text=String(value);
  if(text.length>1800000) return false;
  return /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(text);
}
function validMapsUrl(value){
  if(!value) return true;
  try{
    const url=new URL(String(value).trim());
    return /^https?:$/.test(url.protocol)&&/(^|\.)google\.(com|[a-z.]+)$|(^|\.)goo\.gl$|(^|\.)maps\.app\.goo\.gl$/i.test(url.hostname);
  }catch{return false;}
}
function parseMapLocation(value){
  const text=String(value||'').trim();
  if(!text) return null;
  const patterns=[/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,/query=(-?\d{1,2}\.\d+)%?2C(-?\d{1,3}\.\d+)/,/query=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,/q=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/];
  for(const pattern of patterns){
    const match=text.match(pattern);
    if(!match) continue;
    const latitude=Number(match[1]),longitude=Number(match[2]);
    if(Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180) return {latitude,longitude};
  }
  return null;
}
function normalizeBankAccounts(value){
  if(value===undefined) return undefined;
  const list=Array.isArray(value)?value:[];
  return list.slice(0,8).map(item=>({
    id:String(item?.id||crypto.randomUUID()),
    bank:String(item?.bank||'').trim().slice(0,80),
    accountType:String(item?.accountType||'').trim().slice(0,40),
    accountNumber:String(item?.accountNumber||'').trim().replace(/\s+/g,'').slice(0,40),
    holderName:String(item?.holderName||'').trim().slice(0,120),
    holderDocument:String(item?.holderDocument||'').trim().slice(0,30),
    notes:String(item?.notes||'').trim().slice(0,180),
  })).filter(item=>item.bank||item.accountNumber||item.holderName);
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
  if(!hex||hex.length%2!==0||!/^[0-9a-f]+$/i.test(hex)) return new Uint8Array();
  const out=new Uint8Array(hex.length/2);
  for(let i=0;i<out.length;i++) out[i]=parseInt(hex.slice(i*2,i*2+2),16);
  return out;
}
function bytesToHex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
function randomHex(size=16){const bytes=new Uint8Array(size);crypto.getRandomValues(bytes);return bytesToHex(bytes);}
function safeHexEqual(a,b){
  const x=hexToBytes(a),y=hexToBytes(b);
  if(!x.length||x.length!==y.length) return false;
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
  const body=bytesToBase64url(new TextEncoder().encode(JSON.stringify(payload)));
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
  const {passwordHash,passwordSalt,passwordIterations,pushTokens,...safe}=user||{};
  return safe;
}
function userDisplayName(user){return String(user?.businessName||user?.name||user?.email||'Usuario').trim();}
function syncUserMirror(state,user){
  if(user.role==='client'){
    const item={id:user.id,userId:user.id,name:user.name,businessName:user.businessName,username:user.username||'',whatsapp:user.phone,phone:user.phone,email:user.email||'',documentId:user.documentId||'',address:user.address||'',mapUrl:user.mapUrl||'',location:user.location||null,logo:user.logo||'',bankAccounts:Array.isArray(user.bankAccounts)?user.bankAccounts:[],approved:Boolean(user.approved),active:user.active!==false,status:user.active===false?'Inactivo':user.approved?'Activo':'Pendiente de aprobación',registeredAt:user.createdAt};
    const i=state.clients.findIndex(x=>x.userId===user.id||x.id===user.id);
    if(i>=0) state.clients[i]={...state.clients[i],...item}; else state.clients.unshift(item);
  }
  if(user.role==='courier'){
    const item={id:user.id,userId:user.id,name:user.name,fullName:user.name,whatsapp:user.phone,phone:user.phone,email:user.email,photo:user.photo||'',approved:Boolean(user.approved),active:user.active!==false,status:user.active===false?'Inactivo':user.approved?'Disponible':'Pendiente de aprobación',registeredAt:user.createdAt};
    const i=state.couriers.findIndex(x=>x.userId===user.id||x.id===user.id);
    if(i>=0) state.couriers[i]={...state.couriers[i],...item}; else state.couriers.unshift(item);
  }
}
function bearer(request){
  const authorization=String(request.headers.get('Authorization')||'');
  return authorization.startsWith('Bearer ')?authorization.slice(7):'';
}
function isActiveStatus(status){
  return !['finished','cancelled','entregado','finalizado','cancelado','entrega finalizada'].includes(String(status||'').trim().toLowerCase());
}
function belongsToClient(request,client,user){
  const ids=[client?.id,client?.userId,user?.id].filter(Boolean).map(String);
  const requestIds=[request?.clientId,request?.userId,request?.customerId,request?.clientUserId].filter(Boolean).map(String);
  if(ids.some(id=>requestIds.includes(id))) return true;
  const phone=cleanPhone(client?.phone||client?.whatsapp||user?.phone);
  if(phone&&phone===cleanPhone(request?.phone||request?.whatsapp)) return true;
  const email=normalizeEmail(client?.email||user?.email);
  return Boolean(email&&email===normalizeEmail(request?.email));
}
function claimLegacyRequests(state,user){
  const userPhone=cleanPhone(user.phone),userEmail=normalizeEmail(user.email);let changed=false;
  for(const item of state.requests){
    if(item.clientId) continue;
    const phone=cleanPhone(item.phone||item.whatsapp),email=normalizeEmail(item.email);
    if((userPhone&&phone&&userPhone===phone)||(userEmail&&email&&userEmail===email)){
      item.clientId=user.id;item.clientLogo=user.logo||'';item.updatedAt=new Date().toISOString();changed=true;
    }
  }
  return changed;
}
async function sessionFor(user,env){
  const expiresIn=30*24*60*60;
  const token=await signPayload({role:user.role,userId:user.id,exp:Date.now()+expiresIn*1000},env.TOKEN_SECRET);
  return {token,expiresIn,user:publicUser(user)};
}

export async function authPasswordLogin(request,env){
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:JSON_HEADERS});
  try{
    if(!env.TOKEN_SECRET) return json({error:'Autenticación del servidor sin configurar.'},503);
    const body=await request.json().catch(()=>({}));
    const role=body.role==='courier'?'courier':'client';
    const identifier=String(body.identifier||body.username||body.email||'').trim().toLowerCase();
    const password=String(body.password||'');
    if(!identifier||!password) return json({error:'Ingresa tu usuario/correo y contraseña.'},400);

    const state=await readState(env);
    const user=state.users.find(item=>item.role===role&&(
      (item.email&&normalizeEmail(item.email)===identifier)||
      (item.username&&normalizeUsername(item.username)===identifier)
    ));
    if(!user||user.active===false||!user.passwordSalt||!user.passwordHash){
      return json({error:'Usuario/correo o contraseña incorrectos.'},401);
    }

    const passwordHash=await derivePasswordHashHex(
      password,
      user.passwordSalt,
      Number(user.passwordIterations||DEFAULT_ITERATIONS),
    );
    if(!secureHexEqual(passwordHash,user.passwordHash)){
      return json({error:'Usuario/correo o contraseña incorrectos.'},401);
    }
    if(!user.approved){
      return json({error:'Tu cuenta está pendiente de aprobación por el administrador.',pendingApproval:true,user:publicUser(user)},403);
    }
    if(user.role==='client'&&claimLegacyRequests(state,user)) await writeState(env,state);
    return json(await sessionFor(user,env),200);
  }catch(error){
    console.error('GOY XPRESS password login',error);
    return json({error:'No se pudo completar el ingreso. Intenta nuevamente.'},503);
  }
}

export async function authPasswordRegister(request,env,forcedRole){
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:JSON_HEADERS});
  try{
    if(!env.TOKEN_SECRET) return json({error:'Autenticación del servidor sin configurar.'},503);
    const body=await request.json().catch(()=>({}));
    const role=forcedRole==='courier'?'courier':'client';
    const state=await readState(env);
    const inviteToken=String(body.inviteToken||'').trim();
    let invite=null;
    if(inviteToken){
      invite=state.invites.find(item=>String(item.token)===inviteToken);
      if(!invite||invite.usedAt||new Date(invite.expiresAt).getTime()<Date.now()){
        return json({error:'Invitación inválida, utilizada o vencida.'},404);
      }
      if(role!=='client') return json({error:'Esta invitación corresponde a una cuenta de cliente.'},400);
    }

    const email=normalizeEmail(body.email||invite?.email);
    const username=normalizeUsername(body.username);
    const phone=cleanPhone(body.phone||body.whatsapp||invite?.whatsapp);
    const name=String(body.name||'').trim();
    const passwordError=validatePassword(body.password);
    if(!validEmail(email)) return json({error:'Ingresa un correo electrónico válido.'},400);
    if(username&&!validUsername(username)) return json({error:'El usuario debe tener entre 3 y 30 caracteres y usar solo letras, números, punto, guion o guion bajo.'},400);
    if(phone.length<9) return json({error:'Ingresa un número de WhatsApp válido.'},400);
    if(name.length<2) return json({error:'Ingresa tu nombre completo.'},400);
    if(passwordError) return json({error:passwordError},400);
    const image=role==='client'?body.logo:body.photo;
    if(!validImageDataUrl(image)) return json({error:'La imagen de perfil no es válida o es demasiado grande.'},400);
    if(state.users.some(user=>normalizeEmail(user.email)===email)) return json({error:'Este correo ya está registrado. Inicia sesión.'},409);
    if(username&&state.users.some(user=>normalizeUsername(user.username)===username)) return json({error:'Ya existe una cuenta con este nombre de usuario.'},409);

    const passwordSalt=randomHex(16);
    const passwordHash=await derivePasswordHashHex(body.password,passwordSalt,DEFAULT_ITERATIONS);
    const now=new Date().toISOString();
    const approved=Boolean(invite);
    const user={
      id:crypto.randomUUID(),role,name,
      businessName:role==='client'?String(body.businessName||body.companyName||invite?.label||'').trim():'',
      username,email,phone,
      documentId:role==='client'?String(body.documentId||'').trim():'',
      address:role==='client'?String(body.address||'').trim():'',
      logo:role==='client'?String(body.logo||''):'',
      photo:role==='courier'?String(body.photo||''):'',
      approved,active:true,passwordSalt,passwordHash,passwordIterations:DEFAULT_ITERATIONS,
      createdAt:now,updatedAt:now,createdBy:invite?'invitation':'self-registration',
    };
    state.users.unshift(user);
    syncUserMirror(state,user);
    if(user.role==='client') claimLegacyRequests(state,user);
    if(invite) invite.usedAt=now;
    await writeState(env,state);
    return json({
      ok:true,
      user:publicUser(user),
      pendingApproval:!approved,
      message:approved
        ? 'Cuenta creada y habilitada. Ya puedes ingresar a GOY XPRESS.'
        : 'Registro recibido. Tu cuenta debe ser aprobada por el administrador antes de usar la aplicación.',
    },201);
  }catch(error){
    console.error('GOY XPRESS password register',error);
    return json({error:'No se pudo completar el registro. Intenta nuevamente.'},503);
  }
}

export async function adminClientAccounts(request,env,rawId=''){
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:JSON_HEADERS});
  try{
    const payload=await verifyPayload(bearer(request),env.TOKEN_SECRET);
    if(!payload||payload.role!=='admin') return json({error:'No autorizado'},401);
    const state=await readState(env);

    if(request.method==='POST'&&!rawId){
      const body=await request.json().catch(()=>({}));
      const email=normalizeEmail(body.email),username=normalizeUsername(body.username),phone=cleanPhone(body.phone||body.whatsapp);
      const name=String(body.name||'').trim(),businessName=String(body.businessName||'').trim(),documentId=String(body.documentId||'').trim();
      const address=String(body.address||'').trim(),mapUrl=String(body.mapUrl||'').trim(),logo=String(body.logo||'');
      const bankAccounts=normalizeBankAccounts(body.bankAccounts)||[];
      if(name.length<2) return json({error:'Ingresa el nombre del cliente.'},400);
      if(!validUsername(username)) return json({error:'El usuario debe tener entre 3 y 30 caracteres y usar solo letras, números, punto, guion o guion bajo.'},400);
      if(email&&!validEmail(email)) return json({error:'Ingresa un correo electrónico válido o déjalo vacío.'},400);
      if(phone.length<9) return json({error:'Ingresa un número de WhatsApp válido.'},400);
      if(!validMapsUrl(mapUrl)) return json({error:'Pega un enlace válido de Google Maps.'},400);
      if(!validImageDataUrl(logo)) return json({error:'La imagen no es válida o es demasiado grande.'},400);
      const passwordError=validatePassword(body.password);
      if(passwordError) return json({error:passwordError},400);
      if(state.users.some(user=>normalizeUsername(user.username)===username)) return json({error:'Ya existe una cuenta con este nombre de usuario.'},409);
      if(email&&state.users.some(user=>normalizeEmail(user.email)===email)) return json({error:'Ya existe una cuenta con este correo.'},409);

      const passwordSalt=randomHex(16);
      const passwordHash=await derivePasswordHashHex(body.password,passwordSalt,DEFAULT_ITERATIONS);
      const now=new Date().toISOString();
      const user={
        id:crypto.randomUUID(),role:'client',name,businessName,username,email,phone,documentId,address,mapUrl,
        location:parseMapLocation(mapUrl),logo,bankAccounts,approved:true,active:true,passwordSalt,passwordHash,
        passwordIterations:DEFAULT_ITERATIONS,createdAt:now,updatedAt:now,createdBy:'admin',
      };
      state.users.unshift(user);
      syncUserMirror(state,user);
      await writeState(env,state);
      return json({user:publicUser(user),message:'Cliente creado y habilitado para iniciar sesión.'},201);
    }

    const id=decodeURIComponent(String(rawId||''));
    if(!id) return json({error:'Cliente no especificado.'},400);
    const userIndex=state.users.findIndex(user=>user.role==='client'&&String(user.id)===id);
    const clientIndex=state.clients.findIndex(client=>String(client.id)===id||String(client.userId)===id);
    if(userIndex<0&&clientIndex<0) return json({error:'Cliente no encontrado.'},404);
    const currentUser=userIndex>=0?state.users[userIndex]:null;
    const currentClient=clientIndex>=0?state.clients[clientIndex]:null;

    if(request.method==='PATCH'){
      const body=await request.json().catch(()=>({}));
      const base=currentUser||currentClient||{};
      const email=normalizeEmail(body.email!==undefined?body.email:base.email);
      const username=normalizeUsername(body.username!==undefined?body.username:base.username);
      const phone=cleanPhone(body.phone!==undefined?body.phone:(body.whatsapp!==undefined?body.whatsapp:(base.phone||base.whatsapp)));
      const name=String(body.name!==undefined?body.name:base.name||'').trim();
      const businessName=String(body.businessName!==undefined?body.businessName:base.businessName||'').trim();
      const documentId=String(body.documentId!==undefined?body.documentId:base.documentId||'').trim();
      const address=String(body.address!==undefined?body.address:base.address||'').trim();
      const mapUrl=String(body.mapUrl!==undefined?body.mapUrl:base.mapUrl||'').trim();
      const logo=String(body.logo!==undefined?body.logo:base.logo||'');
      const bankAccounts=body.bankAccounts!==undefined?(normalizeBankAccounts(body.bankAccounts)||[]):(Array.isArray(base.bankAccounts)?base.bankAccounts:[]);
      if(name.length<2) return json({error:'Ingresa el nombre del cliente.'},400);
      if(username&&!validUsername(username)) return json({error:'El usuario debe tener entre 3 y 30 caracteres y usar solo letras, números, punto, guion o guion bajo.'},400);
      if(email&&!validEmail(email)) return json({error:'Ingresa un correo electrónico válido o déjalo vacío.'},400);
      if(phone.length<9) return json({error:'Ingresa un número de WhatsApp válido.'},400);
      if(!validMapsUrl(mapUrl)) return json({error:'Pega un enlace válido de Google Maps.'},400);
      if(!validImageDataUrl(logo)) return json({error:'La imagen no es válida o es demasiado grande.'},400);
      if(username&&state.users.some((user,index)=>index!==userIndex&&normalizeUsername(user.username)===username)) return json({error:'Ya existe una cuenta con este nombre de usuario.'},409);
      if(email&&state.users.some((user,index)=>index!==userIndex&&normalizeEmail(user.email)===email)) return json({error:'Ya existe una cuenta con este correo.'},409);

      const location=parseMapLocation(mapUrl)||(mapUrl?base.location:null);
      const now=new Date().toISOString();
      let user=currentUser;
      if(user){
        user={...user,name,businessName,username,email,phone,documentId,address,mapUrl,location,logo,bankAccounts,updatedAt:now};
        if(body.password){
          const passwordError=validatePassword(body.password);
          if(passwordError) return json({error:passwordError},400);
          user.passwordSalt=randomHex(16);
          user.passwordHash=await derivePasswordHashHex(body.password,user.passwordSalt,DEFAULT_ITERATIONS);
          user.passwordIterations=DEFAULT_ITERATIONS;
        }
        state.users[userIndex]=user;
        syncUserMirror(state,user);
      }else{
        state.clients[clientIndex]={...currentClient,name,businessName,username,email,phone,whatsapp:phone,documentId,address,mapUrl,location,logo,bankAccounts,updatedAt:now};
      }
      await writeState(env,state);
      const client=state.clients.find(item=>String(item.id)===id||String(item.userId)===id)||null;
      return json({client,user:user?publicUser(user):null,message:'Cliente actualizado.'},200);
    }

    if(request.method==='DELETE'){
      const active=state.requests.filter(item=>belongsToClient(item,currentClient,currentUser)&&isActiveStatus(item.status));
      if(active.length) return json({error:`No se puede borrar este cliente porque tiene ${active.length} solicitud(es) activa(s). Finalízalas o cancélalas primero.`},409);
      if(userIndex>=0) state.users.splice(userIndex,1);
      if(clientIndex>=0) state.clients.splice(clientIndex,1);
      await writeState(env,state);
      return json({message:'Cliente eliminado. El historial de solicitudes finalizadas se conserva.'},200);
    }

    return json({error:'Método no permitido.'},405);
  }catch(error){
    console.error('GOY XPRESS native admin clients',error);
    return json({error:error.message||'No se pudo procesar el cliente.'},503);
  }
}

export async function authChallenge(request,env){
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:JSON_HEADERS});
  try{
    if(!env.TOKEN_SECRET) return json({error:'Autenticación del servidor sin configurar.'},503);
    const body=await request.json().catch(()=>({}));
    const role=body.role==='courier'?'courier':'client';
    const identifier=String(body.identifier||body.username||body.email||'').trim().toLowerCase();
    const state=await readState(env);
    const user=state.users.find(item=>item.role===role&&((item.email&&normalizeEmail(item.email)===identifier)||(item.username&&normalizeUsername(item.username)===identifier)));
    if(!user||user.active===false||!user.passwordSalt||!user.passwordHash) return json({error:'Usuario/correo o contraseña incorrectos.'},401);
    const iterations=Math.max(1,Number(user.passwordIterations||DEFAULT_ITERATIONS));
    const expiresIn=5*60;
    const challenge=await signPayload({kind:'password-proof',role,uid:user.id,nonce:crypto.randomUUID(),exp:Date.now()+expiresIn*1000},env.TOKEN_SECRET);
    return json({challenge,salt:user.passwordSalt,iterations,hash:'sha512',expiresIn},200);
  }catch(error){console.error('GOY XPRESS auth challenge',error);return json({error:'No se pudo iniciar la verificación de acceso.'},503);}
}

export async function authLoginProof(request,env){
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:JSON_HEADERS});
  try{
    if(!env.TOKEN_SECRET) return json({error:'Autenticación del servidor sin configurar.'},503);
    const body=await request.json().catch(()=>({}));
    const challenge=String(body.challenge||''),proof=String(body.proof||'').toLowerCase();
    const payload=await verifyPayload(challenge,env.TOKEN_SECRET);
    if(!payload||payload.kind!=='password-proof'||!payload.uid||!['client','courier'].includes(payload.role)) return json({error:'La verificación de acceso venció. Intenta nuevamente.'},401);
    const state=await readState(env);
    const user=state.users.find(item=>String(item.id)===String(payload.uid)&&item.role===payload.role);
    if(!user||user.active===false||!user.passwordHash) return json({error:'Usuario/correo o contraseña incorrectos.'},401);
    const storedKey=hexToBytes(user.passwordHash);
    if(storedKey.length!==64) return json({error:'Usuario/correo o contraseña incorrectos.'},401);
    const expected=await hmacSha256Hex(storedKey,challenge);
    if(!safeHexEqual(expected,proof)) return json({error:'Usuario/correo o contraseña incorrectos.'},401);
    if(!user.approved) return json({error:'Tu cuenta está pendiente de aprobación por el administrador.',pendingApproval:true,user:publicUser(user)},403);
    if(user.role==='client'&&claimLegacyRequests(state,user)) await writeState(env,state);
    return json(await sessionFor(user,env),200);
  }catch(error){console.error('GOY XPRESS auth proof',error);return json({error:'No se pudo completar el ingreso. Intenta nuevamente.'},503);}
}

export async function authRegisterParams(request,env){
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:JSON_HEADERS});
  try{
    if(!env.TOKEN_SECRET) return json({error:'Autenticación del servidor sin configurar.'},503);
    const body=await request.json().catch(()=>({}));
    const role=body.role==='courier'?'courier':'client';
    const email=normalizeEmail(body.email);
    if(!validEmail(email)) return json({error:'Ingresa un correo electrónico válido.'},400);
    const state=await readState(env);
    if(state.users.some(user=>normalizeEmail(user.email)===email)) return json({error:'Este correo ya está registrado. Inicia sesión.'},409);
    const salt=randomHex(16),iterations=DEFAULT_ITERATIONS,expiresIn=10*60;
    const challenge=await signPayload({kind:'register-proof',role,email,salt,iterations,nonce:crypto.randomUUID(),exp:Date.now()+expiresIn*1000},env.TOKEN_SECRET);
    return json({challenge,salt,iterations,hash:'sha512',expiresIn},200);
  }catch(error){console.error('GOY XPRESS register params',error);return json({error:'No se pudo preparar el registro.'},503);}
}

export async function authRegisterProof(request,env){
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:JSON_HEADERS});
  try{
    if(!env.TOKEN_SECRET) return json({error:'Autenticación del servidor sin configurar.'},503);
    const body=await request.json().catch(()=>({}));
    const challenge=String(body.challenge||'');
    const payload=await verifyPayload(challenge,env.TOKEN_SECRET);
    if(!payload||payload.kind!=='register-proof'||!['client','courier'].includes(payload.role)) return json({error:'El registro venció. Intenta nuevamente.'},401);
    const email=normalizeEmail(body.email),phone=cleanPhone(body.phone||body.whatsapp),name=String(body.name||'').trim();
    if(email!==payload.email||!validEmail(email)) return json({error:'Correo de registro no válido.'},400);
    if(phone.length<9) return json({error:'Ingresa un número de WhatsApp válido.'},400);
    if(name.length<2) return json({error:'Ingresa tu nombre completo.'},400);
    const passwordError=validatePassword(body.password);if(passwordError) return json({error:passwordError},400);
    const passwordHash=String(body.passwordHash||'').toLowerCase();
    if(!/^[0-9a-f]{128}$/.test(passwordHash)) return json({error:'No se pudo proteger la contraseña. Intenta nuevamente.'},400);
    const image=payload.role==='client'?body.logo:body.photo;
    if(!validImageDataUrl(image)) return json({error:'La imagen de perfil no es válida o es demasiado grande.'},400);
    const state=await readState(env);
    if(state.users.some(user=>normalizeEmail(user.email)===email)) return json({error:'Este correo ya está registrado. Inicia sesión.'},409);
    const now=new Date().toISOString();
    const user={
      id:crypto.randomUUID(),role:payload.role,name,
      businessName:payload.role==='client'?String(body.businessName||body.companyName||'').trim():'',
      email,phone,
      documentId:payload.role==='client'?String(body.documentId||'').trim():'',
      address:payload.role==='client'?String(body.address||'').trim():'',
      logo:payload.role==='client'?String(body.logo||''):'',
      photo:payload.role==='courier'?String(body.photo||''):'',
      approved:false,active:true,
      passwordSalt:String(payload.salt),passwordHash,passwordIterations:Number(payload.iterations||DEFAULT_ITERATIONS),
      createdAt:now,updatedAt:now,
    };
    state.users.unshift(user);syncUserMirror(state,user);if(user.role==='client') claimLegacyRequests(state,user);await writeState(env,state);
    return json({ok:true,user:publicUser(user),pendingApproval:true,message:'Registro recibido. Tu cuenta debe ser aprobada por el administrador antes de usar la aplicación.'},201);
  }catch(error){console.error('GOY XPRESS register proof',error);return json({error:'No se pudo completar el registro. Intenta nuevamente.'},503);}
}
