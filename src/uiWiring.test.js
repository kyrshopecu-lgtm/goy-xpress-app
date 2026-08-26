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

test('Mensajero v1.3: OTP, foto, botones cableados y trabajos asignados', () => {
  const code = source('CourierAppV13.js');
  assertInteractiveElementsAreWired(code, 'Mensajero');
  assert.match(code, /requestCourierOtp/);
  assert.match(code, /verifyCourierOtp/);
  assert.match(code, /pickCourierPhoto/);
  assert.match(code, /getCourierJobs/);
  assert.match(code, /registerPickupEvidence/);
  assert.match(code, /registerDeliveryEvidence/);
  assert.match(code, /startLocationTracking/);
  assert.doesNotMatch(code, /Contraseña|registerCourier|login\('courier'|Clave de operación|X-Request-Secret|Código \+ clave/i);
});

test('OTP Mensajero está en servidor y API v5 mantiene Google Routes', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server', 'server-v5.js'), 'utf8');
  const otp = fs.readFileSync(path.join(__dirname, '..', 'server', 'courierOtp.js'), 'utf8');
  const admin = fs.readFileSync(path.join(__dirname, '..', 'admin-web', 'role-security.js'), 'utf8');
  assert.match(otp, /otpChallenges/);
  assert.match(otp, /sendWhatsApp/);
  assert.match(otp, /sendEmail/);
  assert.match(server, /routes\.googleapis\.com\/directions\/v2:computeRoutes/);
  assert.match(server, /courierId/);
  assert.match(admin, /\/admin\/couriers\//);
  assert.match(admin, /courierId/);
});
