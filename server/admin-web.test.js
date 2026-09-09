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

test('administración carga y valida el visor de evidencias fotográficas', () => {
  const config = read('admin-web/config.js');
  const evidence = read('admin-web/order-evidence.js');
  assert.match(config, /order-evidence\.js/);
  assert.match(config, /data-order-evidence/);
  assert.match(evidence, /pickupPhoto/);
  assert.match(evidence, /deliveryPhoto/);
  assert.match(evidence, /depositPhoto/);
  assert.match(evidence, /\/admin\/data/);
  new vm.Script(evidence, {filename:'order-evidence.js'});
});