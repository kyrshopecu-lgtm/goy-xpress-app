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
