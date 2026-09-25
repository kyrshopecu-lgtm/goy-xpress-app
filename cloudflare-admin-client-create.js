import { neon } from '@neondatabase/serverless';

const HEADERS={
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
};

function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:HEADERS});}
function normalizeEmail(v){return String(v||'').trim().toLowerCase();}
function normalizeUsername(v){return String(v||'').trim().toLowerCase();}
function cleanPhone(v){return String(v||'').replace(/\D/g,'');}
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(v));}
function validUsername(v){return /^[a-z0-9._-]{3,30}$/.test(normalizeUsername(v));}
function base64urlToBytes(value){const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/');const padded=text+'='.repeat((4-(text.length%4))%4);return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));}
async function verifyAdmin(request,env){
  try{
    const auth=String(request.headers.get('Authorization')||'');
    if(!auth.startsWith('Bearer ')||!env.TOKEN_SECRET)return false;
    const token=auth.slice(7),[body,signature]=token.split('.');
    if(!body||!signature)return false;
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(env.TOKEN_SECRET)),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    const ok=await crypto.subtle.verify('HMAC',key,base64urlToBytes(signature),new TextEncoder().encode(body));
    if(!ok)return false;
    const payload=JSON.parse(new TextDecoder().decode(base64urlToBytes(body)));
    return payload?.role==='admin'&&Number(payload.exp||0)>Date.now();
  }catch{return false;}
}
function validImage(value){
  if(!value)return true;
  const text=String(value);
  return text.length<=1_800_000&&/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(text);
}
function validMapsUrl(value){
  if(!value)return true;
  try{
    const url=new URL(String(value).trim());
    return /^https?:$/.test(url.protocol)&&/(^|\.)google\.(com|[a-z.]+)$|(^|\.)goo\.gl$|(^|\.)maps\.app\.goo\.gl$/i.test(url.hostname);
  }catch{return false;}
}
function parseMapLocation(value){
  const text=String(value||'').trim();
  if(!text)return null;
  const patterns=[/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,/query=(-?\d{1,2}\.\d+)%?2C(-?\d{1,3}\.\d+)/,/query=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,/q=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/];
  for(const pattern of patterns){
    const match=text.match(pattern);if(!match)continue;
    const latitude=Number(match[1]),longitude=Number(match[2]);
    if(Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180)return{latitude,longitude};
  }
  return null;
}
function normalizeBankAccounts(value){
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
async function readState(env){
  if(!env.DATABASE_URL)throw new Error('DATABASE_URL no configurado');
  const sql=neon(String(env.DATABASE_URL));
  const rows=await sql`SELECT data FROM goy_state WHERE id=1 LIMIT 1`;
  const state=rows[0]?.data||{};
  for(const key of ['users','clients','couriers','requests','payments','invites','templates','walletEntries','monthlyArchives'])if(!Array.isArray(state[key]))state[key]=[];
  return state;
}
async function writeState(env,state){
  const sql=neon(String(env.DATABASE_URL));
  await sql`UPDATE goy_state SET data=${JSON.stringify(state)}::jsonb, updated_at=NOW() WHERE id=1`;
}
function publicUser(user){const {passwordHash,passwordSalt,passwordIterations,...safe}=user||{};return safe;}

export async function createAdminClient(request,env){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
  if(!(await verifyAdmin(request,env)))return json({error:'No autorizado'},401);
  try{
    const body=await request.json().catch(()=>({}));
    const name=String(body.name||'').trim();
    const businessName=String(body.businessName||'').trim();
    const username=normalizeUsername(body.username);
    const phone=cleanPhone(body.phone||body.whatsapp);
    const email=normalizeEmail(body.email);
    const documentId=String(body.documentId||'').trim();
    const address=String(body.address||'').trim();
    const mapUrl=String(body.mapUrl||'').trim();
    const logo=String(body.logo||'');
    const bankAccounts=normalizeBankAccounts(body.bankAccounts);
    const passwordSalt=String(body.passwordSalt||'').toLowerCase();
    const passwordHash=String(body.passwordHash||'').toLowerCase();
    const passwordIterations=Number(body.passwordIterations||0);

    if(name.length<2)return json({error:'Ingresa el nombre del cliente.'},400);
    if(!validUsername(username))return json({error:'El usuario debe tener entre 3 y 30 caracteres y usar solo letras, números, punto, guion o guion bajo.'},400);
    if(phone.length<9)return json({error:'Ingresa un número de WhatsApp válido.'},400);
    if(email&&!validEmail(email))return json({error:'Ingresa un correo electrónico válido o déjalo vacío.'},400);
    if(!validMapsUrl(mapUrl))return json({error:'Pega un enlace válido de Google Maps.'},400);
    if(!validImage(logo))return json({error:'La imagen no es válida o es demasiado grande.'},400);
    if(!/^[0-9a-f]{32}$/.test(passwordSalt)||!/^[0-9a-f]{128}$/.test(passwordHash)||passwordIterations!==100000){
      return json({error:'No se pudo proteger la contraseña. Recarga el panel e intenta nuevamente.'},400);
    }

    const state=await readState(env);
    if(state.users.some(user=>normalizeUsername(user.username)===username))return json({error:'Ya existe una cuenta con este nombre de usuario.'},409);
    if(email&&state.users.some(user=>normalizeEmail(user.email)===email))return json({error:'Ya existe una cuenta con este correo.'},409);

    const now=new Date().toISOString();
    const user={
      id:crypto.randomUUID(),role:'client',name,businessName,username,email,phone,documentId,address,mapUrl,
      location:parseMapLocation(mapUrl),logo,bankAccounts,approved:true,active:true,
      passwordSalt,passwordHash,passwordIterations,createdAt:now,updatedAt:now,createdBy:'admin',
    };
    state.users.unshift(user);
    const client={
      id:user.id,userId:user.id,name:user.name,businessName:user.businessName,username:user.username,
      whatsapp:user.phone,phone:user.phone,email:user.email,documentId:user.documentId,address:user.address,
      mapUrl:user.mapUrl,location:user.location,logo:user.logo,bankAccounts:user.bankAccounts,
      approved:true,active:true,status:'Activo',registeredAt:now,
    };
    const existing=state.clients.findIndex(item=>String(item.userId||item.id)===String(user.id));
    if(existing>=0)state.clients[existing]={...state.clients[existing],...client};else state.clients.unshift(client);
    await writeState(env,state);
    return json({user:publicUser(user),message:'Cliente creado y habilitado para iniciar sesión.'},201);
  }catch(error){
    console.error('GOY XPRESS secure admin client create',error);
    return json({error:error.message||'No se pudo crear el cliente.'},503);
  }
}
