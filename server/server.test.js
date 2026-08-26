const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const dataFile = path.join(os.tmpdir(), `goy-xpress-api-test-${process.pid}.json`);
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'clave-segura-test';
process.env.TOKEN_SECRET = 'token-secret-test-32-caracteres-minimo';
process.env.DATA_FILE = dataFile;
process.env.DATABASE_URL = '';

const handler = require('./server');

async function call(method, url, {body, headers = {}} = {}) {
  const req = {
    method,
    url,
    headers: {host: 'localhost', ...headers},
    ...(body !== undefined ? {body} : {}),
  };
  let status = 0;
  let responseHeaders = {};
  let raw = '';
  const res = {
    writeHead(code, nextHeaders) {
      status = code;
      responseHeaders = nextHeaders || {};
    },
    end(value = '') {
      raw += value;
    },
  };
  await handler(req, res);
  return {
    status,
    headers: responseHeaders,
    body: raw ? JSON.parse(raw) : {},
  };
}

function requestHeaders(secret) {
  return {'x-request-secret': secret};
}

async function adminToken() {
  const login = await call('POST', '/api/admin/login', {
    body: {email: 'admin@test.local', password: 'clave-segura-test'},
  });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);
  return login.body.token;
}

test('API v3.3 recorre flujo logístico completo con permisos y evidencias', async () => {
  try { fs.unlinkSync(dataFile); } catch {}

  const health = await call('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.version, '3.3.0');

  const invalidCash = await call('POST', '/api/requests', {
    body: {
      code: 'DEP-CASH-1001',
      kind: 'deposit',
      depositMethod: 'cash',
      cashAmount: 1000.01,
      serviceCost: 3.5,
    },
  });
  assert.equal(invalidCash.status, 400);

  const deposit = await call('POST', '/api/requests', {
    body: {
      code: 'DEP-CHECK-0001',
      kind: 'deposit',
      depositMethod: 'checks',
      checkCount: 4,
      serviceCost: 0,
      customer: 'Cliente prueba',
    },
  });
  assert.equal(deposit.status, 201);
  assert.equal(deposit.body.request.serviceCost, 4);
  assert.ok(deposit.body.accessSecret);

  const shipment = await call('POST', '/api/requests', {
    body: {
      code: 'GOY-TEST-0001',
      kind: 'shipment',
      customer: 'Cliente prueba',
      baseServiceCost: 3,
      serviceCost: 3,
      totalToCollect: 25,
    },
  });
  assert.equal(shipment.status, 201);
  const secret = shipment.body.accessSecret;
  assert.ok(secret);
  assert.equal(shipment.body.request.accessSecretHash, undefined);

  const unauthorizedPickup = await call('POST', '/api/requests/GOY-TEST-0001/pickup', {
    headers: requestHeaders('secreto-incorrecto'),
    body: {photo: 'data:image/jpeg;base64,AAAA'},
  });
  assert.equal(unauthorizedPickup.status, 401);

  const pickup = await call('POST', '/api/requests/GOY-TEST-0001/pickup', {
    headers: requestHeaders(secret),
    body: {photo: 'data:image/jpeg;base64,AAAA'},
  });
  assert.equal(pickup.status, 200);
  assert.equal(pickup.body.status, 'Recogido');
  assert.equal(pickup.body.courierStage, 'Recogido');

  const location = await call('POST', '/api/requests/GOY-TEST-0001/location', {
    headers: requestHeaders(secret),
    body: {latitude: -0.1807, longitude: -78.4678, accuracy: 8},
  });
  assert.equal(location.status, 200);
  assert.equal(location.body.status, 'En camino');
  assert.equal(location.body.gps.last.latitude, -0.1807);

  const wait10 = await call('POST', '/api/requests/GOY-TEST-0001/wait', {
    headers: requestHeaders(secret),
    body: {elapsedMinutes: 10},
  });
  assert.equal(wait10.status, 200);
  assert.equal(wait10.body.wait.extraCost, 0);
  assert.equal(wait10.body.serviceCost, 3);

  const wait11 = await call('POST', '/api/requests/GOY-TEST-0001/wait', {
    headers: requestHeaders(secret),
    body: {elapsedMinutes: 11},
  });
  assert.equal(wait11.status, 200);
  assert.equal(wait11.body.wait.extraCost, 0.1);
  assert.equal(wait11.body.serviceCost, 3.1);

  const continueWait = await call('POST', '/api/requests/GOY-TEST-0001/wait-decision', {
    headers: requestHeaders(secret),
    body: {decision: 'continue'},
  });
  assert.equal(continueWait.status, 200);
  assert.equal(continueWait.body.wait.decision, 'continue');

  const delivery = await call('POST', '/api/requests/GOY-TEST-0001/delivery', {
    headers: requestHeaders(secret),
    body: {photo: 'data:image/jpeg;base64,BBBB'},
  });
  assert.equal(delivery.status, 200);
  assert.equal(delivery.body.status, 'Entrega finalizada');
  assert.equal(delivery.body.courierStage, 'Entrega finalizada');

  const depositEvidence = await call('POST', '/api/requests/GOY-TEST-0001/deposit-evidence', {
    headers: requestHeaders(secret),
    body: {photo: 'data:image/jpeg;base64,CCCC', amount: 25},
  });
  assert.equal(depositEvidence.status, 200);
  assert.ok(depositEvidence.body.evidence.depositPhoto);

  const token = await adminToken();
  const release = await call('POST', '/api/admin/requests/GOY-TEST-0001/release-wallet', {
    headers: {authorization: `Bearer ${token}`},
  });
  assert.equal(release.status, 200);
  assert.equal(release.body.wallet.released, true);

  const diverse = await call('POST', '/api/requests', {
    body: {
      code: 'DIV-TEST-0001',
      kind: 'diverse',
      customer: 'Cliente prueba',
      details: 'Gestión personalizada de prueba',
      serviceCost: 0,
    },
  });
  assert.equal(diverse.status, 201);
  const diverseSecret = diverse.body.accessSecret;

  const quote = await call('PATCH', '/api/admin/requests/DIV-TEST-0001', {
    headers: {authorization: `Bearer ${token}`},
    body: {
      status: 'Cotizado',
      serviceCost: 12.75,
      reason: 'Cotización personalizada',
      quote: {status: 'Cotizado', amount: 12.75, note: 'Incluye gestión completa'},
    },
  });
  assert.equal(quote.status, 200);
  assert.equal(quote.body.serviceCost, 12.75);
  assert.equal(quote.body.quote.status, 'Cotizado');

  const accepted = await call('POST', '/api/requests/DIV-TEST-0001/quote-response', {
    headers: requestHeaders(diverseSecret),
    body: {response: 'accepted'},
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.status, 'Aceptado');
  assert.equal(accepted.body.quote.status, 'Aceptado');

  const adminData = await call('GET', '/api/admin/data', {
    headers: {authorization: `Bearer ${token}`},
  });
  assert.equal(adminData.status, 200);
  assert.ok(Array.isArray(adminData.body.requests));
  assert.ok(adminData.body.requests.some(item => item.code === 'GOY-TEST-0001'));

  try { fs.unlinkSync(dataFile); } catch {}
});
