function cleanPhone(value) {
  let d = String(value || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('593')) return d;
  if (d.startsWith('0') && d.length === 10) return `593${d.slice(1)}`;
  if (d.length === 9 && d.startsWith('9')) return `593${d}`;
  return d;
}

function config() {
  return {
    accessToken: String(process.env.WHATSAPP_ACCESS_TOKEN || ''),
    phoneNumberId: String(process.env.WHATSAPP_PHONE_NUMBER_ID || ''),
    graphVersion: String(process.env.WHATSAPP_GRAPH_VERSION || 'v25.0'),
    language: String(process.env.GOY_WA_TEMPLATE_LANG || 'es'),
    adminPhone: cleanPhone(process.env.GOY_ADMIN_WHATSAPP || ''),
    adminTemplate: String(process.env.GOY_WA_ADMIN_ORDER_TEMPLATE || 'goy_nueva_orden_admin'),
    courierTemplate: String(process.env.GOY_WA_COURIER_ORDER_TEMPLATE || 'goy_nueva_orden_mensajero'),
    clientDeliveredTemplate: String(process.env.GOY_WA_CLIENT_DELIVERED_TEMPLATE || 'goy_entrega_finalizada_cliente'),
    prospectTemplate: String(process.env.GOY_WA_PROSPECT_TEMPLATE || ''),
    prospectMediaHeader: String(process.env.GOY_WA_PROSPECT_MEDIA_HEADER || '').toLowerCase() === 'true',
  };
}

function isConfigured(cfg = config()) {
  return Boolean(cfg.accessToken && cfg.phoneNumberId);
}

async function sendTemplate(to, templateName, parameters = [], cfg = config(), options = {}) {
  const phone = cleanPhone(to);
  if (!isConfigured(cfg)) return {ok:false, skipped:true, reason:'WHATSAPP_NOT_CONFIGURED'};
  if (!phone || !templateName) return {ok:false, skipped:true, reason:'RECIPIENT_OR_TEMPLATE_MISSING'};

  const components=[];
  const headerImageUrl=String(options.headerImageUrl||'').trim();
  if(headerImageUrl){
    components.push({
      type:'header',
      parameters:[{type:'image',image:{link:headerImageUrl}}],
    });
  }
  components.push({
    type:'body',
    parameters:parameters.map(value => ({type:'text', text:String(value ?? '-').slice(0,1024)})),
  });

  const url = `https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/messages`;
  const response = await fetch(url, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization':`Bearer ${cfg.accessToken}`,
    },
    body:JSON.stringify({
      messaging_product:'whatsapp',
      recipient_type:'individual',
      to:phone,
      type:'template',
      template:{
        name:templateName,
        language:{code:cfg.language},
        components,
      },
    }),
  });
  const body = await response.json().catch(()=>({}));
  if (!response.ok) {
    console.error('GOY WhatsApp notification error', response.status, JSON.stringify(body).slice(0,600));
    return {ok:false, status:response.status, error:body?.error?.message || 'WHATSAPP_SEND_FAILED'};
  }
  return {ok:true, id:body?.messages?.[0]?.id || ''};
}

function orderCode(request) { return request?.code || request?.id || '-'; }
function clientName(client, request) { return client?.businessName || client?.name || request?.customer || 'Cliente'; }
function courierName(courier) { return courier?.name || courier?.fullName || 'Mensajero'; }
function serviceName(request) { return request?.serviceLabel || request?.service || request?.kind || 'Servicio'; }
function address(request) { return request?.destinationAddress || request?.procedureAddress || request?.pickupAddress || request?.address || '-'; }
function value(request) { return `$${Number(request?.serviceCost ?? request?.value ?? 0).toFixed(2)}`; }

async function notifyAdminNewOrder({request, client}) {
  const cfg = config();
  if (!cfg.adminPhone) return {ok:false, skipped:true, reason:'ADMIN_PHONE_MISSING'};
  return sendTemplate(cfg.adminPhone, cfg.adminTemplate, [
    orderCode(request),
    clientName(client, request),
    serviceName(request),
    address(request),
    value(request),
  ], cfg);
}

async function notifyCourierAssigned({request, courier}) {
  const phone = courier?.whatsapp || courier?.phone;
  return sendTemplate(phone, config().courierTemplate, [
    courierName(courier),
    orderCode(request),
  ]);
}

async function notifyClientDelivered({request, client}) {
  const phone = client?.whatsapp || client?.phone || request?.whatsapp || request?.phone;
  return sendTemplate(phone, config().clientDeliveredTemplate, [
    clientName(client, request),
    orderCode(request),
    serviceName(request),
  ]);
}

async function sendProspectFirstContact({phone,business,message,imageUrl=''}) {
  const cfg=config();
  if(!cfg.prospectTemplate)return {ok:false,skipped:true,reason:'PROSPECT_TEMPLATE_MISSING'};
  const media=String(imageUrl||'').trim();
  if(media&&!cfg.prospectMediaHeader){
    const sent=await sendTemplate(phone,cfg.prospectTemplate,[business||'Negocio',message],cfg);
    return sent.ok?{...sent,mediaRequested:true,mediaSkipped:true,fallback:'text-only'}:sent;
  }
  const sent=await sendTemplate(phone,cfg.prospectTemplate,[business||'Negocio',message],cfg,media?{headerImageUrl:media}:{});
  return sent.ok?{...sent,mediaRequested:Boolean(media),mediaSkipped:false,fallback:''}:sent;
}

async function sendProspectReply({phone,message,imageUrl=''}) {
  const cfg=config(),to=cleanPhone(phone),body=String(message||'').trim(),media=String(imageUrl||'').trim();
  if(!isConfigured(cfg))return {ok:false,skipped:true,reason:'WHATSAPP_NOT_CONFIGURED'};
  if(!to||!body)return {ok:false,skipped:true,reason:'RECIPIENT_OR_MESSAGE_MISSING'};
  const url=`https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/messages`;
  const payloadBody=media
    ?{messaging_product:'whatsapp',recipient_type:'individual',to,type:'image',image:{link:media,caption:body.slice(0,1024)}}
    :{messaging_product:'whatsapp',recipient_type:'individual',to,type:'text',text:{preview_url:false,body:body.slice(0,4096)}};
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${cfg.accessToken}`},body:JSON.stringify(payloadBody)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){console.error('GOY WhatsApp prospect reply error',response.status,JSON.stringify(payload).slice(0,600));return {ok:false,status:response.status,error:payload?.error?.message||'WHATSAPP_SEND_FAILED'};}
  return {ok:true,id:payload?.messages?.[0]?.id||''};
}

async function safeNotify(label, fn) {
  try { return await fn(); }
  catch (error) {
    console.error(`GOY WhatsApp ${label}`, error);
    return {ok:false, error:error.message || String(error)};
  }
}

module.exports = {
  cleanPhone,
  isConfigured,
  sendTemplate,
  notifyAdminNewOrder,
  notifyCourierAssigned,
  notifyClientDelivered,
  sendProspectFirstContact,
  sendProspectReply,
  safeNotify,
};
