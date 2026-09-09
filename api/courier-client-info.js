const crypto=require('crypto');
const{neon}=require('@neondatabase/serverless');

function send(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(body));}
function safeEqual(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function verifyToken(token,secret){if(!token||!secret)return null;const[body,signature]=String(token).split('.');if(!body||!signature)return null;const expected=crypto.createHmac('sha256',secret).update(body).digest('base64url');if(!safeEqual(signature,expected))return null;try{const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));if(!payload.exp||Date.now()>payload.exp)return null;return payload}catch{return null}}
function bearer(req){const a=String(req.headers.authorization||'');return a.startsWith('Bearer ')?a.slice(7):''}
function cleanPhone(v){return String(v||'').replace(/\D/g,'')}

module.exports=async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{error:'Método no permitido'});
 const databaseUrl=String(process.env.DATABASE_URL||''),tokenSecret=String(process.env.TOKEN_SECRET||'');
 if(!databaseUrl||!tokenSecret)return send(res,503,{error:'Servicio temporalmente no disponible'});
 const payload=verifyToken(bearer(req),tokenSecret);if(!payload||payload.role!=='courier'||!payload.userId)return send(res,401,{error:'Sesión de mensajero inválida'});
 const code=String(req.query?.code||new URL(req.url,'http://localhost').searchParams.get('code')||'').trim();if(!code)return send(res,400,{error:'Código de operación obligatorio'});
 try{
  const sql=neon(databaseUrl);const rows=await sql`SELECT data FROM goy_state WHERE id=1 LIMIT 1`;const data=rows[0]?.data||{};
  const courier=(data.users||[]).find(u=>u.id===payload.userId&&u.role==='courier'&&u.active!==false&&u.approved);if(!courier)return send(res,403,{error:'Mensajero no autorizado'});
  const request=(data.requests||[]).find(r=>(r.code===code||r.id===code)&&r.courierId===courier.id);if(!request)return send(res,404,{error:'Operación no asignada a tu cuenta'});
  const client=(data.users||[]).find(u=>u.id===request.clientId&&u.role==='client')||(data.clients||[]).find(c=>c.userId===request.clientId||c.id===request.clientId)||{};
  return send(res,200,{client:{name:String(client.name||request.customer||'Cliente'),businessName:String(client.businessName||request.customer||''),documentId:String(client.documentId||''),address:String(client.address||''),phone:cleanPhone(client.phone||client.whatsapp||request.phone||''),email:String(client.email||request.email||'')}});
 }catch(error){console.error('courier-client-info',error);return send(res,500,{error:'No se pudieron consultar los datos del cliente'})}
};