const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function source(file) {
  return fs.readFileSync(path.join(__dirname, file), 'utf8');
}

function assertInteractiveElementsAreWired(code, label) {
  const buttons = code.match(/<Btn\b[\s\S]*?\/>/g) || [];
  assert.ok(buttons.length > 0, `${label}: se esperaban botones`);
  buttons.forEach((markup, index) => {
    assert.match(markup, /\bonPress\s*=/, `${label}: Btn #${index + 1} no tiene onPress`);
  });

  const pressables = code.match(/<Pressable\b[^>]*>/g) || [];
  assert.ok(pressables.length > 0, `${label}: se esperaban Pressable`);
  pressables.forEach((markup, index) => {
    assert.match(markup, /\bonPress\s*=/, `${label}: Pressable #${index + 1} no tiene onPress`);
  });
}

test('Cliente v1.2: botones cableados, cuenta previa, logo y Maps automático', () => {
  const code = source('ClientAppV12.js');
  assertInteractiveElementsAreWired(code, 'Cliente');
  assert.match(code, /registerClient/);
  assert.match(code, /login\('client'/);
  assert.match(code, /pickClientLogo/);
  assert.match(code, /estimateGoogleRoute/);
  assert.match(code, /createClientRequest/);
  assert.doesNotMatch(code, /label=["'](?:Distancia|Kilómetros|Km manual)/i);
});

test('Mensajero v1.2: botones cableados, cuenta previa, foto y trabajos asignados', () => {
  const code = source('CourierAppV12.js');
  assertInteractiveElementsAreWired(code, 'Mensajero');
  assert.match(code, /registerCourier/);
  assert.match(code, /login\('courier'/);
  assert.match(code, /pickCourierPhoto/);
  assert.match(code, /getCourierJobs/);
  assert.match(code, /registerPickupEvidence/);
  assert.match(code, /registerDeliveryEvidence/);
  assert.match(code, /startLocationTracking/);
  assert.doesNotMatch(code, /Clave de operación|X-Request-Secret|Código \+ clave/i);
});

test('Administración y API v5 usan cuentas aprobadas y Google Routes', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server', 'server-v5.js'), 'utf8');
  const admin = fs.readFileSync(path.join(__dirname, '..', 'admin-web', 'role-security.js'), 'utf8');
  assert.match(server, /\/auth\/client\/register/);
  assert.match(server, /\/auth\/courier\/register/);
  assert.match(server, /routes\.googleapis\.com\/directions\/v2:computeRoutes/);
  assert.match(server, /courierId/);
  assert.match(admin, /\/admin\/couriers\//);
  assert.match(admin, /courierId/);
});
