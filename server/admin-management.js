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
async function discoverProspects(config,criteria){
 const endpoint=String(config.prospectDiscoveryUrl||'').trim(),token=String(config.prospectDiscoveryToken||'').trim();
 if(!endpoint){const e=new Error('Proveedor de descubrimiento de prospectos no configurado.');e.status=503;throw e;}
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'Authorization':'Bearer '+token}:{})},body:JSON.stringify(criteria)});
 if(!response.ok){const e=new Error('El proveedor de prospectos no respondió correctamente.');e.status=502;throw e;}
 const body=await response.json(),items=Array.isArray(body)?body:Array.isArray(body.prospects)?body.prospects:[];
 return items.slice(0,criteria.limit).map(x=>({business:String(x.business||x.name||'').trim(),city:String(x.city||criteria.city||'').trim(),category:String(x.category||criteria.category||'').trim(),source:String(x.source||'web pública').trim(),sourceUrl:String(x.sourceUrl||x.url||'').trim(),channel:String(x.channel||'').trim(),contact:String(x.contact||'').trim(),fitReason:String(x.fitReason||'').trim(),score:Math.max(0,Math.min(100,Number(x.score||0)))})).filter(x=>x.business.length>=2);
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
  const handles=(p==='/admin/services'&&['GET','POST'].includes(req.method))||(serviceMatch&&['PATCH','DELETE'].includes(req.method))||(p==='/admin/prospects'&&['GET','POST'].includes(req.method))||(prospectImport&&req.method==='POST')||(prospectDiscover&&req.method==='POST')||(prospectAnalyzeMatch&&req.method==='POST')||(prospectMatch&&['GET','PATCH','DELETE'].includes(req.method))||(accountMatch&&req.method==='DELETE');
  if(!handles)return next(req,res);
  const config={databaseUrl:String(overrides.databaseUrl??process.env.DATABASE_URL??''),tokenSecret:String(overrides.tokenSecret??process.env.TOKEN_SECRET??''),allowedOrigin:String(overrides.allowedOrigin??process.env.ALLOWED_ORIGIN??'*'),openaiApiKey:String(overrides.openaiApiKey??process.env.OPENAI_API_KEY??''),prospectDiscoveryUrl:String(overrides.prospectDiscoveryUrl??process.env.PROSPECT_DISCOVERY_URL??''),prospectDiscoveryToken:String(overrides.prospectDiscoveryToken??process.env.PROSPECT_DISCOVERY_TOKEN??''),dataFile:overrides.dataFile||process.env.DATA_FILE||path.join(__dirname,'data-v5.json')};
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
   if(prospectDiscover&&req.method==='POST'){
    const body=await readBody(req),city=String(body.city||'').trim(),category=String(body.category||'').trim(),limit=Math.max(1,Math.min(60,Number(body.limit||50)));
    const found=await discoverProspects(config,{city,category,limit,publicOnly:true,dailyRequestBudget:177,monthlyRequestBudget:4800});
    return json(res,200,{prospects:found,count:found.length,criteria:{city,category,limit}},config.allowedOrigin);
   }
   if(prospectImport&&req.method==='POST'){
    const body=await readBody(req),incoming=Array.isArray(body.prospects)?body.prospects:[];
    if(!incoming.length)return json(res,400,{error:'Incluye al menos un prospecto para importar.'},config.allowedOrigin);
    if(incoming.length>500)return json(res,400,{error:'Máximo 500 prospectos por importación.'},config.allowedOrigin);
    const keyOf=x=>{const url=String(x.sourceUrl||'').trim().toLowerCase().replace(/\/$/,'');const contact=String(x.contact||'').trim().toLowerCase().replace(/[\s()+-]/g,'');const business=String(x.business||x.name||'').trim().toLowerCase(),city=String(x.city||'').trim().toLowerCase();return url?'url:'+url:contact?'contact:'+contact:'business:'+business+'|'+city;};
    const known=new Set(data.prospects.map(keyOf)),added=[],duplicates=[],invalid=[];const now=new Date().toISOString();
    incoming.forEach((raw,index)=>{const business=String(raw?.business||raw?.name||'').trim();if(business.length<2){invalid.push({index,reason:'Nombre de negocio inválido'});return;}const key=keyOf(raw);if(known.has(key)){duplicates.push({index,business});return;}known.add(key);const item={id:crypto.randomUUID(),business,city:String(raw.city||'').trim(),category:String(raw.category||'').trim(),source:String(raw.source||'importación').trim(),sourceUrl:String(raw.sourceUrl||'').trim(),channel:String(raw.channel||'').trim(),contact:String(raw.contact||'').trim(),fitReason:String(raw.fitReason||'').trim(),observedNeeds:'',growthOpportunities:'',suggestedServices:'',campaignIdeas:'',score:Math.max(0,Math.min(100,Number(raw.score||0))),status:'Pendiente de revisión',draftMessage:String(raw.draftMessage||'').trim(),approvedMessage:'',doNotContact:Boolean(raw.doNotContact),conversation:[],createdAt:now,updatedAt:now};data.prospects.unshift(item);added.push(item);});
    if(added.length)await writeState(config,data);return json(res,200,{imported:added.length,duplicates:duplicates.length,invalid:invalid.length,prospects:added,duplicateItems:duplicates,invalidItems:invalid},config.allowedOrigin);
   }
   if(p==='/admin/prospects'&&req.method==='GET')return json(res,200,{prospects:data.prospects},config.allowedOrigin);
   if(p==='/admin/prospects'&&req.method==='POST'){
    const body=await readBody(req),business=String(body.business||body.name||'').trim(),sourceUrl=String(body.sourceUrl||'').trim(),channel=String(body.channel||'').trim(),contact=String(body.contact||'').trim();
    if(business.length<2)return json(res,400,{error:'Ingresa el nombre del negocio o prospecto.'},config.allowedOrigin);
    const now=new Date().toISOString(),item={id:crypto.randomUUID(),business,city:String(body.city||'').trim(),category:String(body.category||'').trim(),source:String(body.source||'web').trim(),sourceUrl,channel,contact,fitReason:String(body.fitReason||'').trim(),observedNeeds:String(body.observedNeeds||'').trim(),growthOpportunities:String(body.growthOpportunities||'').trim(),suggestedServices:String(body.suggestedServices||'').trim(),campaignIdeas:String(body.campaignIdeas||'').trim(),score:Math.max(0,Math.min(100,Number(body.score||0))),status:'Pendiente de revisión',draftMessage:String(body.draftMessage||'').trim(),approvedMessage:'',doNotContact:false,conversation:[],createdAt:now,updatedAt:now};
    data.prospects.unshift(item);await writeState(config,data);return json(res,201,{prospect:item},config.allowedOrigin);
   }
   if(prospectAnalyzeMatch){
    const id=decodeURIComponent(prospectAnalyzeMatch[1]),item=data.prospects.find(x=>x.id===id);if(!item)return json(res,404,{error:'Prospecto no encontrado.'},config.allowedOrigin);
    if(!config.openaiApiKey)return json(res,503,{error:'El análisis con IA no está configurado.'},config.allowedOrigin);
    const evidence={business:item.business,city:item.city,category:item.category,source:item.source,sourceUrl:item.sourceUrl,fitReason:item.fitReason,contactChannel:item.channel};
    const prompt='Analiza este prospecto comercial para GOY XPRESS en Quito. Usa únicamente los datos proporcionados como evidencia. Distingue hechos observados de hipótesis/recomendaciones. Devuelve JSON válido sin markdown con las claves observedNeeds, growthOpportunities, suggestedServices, campaignIdeas, fitReason, score y draftMessage. observedNeeds debe expresar señales observables y, cuando falte evidencia, decir que requiere validación. growthOpportunities debe proponer oportunidades concretas. suggestedServices puede incluir servicios actuales de GOY XPRESS o ideas de nuevos servicios útiles para ese negocio. campaignIdeas debe proponer campañas concretas con concepto, público y canal. score debe ser entero 0-100 según afinidad con GOY XPRESS. draftMessage debe ser breve, personalizado, identificarse como asistente virtual de GOY XPRESS y no afirmar necesidades no confirmadas. Datos: '+JSON.stringify(evidence);
    const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+config.openaiApiKey},body:JSON.stringify({model:'gpt-4o-mini',temperature:0.3,response_format:{type:'json_object'},messages:[{role:'system',content:'Eres GOY SALES AI, analista comercial responsable. No inventes datos ni uses información sensible.'},{role:'user',content:prompt}]})});
    if(!response.ok)return json(res,502,{error:'No se pudo completar el análisis con IA.'},config.allowedOrigin);
    const ai=await response.json(),raw=ai?.choices?.[0]?.message?.content||'{}';let analysis;try{analysis=JSON.parse(raw);}catch{return json(res,502,{error:'La IA devolvió un análisis no válido.'},config.allowedOrigin);}
    for(const key of ['observedNeeds','growthOpportunities','suggestedServices','campaignIdeas','fitReason','draftMessage'])if(Object.prototype.hasOwnProperty.call(analysis,key))item[key]=String(analysis[key]||'').trim().slice(0,6000);
    if(Object.prototype.hasOwnProperty.call(analysis,'score'))item.score=Math.max(0,Math.min(100,Math.round(Number(analysis.score)||0)));
    item.analysisUpdatedAt=new Date().toISOString();item.updatedAt=item.analysisUpdatedAt;await writeState(config,data);return json(res,200,{prospect:item,analysis});
   }
   if(prospectMatch){
    const id=decodeURIComponent(prospectMatch[1]),item=data.prospects.find(x=>x.id===id);if(!item)return json(res,404,{error:'Prospecto no encontrado.'},config.allowedOrigin);
    if(req.method==='GET')return json(res,200,{prospect:item},config.allowedOrigin);
    if(req.method==='DELETE'){data.prospects=data.prospects.filter(x=>x.id!==id);await writeState(config,data);return json(res,200,{ok:true},config.allowedOrigin);}
    const body=await readBody(req);
    for(const key of ['business','city','category','source','sourceUrl','channel','contact','fitReason','observedNeeds','growthOpportunities','suggestedServices','campaignIdeas','draftMessage'])if(Object.prototype.hasOwnProperty.call(body,key))item[key]=String(body[key]||'').trim();
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
