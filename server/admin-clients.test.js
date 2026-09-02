const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {wrap,hashPassword}=require('./admin-clients');

function sign(payload,secret){const body=Buffer.from(JSON.stringify(payload)).toString('base64url');const sig=crypto.createHmac('sha256',secret).update(body).digest('base64url');return `${body}.${sig}`;}
function request(body,token){const raw=JSON.stringify(body||{});return {method:'POST',url:'/api/admin/clients',headers:{host:'localhost',authorization:token?`Bearer ${token}`:''},body:body||{},async *[Symbol.asyncIterator](){yield raw;}};}
function response(){let resolve;const done=new Promise(r=>resolve=r);return {statusCode:0,headers:{},body:null,setHeader(k,v){this.headers[k]=v;},end(value){this.body=JSON.parse(value||'{}');resolve();},done};}

function makeHarness(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'goy-admin-client-'));const dataFile=path.join(dir,'data.json');const secret='test-secret-123';const fallback=async(_req,res)=>{res.statusCode=404;res.end(JSON.stringify({error:'fallback'}));};const handler=wrap(fallback,{tokenSecret:secret,dataFile,databaseUrl:'',allowedOrigin:'*'});const adminToken=sign({role:'admin',exp:Date.now()+60000},secret);return {dir,dataFile,handler,adminToken};}

async function call(handler,req){const res=response();await handler(req,res);await res.done;return res;}

test('rechaza creación de cliente sin sesión admin',async()=>{const h=makeHarness();try{const res=await call(h.handler,request({name:'Cliente Uno'},''));assert.equal(res.statusCode,401);assert.equal(res.body.error,'No autorizado');}finally{fs.rmSync(h.dir,{recursive:true,force:true});}});

test('admin crea cliente activo, aprobado y con contraseña cifrada',async()=>{const h=makeHarness();try{const payload={name:'Cliente Prueba',businessName:'Tienda Prueba',phone:'0991234567',documentId:'1712345678',address:'Quito',email:'cliente@example.com',password:'Clave1234'};const res=await call(h.handler,request(payload,h.adminToken));assert.equal(res.statusCode,201);assert.equal(res.body.user.role,'client');assert.equal(res.body.user.approved,true);assert.equal(res.body.user.active,true);assert.equal(res.body.user.email,'cliente@example.com');assert.equal(res.body.user.passwordHash,undefined);assert.equal(res.body.user.passwordSalt,undefined);
const data=JSON.parse(fs.readFileSync(h.dataFile,'utf8'));assert.equal(data.users.length,1);assert.equal(data.clients.length,1);assert.equal(data.users[0].approved,true);assert.equal(data.clients[0].status,'Activo');assert.notEqual(data.users[0].passwordHash,payload.password);const computed=hashPassword(payload.password,data.users[0].passwordSalt).hash;assert.equal(computed,data.users[0].passwordHash);
}finally{fs.rmSync(h.dir,{recursive:true,force:true});}});

test('evita correos duplicados y contraseñas débiles',async()=>{const h=makeHarness();try{const base={name:'Cliente Prueba',phone:'0991234567',email:'cliente@example.com',password:'Clave1234'};let res=await call(h.handler,request(base,h.adminToken));assert.equal(res.statusCode,201);res=await call(h.handler,request(base,h.adminToken));assert.equal(res.statusCode,409);res=await call(h.handler,request({...base,email:'otro@example.com',password:'123'},h.adminToken));assert.equal(res.statusCode,400);assert.match(res.body.error,/8 caracteres/);
}finally{fs.rmSync(h.dir,{recursive:true,force:true});}});
