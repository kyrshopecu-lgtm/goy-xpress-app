const crypto=require('crypto');
const {neon}=require('@neondatabase/serverless');

function send(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));}
function hashSecret(secret){return crypto.createHash('sha256').update(String(secret)).digest('hex');}
function safeEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function validImageDataUrl(v){const t=String(v||'');return t.length<=1800000&&/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(t);}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return send(res,405,{error:'Método no permitido'});
  const databaseUrl=String(process.env.DATABASE_URL||'');if(!databaseUrl)return send(res,503,{error:'Base de datos no configurada'});
  try{
    const body=typeof req.body==='object'&&req.body?req.body:{};
    const code=String(body.code||'').trim();
    const type=String(body.type||'').trim();
    const photo=String(body.photo||'');
    const secret=String(req.headers['x-request-secret']||'');
    if(!code||!['pickup','delivery','deposit','service'].includes(type))return send(res,400,{error:'Datos de evidencia incompletos'});
    if(!validImageDataUrl(photo))return send(res,400,{error:'Fotografía inválida o demasiado grande'});
    if(!secret)return send(res,401,{error:'Acceso privado requerido'});
    const sql=neon(databaseUrl);
    const rows=await sql`SELECT data FROM goy_state WHERE id=1 LIMIT 1`;
    const data=rows[0]?.data||{};data.requests=Array.isArray(data.requests)?data.requests:[];
    const index=data.requests.findIndex(r=>String(r.code||r.id||'')===code);if(index<0)return send(res,404,{error:'Solicitud no encontrada'});
    const request=data.requests[index];
    const supplied=hashSecret(secret);
    const hashes=[request.courierAccessHash,request.accessSecretHash].filter(Boolean);
    if(!hashes.some(h=>safeEqual(supplied,h)))return send(res,403,{error:'Acceso de mensajero no autorizado'});
    request.evidence={...(request.evidence||{})};
    const key=type==='pickup'?'pickupPhotos':type==='delivery'?'deliveryPhotos':type==='deposit'?'depositPhotos':'servicePhotos';
    const current=Array.isArray(request.evidence[key])?request.evidence[key]:[];
    request.evidence[key]=[...current,{photo,at:new Date().toISOString()}].slice(-20);
    request.events=Array.isArray(request.events)?request.events:[];
    request.events.unshift({id:crypto.randomUUID(),type:`additional_${type}_photo`,at:new Date().toISOString()});
    request.updatedAt=new Date().toISOString();
    data.requests[index]=request;
    await sql`UPDATE goy_state SET data=${JSON.stringify(data)}::jsonb, updated_at=NOW() WHERE id=1`;
    return send(res,200,{request:{...request,accessSecretHash:undefined,clientAccessHash:undefined,courierAccessHash:undefined},count:request.evidence[key].length});
  }catch(error){console.error('additional-evidence',error);return send(res,500,{error:'No se pudo guardar la fotografía adicional'});}
};
