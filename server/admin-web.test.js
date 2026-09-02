const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('panel moderno tiene logo, botones de nueva orden y scripts válidos', () => {
  const html = read('admin-web/index.html');
  const modern = read('admin-web/modern-admin.js');
  const styles = read('admin-web/styles.css');
  const vercel = read('vercel.json');

  assert.match(html, /\/assets\/goy-logo\.jpg/);
  for (const id of ['newOrderNav','heroNewOrder','quickNewOrder','ordersNewOrder']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `Falta botón ${id}`);
  }
  for (const id of ['newOrderNav','heroNewOrder','quickNewOrder']) {
    assert.match(modern, new RegExp(`['"]${id}['"]`), `El botón ${id} no está cableado en modern-admin.js`);
  }
  assert.match(html, /modern-admin\.js/);
  assert.match(styles, /hero-logo-3d/);
  assert.match(styles, /@keyframes heroLogo/);
  assert.match(modern, /admin-create-request/);
  assert.match(modern, /clientId/);
  assert.match(modern, /courierId/);
  assert.match(vercel, /\/api\/admin-create-request/);
  new vm.Script(modern, {filename:'modern-admin.js'});
});

test('crear orden no permite kilometraje manual y mantiene cálculo de Maps en servidor', () => {
  const html = read('admin-web/index.html');
  const modern = read('admin-web/modern-admin.js');
  assert.doesNotMatch(html, /name=["']distanceKm["']/);
  assert.doesNotMatch(modern, /name=\\?["']distanceKm/);
  assert.match(modern, /La distancia, duración y tarifa se calcularán automáticamente con Google Maps/);
});

test('panel evita ciclos de mutación y limita esperas de red al ingresar', () => {
  const app = read('admin-web/app.js');
  const approvals = read('admin-web/account-approvals.js');

  assert.match(app, /new AbortController\(\)/);
  assert.match(app, /El servidor tardó demasiado en responder/);
  assert.match(app, /goy:admin-data/);
  assert.match(app, /Ingresando…/);
  assert.match(app, /data-client-field="status"/);

  assert.match(approvals, /REFRESH_MS=30000/);
  assert.match(approvals, /node\.innerHTML===html/);
  assert.match(approvals, /observer\.disconnect\(\)/);
  assert.match(approvals, /decorating=true/);
  assert.match(approvals, /requestAnimationFrame/);
  assert.match(approvals, /data-client-field="status"/);
  assert.match(approvals, /goy:admin-data/);

  new vm.Script(app, {filename:'app.js'});
  new vm.Script(approvals, {filename:'account-approvals.js'});
});

test('panel permite crear y compartir una cuenta activa de cliente', () => {
  const html = read('admin-web/index.html');
  const accounts = read('admin-web/client-accounts.js');
  const styles = read('admin-web/client-accounts.css');
  const server = read('server/server-v5.js');

  assert.match(html, /id="createClientButton"/);
  assert.match(html, /id="quickCreateClient"/);
  assert.match(html, /client-accounts\.js/);
  assert.match(html, /client-accounts\.css/);
  assert.match(accounts, /\/admin\/clients/);
  assert.match(accounts, /generatePassword/);
  assert.match(accounts, /navigator\.clipboard/);
  assert.match(accounts, /https:\/\/wa\.me\//);
  assert.match(accounts, /goy:reload-admin-data/);
  assert.match(accounts, /Usuario \(correo electrónico\)/);
  assert.match(styles, /credentials-card/);
  assert.match(server, /pathname==='\/admin\/clients'/);
  assert.match(server, /registrationSource='admin'/);
  new vm.Script(accounts, {filename:'client-accounts.js'});
});
