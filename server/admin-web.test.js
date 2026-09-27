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


test('GOY SALES AI conecta análisis automático protegido y revisable', () => {
  const prospects = read('public-web/admin/prospects.js');
  const management = read('server/admin-management.js');
  assert.match(prospects, /Analizar con GOY SALES AI/);
  assert.match(prospects, /\/admin\/prospects\/.*\/analyze/);
  assert.match(prospects, /Revísalo y edítalo antes de aprobar el contacto/);
  assert.match(management, /prospectAnalyzeMatch/);
  assert.match(management, /OPENAI_API_KEY/);
  assert.match(management, /El análisis con IA no está configurado/);
  assert.match(management, /No autorizado/);
  assert.match(management, /response_format:\{type:'json_object'\}/);
  assert.match(management, /No inventes datos ni uses información sensible/);
  assert.match(management, /item\.analysisUpdatedAt/);
  new vm.Script(prospects, {filename:'public-web/admin/prospects.js'});
});


test('GOY SALES AI permite importar lotes deduplicados sin autorizar contacto', () => {
  const html = read('public-web/admin/index.html');
  const prospects = read('public-web/admin/prospects.js');
  const management = read('server/admin-management.js');
  assert.match(html, /importProspectsBtn/);
  assert.match(prospects, /Importar prospectos/);
  assert.match(prospects, /\/admin\/prospects\/import/);
  assert.match(prospects, /Analizar automáticamente los prospectos importados/);
  assert.match(prospects, /Analizar no aprueba ni envía contactos/);
  assert.match(management, /Máximo 500 prospectos por importación/);
  assert.match(management, /duplicates/);
  assert.match(management, /invalidItems/);
  assert.match(management, /status:'Pendiente de revisión'/);
  new vm.Script(prospects, {filename:'public-web/admin/prospects.js'});
});


test('GOY SALES AI descubre candidatos públicos antes de importarlos', () => {
  const html = read('public-web/admin/index.html');
  const prospects = read('public-web/admin/prospects.js');
  const management = read('server/admin-management.js');
  const worker = read('cloudflare-worker-v2.js');
  assert.match(html, /discoverProspectsBtn/);
  assert.match(prospects, /Buscar prospectos públicos/);
  assert.match(prospects, /\/admin\/prospects\/discover/);
  assert.match(prospects, /Importar seleccionados/);
  assert.match(prospects, /Todos quedaron pendientes de revisión/);
  assert.match(management, /Proveedor de descubrimiento de prospectos no configurado/);
  assert.match(management, /Math\.min\(177/);
  assert.match(management, /publicOnly:true/);
  assert.match(worker, /PROSPECT_DISCOVERY_URL/);
  assert.match(worker, /PROSPECT_DISCOVERY_TOKEN/);
  new vm.Script(prospects, {filename:'public-web/admin/prospects.js'});
});


test('GOY SALES AI protege el presupuesto de descubrimiento', () => {
  const management = read('server/admin-management.js');
  const prospects = read('public-web/admin/prospects.js');
  assert.match(management, /Math\.min\(177/);
  assert.match(management, /daily>=177/);
  assert.match(management, /monthly>=4800/);
  assert.match(management, /pausado los domingos/);
  assert.match(management, /prospectDiscoveryUsage/);
  assert.match(management, /America\/Guayaquil/);
  assert.match(prospects, /max="177"/);
});


test('GOY SALES AI usa Google Places sin exceder la cuota restante', () => {
  const management = read('server/admin-management.js');
  assert.match(management, /places\.googleapis\.com\/v1\/places:searchText/);
  assert.match(management, /GOOGLE_MAPS_API_KEY/);
  assert.match(management, /X-Goog-FieldMask/);
  assert.match(management, /requestBudget=Math\.min\(177-daily,4800-monthly\)/);
  assert.match(management, /requestsUsed<requestBudget/);
  assert.match(management, /requestsUsed:used/);
  assert.match(management, /source:'Google Places'/);
});


test('GOY SALES AI muestra el consumo real del descubrimiento', () => {
  const prospects = read('public-web/admin/prospects.js');
  assert.match(prospects, /Hoy: \$\{usage\.daily/);
  assert.match(prospects, /Mes: \$\{usage\.monthly/);
  assert.match(prospects, /Esta búsqueda: \$\{usage\.requestsUsed/);
  assert.match(prospects, /usage\.dailyLimit\?\?177/);
  assert.match(prospects, /usage\.monthlyLimit\?\?4800/);
  new vm.Script(prospects, {filename:'public-web/admin/prospects.js'});
});


test('GOY SALES AI diversifica Google Places y elimina duplicados', () => {
  const management = read('server/admin-management.js');
  assert.match(management, /defaultCategories=\['tecnología','accesorios','ropa','juguetes y coleccionables','emprendimientos','tiendas online','repuestos','servicios profesionales'\]/);
  assert.match(management, /for\(const query of queries\)/);
  assert.match(management, /seen=new Set\(\)/);
  assert.match(management, /seen\.has\(identity\)/);
  assert.match(management, /place\.id\|\|place\.websiteUri/);
  assert.match(management, /requestsUsed<requestBudget/);
});
