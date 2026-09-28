import {neon} from '@neondatabase/serverless';
import {ensureStateTable,readVersionedState,writeVersionedState} from './cloudflare-versioned-state.js';

const enc=new TextEncoder();
function digits(v){let d=String(v||'').replace(/\D/g,'');if(d.startsWith('00'))d=d.slice(2);if(d.startsWith('593'))return d;if(d.startsWith('0'))return '593'+d.slice(1);if(d.startsWith('9')&&d.length===9)return '593'+d;return d;}
function optOut(t){return /(?:^|\b)(stop|salir|baja|no\s+me\s+escrib|no\s+contact|no\s+mensajes|dejen\s+de\s+escribir)(?:\b|$)/i.test(String(t||''));}
function normalize(s){const x=s&&typeof s==='object'?s:{};if(!Array.isArray(x.prospects))x.prospects=[];return x;}
function hex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function validSignature(raw,header,secret){
 if(!secret||!header?.startsWith('sha256='))return false;
 const key=await crypto.subtle.importKey('raw',enc.encode(String(secret)),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const expected='sha256='+hex(await crypto.subtle.sign('HMAC',key,raw));
 const a=enc.encode(expected),b=enc.encode(header);if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
function messages(payload){const out=[];for(const e of payload?.entry||[])for(const ch of e?.changes||[])for(const m of ch?.value?.messages||[])if(m?.id&&m?.from){const text=m?.text?.body||m?.button?.text||m?.interactive?.button_reply?.title||m?.interactive?.list_reply?.title||'';out.push({id:String(m.id),from:digits(m.from),text:String(text).trim(),timestamp:String(m.timestamp||'')});}return out;}
async function mutate(env,incoming){
 const sql=neon(String(env.DATABASE_URL));await ensureStateTable(sql,normalize({}));
 for(let attempt=0;attempt<3;attempt++){
  const state=await readVersionedState(sql,normalize);let changed=0;
  for(const m of incoming){
   const p=state.prospects.find(x=>digits(x.contact)===m.from);if(!p)continue;
   p.conversation=Array.isArray(p.conversation)?p.conversation:[];
   if(p.conversation.some(x=>String(x.providerMessageId||'')===m.id))continue;
   const at=m.timestamp?new Date(Number(m.timestamp)*1000).toISOString():new Date().toISOString();
   p.conversation.push({direction:'inbound',channel:'WhatsApp',message:m.text,providerMessageId:m.id,sentAt:at});
   p.lastContact=at;p.updatedAt=new Date().toISOString();
   if(optOut(m.text)){p.doNotContact=true;p.status='Descartado';}else if(p.status!=='Cliente'&&p.status!=='Descartado')p.status='Respondió';
   changed++;
  }
  if(!changed)return {updated:0};
  try{await writeVersionedState(sql,state,normalize);return {updated:changed};}catch(e){if(e?.code!=='STATE_CONFLICT'||attempt===2)throw e;}
 }
 return {updated:0};
}
export async function whatsappProspectWebhook(request,env){
 const url=new URL(request.url);
 if(request.method==='GET'){
  const mode=url.searchParams.get('hub.mode'),token=url.searchParams.get('hub.verify_token'),challenge=url.searchParams.get('hub.challenge');
  if(mode==='subscribe'&&token&&token===String(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN||''))return new Response(challenge||'',{status:200});
  return new Response('Forbidden',{status:403});
 }
 if(request.method!=='POST')return new Response('Method Not Allowed',{status:405});
 const raw=await request.arrayBuffer();
 if(!await validSignature(raw,request.headers.get('X-Hub-Signature-256'),env.META_APP_SECRET))return new Response('Invalid signature',{status:401});
 let payload;try{payload=JSON.parse(new TextDecoder().decode(raw));}catch{return new Response('Bad Request',{status:400});}
 const incoming=messages(payload);if(incoming.length&&env.DATABASE_URL)await mutate(env,incoming);
 return new Response('EVENT_RECEIVED',{status:200});
}
