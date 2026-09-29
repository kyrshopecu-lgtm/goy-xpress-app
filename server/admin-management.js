const {ensureStateTable,readVersionedState,writeVersionedState}=require('./versioned-state');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {cleanPhone,sendProspectFirstContact,sendProspectReply}=require('./whatsappNotifications');

function safeEqual(a,b){const x=Buffer.from(String(a));const y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function verifyToken(token,secret){if(!token||!secret)return null;const [body,sig]=String(token).split('.');if(!body||!sig)return null;const expected=crypto.createHmac('sha256',secret).update(body).digest('base64url');if(!safeEqual(sig,expected))return null;try{const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));if(!payload.exp||Date.now()>payload.exp)return null;return payload;}catch{return null;}}
function bearer(req){const a=String(req.headers?.authorization||'');return a.startsWith('Bearer ')?a.slice(7):'';}
function pathnameOf(req){const u=new URL(req.url,`http://${req.headers?.host||'localhost'}`);let p=u.pathname.replace(/\/$/,'')||'/';if(p==='/api')p='/';else if(p.startsWith('/api/'))p=p.slice(4);return p;}
function json(res,status,body,origin='*'){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-Request-Secret');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');res.end(JSON.stringify(body));}
async function readBody(req){if(req.body&&typeof req.body==='object')return req.body;let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1000000)throw new Error('Payload demasiado grande');}return raw?JSON.parse(raw):{};}
function cleanData(value){const data=value&&typeof value==='object'?value:{};for(const key of ['users','clients','couriers','requests','payments','invites','templates','walletEntries','monthlyArchives','customServices','prospects'])if(!Array.isArray(data[key]))data[key]=[];if(!data.prospectDiscoveryUsage||typeof data.prospectDiscoveryUsage!=='object')data.prospectDiscoveryUsage={};return data;}
let sqlClient;
async function readState(config){if(config.databaseUrl){if(!sqlClient){const {neon}=require('@neondatabase/serverless');sqlClient=neon(config.databaseUrl);}await ensureStateTable(sqlClient,cleanData({}));return readVersionedState(sqlClient,cleanData);}try{if(!fs.existsSync(config.dataFile))return cleanData({});return cleanData(JSON.parse(fs.readFileSync(config.dataFile,'utf8')));}catch{return cleanData({});}}
async function writeState(config,data){const normalized=cleanData(data);if(config.databaseUrl){if(!sqlClient){const {neon}=require('@neondatabase/serverless');sqlClient=neon(config.databaseUrl);}await writeVersionedState(sqlClient,data,cleanData);return;}const dir=path.dirname(config.dataFile);if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});const tmp=`${config.dataFile}.tmp`;fs.writeFileSync(tmp,JSON.stringify(normalized,null,2));fs.renameSync(tmp,config.dataFile);}
function activeStatus(value){return !['Entrega finalizada','Cancelado','Entregado','Finalizado'].includes(String(value||''));}
function cleanMoney(value){const n=Number(String(value??'').replace(',','.'));return Number.isFinite(n)&&n>=0?Math.round(n*100)/100:null;}
function publicService(item){return {id:item.id,name:item.name,price:Number(item.price||0),description:item.description||'',active:item.active!==false,createdAt:item.createdAt,updatedAt:item.updatedAt};}

const SALES_BASE_SERVICES=[
 {id:'packages',name:'Retiro y/o entrega de paquetes',description:'Retiro y entrega de paquetes en Quito con tarifa por distancia, medidas y peso.',mediaUrl:'/assets/01_mensajeria_envios.png',queries:['tiendas online','ecommerce','boutiques','tecnología','accesorios','repuestos','regalos','juguetes y coleccionables']},
 {id:'messaging',name:'Mensajería y Envíos',description:'Mensajería programada y express para negocios y personas.',mediaUrl:'/assets/01_mensajeria_envios.png',queries:['tiendas online','emprendimientos','distribuidores','oficinas','floristerías']},
 {id:'procedures',name:'Trámites Generales y Mensajería Ejecutiva',description:'Ingreso y retiro de documentos, gestiones institucionales y trámites en Quito.',mediaUrl:'/assets/02_tramites_generales.png',queries:['estudios jurídicos','abogados','contadores','consultoras','inmobiliarias','agencias de viajes']},
 {id:'legal',name:'Apoyo Legal y Judicial',description:'Gestiones e ingreso de documentos para abogados y estudios jurídicos.',mediaUrl:'/assets/04_apoyo_legal_judicial.png',queries:['abogados','estudios jurídicos','bufetes','notarías','consultores legales']},
 {id:'vehicle',name:'Trámites Vehiculares',description:'Apoyo operativo para matriculación, revisión y gestiones vehiculares.',mediaUrl:'/assets/05_tramites_vehiculares.png',queries:['concesionarios','patios de autos','talleres automotrices','rent a car','venta de vehículos']},
 {id:'apostille',name:'Apostilla de Documentos',description:'Gestión de apostilla y documentación para clientes en Quito o de otras ciudades.',mediaUrl:'/assets/06_apostilla_documentos.png',queries:['agencias migratorias','abogados','traductores','agencias de estudios en el exterior','consultoras']},
 {id:'deposits',name:'Depósitos y gestiones de pago',description:'Depósito de cheques, efectivo y gestiones de pago dentro de los límites operativos.',mediaUrl:'/assets/03_cambio_dinero_negocio.png',queries:['distribuidores','mayoristas','comercios','tiendas','empresas de ventas']},
 {id:'additional',name:'Servicios diversos y personalizados',description:'Gestiones especiales cotizadas por administración según la necesidad del cliente.',mediaUrl:'/assets/08_servicios_adicionales.png',queries:['pymes','emprendimientos','servicios profesionales','empresas']},
];
function salesServiceKnowledge(data){
 const custom=(data.customServices||[]).filter(s=>s.active!==false).map(s=>({id:'custom:'+s.id,name:String(s.name||'').trim(),description:String(s.description||'').trim(),price:Number(s.price||0),mediaUrl:'/assets/08_servicios_adicionales.png',queries:[String(s.name||'').trim(),String(s.description||'').trim()].filter(x=>x.length>=3)}));
 const services=[...SALES_BASE_SERVICES,...custom];
 const queries=[...new Set(services.flatMap(s=>s.queries||[]).map(x=>String(x||'').trim()).filter(Boolean))].slice(0,30);
 return {services,queries};
}
function serviceMediaForName(knowledge,name){
 const target=String(name||'').trim().toLowerCase();
 if(!target)return '';
 const match=(knowledge.services||[]).find(s=>String(s.name||'').trim().toLowerCase()===target)|| (knowledge.services||[]).find(s=>target.includes(String(s.name||'').trim().toLowerCase())||String(s.name||'').trim().toLowerCase().includes(target));
 return match?.mediaUrl||'';
}
function validMediaUrl(value){
 const v=String(value||'').trim();
 return !v||/^\/assets\/[A-Za-z0-9._/-]+$/.test(v)||/^https:\/\/[^\s]+$/i.test(v);
}
function absoluteMediaUrl(req,value){
 const v=String(value||'').trim();if(!v)return '';
 if(/^https:\/\//i.test(v))return v;
 if(!v.startsWith('/'))return '';
 const host=String(req.headers?.['x-forwarded-host']||req.headers?.host||'').trim();
 if(!host)return '';
 const proto=String(req.headers?.['x-forwarded-proto']||'https').split(',')[0].trim()||'https';
 return `${proto}://${host}${v}`;
}
function preliminaryFitScore({category='',city='',website=false}={}){
 const text=String(category).toLowerCase();let score=35;
 if(/tecnolog|accesor|ropa|juguete|coleccion|tienda|emprend|repuesto/.test(text))score+=25;
 if(String(city).trim())score+=10;
 if(website)score+=10;
 return Math.max(0,Math.min(100,score));
}

async function discoverProspects(config,criteria){
 const key=String(config.googleMapsApiKey||'').trim();
 if(key){
  const results=[],seen=new Set();let requestsUsed=0;
  const requestBudget=Math.max(0,Number(criteria.requestBudget||0));
  const defaultCategories=['tecnología','accesorios','ropa','juguetes y coleccionables','emprendimientos','tiendas online','repuestos','servicios profesionales'];
  const learned=Array.isArray(criteria.queries)?criteria.queries.map(x=>String(x||'').trim()).filter(Boolean):[];
  const queries=String(criteria.category||'').trim()?[String(criteria.category).trim()]:(learned.length?learned:defaultCategories);
  for(const query of queries){
   let pageToken='';
   while(results.length<criteria.limit&&requestsUsed<requestBudget){
    const body={textQuery:[query,criteria.city].filter(Boolean).join(' ')||'negocios Ecuador',pageSize:20,languageCode:'es'};
    if(pageToken)body.pageToken=pageToken;
    const response=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.primaryType,nextPageToken'},body:JSON.stringify(body)});
    requestsUsed++;
    if(!response.ok){const err=new Error('Google Places no respondió correctamente.');err.status=502;err.requestsUsed=requestsUsed;throw err;}
    const payload=await response.json();
    for(const place of payload.places||[]){
     const identity=String(place.id||place.websiteUri||place.googleMapsUri||place.displayName?.text||'').trim().toLowerCase();
     if(!identity||seen.has(identity))continue;seen.add(identity);
     results.push({business:place.displayName?.text||'',city:criteria.city||'',category:query||place.primaryType||'',source:'Google Places',sourceUrl:place.websiteUri||place.googleMapsUri||'',channel:place.websiteUri?'Sitio web':'Google Maps',contact:'',fitReason:'Negocio público encontrado por categoría y ciudad.',score:preliminaryFitScore({category:query||place.primaryType||'',city:criteria.city||'',website:Boolean(place.websiteUri)})});
     if(results.length>=criteria.limit)break;
    }
    pageToken=String(payload.nextPageToken||'');if(!pageToken)break;
   }
   if(results.length>=criteria.limit||requestsUsed>=requestBudget)break;
  }
  return {prospects:results.filter(x=>x.business.length>=2),requestsUsed};
 }
 const endpoint=String(config.prospectDiscoveryUrl||'').trim(),token=String(config.prospectDiscoveryToken||'').trim();
 if(!endpoint){const e=new Error('Proveedor de descubrimiento de prospectos no configurado.');e.status=503;throw e;}
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'Authorization':'Bearer '+token}:{})},body:JSON.stringify(criteria)});
 if(!response.ok){const e=new Error('El proveedor de prospectos no respondió correctamente.');e.status=502;throw e;}
 const body=await response.json(),items=Array.isArray(body)?body:Array.isArray(body.prospects)?body.prospects:[];
 const prospects=items.slice(0,criteria.limit).map(x=>({business:String(x.business||x.name||'').trim(),city:String(x.city||criteria.city||'').trim(),category:String(x.category||criteria.category||'').trim(),source:String(x.source||'web pública').trim(),sourceUrl:String(x.sourceUrl||x.url||'').trim(),channel:String(x.channel||'').trim(),contact:String(x.contact||'').trim(),fitReason:String(x.fitReason||'').trim(),score:Math.max(0,Math.min(100,Number(x.score||0)))})).filter(x=>x.business.length>=2);
 return {prospects,requestsUsed:1};
}

function wrap(next,overrides={}){
 return async function handler(req,res){
  const p=pathnameOf(req);
  const accountMatch=p.match(/^\/admin\/(clients|couriers)\/([^/]+)$/);
  const serviceMatch=p.match(/^\/admin\/services\/([^/]+)$/);
  const prospectMatch=p.match(/^\/admin\/prospects\/([^/]+)$/);
  const prospectImport=p==='/admin/prospects/import';
  const prospectDiscover=p==='/admin/prospects/discover';
  const prospectAnalyzeMatch=p.match(/^\/admin\/prospects\/([^/]+)\/analyze$/);
  const prospectSendMatch=p.match(/^\/admin\/prospects\/([^/]+)\/send-whatsapp$/);
  const prospectFollowupMatch=p.match(/^\/admin\/prospects\/([^/]+)\/draft-followup$/);
  const prospectFollowupSendMatch=p.match(/^\/admin\/prospects\/([^/]+)\/send-followup-whatsapp$/);
  const prospectWhatsAppStatus=p==='/admin/prospects/whatsapp-status';
  const prospectServiceIntelligence=p==='/admin/prospects/service-intelligence';
  const prospectSendApprovedBatch=p==='/admin/prospects/send-approved-batch';
  const handles=(p==='/admin/services'&&['GET','POST'].includes(req.method))||(serviceMatch&&['PATCH','DELETE'].includes(req.method))||(p==='/admin/prospects'&&['GET','POST'].includes(req.method))||(prospectImport&&req.method==='POST')||(prospectDiscover&&req.method==='POST')||(prospectAnalyzeMatch&&req.method==='POST')||(prospectSendMatch&&req.method==='POST')||(prospectFollowupMatch&&req.method==='POST')||(prospectFollowupSendMatch&&req.method==='POST')||(prospectWhatsAppStatus&&req.method==='GET')||(prospectServiceIntelligence&&req.method==='GET')||(prospectSendApprovedBatch&&req.method==='POST')||(prospectMatch&&['GET','PATCH','DELETE'].includes(req.method))||(accountMatch&&req.method==='DELETE');
  if(!handles)return next(req,res);
  const config={databaseUrl:String(overrides.databaseUrl??process.env.DATABASE_URL??''),tokenSecret:String(overrides.tokenSecret??process.env.TOKEN_SECRET??''),allowedOrigin:String(overrides.allowedOrigin??process.env.ALLOWED_ORIGIN??'*'),workersAiRun:typeof overrides.workersAiRun==='function'?overrides.workersAiRun:null,openaiApiKey:String(overrides.openaiApiKey??process.env.OPENAI_API_KEY??''),openaiFallbackEnabled:String(overrides.openaiFallbackEnabled??process.env.GOY_AI_OPENAI_FALLBACK??'').toLowerCase()==='true',googleMapsApiKey:String(overrides.googleMapsApiKey??process.env.GOOGLE_MAPS_API_KEY??''),prospectDiscoveryUrl:String(overrides.prospectDiscoveryUrl??process.env.PROSPECT_DISCOVERY_URL??''),prospectDiscoveryToken:String(overrides.prospectDiscoveryToken??process.env.PROSPECT_DISCOVERY_TOKEN??''),dataFile:overrides.dataFile||process.env.DATA_FILE||path.join(__dirname,'data-v5.json')};
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
   if(prospectWhatsAppStatus){
    const accessToken=String(process.env.WHATSAPP_ACCESS_TOKEN||''),phoneNumberId=String(process.env.WHATSAPP_PHONE_NUMBER_ID||''),template=String(process.env.GOY_WA_PROSPECT_TEMPLATE||''),mediaHeader=String(process.env.GOY_WA_PROSPECT_MEDIA_HEADER||'').toLowerCase()==='true';
    const missing=[];if(!accessToken)missing.push('WHATSAPP_ACCESS_TOKEN');if(!phoneNumberId)missing.push('WHATSAPP_PHONE_NUMBER_ID');if(!template)missing.push('GOY_WA_PROSPECT_TEMPLATE');
    return json(res,200,{configured:missing.length===0,missing,templateConfigured:Boolean(template),mediaHeaderConfigured:mediaHeader},config.allowedOrigin);
   }
   if(prospectServiceIntelligence){
    const knowledge=salesServiceKnowledge(data);
    return json(res,200,{services:knowledge.services.map(s=>({id:s.id,name:s.name,description:s.description,price:s.price??null,mediaUrl:s.mediaUrl||''})),searchQueries:knowledge.queries},config.allowedOrigin);
   }
   if(prospectDiscover&&req.method==='POST'){
    const body=await readBody(req),city=String(body.city||'').trim(),category=String(body.category||'').trim(),limit=Math.max(1,Math.min(177,Number(body.limit||50)));
    const now=new Date(),ecuador=new Date(now.toLocaleString('en-US',{timeZone:'America/Guayaquil'})),day=ecuador.getDay();
    if(day===0)return json(res,429,{error:'El buscador está pausado los domingos para proteger el cupo mensual.'},config.allowedOrigin);
    const dayKey=`${ecuador.getFullYear()}-${String(ecuador.getMonth()+1).padStart(2,'0')}-${String(ecuador.getDate()).padStart(2,'0')}`,monthKey=dayKey.slice(0,7),usage=data.prospectDiscoveryUsage||{},daily=Number(usage[dayKey]||0),monthly=Object.entries(usage).filter(([k])=>k.startsWith(monthKey+'-')).reduce((sum,[,v])=>sum+Number(v||0),0);
    if(daily>=177)return json(res,429,{error:'Se alcanzó el límite diario de 177 búsquedas.',usage:{daily,monthly,dailyLimit:177,monthlyLimit:4800}},config.allowedOrigin);
    if(monthly>=4800)return json(res,429,{error:'Se alcanzó el límite mensual de 4.800 búsquedas.',usage:{daily,monthly,dailyLimit:177,monthlyLimit:4800}},config.allowedOrigin);
    const requestBudget=Math.min(177-daily,4800-monthly);
    if(requestBudget<=0)return json(res,429,{error:'No quedan llamadas disponibles dentro del cupo configurado.',usage:{daily,monthly,dailyLimit:177,monthlyLimit:4800}},config.allowedOrigin);
    const knowledge=salesServiceKnowledge(data),queries=category?[category]:knowledge.queries;
    const discovery=await discoverProspects(config,{city,category,limit,queries,publicOnly:true,requestBudget}),used=Math.max(1,Number(discovery.requestsUsed||1));
    if(daily+used>177||monthly+used>4800)return json(res,429,{error:'La búsqueda requiere más llamadas que el cupo restante.',usage:{daily,monthly,dailyLimit:177,monthlyLimit:4800}},config.allowedOrigin);
    data.prospectDiscoveryUsage[dayKey]=daily+used;await writeState(config,data);
    return json(res,200,{prospects:discovery.prospects,count:discovery.prospects.length,criteria:{city,category,limit,mode:category?'categoría manual':'servicios activos'},servicesLearned:knowledge.services.map(s=>s.name),searchQueries:queries,usage:{daily:daily+used,monthly:monthly+used,requestsUsed:used,dailyLimit:177,monthlyLimit:4800}},config.allowedOrigin);
   }
   if(prospectImport&&req.method==='POST'){
    const body=await readBody(req),incoming=Array.isArray(body.prospects)?body.prospects:[];
    if(!incoming.length)return json(res,400,{error:'Incluye al menos un prospecto para importar.'},config.allowedOrigin);
    if(incoming.length>500)return json(res,400,{error:'Máximo 500 prospectos por importación.'},config.allowedOrigin);
    const keyOf=x=>{const url=String(x.sourceUrl||'').trim().toLowerCase().replace(/\/$/,'');const contact=String(x.contact||'').trim().toLowerCase().replace(/[\s()+-]/g,'');const business=String(x.business||x.name||'').trim().toLowerCase(),city=String(x.city||'').trim().toLowerCase();return url?'url:'+url:contact?'contact:'+contact:'business:'+business+'|'+city;};
    const known=new Set(data.prospects.map(keyOf)),added=[],duplicates=[],invalid=[];const now=new Date().toISOString();
    incoming.forEach((raw,index)=>{const business=String(raw?.business||raw?.name||'').trim();if(business.length<2){invalid.push({index,reason:'Nombre de negocio inválido'});return;}const key=keyOf(raw);if(known.has(key)){duplicates.push({index,business});return;}known.add(key);const item={id:crypto.randomUUID(),business,city:String(raw.city||'').trim(),category:String(raw.category||'').trim(),source:String(raw.source||'importación').trim(),sourceUrl:String(raw.sourceUrl||'').trim(),channel:String(raw.channel||'').trim(),contact:String(raw.contact||'').trim(),fitReason:String(raw.fitReason||'').trim(),observedNeeds:'',growthOpportunities:'',suggestedServices:'',campaignIdeas:'',matchedService:'',recommendedMediaUrl:'',score:Math.max(0,Math.min(100,Number(raw.score||0))),status:'Pendiente de revisión',draftMessage:String(raw.draftMessage||'').trim(),approvedMessage:'',approvedMediaUrl:'',doNotContact:Boolean(raw.doNotContact),conversation:[],createdAt:now,updatedAt:now};data.prospects.unshift(item);added.push(item);});
    if(added.length)await writeState(config,data);return json(res,200,{imported:added.length,duplicates:duplicates.length,invalid:invalid.length,prospects:added,duplicateItems:duplicates,invalidItems:invalid},config.allowedOrigin);
   }
   if(p==='/admin/prospects'&&req.method==='GET')return json(res,200,{prospects:data.prospects},config.allowedOrigin);
   if(p==='/admin/prospects'&&req.method==='POST'){
    const body=await readBody(req),business=String(body.business||body.name||'').trim(),sourceUrl=String(body.sourceUrl||'').trim(),channel=String(body.channel||'').trim(),contact=String(body.contact||'').trim();
    if(business.length<2)return json(res,400,{error:'Ingresa el nombre del negocio o prospecto.'},config.allowedOrigin);
    const now=new Date().toISOString(),item={id:crypto.randomUUID(),business,city:String(body.city||'').trim(),category:String(body.category||'').trim(),source:String(body.source||'web').trim(),sourceUrl,channel,contact,fitReason:String(body.fitReason||'').trim(),observedNeeds:String(body.observedNeeds||'').trim(),growthOpportunities:String(body.growthOpportunities||'').trim(),suggestedServices:String(body.suggestedServices||'').trim(),campaignIdeas:String(body.campaignIdeas||'').trim(),matchedService:'',recommendedMediaUrl:'',score:Math.max(0,Math.min(100,Number(body.score||0))),status:'Pendiente de revisión',draftMessage:String(body.draftMessage||'').trim(),approvedMessage:'',approvedMediaUrl:'',doNotContact:false,conversation:[],createdAt:now,updatedAt:now};
    data.prospects.unshift(item);await writeState(config,data);return json(res,201,{prospect:item},config.allowedOrigin);
   }
   if(prospectSendApprovedBatch){
    const body=await readBody(req),limit=Math.max(1,Math.min(60,Number(body.limit||60)));
    const ready=data.prospects.filter(x=>x.status==='Aprobado para contacto'&&!x.doNotContact&&String(x.approvedMessage||'').trim()&&cleanPhone(x.contact).length>=11).sort((a,b)=>Number(b.score||0)-Number(a.score||0)).slice(0,limit);
    const results=[];let sentCount=0;
    for(const prospect of ready){
      const message=String(prospect.approvedMessage||'').trim(),phone=cleanPhone(prospect.contact),media=absoluteMediaUrl(req,prospect.approvedMediaUrl||'');
      const sent=await sendProspectFirstContact({phone,business:prospect.business,message,imageUrl:media});
      if(!sent.ok){results.push({id:prospect.id,business:prospect.business,ok:false,error:sent.reason||sent.error||'WHATSAPP_SEND_FAILED'});continue;}
      const now=new Date().toISOString();prospect.conversation=Array.isArray(prospect.conversation)?prospect.conversation:[];
      prospect.conversation.push({direction:'outbound',channel:'WhatsApp',message,mediaUrl:prospect.approvedMediaUrl||'',providerMessageId:sent.id||'',sentAt:now});
      prospect.status='Contactado';prospect.lastContact=now;prospect.updatedAt=now;sentCount++;
      results.push({id:prospect.id,business:prospect.business,ok:true,providerMessageId:sent.id||''});
    }
    if(ready.length)await writeState(config,data);
    return json(res,200,{ok:true,attempted:ready.length,sent:sentCount,failed:ready.length-sentCount,results},config.allowedOrigin);
   }
   if(prospectSendMatch){
    const id=decodeURIComponent(prospectSendMatch[1]),prospect=data.prospects.find(x=>x.id===id);
    if(!prospect)return json(res,404,{error:'Prospecto no encontrado.'},config.allowedOrigin);
    if(prospect.doNotContact)return json(res,409,{error:'Este prospecto indicó que no desea contacto.'},config.allowedOrigin);
    if(prospect.status!=='Aprobado para contacto')return json(res,409,{error:'El contacto debe estar aprobado antes de enviar.'},config.allowedOrigin);
    const message=String(prospect.approvedMessage||'').trim(),phone=cleanPhone(prospect.contact),media=absoluteMediaUrl(req,prospect.approvedMediaUrl||'');
    if(!message)return json(res,409,{error:'No existe un mensaje final aprobado.'},config.allowedOrigin);
    if(phone.length<11)return json(res,409,{error:'No existe un WhatsApp público válido registrado.'},config.allowedOrigin);
    const sent=await sendProspectFirstContact({phone,business:prospect.business,message,imageUrl:media});
    if(!sent.ok){const reason=sent.reason==='PROSPECT_MEDIA_TEMPLATE_NOT_ENABLED'?'La plantilla de primer contacto no tiene habilitada una cabecera de imagen. Activa GOY_WA_PROSPECT_MEDIA_HEADER o envía sin imagen.':sent.reason||sent.error||'WhatsApp no confirmó el envío.';return json(res,502,{error:reason},config.allowedOrigin);}
    const now=new Date().toISOString();prospect.conversation=Array.isArray(prospect.conversation)?prospect.conversation:[];
    prospect.conversation.push({direction:'outbound',channel:'WhatsApp',message,mediaUrl:prospect.approvedMediaUrl||'',providerMessageId:sent.id||'',sentAt:now});
    prospect.status='Contactado';prospect.lastContact=now;prospect.updatedAt=now;
    await writeState(config,data);return json(res,200,{ok:true,prospect,providerMessageId:sent.id||''},config.allowedOrigin);
   }
   if(prospectFollowupSendMatch){
    const id=decodeURIComponent(prospectFollowupSendMatch[1]),prospect=data.prospects.find(x=>x.id===id);
    if(!prospect)return json(res,404,{error:'Prospecto no encontrado.'},config.allowedOrigin);
    if(prospect.doNotContact)return json(res,409,{error:'Este prospecto indicó que no desea más contacto.'},config.allowedOrigin);
    if(!['Respondió','Interesado','Solicita llamada'].includes(String(prospect.status||'')))return json(res,409,{error:'El seguimiento solo se puede enviar después de una respuesta del prospecto.'},config.allowedOrigin);
    const conversation=Array.isArray(prospect.conversation)?prospect.conversation:[],inbound=conversation.filter(x=>x.direction==='inbound'&&String(x.channel||'').toLowerCase()==='whatsapp'&&x.sentAt).map(x=>Date.parse(x.sentAt)).filter(Number.isFinite);
    const lastInboundAt=inbound.length?Math.max(...inbound):0;
    if(!lastInboundAt)return json(res,409,{error:'No existe un mensaje entrante de WhatsApp para abrir la ventana de respuesta.'},config.allowedOrigin);
    if(Date.now()-lastInboundAt>24*60*60*1000)return json(res,409,{error:'La ventana de atención de WhatsApp de 24 horas está cerrada. Para volver a contactar se requiere una plantilla aprobada por Meta.'},config.allowedOrigin);
    const message=String(prospect.followupApprovedMessage||'').trim(),phone=cleanPhone(prospect.contact);
    if(!message)return json(res,409,{error:'Primero revisa y aprueba la respuesta de seguimiento.'},config.allowedOrigin);
    if(phone.length<11)return json(res,409,{error:'No existe un WhatsApp público válido registrado.'},config.allowedOrigin);
    const sent=await sendProspectReply({phone,message});
    if(!sent.ok)return json(res,502,{error:sent.reason||sent.error||'WhatsApp no confirmó el seguimiento.'},config.allowedOrigin);
    const now=new Date().toISOString();conversation.push({direction:'outbound',channel:'WhatsApp',message,providerMessageId:sent.id||'',sentAt:now});
    prospect.conversation=conversation;prospect.lastContact=now;prospect.followupSentAt=now;prospect.followupLastSentMessage=message;prospect.followupApprovedMessage='';prospect.updatedAt=now;
    await writeState(config,data);return json(res,200,{ok:true,prospect,providerMessageId:sent.id||''},config.allowedOrigin);
   }
   if(prospectFollowupMatch){
    const id=decodeURIComponent(prospectFollowupMatch[1]),item=data.prospects.find(x=>x.id===id);if(!item)return json(res,404,{error:'Prospecto no encontrado.'},config.allowedOrigin);
    if(item.doNotContact)return json(res,409,{error:'Este prospecto indicó que no desea más contacto.'},config.allowedOrigin);
    const conversation=(Array.isArray(item.conversation)?item.conversation:[]).slice(-12).map(x=>({direction:x.direction==='inbound'?'prospecto':'GOY XPRESS',message:String(x.message||'').slice(0,1500),sentAt:x.sentAt||''}));
    if(!conversation.some(x=>x.direction==='prospecto'))return json(res,409,{error:'Aún no existe una respuesta del prospecto para analizar.'},config.allowedOrigin);
    const context={business:item.business,city:item.city,category:item.category,observedNeeds:item.observedNeeds,growthOpportunities:item.growthOpportunities,suggestedServices:item.suggestedServices,conversation};
    const prompt='Prepara el siguiente mensaje comercial de GOY XPRESS para este prospecto. Responde específicamente a lo que escribió, sé breve y natural, no inventes datos, no presiones y respeta cualquier rechazo. Devuelve JSON válido con draftMessage, intent y recommendedStatus. recommendedStatus: Respondió, Interesado, Solicita llamada o Descartado. Contexto: '+JSON.stringify(context);
    let raw='';
    if(config.workersAiRun){try{const ai=await config.workersAiRun('@cf/zai-org/glm-4.7-flash',{temperature:0.3,response_format:{type:'json_object'},messages:[{role:'system',content:'Eres GOY SALES AI. Preparas borradores para revisión humana. Responde solo JSON válido.'},{role:'user',content:prompt}]});raw=String(ai?.choices?.[0]?.message?.content||ai?.response||'').trim();}catch(error){console.error('GOY followup Workers AI',error);}}
    if(!raw)return json(res,502,{error:'No se pudo preparar el seguimiento con Workers AI.'},config.allowedOrigin);
    let draft;try{draft=JSON.parse(raw);}catch{return json(res,502,{error:'GOY SALES AI devolvió un seguimiento no válido.'},config.allowedOrigin);}
    const allowed=['Respondió','Interesado','Solicita llamada','Descartado'],recommendedStatus=allowed.includes(String(draft.recommendedStatus))?String(draft.recommendedStatus):'Respondió';
    item.followupDraft=String(draft.draftMessage||'').trim().slice(0,4000);item.followupIntent=String(draft.intent||'').trim().slice(0,1000);item.followupRecommendedStatus=recommendedStatus;item.followupDraftAt=new Date().toISOString();item.updatedAt=item.followupDraftAt;
    await writeState(config,data);return json(res,200,{prospect:item,draft:{draftMessage:item.followupDraft,intent:item.followupIntent,recommendedStatus}},config.allowedOrigin);
   }
   if(prospectAnalyzeMatch){
    const id=decodeURIComponent(prospectAnalyzeMatch[1]),item=data.prospects.find(x=>x.id===id);if(!item)return json(res,404,{error:'Prospecto no encontrado.'},config.allowedOrigin);
    if(!config.workersAiRun&&!(config.openaiFallbackEnabled&&config.openaiApiKey))return json(res,503,{error:'El análisis con IA no está configurado.'},config.allowedOrigin);
    const knowledge=salesServiceKnowledge(data);
    const evidence={business:item.business,city:item.city,category:item.category,source:item.source,sourceUrl:item.sourceUrl,fitReason:item.fitReason,contactChannel:item.channel,activeServices:knowledge.services.map(s=>({name:s.name,description:s.description,price:s.price??null}))};
    const prompt='Analiza este prospecto comercial para GOY XPRESS. Usa únicamente los datos proporcionados como evidencia y el catálogo activo incluido en activeServices. No afirmes que el prospecto tiene una necesidad si no hay evidencia; expresa esas conclusiones como hipótesis que requieren validación. Devuelve JSON válido sin markdown con las claves observedNeeds, growthOpportunities, suggestedServices, matchedService, campaignIdeas, fitReason, score y draftMessage. matchedService debe ser exactamente el nombre de uno de activeServices o vacío. suggestedServices debe priorizar únicamente servicios actuales de activeServices. campaignIdeas debe proponer campañas concretas con concepto, público y canal. score debe ser entero 0-100 según afinidad con los servicios activos de GOY XPRESS. draftMessage debe ser breve, personalizado, identificarse como asistente virtual de GOY XPRESS, mencionar solo el servicio que tenga mejor relación con la evidencia y no inventar necesidades. Datos: '+JSON.stringify(evidence);
    const messages=[{role:'system',content:'Eres GOY SALES AI, analista comercial responsable. No inventes datos ni uses información sensible. Responde exclusivamente con JSON válido.'},{role:'user',content:prompt}];
    let raw='',provider='';
    if(config.workersAiRun){
      try{
        const ai=await config.workersAiRun('@cf/zai-org/glm-4.7-flash',{temperature:0.3,response_format:{type:'json_object'},messages});
        raw=String(ai?.choices?.[0]?.message?.content||ai?.response||'').trim();
        provider='cloudflare-workers-ai';
      }catch(error){
        console.error('GOY SALES AI Workers AI',error);
      }
    }
    if(!raw&&config.openaiFallbackEnabled&&config.openaiApiKey){
      if(config.workersAiRun){try{const ai=await config.workersAiRun('@cf/zai-org/glm-4.7-flash',{temperature:0.3,response_format:{type:'json_object'},messages:[{role:'system',content:'Eres GOY SALES AI. No inventes datos. Responde exclusivamente JSON válido.'},{role:'user',content:prompt}]});const raw=String(ai?.choices?.[0]?.message?.content||ai?.response||'').trim();if(raw){const analysis=JSON.parse(raw);for(const key of ['observedNeeds','growthOpportunities','suggestedServices','campaignIdeas','fitReason','draftMessage'])if(Object.prototype.hasOwnProperty.call(analysis,key))item[key]=String(analysis[key]||'').trim().slice(0,6000);if(Object.prototype.hasOwnProperty.call(analysis,'matchedService')){item.matchedService=String(analysis.matchedService||'').trim().slice(0,160);item.recommendedMediaUrl=serviceMediaForName(knowledge,item.matchedService);}if(Object.prototype.hasOwnProperty.call(analysis,'score'))item.score=Math.max(0,Math.min(100,Math.round(Number(analysis.score)||0)));item.analysisUpdatedAt=new Date().toISOString();item.updatedAt=item.analysisUpdatedAt;await writeState(config,data);return json(res,200,{prospect:item,analysis,provider:'cloudflare-workers-ai'},config.allowedOrigin);}}catch(error){console.error('GOY SALES AI Workers AI',error);}}
    const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+config.openaiApiKey},body:JSON.stringify({model:'gpt-4o-mini',temperature:0.3,response_format:{type:'json_object'},messages})});
      if(response.ok){const ai=await response.json();raw=String(ai?.choices?.[0]?.message?.content||'').trim();provider='openai';}
    }
    if(!raw)return json(res,502,{error:'No se pudo completar el análisis con IA. Workers AI no respondió. El respaldo opcional de OpenAI está desactivado o no disponible.'},config.allowedOrigin);
    let analysis;try{analysis=JSON.parse(raw.replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,''));}catch{return json(res,502,{error:'La IA devolvió un análisis no válido.'},config.allowedOrigin);}
    for(const key of ['observedNeeds','growthOpportunities','suggestedServices','campaignIdeas','fitReason','draftMessage'])if(Object.prototype.hasOwnProperty.call(analysis,key))item[key]=String(analysis[key]||'').trim().slice(0,6000);
    if(Object.prototype.hasOwnProperty.call(analysis,'matchedService')){item.matchedService=String(analysis.matchedService||'').trim().slice(0,160);item.recommendedMediaUrl=serviceMediaForName(knowledge,item.matchedService);}
    if(Object.prototype.hasOwnProperty.call(analysis,'score'))item.score=Math.max(0,Math.min(100,Math.round(Number(analysis.score)||0)));
    item.analysisUpdatedAt=new Date().toISOString();item.updatedAt=item.analysisUpdatedAt;await writeState(config,data);return json(res,200,{prospect:item,analysis,provider});
   }
   if(prospectMatch){
    const id=decodeURIComponent(prospectMatch[1]),item=data.prospects.find(x=>x.id===id);if(!item)return json(res,404,{error:'Prospecto no encontrado.'},config.allowedOrigin);
    if(req.method==='GET')return json(res,200,{prospect:item},config.allowedOrigin);
    if(req.method==='DELETE'){data.prospects=data.prospects.filter(x=>x.id!==id);await writeState(config,data);return json(res,200,{ok:true},config.allowedOrigin);}
    const body=await readBody(req);
    for(const key of ['business','city','category','source','sourceUrl','channel','contact','fitReason','observedNeeds','growthOpportunities','suggestedServices','campaignIdeas','draftMessage','matchedService'])if(Object.prototype.hasOwnProperty.call(body,key))item[key]=String(body[key]||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'approvedMediaUrl')){const media=String(body.approvedMediaUrl||'').trim();if(!validMediaUrl(media))return json(res,400,{error:'La imagen publicitaria debe usar un recurso /assets/ o una URL HTTPS pública.'},config.allowedOrigin);item.approvedMediaUrl=media;}
    if(Object.prototype.hasOwnProperty.call(body,'recommendedMediaUrl')){const media=String(body.recommendedMediaUrl||'').trim();if(!validMediaUrl(media))return json(res,400,{error:'La imagen recomendada no es válida.'},config.allowedOrigin);item.recommendedMediaUrl=media;}
    if(Object.prototype.hasOwnProperty.call(body,'score'))item.score=Math.max(0,Math.min(100,Number(body.score||0)));
    if(Object.prototype.hasOwnProperty.call(body,'doNotContact'))item.doNotContact=Boolean(body.doNotContact);
    if(Object.prototype.hasOwnProperty.call(body,'status')){
      const allowed=['Pendiente de revisión','Aprobado para contacto','Contactado','Respondió','Interesado','Solicita llamada','Cliente','Descartado'];
      if(!allowed.includes(String(body.status)))return json(res,400,{error:'Estado de prospecto no válido.'},config.allowedOrigin);
      if(String(body.status)==='Aprobado para contacto'&&item.doNotContact)return json(res,409,{error:'Este prospecto está marcado como no contactar.'},config.allowedOrigin);
      item.status=String(body.status);
    }
    if(Object.prototype.hasOwnProperty.call(body,'approvedMessage'))item.approvedMessage=String(body.approvedMessage||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'followupApprovedMessage'))item.followupApprovedMessage=String(body.followupApprovedMessage||'').trim().slice(0,4096);
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
