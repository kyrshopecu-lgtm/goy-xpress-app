const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goy-v6-admin-client-'));
const dataFile = path.join(tempDir, 'state.json');
process.env.DATA_FILE = dataFile;
process.env.ADMIN_EMAIL = 'admin-v6@goy.test';
process.env.ADMIN_PASSWORD = 'AdminV6123';
process.env.TOKEN_SECRET = 'test-secret-v6-admin-client';
process.env.DATABASE_URL = '';

const serverV6 = require('./server-v6');

function startServer(handler) {
  return new Promise(resolve => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({server, base:`http://127.0.0.1:${address.port}`});
    });
  });
}

function call(base, pathname, {method='GET', body, token} = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, base);
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(url, {
      method,
      headers:{
        ...(payload ? {'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(payload)} : {}),
        ...(token ? {Authorization:`Bearer ${token}`} : {}),
      },
    }, res => {
      let raw='';
      res.on('data', chunk => raw+=chunk);
      res.on('end', () => {
        let json={};
        try{json=raw?JSON.parse(raw):{};}catch{}
        resolve({status:res.statusCode,body:json});
      });
    });
    req.on('error',reject);
    if(payload)req.write(payload);
    req.end();
  });
}

test('API v6 acepta la cuenta creada por administración y permite su ingreso', async t => {
  const {server,base}=await startServer(serverV6);
  t.after(()=>{
    server.close();
    fs.rmSync(tempDir,{recursive:true,force:true});
  });

  const admin=await call(base,'/api/admin/login',{
    method:'POST',
    body:{email:'admin-v6@goy.test',password:'AdminV6123'},
  });
  assert.equal(admin.status,200);

  const client={
    name:'Cliente Producción',
    businessName:'Comercial GOY',
    phone:'0995556677',
    email:'cliente-v6@goy.test',
    password:'Cliente456',
  };
  const created=await call(base,'/api/admin/clients',{
    method:'POST',token:admin.body.token,body:client,
  });
  assert.equal(created.status,201);
  assert.equal(created.body.user.approved,true);
  assert.equal(created.body.user.passwordHash,undefined);

  const login=await call(base,'/api/auth/login',{
    method:'POST',
    body:{role:'client',email:client.email,password:client.password},
  });
  assert.equal(login.status,200);
  assert.equal(login.body.pendingApproval,false);
  assert.equal(login.body.user.email,client.email);

  const stored=fs.readFileSync(dataFile,'utf8');
  assert.doesNotMatch(stored,/Cliente456/);
  assert.match(stored,/passwordHash/);
});
