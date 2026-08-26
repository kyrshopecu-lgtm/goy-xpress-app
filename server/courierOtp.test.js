const test = require('node:test');
const assert = require('node:assert/strict');
const {cleanPhone, validEcuadorMobile, validEmail, otpHash, signToken} = require('./courierOtp');

test('normaliza móviles ecuatorianos a formato WhatsApp', () => {
  assert.equal(cleanPhone('099 123 4567'), '593991234567');
  assert.equal(cleanPhone('+593 99 123 4567'), '593991234567');
  assert.equal(cleanPhone('991234567'), '593991234567');
  assert.equal(validEcuadorMobile('0991234567'), true);
  assert.equal(validEcuadorMobile('022345678'), false);
});

test('valida correo opcional para canal email', () => {
  assert.equal(validEmail('mensajero@example.com'), true);
  assert.equal(validEmail('correo-invalido'), false);
});

test('OTP queda hasheado y ligado al teléfono', () => {
  const a = otpHash('593991234567','123456','secret');
  const b = otpHash('593991234567','123456','secret');
  const c = otpHash('593991234568','123456','secret');
  assert.equal(a,b);
  assert.notEqual(a,c);
  assert.equal(a.includes('123456'), false);
});

test('token de sesión incluye firma', () => {
  const token = signToken({userId:'u1',role:'courier',exp:Date.now()+10000},'secret');
  assert.equal(token.split('.').length,2);
});
