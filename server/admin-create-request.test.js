const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const serverV5 = require('./server-v5');
const adminOrder = require('../api/admin-create-request');

function startServer(handler) {
  return new Promise(resolve => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({server, base:`http://127.0.0.1:${server.address().port}`}));
  });
}

function call(base, pathname, {method='GET', body, token} = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(new URL(pathname, base), {
      method,
      headers:{
        ...(payload ? {'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)} : {}),
        ...(token ? {Authorization:`Bearer ${token}`} : {}),
      },
    }, res => {
      let raw='';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let parsed={};
        try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
        resolve({status:res.statusCode, body:parsed});
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('administrador crea una orden para un cliente y la delega a un mensajero aprobado', async t => {
  const store = serverV5.createMemoryStore();
  const config = {
    tokenSecret:'admin-order-test-secret',
    adminEmail:'admin@goy.test',
    adminPassword:'Admin1234',
    allowedOrigin:'*',
    googleMapsApiKey:'maps-test-key',
    databaseUrl:'',
  };
  const mapsFetch = async () => ({
    ok:true,
    async json(){return {routes:[{distanceMeters:3200,duration:'720s',polyline:{encodedPolyline:'xyz'}}]};},
  });
  const backend = serverV5.createHandler({store, config, mapsFetch});
  const proxy = adminOrder.createHandler({backend, tokenSecret:config.tokenSecret});
  const backendServer = await startServer(backend);
  const proxyServer = await startServer(proxy);
  t.after(() => backendServer.server.close());
  t.after(() => proxyServer.server.close());

  const client = await call(backendServer.base, '/api/auth/client/register', {
    method:'POST',
    body:{name:'Nancy Cliente',businessName:'Tienda Quito',email:'cliente-admin@goy.test',phone:'0991112233',password:'Cliente123'},
  });
  assert.equal(client.status, 201);

  const courier = await call(backendServer.base, '/api/auth/courier/register', {
    method:'POST',
    body:{name:'Carlos Mensajero',email:'mensajero-admin@goy.test',phone:'0992223344',password:'Mensajero123'},
  });
  assert.equal(courier.status, 201);

  const login = await call(backendServer.base, '/api/admin/login', {
    method:'POST',
    body:{email:'admin@goy.test',password:'Admin1234'},
  });
  assert.equal(login.status, 200);

  const approve = await call(backendServer.base, `/api/admin/couriers/${courier.body.user.id}/approve`, {
    method:'POST', token:login.body.token, body:{approved:true},
  });
  assert.equal(approve.status, 200);

  const unauthorized = await call(proxyServer.base, '/api/admin-create-request', {
    method:'POST',
    body:{clientId:client.body.user.id,kind:'shipment'},
  });
  assert.equal(unauthorized.status, 401);

  const created = await call(proxyServer.base, '/api/admin-create-request', {
    method:'POST',
    token:login.body.token,
    body:{
      clientId:client.body.user.id,
      courierId:courier.body.user.id,
      kind:'shipment',
      deliveryMode:'scheduled',
      originAddress:'Jorge Juan y Mariana de Jesús, Quito',
      destinationAddress:'La Carolina, Quito',
      recipient:'Destino de prueba',
      adminNotes:'Orden generada desde administración',
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.assigned, true);
  assert.equal(created.body.request.clientId, client.body.user.id);
  assert.equal(created.body.request.courierId, courier.body.user.id);
  assert.equal(created.body.request.status, 'Asignado');
  assert.equal(created.body.request.distanceKm, 3.2);
  assert.equal(created.body.request.adminCreated, true);
  assert.equal(created.body.request.createdBy, 'admin');

  const adminData = await call(backendServer.base, '/api/admin/data', {token:login.body.token});
  assert.equal(adminData.status, 200);
  const stored = adminData.body.requests.find(item => item.code === created.body.request.code);
  assert.ok(stored);
  assert.equal(stored.customer, 'Tienda Quito');
  assert.equal(stored.courier, 'Carlos Mensajero');

  const jobs = await call(backendServer.base, '/api/courier/jobs', {token:courier.body.token});
  assert.equal(jobs.status, 200);
  assert.equal(jobs.body.jobs.some(item => item.code === created.body.request.code), true);
});

test('servicio diverso administrativo no puede delegarse antes de cotización', async t => {
  const store = serverV5.createMemoryStore();
  const config = {tokenSecret:'secret',adminEmail:'admin@goy.test',adminPassword:'Admin1234',allowedOrigin:'*',googleMapsApiKey:'maps',databaseUrl:''};
  const backend = serverV5.createHandler({store, config});
  const proxy = adminOrder.createHandler({backend, tokenSecret:config.tokenSecret});
  const backendServer = await startServer(backend);
  const proxyServer = await startServer(proxy);
  t.after(() => backendServer.server.close());
  t.after(() => proxyServer.server.close());

  const client = await call(backendServer.base, '/api/auth/client/register', {method:'POST',body:{name:'Cliente',email:'c@goy.test',phone:'0991111111',password:'Cliente123'}});
  const courier = await call(backendServer.base, '/api/auth/courier/register', {method:'POST',body:{name:'Mensajero',email:'m@goy.test',phone:'0992222222',password:'Mensajero123'}});
  const login = await call(backendServer.base, '/api/admin/login', {method:'POST',body:{email:'admin@goy.test',password:'Admin1234'}});
  await call(backendServer.base, `/api/admin/couriers/${courier.body.user.id}/approve`, {method:'POST',token:login.body.token,body:{approved:true}});

  const result = await call(proxyServer.base, '/api/admin-create-request', {
    method:'POST',token:login.body.token,
    body:{clientId:client.body.user.id,courierId:courier.body.user.id,kind:'diverse',diverseDetail:'Gestión especial'},
  });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /cotizarse/i);
});
