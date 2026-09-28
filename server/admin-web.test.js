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


test('GOY SALES AI calcula afinidad preliminar sin inventar necesidades', () => {
  const management = read('server/admin-management.js');
  assert.match(management, /function preliminaryFitScore/);
  assert.match(management, /tecnolog\|accesor\|ropa\|juguete\|coleccion\|tienda\|emprend\|repuesto/);
  assert.match(management, /website\)score\+=10/);
  assert.match(management, /preliminaryFitScore\(\{category:query/);
  assert.doesNotMatch(management, /preliminaryFitScore[\s\S]{0,500}needs/i);
});


test('GOY SALES AI ordena y filtra prospectos por prioridad', () => {
  const html=read('public-web/admin/index.html'),js=read('public-web/admin/prospects.js');
  assert.match(html, /id="prospectPriorityFilter"/);
  assert.match(html, /Alta prioridad \(70\+\)/);
  assert.match(html, /id="prospectCityFilter"/);
  assert.match(html, /id="prospectCategoryFilter"/);
  assert.match(js, /Number\(p\.score\|\|0\)>=70/);
  assert.match(js, /sort\(\(a,b\)=>Number\(b\.score\|\|0\)-Number\(a\.score\|\|0\)\)/);
  new vm.Script(js,{filename:'public-web/admin/prospects.js'});
});


test('GOY SALES AI analiza seleccionados en lote sin aprobarlos', () => {
  const html=read('public-web/admin/index.html'),js=read('public-web/admin/prospects.js');
  assert.match(html, /id="selectTopProspects"/);
  assert.match(html, /Seleccionar top 20/);
  assert.match(html, /id="analyzeSelectedProspects"/);
  assert.match(js, /slice\(0,20\)/);
  assert.match(js, /\/analyze\x60,\{method:'POST'/);
  assert.match(js, /Ningún prospecto fue aprobado ni contactado/);
  new vm.Script(js,{filename:'public-web/admin/prospects.js'});
});


test('GOY SALES AI muestra bandeja supervisada de listos para contactar', () => {
  const html=read('public-web/admin/index.html'),js=read('public-web/admin/prospects.js');
  assert.match(html, /id="readyContactBox"/);
  assert.match(html, /Listos para contactar/);
  assert.match(js, /p\.status==='Aprobado para contacto'/);
  assert.match(js, /!p\.doNotContact/);
  assert.match(js, /p\.approvedMessage/);
  assert.match(js, /Sin contacto público registrado/);
  assert.doesNotMatch(js, /readyContact[\s\S]{0,800}method:'POST'[\s\S]{0,100}send/i);
  new vm.Script(js,{filename:'public-web/admin/prospects.js'});
});


test('GOY SALES AI exige aprobación y confirmación para primer WhatsApp', () => {
  const management=read('server/admin-management.js'),wa=read('server/whatsappNotifications.js'),js=read('public-web/admin/prospects.js');
  assert.match(management, /send-whatsapp/);
  assert.match(management, /prospect\.status!=='Aprobado para contacto'/);
  assert.match(management, /prospect\.doNotContact/);
  assert.match(management, /sendProspectFirstContact/);
  assert.match(management, /providerMessageId/);
  assert.match(management, /prospect\.status='Contactado'/);
  assert.match(wa, /GOY_WA_PROSPECT_TEMPLATE/);
  assert.match(js, /Enviar por WhatsApp/);
  assert.match(js, /window\.confirm/);
  assert.match(js, /Mensaje aprobado/);
  assert.match(js, /\/send-whatsapp/);
  new vm.Script(js,{filename:'public-web/admin/prospects.js'});
});


test('GOY SALES AI informa si WhatsApp comercial está listo sin exponer secretos', () => {
  const management=read('server/admin-management.js'),js=read('public-web/admin/prospects.js');
  assert.match(management, /\/admin\/prospects\/whatsapp-status/);
  assert.match(management, /GOY_WA_PROSPECT_TEMPLATE/);
  assert.match(management, /configured:missing\.length===0/);
  assert.match(js, /loadWhatsAppStatus/);
  assert.match(js, /WhatsApp pendiente/);
  assert.match(js, /WhatsApp comercial aún no está configurado/);
  assert.doesNotMatch(management, /accessToken\s*[,}]/);
  new vm.Script(js,{filename:'public-web/admin/prospects.js'});
});


test('Cloudflare conecta webhook firmado de respuestas WhatsApp para prospectos', () => {
  const edge=read('cloudflare-entry-auth.js'),hook=read('cloudflare-whatsapp-prospect-webhook.js');
  assert.match(edge, /\/api\/webhooks\/whatsapp\/prospects/);
  assert.match(edge, /whatsappProspectWebhook/);
  assert.match(hook, /X-Hub-Signature-256/);
  assert.match(hook, /WHATSAPP_WEBHOOK_VERIFY_TOKEN/);
  assert.match(hook, /META_APP_SECRET/);
  assert.match(hook, /providerMessageId/);
  assert.match(hook, /p\.status='Respondió'/);
  assert.match(hook, /p\.doNotContact=true/);
  assert.match(hook, /STATE_CONFLICT/);
});


test('Cloudflare sincroniza variables WhatsApp comerciales de GOY SALES AI', () => {
  const worker=read('cloudflare-worker-v2.js');
  for(const key of ['GOY_WA_TEMPLATE_LANG','GOY_WA_ADMIN_PHONE','GOY_WA_ADMIN_ORDER_TEMPLATE','GOY_WA_COURIER_ORDER_TEMPLATE','GOY_WA_CLIENT_DELIVERED_TEMPLATE','GOY_WA_PROSPECT_TEMPLATE']) assert.match(worker,new RegExp(key));
});


test('Buscador de prospectos mantiene importación accesible en móvil', () => {
  const prospects=read('public-web/admin/prospects.js'),css=read('public-web/admin/styles.css');
  assert.match(prospects, /discover-import-bar/);
  assert.match(prospects, /discoverSelectedCount/);
  assert.match(prospects, /setTimeout\(\(\)=>o\.remove\(\),650\)/);
  assert.match(css, /discover-results-scroll/);
  assert.match(css, /position:sticky/);
});
