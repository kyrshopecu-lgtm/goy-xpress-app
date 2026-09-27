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
  assert.match(evidence, /\/admin\/requests\/.*\/evidence/);
  new vm.Script(evidence, {filename:'order-evidence.js'});
});

test('panel publicado conserva creación segura de clientes', () => {
  const sourceConfig = read('admin-web/config.js');
  const publicConfig = read('public-web/admin/config.js');
  const secureCreate = read('public-web/admin/client-create-fix.js');
  const clientAccounts = read('public-web/admin/client-accounts.js');

  for (const config of [sourceConfig, publicConfig]) {
    assert.match(config, /client-accounts\.js/);
    assert.match(config, /client-create-fix\.js/);
  }
  assert.match(clientAccounts, /id=['"]createClientForm['"]/);
  assert.match(secureCreate, /PBKDF2/);
  assert.match(secureCreate, /passwordHash/);
  assert.match(secureCreate, /passwordSalt/);
  assert.match(secureCreate, /passwordIterations/);
  assert.match(secureCreate, /\/admin\/clients/);
  new vm.Script(secureCreate, {filename:'public-web/admin/client-create-fix.js'});
});


test('panel publicado permite servicio personalizado vinculado al cliente sin actualizar APK', () => {
  const modern = read('public-web/admin/modern-admin.js');
  assert.match(modern, /<option value="custom">Servicio personalizado<\/option>/);
  assert.match(modern, /customService:true/);
  assert.match(modern, /customServiceLabel/);
  assert.match(modern, /customServiceCost/);
  assert.match(modern, /clientId:String\(fd\.get\('clientId'\)/);
  assert.match(modern, /\/admin-create-request/);
  new vm.Script(modern, {filename:'public-web/admin/modern-admin.js'});
});


test('panel publicado incluye GOY SALES AI con revisión humana y selección múltiple', () => {
  const html = read('public-web/admin/index.html');
  const prospects = read('public-web/admin/prospects.js');
  const management = read('server/admin-management.js');
  assert.match(html, /data-view="prospects"/);
  assert.match(html, /GOY SALES AI/);
  assert.match(html, /approveSelectedProspects/);
  assert.match(html, /prospects\.js/);
  assert.match(prospects, /Aprobar para contacto/);
  assert.match(prospects, /Ningún mensaje fue enviado/);
  assert.match(prospects, /doNotContact/);
  assert.match(management, /Pendiente de revisión/);
  assert.match(management, /Aprobado para contacto/);
  assert.match(management, /no contactar/);
  new vm.Script(prospects, {filename:'public-web/admin/prospects.js'});
});


test('GOY SALES AI conserva análisis de necesidades y crecimiento comercial', () => {
  const prospects = read('public-web/admin/prospects.js');
  const management = read('server/admin-management.js');
  for (const field of ['observedNeeds','growthOpportunities','suggestedServices','campaignIdeas']) {
    assert.match(prospects, new RegExp(field));
    assert.match(management, new RegExp(field));
  }
  assert.match(prospects, /Señales \/ necesidades observadas/);
  assert.match(prospects, /Oportunidades de crecimiento/);
  assert.match(prospects, /Nuevos servicios sugeridos/);
  assert.match(prospects, /Ideas de campañas/);
  new vm.Script(prospects, {filename:'public-web/admin/prospects.js'});
});
