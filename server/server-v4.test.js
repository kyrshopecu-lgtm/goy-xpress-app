const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

const dataFile = path.join(os.tmpdir(), `goy-v4-${process.pid}-${Date.now()}.json`);
process.env.DATA_FILE = dataFile;
process.env.DATABASE_URL = '';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'Clave-Segura-Prueba-123';
process.env.TOKEN_SECRET = 'token-secret-test-abcdefghijklmnopqrstuvwxyz-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const handler = require('./server-v4');

let server;
let base;
async function call(route, options={}) {
  const response = await fetch(`${base}${route}`, options);
  const body = await response.json().catch(() => ({}));
  return {response, body};
}

test.before(async () => {
  server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  try { fs.unlinkSync(dataFile); } catch {}
});

test('cliente y mensajero tienen permisos separados y la asignación rota acceso', async () => {
  const code = `GX-SEC-${Date.now()}`;
  const created = await call('/requests', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({code,kind:'shipment',customer:'Cliente Prueba',serviceCost:3,totalToCollect:0,createdAt:new Date().toISOString()})
  });
  assert.equal(created.response.status, 201);
  assert.ok(created.body.clientAccess);
  const clientAccess = created.body.clientAccess;

  const clientStatus = await call(`/request-status?code=${encodeURIComponent(code)}`, {headers:{'X-Request-Secret':clientAccess}});
  assert.equal(clientStatus.response.status, 200);
  assert.equal(clientStatus.body.accessRole, 'client');

  const forbiddenPickup = await call(`/requests/${encodeURIComponent(code)}/pickup`, {
    method:'POST',headers:{'Content-Type':'application/json','X-Request-Secret':clientAccess},body:JSON.stringify({photo:'data:image/jpeg;base64,CLIENTE'})
  });
  assert.equal(forbiddenPickup.response.status, 403);

  const login = await call('/admin/login', {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@test.local',password:'Clave-Segura-Prueba-123'})
  });
  assert.equal(login.response.status, 200);
  assert.ok(login.body.token);

  const assigned = await call(`/admin/requests/${encodeURIComponent(code)}`, {
    method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${login.body.token}`},
    body:JSON.stringify({status:'Asignado',courier:'Mensajero Prueba',issueCourierAccess:true})
  });
  assert.equal(assigned.response.status, 200);
  assert.ok(assigned.body.courierAccess);
  assert.notEqual(assigned.body.courierAccess, clientAccess);
  const courierAccess = assigned.body.courierAccess;

  const courierStatus = await call(`/request-status?code=${encodeURIComponent(code)}`, {headers:{'X-Request-Secret':courierAccess}});
  assert.equal(courierStatus.response.status, 200);
  assert.equal(courierStatus.body.accessRole, 'courier');

  const pickup = await call(`/requests/${encodeURIComponent(code)}/pickup`, {
    method:'POST',headers:{'Content-Type':'application/json','X-Request-Secret':courierAccess},body:JSON.stringify({photo:'data:image/jpeg;base64,MENSAJERO'})
  });
  assert.equal(pickup.response.status, 200);
  assert.equal(pickup.body.status, 'Recogido');

  const courierCannotQuote = await call(`/requests/${encodeURIComponent(code)}/quote-response`, {
    method:'POST',headers:{'Content-Type':'application/json','X-Request-Secret':courierAccess},body:JSON.stringify({response:'accepted'})
  });
  assert.equal(courierCannotQuote.response.status, 403);

  const reassigned = await call(`/admin/requests/${encodeURIComponent(code)}`, {
    method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${login.body.token}`},
    body:JSON.stringify({status:'Asignado',courier:'Mensajero Nuevo',issueCourierAccess:true})
  });
  assert.equal(reassigned.response.status, 200);
  const newCourierAccess = reassigned.body.courierAccess;
  assert.ok(newCourierAccess);
  assert.notEqual(newCourierAccess, courierAccess);

  const oldAccess = await call(`/request-status?code=${encodeURIComponent(code)}`, {headers:{'X-Request-Secret':courierAccess}});
  assert.equal(oldAccess.response.status, 401);
  const newAccess = await call(`/request-status?code=${encodeURIComponent(code)}`, {headers:{'X-Request-Secret':newCourierAccess}});
  assert.equal(newAccess.response.status, 200);
  assert.equal(newAccess.body.accessRole, 'courier');
});
