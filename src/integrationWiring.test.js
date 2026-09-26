const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('PBKDF2 Web Crypto mantiene compatibilidad dentro del límite de Cloudflare', async () => {
  const passwordModule = await import(pathToFileURL(path.join(root, 'cloudflare-password.mjs')).href);
  const password = 'ClaveSegura2026';
  const salt = '00112233445566778899aabbccddeeff';
  const iterations = 1000;
  const expected = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  const actual = await passwordModule.derivePasswordHashHex(password, salt, iterations);
  assert.equal(actual, expected);
  assert.equal(passwordModule.DEFAULT_PASSWORD_ITERATIONS, 100000);
  assert.equal(passwordModule.secureHexEqual(actual, expected), true);
  assert.equal(passwordModule.secureHexEqual(actual, `${expected.slice(0, -2)}00`), false);
  await assert.rejects(
    () => passwordModule.derivePasswordHashHex(password, salt, 100001),
    /no es válida para Cloudflare/,
  );
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
  assert.match(courier, /CourierAppV18/);
});

test('Cloudflare migra cuentas legacy sin ejecutar PBKDF2 de 180000 dentro del Worker', () => {
  const entry = read('cloudflare-entry-auth.js');
  const auth = read('cloudflare-auth-proof.js');
  const login = read('cloudflare-login-v2.js');
  const password = read('cloudflare-password.mjs');

  assert.match(entry, /authPasswordLoginV2/);
  assert.match(entry, /authChallengeV2/);
  assert.match(entry, /authPasswordRegister/);
  assert.match(entry, /adminClientAccounts/);
  assert.doesNotMatch(entry, /authPasswordLogin\b/);
  assert.doesNotMatch(entry, /authChallenge\b/);

  assert.match(login, /LEGACY_PASSWORD_ITERATIONS\s*=\s*180000/);
  assert.match(login, /WORKER_PASSWORD_ITERATIONS\s*=\s*100000/);
  assert.match(login, /legacyauth\.compute\.c-12\.us-east-1\.aws\.neon\.tech/);
  assert.match(login, /x-goy-signature/);
  assert.match(login, /verifyLegacyPassword/);
  assert.match(login, /user\.passwordIterations=WORKER_PASSWORD_ITERATIONS/);
  assert.match(login, /derivePasswordHashHex\(password,newSalt,WORKER_PASSWORD_ITERATIONS\)/);
  assert.match(password, /DEFAULT_PASSWORD_ITERATIONS\s*=\s*100000/);
  assert.doesNotMatch(login, /derivePasswordHashHex\([\s\S]{0,120}LEGACY_PASSWORD_ITERATIONS/);

  assert.match(auth, /derivePasswordHashHex/);
  assert.match(auth, /pendingApproval:true/);
  assert.match(auth, /username/);
});

test('catálogo funciona sin red y acciones del mensajero tienen tiempo límite', () => {
  const catalog = read('src/ClientServiceCatalog.js');
  const courier = read('src/CourierAppV18.js');
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

test('Cliente 1.3.9 agrega sonido, vibración y mantiene interfaz profesional', () => {
  const client = read('src/ClientAppV12.js');
  const api = read('src/goyApiV5.js');
  const config = JSON.parse(read('app.client.json')).expo;
  assert.equal(config.version, '1.3.9');
  assert.equal(config.android.versionCode, 13);
  assert.match(client, /recipientPhone/);
  assert.match(client, /destinationMapUrl/);
  assert.match(client, /Teléfono \/ WhatsApp de quien recibe/);
  assert.doesNotMatch(client, /Elegir punto en Google Maps/);
  assert.match(client, /Dirección escrita de entrega/);
  assert.match(client, /Fotos \(/);
  assert.match(client, /OrderEvidenceModal/);
  assert.match(client, /Descargar imagen/);
  assert.match(client, /saveToLibraryAsync/);
  assert.match(client, /notifyRecipientOrder/);
  assert.match(client, /💬 WhatsApp/);
  assert.match(client, /Tu orden/);
  assert.match(client, /SectionBlock/);
  assert.match(client, /OrderProgress/);
  assert.match(client, /Tu actividad/);
  assert.match(client, /Generar orden de entrega/);
  assert.match(client, /playGoyEventSound/);
  assert.match(client, /Entrega finalizada/);
  assert.match(api, /WhatsApp destinatario/);
  assert.match(api, /Ubicación Maps/);
});

test('Mensajero 1.5.0 alerta asignación y entrega finalizada con sonido y vibración', () => {
  const courier = read('src/CourierAppV18.js');
  const config = JSON.parse(read('app.courier.json')).expo;
  assert.equal(config.version, '1.5.0');
  assert.equal(config.android.versionCode, 15);
  assert.equal(config.android.package, 'com.goyxpress.mensajero');
  assert.match(courier, /PUNTO DE RETIRO/);
  assert.match(courier, /Abrir retiro en Maps/);
  assert.match(courier, /Abrir entrega en Maps/);
  assert.match(courier, /Lugar del trámite/);
  assert.match(courier, /destinationMapUrl/);
  assert.doesNotMatch(courier, /destinationAddress\|\|'Quito'/);
  assert.match(courier, /height:310/);
  assert.match(courier, /<Modal/);
  assert.match(courier, /resizeMode="contain"/);
  assert.match(courier, /allowsEditing:false/);
  assert.doesNotMatch(courier, /Abrir administración/);
  assert.doesNotMatch(courier, /const ADMIN=/);
  assert.match(courier, /SEEN_ASSIGNMENTS/);
  assert.match(courier, /playGoyEventSound/);
});

test('sonido oficial GOY XPRESS está conectado a apps y panel administrativo', () => {
  const sound = read('src/goyBrandSound.js');
  const admin = read('public-web/admin/goy-sound.js');
  const entry = read('cloudflare-entry.js');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(fs.existsSync(path.join(root, 'assets', 'goy-xpress-event.mp3')), true);
  assert.equal(fs.existsSync(path.join(root, 'public-web', 'assets', 'goy-xpress-event.mp3')), true);
  assert.equal(pkg.dependencies['expo-av'], '~15.1.7');
  assert.match(sound, /Vibration\.vibrate/);
  assert.match(sound, /goy-xpress-event\.mp3/);
  assert.match(admin, /\/api\/admin\/event-state/);
  assert.match(admin, /adminCreated/);
  assert.match(admin, /Entrega finalizada/);
  assert.match(entry, /adminEventState/);
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
  const cloudflare = read('.github/workflows/cloudflare-check.yml');
  const ndkInstaller = read('scripts/install-android-ndk.sh');
  assert.doesNotMatch(generic, /cache:\s*npm/);
  assert.doesNotMatch(admin, /cache:\s*npm/);
  assert.match(roles, /CLIENTE-PARCHE-v1\.3\.9\.apk/);
  assert.match(roles, /MENSAJERO-PARCHE-v1\.5\.0\.apk/);
  assert.match(roles, /MENSAJERO-v1\.5\.0-ARM64\.apk/);
  assert.match(generic, /install-android-ndk\.sh 27\.1\.12297006/);
  assert.match(roles, /install-android-ndk\.sh 27\.1\.12297006/);
  assert.match(ndkInstaller, /for attempt in 1 2 3 4/);
  assert.match(ndkInstaller, /source\.properties/);
  assert.match(cloudflare, /cloudflare-login-v2\.js/);
  assert.match(cloudflare, /cloudflare-password\.mjs/);
});
