const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {wrap}=require('./admin-management');

function sign(payload,secret){const body=Buffer.from(JSON.stringify(payload)).toString('base64url');const sig=crypto.createHmac('sha256',secret).update(body).digest('base64url');return `${body}.${sig}`;}
function request(method,url,body={},token=''){return {method,url,headers:{host:'localhost',authorization:token?`Bearer ${token}`:''},body,async *[Symbol.asyncIterator](){yield JSON.stringify(body);}};}
function response(){let resolve;const done=new Promise(r=>resolve=r);return {statusCode:0,headers:{},body:null,setHeader(k,v){this.headers[k]=v;},end(value){this.body=JSON.parse(value||'{}');resolve();},done};}
function harness(initial={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'goy-admin-management-')),dataFile=path.join(dir,'data.json'),secret='test-secret';fs.writeFileSync(dataFile,JSON.stringify({users:[],clients:[],couriers:[],requests:[],payments:[],invites:[],templates:[],walletEntries:[],monthlyArchives:[],...initial},null,2));const fallback=async(_req,res)=>{res.statusCode=404;res.end(JSON.stringify({error:'fallback'}));};return {dir,dataFile,handler:wrap(fallback,{tokenSecret:secret,dataFile,databaseUrl:'',allowedOrigin:'*'}),token:sign({role:'admin',exp:Date.now()+60000},secret)};}
async function call(h,req){const res=response();await h.handler(req,res);await res.done;return res;}

test('admin crea, edita y borra servicio personalizado',async()=>{const h=harness();try{let res=await call(h,request('POST','/api/admin/services',{name:'Retiro especial',price:'7.50',description:'Servicio adicional'},h.token));assert.equal(res.statusCode,201);assert.equal(res.body.service.price,7.5);const id=res.body.service.id;res=await call(h,request('PATCH',`/api/admin/services/${id}`,{price:9,description:'Actualizado'},h.token));assert.equal(res.statusCode,200);assert.equal(res.body.service.price,9);res=await call(h,request('GET','/api/admin/services',{},h.token));assert.equal(res.body.services.length,1);res=await call(h,request('DELETE',`/api/admin/services/${id}`,{},h.token));assert.equal(res.statusCode,200);res=await call(h,request('GET','/api/admin/services',{},h.token));assert.equal(res.body.services.length,0);}finally{fs.rmSync(h.dir,{recursive:true,force:true});}});

test('no borra cliente con solicitud activa y sí permite borrar después de finalizar',async()=>{const user={id:'client-1',role:'client',name:'Cliente'};const h=harness({users:[user],clients:[{id:'client-1',userId:'client-1'}],requests:[{id:'req-1',code:'GOY-1',clientId:'client-1',status:'En camino'}]});try{let res=await call(h,request('DELETE','/api/admin/clients/client-1',{},h.token));assert.equal(res.statusCode,409);let data=JSON.parse(fs.readFileSync(h.dataFile,'utf8'));assert.equal(data.users.length,1);data.requests[0].status='Entrega finalizada';fs.writeFileSync(h.dataFile,JSON.stringify(data,null,2));res=await call(h,request('DELETE','/api/admin/clients/client-1',{},h.token));assert.equal(res.statusCode,200);data=JSON.parse(fs.readFileSync(h.dataFile,'utf8'));assert.equal(data.users.length,0);assert.equal(data.requests.length,1);assert.equal(data.requests[0].code,'GOY-1');}finally{fs.rmSync(h.dir,{recursive:true,force:true});}});

test('no borra mensajero mientras tenga operación activa',async()=>{const user={id:'courier-1',role:'courier',name:'Mensajero'};const h=harness({users:[user],couriers:[{id:'courier-1',userId:'courier-1'}],requests:[{code:'GOY-2',courierId:'courier-1',status:'Asignado'}]});try{const res=await call(h,request('DELETE','/api/admin/couriers/courier-1',{},h.token));assert.equal(res.statusCode,409);}finally{fs.rmSync(h.dir,{recursive:true,force:true});}});

test('rechaza gestión sin sesión administrativa',async()=>{const h=harness();try{const res=await call(h,request('GET','/api/admin/services'));assert.equal(res.statusCode,401);}finally{fs.rmSync(h.dir,{recursive:true,force:true});}});

test('rechaza tokens de ventas en rutas administrativas sensibles',async()=>{const h=harness();try{const salesToken=sign({role:'sales',userId:'sales-1',exp:Date.now()+60000},'test-secret');for(const [method,url,body] of [['GET','/api/admin/services',{}],['GET','/api/admin/prospects',{}],['POST','/api/admin/services',{name:'No autorizado',price:1,role:'admin'}]]){const res=await call(h,request(method,url,body,salesToken));assert.equal(res.statusCode,403,method+' '+url+' debe denegar token de ventas sin permiso o usuario registrado');}}finally{fs.rmSync(h.dir,{recursive:true,force:true});}});

test('ventas solo accede a CRM de prospectos con permisos del rol',async()=>{
 const user={id:'sales-1',role:'sales',name:'Ventas',active:true,permissions:['sales.prospects.read']};
 const h=harness({users:[user]});
 try{
  const token=sign({role:'sales',userId:'sales-1',exp:Date.now()+60000},'test-secret');
  const prospects=await call(h,request('GET','/api/admin/prospects',{},token));
  assert.equal(prospects.statusCode,200);
  const services=await call(h,request('GET','/api/admin/services',{},token));
  assert.equal(services.statusCode,403);
  const forbiddenWrite=await call(h,request('POST','/api/admin/prospects',{business:'Nuevo prospecto'},token));
  assert.equal(forbiddenWrite.statusCode,403);
  const forbiddenWhatsApp=await call(h,request('POST','/api/admin/prospects/prospect-1/send-whatsapp',{},token));
  assert.equal(forbiddenWhatsApp.statusCode,403);
  const persisted=JSON.parse(fs.readFileSync(h.dataFile,'utf8'));
  persisted.users[0].active=false;
  fs.writeFileSync(h.dataFile,JSON.stringify(persisted,null,2));
  const staleSession=await call(h,request('GET','/api/admin/prospects',{},token));
  assert.equal(staleSession.statusCode,403);
 }finally{fs.rmSync(h.dir,{recursive:true,force:true});}
});

test('el rol enviado en el cuerpo no sustituye una sesión administrativa',async()=>{const h=harness();try{const res=await call(h,request('POST','/api/admin/services',{name:'No autorizado',price:1,role:'admin'}));assert.equal(res.statusCode,401);const data=JSON.parse(fs.readFileSync(h.dataFile,'utf8'));assert.equal((data.customServices||[]).length,0);}finally{fs.rmSync(h.dir,{recursive:true,force:true});}});

test('contabilidad registra ingresos y egresos y obtiene resumen',async()=>{
 const user={id:'acct-1',role:'accounting',name:'Contabilidad',active:true,permissions:['accounting.read','accounting.entries.create','accounting.entries.update','accounting.reconcile','accounting.reports']};
 const h=harness({users:[user]});
 try{
  const token=sign({role:'accounting',userId:'acct-1',exp:Date.now()+60000},'test-secret');
  let res=await call(h,request('POST','/api/admin/accounting/entries',{type:'income',amount:'125.50',category:'Mensajería',description:'Cobro de servicio GOY',date:'2026-11-04',paymentMethod:'Transferencia'},token));
  assert.equal(res.statusCode,201);assert.equal(res.body.entry.amount,125.5);const id=res.body.entry.id;
  res=await call(h,request('POST','/api/admin/accounting/entries',{type:'expense',amount:25,category:'Combustible',description:'Gasto operativo',date:'2026-11-04'},token));
  assert.equal(res.statusCode,201);
  res=await call(h,request('GET','/api/admin/accounting/summary',{},token));
  assert.equal(res.statusCode,200);assert.equal(res.body.totals.income,125.5);assert.equal(res.body.totals.expense,25);assert.equal(res.body.totals.balance,100.5);
  res=await call(h,request('GET','/api/admin/accounting/entries',{},token));assert.equal(res.body.total,2);
  res=await call(h,request('PATCH',`/api/admin/accounting/entries/${id}`,{amount:130},token));assert.equal(res.statusCode,200);assert.equal(res.body.entry.amount,130);
 }finally{fs.rmSync(h.dir,{recursive:true,force:true});}
});

test('contabilidad concilia registros y bloquea su edición posterior',async()=>{
 const user={id:'acct-2',role:'accounting',active:true,permissions:['accounting.read','accounting.entries.create','accounting.entries.update','accounting.reconcile','accounting.reports']};
 const h=harness({users:[user]});
 try{
  const token=sign({role:'accounting',userId:'acct-2',exp:Date.now()+60000},'test-secret');
  let res=await call(h,request('POST','/api/admin/accounting/entries',{type:'expense',amount:8,category:'Movilidad',description:'Taxi operativo',date:'2026-11-04'},token));const id=res.body.entry.id;
  res=await call(h,request('POST','/api/admin/accounting/reconcile',{ids:[id]},token));assert.equal(res.statusCode,200);assert.equal(res.body.reconciled,1);
  res=await call(h,request('PATCH',`/api/admin/accounting/entries/${id}`,{amount:10},token));assert.equal(res.statusCode,409);
  res=await call(h,request('GET','/api/admin/accounting/summary',{},token));assert.equal(res.body.pendingReconciliation,0);
 }finally{fs.rmSync(h.dir,{recursive:true,force:true});}
});

test('permisos contables son verificados en servidor y no aceptan campos de rol del cliente',async()=>{
 const user={id:'acct-read',role:'accounting',active:true,permissions:['accounting.read']};
 const h=harness({users:[user]});
 try{
  const token=sign({role:'accounting',userId:'acct-read',exp:Date.now()+60000},'test-secret');
  let res=await call(h,request('GET','/api/admin/accounting/entries',{},token));assert.equal(res.statusCode,200);
  res=await call(h,request('POST','/api/admin/accounting/entries',{type:'income',amount:20,category:'Prueba',description:'No permitido',date:'2026-11-04',role:'admin'},token));assert.equal(res.statusCode,403);
  res=await call(h,request('GET','/api/admin/accounting/summary',{},token));assert.equal(res.statusCode,403);
  res=await call(h,request('POST','/api/admin/accounting/entries',{type:'income',amount:-1,category:'Prueba',description:'Valor inválido',date:'2026-11-04'},sign({role:'admin',exp:Date.now()+60000},'test-secret')));assert.equal(res.statusCode,400);
 }finally{fs.rmSync(h.dir,{recursive:true,force:true});}
});

test('contabilidad rechaza fechas imposibles y ventas no puede consultar el libro contable',async()=>{
 const accounting={id:'acct-date',role:'accounting',active:true,permissions:['accounting.entries.create','accounting.read']};
 const sales={id:'sales-date',role:'sales',active:true,permissions:['sales.prospects.read']};
 const h=harness({users:[accounting,sales]});
 try{
  const acctToken=sign({role:'accounting',userId:'acct-date',exp:Date.now()+60000},'test-secret');
  const salesToken=sign({role:'sales',userId:'sales-date',exp:Date.now()+60000},'test-secret');
  let res=await call(h,request('POST','/api/admin/accounting/entries',{type:'income',amount:10,category:'Cobro',description:'Fecha imposible',date:'2026-02-31'},acctToken));
  assert.equal(res.statusCode,400);
  res=await call(h,request('GET','/api/admin/accounting/entries',{},salesToken));assert.equal(res.statusCode,403);
 }finally{fs.rmSync(h.dir,{recursive:true,force:true});}
});
test('ventas y contabilidad no pueden cruzar módulos aunque llamen directamente a la API',async()=>{
 const sales={id:'sales-isolated',role:'sales',active:true,permissions:['sales.prospects.read','sales.prospects.create','sales.prospects.update']};
 const accounting={id:'acct-isolated',role:'accounting',active:true,permissions:['accounting.read','accounting.entries.create','accounting.entries.update','accounting.reconcile','accounting.reports']};
 const entry={id:'entry-isolated',type:'income',amount:10,category:'Prueba',description:'Registro de prueba',date:'2026-11-04',reconciled:false};
 const h=harness({users:[sales,accounting],accountingEntries:[entry]});
 try{
  const salesToken=sign({role:'sales',userId:sales.id,exp:Date.now()+60000},'test-secret');
  const accountingToken=sign({role:'accounting',userId:accounting.id,exp:Date.now()+60000},'test-secret');
  const salesAttempts=[
   ['GET','/api/admin/accounting/entries',{}],
   ['GET','/api/admin/accounting/summary',{}],
   ['POST','/api/admin/accounting/entries',{type:'income',amount:99,category:'No autorizado',description:'Ventas',date:'2026-11-04'}],
   ['PATCH','/api/admin/accounting/entries/entry-isolated',{amount:99}],
   ['POST','/api/admin/accounting/reconcile',{ids:['entry-isolated']}]
  ];
  for(const [method,url,body] of salesAttempts){
   const res=await call(h,request(method,url,body,salesToken));
   assert.equal(res.statusCode,403, 'Ventas debe quedar fuera de '+method+' '+url);
  }
  const accountingAttempts=[
   ['GET','/api/admin/prospects',{}],
   ['POST','/api/admin/prospects',{business:'No autorizado desde contabilidad'}],
   ['PATCH','/api/admin/prospects/prospect-1',{status:'Cliente'}]
  ];
  for(const [method,url,body] of accountingAttempts){
   const res=await call(h,request(method,url,body,accountingToken));
   assert.equal(res.statusCode,403, 'Contabilidad debe quedar fuera de '+method+' '+url);
  }
  const data=JSON.parse(fs.readFileSync(h.dataFile,'utf8'));
  assert.equal(data.accountingEntries[0].amount,10,'Ventas no debe modificar movimientos contables');
  assert.equal(data.prospects.length,0,'Contabilidad no debe crear ni modificar prospectos');
 }finally{fs.rmSync(h.dir,{recursive:true,force:true});}
});
