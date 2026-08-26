const crypto=require('crypto');
const {neon}=require('@neondatabase/serverless');

function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));}
function hashSecret(secret){return crypto.createHash('sha256').update(String(secret)).digest('hex');}
function safeEqual(a,b){const x=Buffer.from(String(a||''));const y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function sanitize(request){const copy={...request};delete copy.accessSecretHash;delete copy.accessSecret;return copy;}

module.exports=async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{error:'Método no permitido'});
  const databaseUrl=String(process.env.DATABASE_URL||'');
  if(!databaseUrl)return json(res,503,{error:'Base de datos de producción no configurada'});
  const code=String(req.query?.code||new URL(req.url,'http://localhost').searchParams.get('code')||'').trim();
  const secret=String(req.headers['x-request-secret']||'');
  if(!code||!secret)return json(res,400,{error:'Código y acceso privado son obligatorios'});
  try{
    const sql=neon(databaseUrl);
    const rows=await sql`SELECT data FROM goy_state WHERE id = 1 LIMIT 1`;
    const data=rows[0]?.data||{};
    const request=(Array.isArray(data.requests)?data.requests:[]).find(item=>item.code===code||item.id===code);
    if(!request)return json(res,404,{error:'Solicitud no encontrada'});
    if(!request.accessSecretHash||!safeEqual(hashSecret(secret),request.accessSecretHash))return json(res,401,{error:'Acceso privado incorrecto'});
    return json(res,200,{request:sanitize(request)});
  }catch(error){console.error('request-status',error);return json(res,500,{error:'No se pudo consultar la solicitud'});}
};
