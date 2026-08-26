const test = require('node:test');
const assert = require('node:assert/strict');

const {
  adminEmailForUsername,
  buildInviteLink,
  extractInviteToken,
  normalizeEcuadorPhone,
  validateRegistration,
} = require('./authDomain');

test('normaliza teléfonos ecuatorianos al formato internacional', () => {
  assert.equal(normalizeEcuadorPhone('099 772 9964'), '+593997729964');
  assert.equal(normalizeEcuadorPhone('+593 99 772 9964'), '+593997729964');
  assert.equal(normalizeEcuadorPhone('997729964'), '+593997729964');
  assert.equal(normalizeEcuadorPhone('123'), '');
});

test('crea el identificador privado de inicio del administrador', () => {
  assert.equal(
    adminEmailForUsername(' GOY.Admin '),
    'goy.admin@admin.goyxpress.app',
  );
});

test('crea y vuelve a leer un enlace de invitación', () => {
  const token = 'a'.repeat(64);
  const link = buildInviteLink(token);
  assert.equal(link, `goyxpress://register?invite=${token}`);
  assert.equal(extractInviteToken(link), token);
});

test('valida los datos obligatorios del registro', () => {
  const result = validateRegistration({
    fullName: 'María Jiménez',
    address: 'Quito, Mariana de Jesús y Jorge Juan',
    whatsapp: '0997729964',
    contactPhone: '0997729964',
    documentType: 'cedula',
    documentNumber: '1712345678',
    email: 'cliente@example.com',
  });

  assert.equal(result.valid, true);
  assert.equal(result.value.whatsapp, '+593997729964');
});

test('rechaza registros incompletos', () => {
  const result = validateRegistration({documentType: 'ruc'});
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 6);
});
