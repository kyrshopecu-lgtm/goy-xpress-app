module.exports=async function handler(req,res){
 res.statusCode=410;
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.end(JSON.stringify({error:'El seguimiento público fue deshabilitado. Para consultar el estado de una orden, contacta a GOY XPRESS por WhatsApp.'}));
};
