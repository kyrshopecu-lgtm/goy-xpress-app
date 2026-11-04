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
