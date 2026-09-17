'use strict';

const crypto = require('crypto');

const PIPELINE = ['Nuevo','Contactado','Respondió','Calificado','Interesado','Reunión agendada','Cliente','No interesado'];

const SERVICES = [
  {id:'delivery', name:'Mensajería y entregas', keywords:['entrega','envio','mensajeria','reparto','retiro','paquete']},
  {id:'legal', name:'Gestiones para abogados', keywords:['abogado','judicatura','escrito','documento judicial','proceso']},
  {id:'apostille', name:'Apostilla de documentos', keywords:['apostilla','apostillar','cancilleria']},
  {id:'vehicle', name:'Matriculación y revisión vehicular', keywords:['matricula','matriculacion','revision vehicular','vehiculo','auto']},
  {id:'parts', name:'Búsqueda y gestión de repuestos', keywords:['repuesto','repuestos','pieza','autoparte']},
  {id:'procedure', name:'Trámites y gestiones en Quito', keywords:['tramite','gestion','deposito','documento','institucion']},
  {id:'logistics', name:'Logística para emprendimientos', keywords:['emprendimiento','bodega','almacenamiento','inventario','logistica','sucursal']},
];

function text(value){return String(value||'').trim();}
function normalize(value){return text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function cleanPhone(value){return String(value||'').replace(/\D/g,'');}

function classifyService(message){
  const haystack=normalize(message);
  let best=null;
  for(const service of SERVICES){
    const score=service.keywords.reduce((n,k)=>n+(haystack.includes(normalize(k))?1:0),0);
    if(score && (!best || score>best.score)) best={...service,score};
  }
  return best ? {id:best.id,name:best.name,confidence:Math.min(0.95,0.55+best.score*0.12)} : {id:'general',name:'Asesoría GOY XPRESS',confidence:0.35};
}

function isOptOut(message){return /\b(no me escrib|no contactar|dar de baja|salir|stop|cancelar mensajes|no deseo recibir)\b/i.test(normalize(message));}
function wantsMeeting(message){return /\b(reunion|reunir|llamada|videollamada|video llamada|meet|hablar con (una )?persona|asesor)\b/i.test(normalize(message));}

function createProspect(input={}){
  const now=new Date().toISOString();
  const phone=cleanPhone(input.phone||input.whatsapp);
  if(phone.length<9) throw new Error('WhatsApp inválido');
  return {id:crypto.randomUUID(),name:text(input.name)||'Prospecto',businessName:text(input.businessName),city:text(input.city),phone,email:text(input.email).toLowerCase(),source:text(input.source)||'base_importada',consent:Boolean(input.consent),optedOut:false,status:'Nuevo',serviceInterest:null,score:0,lastInboundAt:null,lastOutboundAt:null,nextFollowUpAt:null,meeting:null,notes:text(input.notes),createdAt:now,updatedAt:now};
}

function scoreProspect(prospect,message){
  const m=normalize(message);let score=Number(prospect.score||0);
  if(m.length>8) score+=10;
  if(/precio|costo|valor|como funciona|informacion/.test(m)) score+=15;
  if(/quito|entrega|tramite|apostilla|matricula|repuesto|abogado|emprendimiento/.test(m)) score+=15;
  if(wantsMeeting(m)) score+=35;
  return Math.min(100,score);
}

function processInbound(prospect,message){
  const now=new Date().toISOString();
  const next={...prospect,updatedAt:now,lastInboundAt:now};
  if(isOptOut(message)){next.optedOut=true;next.status='No interesado';next.nextFollowUpAt=null;return {prospect:next,action:'opt_out',reply:'Entendido. No enviaremos más mensajes comerciales a este número.'};}
  const service=classifyService(message);next.serviceInterest=service;next.score=scoreProspect(next,message);next.status=wantsMeeting(message)?'Interesado':next.score>=40?'Calificado':'Respondió';
  return {prospect:next,action:wantsMeeting(message)?'offer_meeting':'reply',service};
}

function canSendOutbound(prospect){return Boolean(prospect && prospect.consent && !prospect.optedOut);}

function firstContact(prospect){
  const name=text(prospect.name).split(/\s+/)[0]||'Hola';
  const business=prospect.businessName?` de ${prospect.businessName}`:'';
  return `Hola ${name} 👋 Soy el asistente virtual de GOY XPRESS. Tenemos soluciones para realizar entregas y gestiones en Quito sin que tengas que dedicar tiempo a desplazarte${business}. ¿Qué tipo de operación necesitas resolver en Quito?`;
}

function serviceReply(prospect,service){
  const name=text(prospect.name).split(/\s+/)[0]||'';
  const prefix=name?`${name}, `:'';
  const messages={
    delivery:'podemos ayudarte con retiros, mensajería y entregas en Quito.',
    legal:'podemos apoyar con el ingreso y gestión de documentos en instituciones de Quito.',
    apostille:'podemos gestionar el proceso de apostilla de documentos en Quito.',
    vehicle:'podemos ayudarte con la gestión de matriculación y revisión vehicular para ahorrarte tiempo.',
    parts:'podemos ayudarte a localizar y gestionar repuestos, además de coordinar su retiro o entrega.',
    procedure:'podemos realizar trámites y gestiones presenciales en Quito mediante nuestro personal.',
    logistics:'podemos ayudarte con operación logística en Quito para que tu emprendimiento tenga presencia sin montar toda una infraestructura propia.',
    general:'cuéntame qué necesitas realizar en Quito y te indico cómo podemos ayudarte.'
  };
  return `${prefix}${messages[service?.id||'general']} Si deseas, puedo hacerte unas preguntas breves y coordinar una llamada o videollamada con GOY XPRESS.`;
}

function scheduleFollowUp(prospect,hours=24){if(!canSendOutbound(prospect))return {...prospect,nextFollowUpAt:null};return {...prospect,nextFollowUpAt:new Date(Date.now()+hours*3600000).toISOString(),updatedAt:new Date().toISOString()};}

module.exports={PIPELINE,SERVICES,classifyService,isOptOut,wantsMeeting,createProspect,scoreProspect,processInbound,canSendOutbound,firstContact,serviceReply,scheduleFollowUp};
