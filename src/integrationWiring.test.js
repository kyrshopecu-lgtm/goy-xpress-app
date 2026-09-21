const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('PBKDF2 Web Crypto mantiene compatibilidad con contraseñas existentes', async () => {
  const passwordModule = await import(pathToFileURL(path.join(root, 'cloudflare-password.mjs')).href);
  const password = 'ClaveSegura2026';
  const salt = '00112233445566778899aabbccddeeff';
  const iterations = 1000;
  const expected = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  const actual = await passwordModule.derivePasswordHashHex(password, salt, iterations);
  assert.equal(actual, expected);
  assert.equal(passwordModule.secureHexEqual(actual, expected), true);
  assert.equal(passwordModule.secureHexEqual(actual, `${expected.slice(0, -2)}00`), false);
});

test('las apps autentican sin bloquear el hilo nativo y admiten usuario o correo', () => {
  const api = read('src/goyApiV5.js');
  const client = read('src/ClientAppV13.js');
  const courier = read('src/CourierAppV16.js');
  assert.match(api, /request\('\/auth\/login'/);
  assert.match(api, /`\/auth\/\$\{role\}\/register`/);
  assert.doesNotMatch(api, /@noble\/hashes|pbkdf2|login-proof|register-proof/);
  assert.match(client, /Usuario o correo/);
  assert.match(courier, /Usuario o correo/);
});

test('Cloudflare atiende login, registro y clientes admin con Web Crypto', () => {
  const entry = read('cloudflare-entry-auth.js');
  const auth = read('cloudflare-auth-proof.js');
  assert.match(entry, /authPasswordLogin/);
  assert.match(entry, /authPasswordRegister/);
  assert.match(entry, /adminClientAccounts/);
  assert.match(auth, /derivePasswordHashHex/);
  assert.match(auth, /pendingApproval:true/);
  assert.match(auth, /username/);
});

test('catálogo funciona sin red y acciones del mensajero tienen tiempo límite', () => {
  const catalog = read('src/ClientServiceCatalog.js');
  const courier = read('src/CourierAppV17.js');
  const metro = read('metro.config.js');
  const assetPlugin = require('../scripts/prefix-numeric-assets');
  assert.equal((catalog.match(/require\('\.\.\/0\d_/g) || []).length, 8);
  assert.doesNotMatch(catalog, /workers\.dev\/assets/);
  assert.match(metro, /prefix-numeric-assets/);
  assert.equal(assetPlugin({name:'01_mensajeria_envios'}).name, 'goy_01_mensajeria_envios');
  assert.equal(assetPlugin({name:'goy-logo'}).name, 'goy-logo');
  assert.match(courier, /AbortController/);
  assert.match(courier, /timeoutMs=30000/);
});

test('panel conserva WhatsApp de invitación y muestra aprobación real del cliente', () => {
  const admin = read('public-web/admin/app.js');
  const cloudflare = read('cloudflare-entry.js');
  const registration = read('public-web/register.html');
  assert.match(admin, /JSON\.stringify\(\{label,whatsapp\}\)/);
  assert.match(registration, /inviteToken:token/);
  assert.match(registration, /\/api\/auth\/client\/register/);
  assert.match(cloudflare, /approved: Boolean\(user\.approved\)/);
  assert.match(cloudflare, /Pendiente de aprobación/);
});

test('workflows generan las versiones corregidas sin caché npm inválida', () => {
  const generic = read('.github/workflows/build-apk.yml');
  const admin = read('.github/workflows/admin-web-check.yml');
  const roles = read('.github/workflows/build-role-apks.yml');
  assert.doesNotMatch(generic, /cache:\s*npm/);
  assert.doesNotMatch(admin, /cache:\s*npm/);
  assert.match(roles, /CLIENTE-PARCHE-v1\.3\.4\.apk/);
  assert.match(roles, /MENSAJERO-PARCHE-v1\.4\.8\.apk/);
});
