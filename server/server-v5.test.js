const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const serverV5 = require('./server-v5');

function startServer(handler) {
  return new Promise(resolve => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({server, base:`http://127.0.0.1:${address.port}`});
    });
  });
}

function call(base, pathname, {method='GET', body, token, secret} = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, base);
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(url, {
      method,
      headers: {
        ...(payload ? {'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(payload)} : {}),
        ...(token ? {Authorization:`Bearer ${token}`} : {}),
        ...(secret ? {'X-Request-Secret':secret} : {}),
      },
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch {}
        resolve({status:res.statusCode, body:json});
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('cuentas Cliente/Mensajero, Google Maps y permisos por asignación', async t => {
  const store = serverV5.createMemoryStore();
  const mapsFetch = async () => ({
    ok: true,
    async json() {
      return {
        routes: [{
          distanceMeters: 5400,
          duration: '900s',
          polyline: {encodedPolyline:'abc123'},
        }],
      };
    },
  });
  const handler = serverV5.createHandler({
    store,
    mapsFetch,
    config: {
      tokenSecret:'test-secret-123',
      adminEmail:'admin@goy.test',
      adminPassword:'Admin1234',
      allowedOrigin:'*',
      googleMapsApiKey:'maps-test-key',
      databaseUrl:'',
    },
  });
  const {server, base} = await startServer(handler);
  t.after(() => server.close());

  const clientReg = await call(base, '/api/auth/client/register', {
    method:'POST',
    body:{
      name:'Nancy Cliente',
      businessName:'Tienda GOY',
      email:'cliente@goy.test',
      phone:'0991112233',
      password:'Cliente123',
      logo:'data:image/png;base64,QUJDRA==',
    },
  });
  assert.equal(clientReg.status, 201);
  assert.equal(clientReg.body.user.role, 'client');
  assert.ok(clientReg.body.token);

  const courierReg = await call(base, '/api/auth/courier/register', {
    method:'POST',
    body:{
      name:'Carlos Mensajero',
      email:'mensajero@goy.test',
      phone:'0992223344',
      password:'Mensajero123',
      photo:'data:image/jpeg;base64,QUJDRA==',
    },
  });
  assert.equal(courierReg.status, 201);
  assert.equal(courierReg.body.user.approved, false);

  const pendingJobs = await call(base, '/api/courier/jobs', {token:courierReg.body.token});
  assert.equal(pendingJobs.status, 403);
  assert.equal(pendingJobs.body.pendingApproval, true);

  const adminLogin = await call(base, '/api/admin/login', {
    method:'POST',
    body:{email:'admin@goy.test', password:'Admin1234'},
  });
  assert.equal(adminLogin.status, 200);

  const approve = await call(base, `/api/admin/couriers/${courierReg.body.user.id}/approve`, {
    method:'POST',
    token:adminLogin.body.token,
    body:{approved:true},
  });
  assert.equal(approve.status, 200);
  assert.equal(approve.body.user.approved, true);

  const route = await call(base, '/api/maps/route', {
    method:'POST',
    token:clientReg.body.token,
    body:{origin:'Jorge Juan y Mariana de Jesús, Quito', destination:'La Carolina, Quito', mode:'scheduled'},
  });
  assert.equal(route.status, 200);
  assert.equal(route.body.route.distanceKm, 5.4);
  assert.equal(route.body.route.provider, 'google_routes');
  assert.ok(route.body.route.mapUrl.includes('google.com/maps/dir'));

  const created = await call(base, '/api/client/requests', {
    method:'POST',
    token:clientReg.body.token,
    body:{
      code:'GOY-TEST-001',
      kind:'shipment',
      deliveryMode:'scheduled',
      originAddress:'Jorge Juan y Mariana de Jesús, Quito',
      recipient:'Prueba Destino',
      destinationAddress:'La Carolina, Quito',
      productValue:10,
      cashOnDelivery:true,
      deliveryPayer:'recipient',
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.request.distanceKm, 5.4);
  assert.equal(created.body.request.clientId, clientReg.body.user.id);
  assert.equal(created.body.request.courierId, null);

  const unauthorizedPickup = await call(base, '/api/requests/GOY-TEST-001/pickup', {
    method:'POST',
    token:clientReg.body.token,
    body:{photo:'data:image/jpeg;base64,QUJDRA=='},
  });
  assert.equal(unauthorizedPickup.status, 403);

  const assign = await call(base, '/api/admin/requests/GOY-TEST-001', {
    method:'PATCH',
    token:adminLogin.body.token,
    body:{courierId:courierReg.body.user.id, status:'Asignado'},
  });
  assert.equal(assign.status, 200);
  assert.equal(assign.body.request.courierId, courierReg.body.user.id);

  const jobs = await call(base, '/api/courier/jobs', {token:courierReg.body.token});
  assert.equal(jobs.status, 200);
  assert.equal(jobs.body.jobs.length, 1);

  const pickup = await call(base, '/api/requests/GOY-TEST-001/pickup', {
    method:'POST',
    token:courierReg.body.token,
    body:{photo:'data:image/jpeg;base64,QUJDRA=='},
  });
  assert.equal(pickup.status, 200);
  assert.equal(pickup.body.status, 'Recogido');

  const clientRequests = await call(base, '/api/client/requests', {token:clientReg.body.token});
  assert.equal(clientRequests.status, 200);
  assert.equal(clientRequests.body.requests[0].status, 'Recogido');

  const health = await call(base, '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.version, '5.0.0-accounts-maps');
  assert.equal(health.body.mapsConfigured, true);
});

test('no permite crear solicitudes sin registro ni reutilizar correos', async t => {
  const store = serverV5.createMemoryStore();
  const handler = serverV5.createHandler({
    store,
    config:{
      tokenSecret:'test-secret',
      allowedOrigin:'*',
      googleMapsApiKey:'maps',
      databaseUrl:'',
    },
    mapsFetch: async () => ({ok:true, json:async()=>({routes:[{distanceMeters:1000,duration:'300s'}]})}),
  });
  const {server, base} = await startServer(handler);
  t.after(() => server.close());

  const legacy = await call(base, '/api/requests', {
    method:'POST',
    body:{code:'OLD-1',kind:'shipment'},
  });
  assert.equal(legacy.status, 401);

  const first = await call(base, '/api/auth/client/register', {
    method:'POST',
    body:{name:'Cliente',email:'same@goy.test',phone:'0991111111',password:'Cliente123'},
  });
  assert.equal(first.status, 201);

  const duplicate = await call(base, '/api/auth/courier/register', {
    method:'POST',
    body:{name:'Mensajero',email:'same@goy.test',phone:'0992222222',password:'Mensajero123'},
  });
  assert.equal(duplicate.status, 409);
});
