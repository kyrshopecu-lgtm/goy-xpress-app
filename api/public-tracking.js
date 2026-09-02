const {neon}=require('@neondatabase/serverless');

function send(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(body));}
function clean(v){return String(v||'').trim().toUpperCase();}
function trackingNumber(request){if(request?.trackingNumber)return String(request.trackingNumber);const code=clean(request?.code||request?.id).replace(/^GOY[-_]?/i,'').replace(/[^A-Z0-9-]/g,'');return code?`GOY-TRK-${code}`:'';}
function statusName(v){return ({pending:'Pendiente',quoted:'Cotizado',accepted:'Aceptado',assigned:'Asignado',pickedUp:'Recogido',onRoute:'En camino',finished:'Entrega finalizada',cancelled:'Cancelado','En ruta':'En camino',Entregado:'Entrega finalizada',Finalizado:'Entrega finalizada'}[v]||v||'Pendiente');}
function serviceName(r){return r?.serviceLabel||({shipment:r?.deliveryMode==='express'?'Envío Express':'Entrega programada',procedure:'Trámite ejecutivo',deposit:'Depósito',diverse:'Servicio diverso'}[r?.kind])||r?.service||r?.kind||'Servicio';}
function point(p){const latitude=Number(p?.latitude),longitude=Number(p?.longitude);if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return null;return {latitude,longitude,at:p?.at||null};}
function safeRequest(r){const gpsHistory=(Array.isArray(r?.gps?.history)?r.gps.history:[]).map(point).filter(Boolean).slice(-250);const last=point(r?.gps?.last);return {tracking:trackingNumber(r),order:String(r?.code||r?.id||''),client:String(r?.customer||r?.businessName||r?.client||'Cliente GOY XPRESS'),service:serviceName(r),status:statusName(r?.status),courier:String(r?.courier||'Sin asignar'),origin:String(r?.originAddress||r?.pickupAddress||''),destination:String(r?.destinationAddress||r?.procedureAddress||r?.depositDestination||r?.address||''),createdAt:r?.createdAt||null,updatedAt:r?.updatedAt||null,finishedAt:r?.finishedAt||null,gps:{history:gpsHistory,last}};}

module.exports=async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{error:'Método no permitido'});
 const code=String(req.query?.code||new URL(req.url,'http://localhost').searchParams.get('code')||'').trim();
 if(!code)return send(res,400,{error:'Tracking obligatorio'});
 const databaseUrl=String(process.env.DATABASE_URL||'');if(!databaseUrl)return send(res,503,{error:'Seguimiento temporalmente no disponible'});
 try{const sql=neon(databaseUrl);const rows=await sql`SELECT data FROM goy_state WHERE id=1 LIMIT 1`;const requests=Array.isArray(rows[0]?.data?.requests)?rows[0].data.requests:[];const wanted=clean(code);const request=requests.find(r=>clean(r.code||r.id)===wanted||clean(trackingNumber(r))===wanted);if(!request)return send(res,404,{error:'Orden no encontrada'});return send(res,200,{request:safeRequest(request)});}catch(error){console.error('public-tracking',error);return send(res,500,{error:'No se pudo consultar el seguimiento'});}
};