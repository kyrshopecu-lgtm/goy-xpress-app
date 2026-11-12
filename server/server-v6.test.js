'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const serverV6=require('./server-v6');

function signAdmin(secret){
 const body=Buffer.from(JSON.stringify({role:'admin',userId:'admin-test',exp:Date.now()+60000})).toString('base64url');
 return body+'.'+crypto.createHmac('sha256',secret).update(body).digest('base64url');
}
function start(handler){return new Promise(resolve=>{const server=http.createServer(handler);server.listen(0,'127.0.0.1',()=>resolve({server,base:`http://127.0.0.1:${server.address().port}`}));});}
function call(base,url,{method='GET',body,token}={}){return new Promise((resolve,reject)=>{const payload=body===undefined?null:JSON.stringify(body);const req=http.request(new URL(url,base),{method,headers:{...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{}),...(token?{Authorization:`Bearer ${token}`}:{})}},res=>{let raw='';res.on('data',c=>raw+=c);res.on('end',()=>resolve({status:res.statusCode,body:raw?JSON.parse(raw):{}}));});req.on('error',reject);if(payload)req.write(payload);req.end();});}

test('administrador crea cuentas internas, los roles inician sesión y puede bloquearlas',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'goy-v6-')),file=path.join(dir,'state.json'),old={DATA_FILE:process.env.DATA_FILE,TOKEN_SECRET:process.env.TOKEN_SECRET};
 process.env.DATA_FILE=file;process.env.TOKEN_SECRET='internal-users-test-secret';
 t.after(()=>{if(old.DATA_FILE===undefined)delete process.env.DATA_FILE;else process.env.DATA_FILE=old.DATA_FILE;if(old.TOKEN_SECRET===undefined)delete process.env.TOKEN_SECRET;else process.env.TOKEN_SECRET=old.TOKEN_SECRET;fs.rmSync(dir,{recursive:true,force:true});});
 const {server,base}=await start(serverV6);t.after(()=>server.close());const admin=signAdmin(process.env.TOKEN_SECRET);
 const denied=await call(base,'/api/admin/internal-users',{method:'GET'});assert.equal(denied.status,401);
 const created=await call(base,'/api/admin/internal-users',{method:'POST',token:admin,body:{role:'sales',name:'Agente Ventas',username:'ventas01',email:'ventas@goy.test',phone:'0991112233',password:'Ventas123'}});
 assert.equal(created.status,201);assert.equal(created.body.user.role,'sales');assert.equal(created.body.user.passwordHash,undefined);assert.ok(created.body.permissions.includes('sales.prospects.read'));
 const login=await call(base,'/api/auth/login',{method:'POST',body:{role:'sales',username:'ventas01',password:'Ventas123'}});
 assert.equal(login.status,200);assert.equal(login.body.user.role,'sales');assert.ok(login.body.token);
 const blocked=await call(base,`/api/admin/internal-users/${created.body.user.id}`,{method:'PATCH',token:admin,body:{active:false}});
 assert.equal(blocked.status,200);assert.equal(blocked.body.permissions.length,0);
 const blockedLogin=await call(base,'/api/auth/login',{method:'POST',body:{role:'sales',username:'ventas01',password:'Ventas123'}});
 assert.equal(blockedLogin.status,401);
 const listed=await call(base,'/api/admin/internal-users',{method:'GET',token:admin});
 assert.equal(listed.status,200);assert.equal(listed.body.users.length,1);assert.equal(listed.body.auditLog.length,2);
});

test('cuentas internas rechazan roles, usuarios duplicados y contraseñas débiles',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'goy-v6-invalid-')),file=path.join(dir,'state.json');
 const old={DATA_FILE:process.env.DATA_FILE,TOKEN_SECRET:process.env.TOKEN_SECRET};process.env.DATA_FILE=file;process.env.TOKEN_SECRET='internal-users-test-secret';
 t.after(()=>{if(old.DATA_FILE===undefined)delete process.env.DATA_FILE;else process.env.DATA_FILE=old.DATA_FILE;if(old.TOKEN_SECRET===undefined)delete process.env.TOKEN_SECRET;else process.env.TOKEN_SECRET=old.TOKEN_SECRET;fs.rmSync(dir,{recursive:true,force:true});});
 const {server,base}=await start(serverV6);t.after(()=>server.close());const admin=signAdmin(process.env.TOKEN_SECRET);
 const baseBody={role:'accounting',name:'Auxiliar Contable',username:'conta01',email:'conta@goy.test',phone:'0991112233',password:'Contabilidad123'};
 const weak=await call(base,'/api/admin/internal-users',{method:'POST',token:admin,body:{...baseBody,password:'123'}});
 assert.equal(weak.status,400);
 const created=await call(base,'/api/admin/internal-users',{method:'POST',token:admin,body:baseBody});assert.equal(created.status,201);
 const duplicate=await call(base,'/api/admin/internal-users',{method:'POST',token:admin,body:{...baseBody,username:'conta02'}});
 assert.equal(duplicate.status,409);
 const invalidRole=await call(base,'/api/admin/internal-users',{method:'POST',token:admin,body:{...baseBody,role:'admin',username:'root01',email:'root@goy.test'}});
 assert.equal(invalidRole.status,400);
});

test('la app de cliente y el registro por invitación quedan deshabilitados sin borrar datos históricos',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'goy-v6-client-disabled-')),file=path.join(dir,'state.json');
 const old={DATA_FILE:process.env.DATA_FILE,TOKEN_SECRET:process.env.TOKEN_SECRET};
 process.env.DATA_FILE=file;process.env.TOKEN_SECRET='client-disabled-test-secret';
 const historic={users:[{id:'client-old',role:'client',name:'Cliente histórico',active:true}],clients:[{id:'client-old',userId:'client-old',name:'Cliente histórico'}],requests:[{id:'old-order',clientId:'client-old',status:'Entrega finalizada'}]};
 fs.writeFileSync(file,JSON.stringify(historic));
 t.after(()=>{if(old.DATA_FILE===undefined)delete process.env.DATA_FILE;else process.env.DATA_FILE=old.DATA_FILE;if(old.TOKEN_SECRET===undefined)delete process.env.TOKEN_SECRET;else process.env.TOKEN_SECRET=old.TOKEN_SECRET;fs.rmSync(dir,{recursive:true,force:true});});
 const {server,base}=await start(serverV6);t.after(()=>server.close());
 const registration=await call(base,'/api/auth/client/register',{method:'POST',body:{name:'Nuevo cliente',email:'new@goy.test',password:'Cliente123',phone:'0991112233'}});
 assert.equal(registration.status,410);
 const login=await call(base,'/api/auth/login',{method:'POST',body:{role:'client',email:'historic@goy.test',password:'Anything123'}});
 assert.equal(login.status,403);
 const invite=await call(base,'/api/invite/legacy-token',{method:'GET'});
 assert.equal(invite.status,410);
 const saved=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.equal(saved.users.length,1);assert.equal(saved.clients.length,1);assert.equal(saved.requests[0].id,'old-order');
});


test('administrador crea, lista, edita y bloquea cuentas de mensajero desde Equipo y permisos',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'goy-v6-courier-staff-')),file=path.join(dir,'state.json');
 const old={DATA_FILE:process.env.DATA_FILE,TOKEN_SECRET:process.env.TOKEN_SECRET};
 process.env.DATA_FILE=file;process.env.TOKEN_SECRET='internal-courier-test-secret';
 t.after(()=>{if(old.DATA_FILE===undefined)delete process.env.DATA_FILE;else process.env.DATA_FILE=old.DATA_FILE;if(old.TOKEN_SECRET===undefined)delete process.env.TOKEN_SECRET;else process.env.TOKEN_SECRET=old.TOKEN_SECRET;fs.rmSync(dir,{recursive:true,force:true});});
 const {server,base}=await start(serverV6);t.after(()=>server.close());const admin=signAdmin(process.env.TOKEN_SECRET);
 const created=await call(base,'/api/admin/internal-users',{method:'POST',token:admin,body:{role:'courier',name:'Mensajero GOY',username:'mensajero01',email:'mensajero@goy.test',phone:'0992223344',password:'Mensajero123'}});
 assert.equal(created.status,201);assert.equal(created.body.user.role,'courier');assert.ok(created.body.permissions.includes('courier.jobs.read_assigned'));const stored=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(stored.users[0].passwordIterations,100000);
 const listed=await call(base,'/api/admin/internal-users',{method:'GET',token:admin});
 assert.equal(listed.status,200);assert.equal(listed.body.users.length,1);assert.equal(listed.body.users[0].role,'courier');
 const login=await call(base,'/api/auth/login',{method:'POST',body:{role:'courier',username:'mensajero01',password:'Mensajero123'}});
 assert.equal(login.status,200);assert.equal(login.body.user.role,'courier');assert.ok(login.body.token);
 const updated=await call(base,`/api/admin/internal-users/${created.body.user.id}`,{method:'PATCH',token:admin,body:{permissions:['courier.jobs.read_assigned'],active:true}});
 assert.equal(updated.status,200);assert.deepEqual(updated.body.permissions,['courier.jobs.read_assigned']);
 const blocked=await call(base,`/api/admin/internal-users/${created.body.user.id}`,{method:'PATCH',token:admin,body:{active:false}});
 assert.equal(blocked.status,200);assert.equal(blocked.body.permissions.length,0);
 const blockedLogin=await call(base,'/api/auth/login',{method:'POST',body:{role:'courier',username:'mensajero01',password:'Mensajero123'}});
 assert.equal(blockedLogin.status,401);
});
