(() => {
  const apiBase = String(window.GOY_ADMIN_CONFIG?.apiBaseUrl || '/api').replace(/\/$/, '');
  const token = () => sessionStorage.getItem('goyAdminToken') || '';
  let clients = [];
  let requests = [];
  let loading = false;

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const clean = value => String(value || '').trim().toLowerCase();
  const digits = value => String(value || '').replace(/\D/g, '');
  const money = value => `$${Number(value || 0).toFixed(2)}`;
  const formatDate = value => {
    const date = new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('es-EC', {dateStyle:'medium', timeStyle:'short'}).format(date);
  };
  const serviceName = request => request?.serviceLabel || ({shipment:request?.deliveryMode === 'express' ? 'Envío Express' : 'Entrega programada',procedure:'Trámite ejecutivo',deposit:'Depósito',diverse:'Servicio diverso'}[request?.kind]) || request?.service || request?.kind || 'Servicio';
  const statusName = value => ({pending:'Pendiente',quoted:'Cotizado',accepted:'Aceptado',assigned:'Asignado',pickedUp:'Recogido',onRoute:'En camino',finished:'Entrega finalizada',cancelled:'Cancelado','En ruta':'En camino',Entregado:'Entrega finalizada',Finalizado:'Entrega finalizada'}[value] || value || 'Pendiente');

  function trackingNumber(request) {
    if (request?.trackingNumber) return String(request.trackingNumber);
    const code = String(request?.code || request?.id || '').trim().toUpperCase();
    if (!code) return 'GOY-TRK-PENDIENTE';
    const normalized = code.replace(/^GOY[-_]?/i, '').replace(/[^A-Z0-9-]/g, '');
    return `GOY-TRK-${normalized}`;
  }

  function requestCode(request) {
    return String(request?.code || request?.id || '').trim();
  }

  function findClient(request) {
    const requestIds = [request?.clientId, request?.userId, request?.customerId].filter(Boolean).map(String);
    const phone = digits(request?.phone || request?.whatsapp);
    const email = clean(request?.email);
    const name = clean(request?.customer || request?.businessName || request?.client);
    return clients.find(client => {
      const ids = [client?.id, client?.userId].filter(Boolean).map(String);
      if (ids.some(id => requestIds.includes(id))) return true;
      if (phone && phone === digits(client?.phone || client?.whatsapp)) return true;
      if (email && email === clean(client?.email)) return true;
      return Boolean(name && name === clean(client?.businessName || client?.name));
    }) || null;
  }

  function addressFor(request) {
    return String(request?.destinationAddress || request?.procedureAddress || request?.depositDestination || request?.pickupAddress || request?.address || '').trim();
  }

  function originFor(request) {
    return String(request?.originAddress || '').trim();
  }

  function labelHtml(request) {
    const client = findClient(request) || {};
    const tracking = trackingNumber(request);
    const clientName = client.businessName || client.name || request.customer || request.businessName || 'Cliente GOY XPRESS';
    const clientPhone = client.whatsapp || client.phone || request.phone || '-';
    const clientEmail = client.email || request.email || '-';
    const documentId = client.documentId || '-';
    const clientAddress = client.address || '-';
    const destination = addressFor(request) || clientAddress;
    const origin = originFor(request);
    const recipient = request.recipient || '-';
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(tracking)} | GOY XPRESS</title><style>
      *{box-sizing:border-box}body{margin:0;background:#eef4f6;font-family:Arial,Helvetica,sans-serif;color:#122b36}.page{width:100%;max-width:860px;margin:20px auto;background:#fff;border:2px solid #0b2f40;border-radius:20px;overflow:hidden}.head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:22px 26px;background:#0b2f40;color:#fff}.brand{display:flex;align-items:center;gap:14px}.brand img{width:74px;height:74px;object-fit:cover;border-radius:16px;background:#fff}.brand strong{display:block;font-size:25px}.brand span{font-size:13px;opacity:.8}.tracking{text-align:right}.tracking small{display:block;text-transform:uppercase;letter-spacing:.12em;font-size:11px;opacity:.75}.tracking b{display:block;font-size:28px;letter-spacing:.04em;margin-top:5px}.body{padding:24px 26px}.notice{background:#eaf8fc;border:1px solid #c9ebf3;border-radius:14px;padding:12px 15px;margin-bottom:18px;font-weight:700;color:#0b708b}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.card{border:1px solid #dce8ec;border-radius:14px;padding:13px;min-height:74px}.card span{display:block;color:#78909c;text-transform:uppercase;font-size:10px;font-weight:800;letter-spacing:.08em;margin-bottom:5px}.card strong{font-size:15px;overflow-wrap:anywhere}.wide{grid-column:1/-1}.route{margin-top:16px;border-top:2px dashed #cbd8dd;padding-top:16px}.route h2{font-size:16px;margin:0 0 10px}.route-item{padding:12px 0;border-bottom:1px solid #e8eff2}.route-item span{display:block;font-size:10px;text-transform:uppercase;color:#7d919a;font-weight:800}.route-item strong{display:block;margin-top:4px;font-size:16px}.foot{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-top:20px;padding-top:16px;border-top:1px solid #e5ecef}.foot small{color:#78909c}.amount{text-align:right}.amount span{display:block;color:#78909c;font-size:11px;text-transform:uppercase}.amount strong{font-size:21px}.actions{max-width:860px;margin:12px auto 24px;text-align:center}.actions button{border:0;border-radius:12px;padding:12px 18px;font-weight:800;background:#00a9e8;color:#fff;cursor:pointer}@media print{body{background:#fff}.page{margin:0;max-width:none;border-radius:0}.actions{display:none}@page{size:auto;margin:8mm}}@media(max-width:620px){.head{align-items:flex-start;flex-direction:column}.tracking{text-align:left}.tracking b{font-size:22px}.grid{grid-template-columns:1fr}.wide{grid-column:auto}.page{margin:0;border-radius:0;border-width:0}.body{padding:18px}}
    </style></head><body><main class="page"><header class="head"><div class="brand"><img src="/assets/goy-logo.jpg" alt="GOY XPRESS"><div><strong>GOY XPRESS</strong><span>Guía de entrega y seguimiento</span></div></div><div class="tracking"><small>Número de tracking</small><b>${escapeHtml(tracking)}</b></div></header><section class="body"><div class="notice">Conserva este número para identificar y dar seguimiento a la entrega.</div><div class="grid"><div class="card"><span>Cliente</span><strong>${escapeHtml(clientName)}</strong></div><div class="card"><span>WhatsApp</span><strong>${escapeHtml(clientPhone)}</strong></div><div class="card"><span>Cédula / RUC</span><strong>${escapeHtml(documentId)}</strong></div><div class="card"><span>Correo</span><strong>${escapeHtml(clientEmail)}</strong></div><div class="card wide"><span>Dirección registrada del cliente</span><strong>${escapeHtml(clientAddress)}</strong></div></div><div class="route"><h2>Datos de la orden</h2>${origin ? `<div class="route-item"><span>Retiro</span><strong>${escapeHtml(origin)}</strong></div>` : ''}<div class="route-item"><span>Dirección / destino</span><strong>${escapeHtml(destination || '-')}</strong></div><div class="route-item"><span>Persona que recibe</span><strong>${escapeHtml(recipient)}</strong></div><div class="grid" style="margin-top:12px"><div class="card"><span>Orden</span><strong>${escapeHtml(requestCode(request) || '-')}</strong></div><div class="card"><span>Servicio</span><strong>${escapeHtml(serviceName(request))}</strong></div><div class="card"><span>Estado</span><strong>${escapeHtml(statusName(request.status))}</strong></div><div class="card"><span>Mensajero</span><strong>${escapeHtml(request.courier || 'Sin asignar')}</strong></div></div></div><div class="foot"><small>Generado: ${escapeHtml(formatDate(request.createdAt || request.updatedAt))}<br>GOY XPRESS · Quito, Ecuador</small><div class="amount"><span>Valor del servicio</span><strong>${escapeHtml(money(request.serviceCost ?? request.value ?? 0))}</strong></div></div></section></main><div class="actions"><button onclick="window.print()">Imprimir guía</button></div><script>setTimeout(()=>window.print(),350);<\/script></body></html>`;
  }

  function printRequest(request) {
    if (!request) return alert('No se encontró la solicitud para imprimir.');
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) return alert('El navegador bloqueó la ventana de impresión. Habilita ventanas emergentes para este sitio.');
    popup.document.open();
    popup.document.write(labelHtml(request));
    popup.document.close();
  }

  function requestByCode(code) {
    const wanted = clean(code);
    return requests.find(request => clean(requestCode(request)) === wanted || clean(trackingNumber(request)) === wanted) || null;
  }

  function ensureStyles() {
    if (document.getElementById('goy-tracking-styles')) return;
    const style = document.createElement('style');
    style.id = 'goy-tracking-styles';
    style.textContent = `.tracking-inline{display:block;margin-top:5px;font-size:10px;font-weight:900;color:#087394;letter-spacing:.03em}.tracking-print-btn{border:1px solid #bfe3ec;background:#eefafd;color:#087394;font-weight:800;border-radius:9px;padding:7px 9px;cursor:pointer;white-space:nowrap}.tracking-print-btn:hover{background:#dff5fa}.tracking-created-box{margin-top:12px;padding:12px;border:1px solid #cfeaf2;background:#f0fbfd;border-radius:12px}.tracking-created-box strong{display:block;color:#0b718b;font-size:16px;margin-bottom:8px}`;
    document.head.appendChild(style);
  }

  function decorateOrderRows() {
    const tbody = document.getElementById('ordersBody');
    if (!tbody) return;
    for (const row of tbody.querySelectorAll('tr')) {
      if (row.dataset.trackingReady === '1' || row.querySelector('td[colspan]')) continue;
      const code = String(row.children[0]?.querySelector('strong')?.textContent || row.children[0]?.textContent || '').trim();
      const request = requestByCode(code);
      if (!request) continue;
      const codeCell = row.children[0];
      const tag = document.createElement('small');
      tag.className = 'tracking-inline';
      tag.textContent = `Tracking: ${trackingNumber(request)}`;
      codeCell.appendChild(tag);
      const actions = row.querySelector('.order-actions') || row.lastElementChild;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tracking-print-btn';
      button.textContent = 'Imprimir guía';
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); printRequest(request); });
      actions?.appendChild(button);
      row.dataset.trackingReady = '1';
    }
  }

  function decorateClientHistory() {
    for (const row of document.querySelectorAll('.client-history-table tbody tr')) {
      if (row.dataset.trackingReady === '1') continue;
      const code = String(row.children[1]?.textContent || '').trim();
      const request = requestByCode(code);
      if (!request) continue;
      const codeCell = row.children[1];
      const tag = document.createElement('small');
      tag.className = 'tracking-inline';
      tag.textContent = trackingNumber(request);
      codeCell.appendChild(tag);
      const valueCell = row.lastElementChild;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tracking-print-btn';
      button.style.display = 'block';
      button.style.marginTop = '6px';
      button.textContent = 'Guía';
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); printRequest(request); });
      valueCell?.appendChild(button);
      row.dataset.trackingReady = '1';
    }
  }

  function decorateCreatedOrder() {
    const result = document.getElementById('adminOrderResult');
    if (!result || result.dataset.trackingReady === '1') return;
    const strong = result.querySelector('.success-card strong');
    const match = String(strong?.textContent || '').match(/Orden\s+([^\s]+)\s+creada/i);
    if (!match) return;
    const request = requestByCode(match[1]);
    if (!request) return;
    const box = document.createElement('div');
    box.className = 'tracking-created-box';
    box.innerHTML = `<strong>Tracking: ${escapeHtml(trackingNumber(request))}</strong><button type="button" class="tracking-print-btn">Imprimir guía de entrega</button>`;
    box.querySelector('button').addEventListener('click', () => printRequest(request));
    result.prepend(box);
    result.dataset.trackingReady = '1';
  }

  function decorate() {
    ensureStyles();
    decorateOrderRows();
    decorateClientHistory();
    decorateCreatedOrder();
  }

  async function loadData(force = false) {
    if (loading || !token() || !apiBase) return;
    if (!force && requests.length) return decorate();
    loading = true;
    try {
      const response = await fetch(`${apiBase}/admin/data`, {headers:{Authorization:`Bearer ${token()}`}});
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        clients = body.clients || [];
        requests = body.requests || [];
        decorate();
      }
    } finally {
      loading = false;
    }
  }

  const observer = new MutationObserver(() => {
    if (!requests.length) loadData();
    else decorate();
  });
  observer.observe(document.body, {childList:true, subtree:true});

  document.addEventListener('click', event => {
    if (event.target.closest('[data-view="orders"],[data-go="orders"],[data-view="clients"],[data-go="clients"]')) setTimeout(() => loadData(true), 100);
  });

  setTimeout(loadData, 350);
})();
