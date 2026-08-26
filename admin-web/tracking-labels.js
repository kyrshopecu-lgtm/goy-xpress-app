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
  const serviceName = r => r?.serviceLabel || ({shipment:r?.deliveryMode === 'express' ? 'Envío Express' : 'Entrega programada',procedure:'Trámite ejecutivo',deposit:'Depósito',diverse:'Servicio diverso'}[r?.kind]) || r?.service || r?.kind || 'Servicio';
  const statusName = v => ({pending:'Pendiente',quoted:'Cotizado',accepted:'Aceptado',assigned:'Asignado',pickedUp:'Recogido',onRoute:'En camino',finished:'Entrega finalizada',cancelled:'Cancelado','En ruta':'En camino',Entregado:'Entrega finalizada',Finalizado:'Entrega finalizada'}[v] || v || 'Pendiente');
  const formatDate = value => {
    const d = new Date(value || Date.now());
    return Number.isNaN(d.getTime()) ? '-' : new Intl.DateTimeFormat('es-EC', {dateStyle:'medium', timeStyle:'short'}).format(d);
  };

  function trackingNumber(request) {
    if (request?.trackingNumber) return String(request.trackingNumber);
    const code = String(request?.code || request?.id || '').trim().toUpperCase();
    if (!code) return 'GOY-TRK-PENDIENTE';
    return `GOY-TRK-${code.replace(/^GOY[-_]?/i, '').replace(/[^A-Z0-9-]/g, '')}`;
  }

  const requestCode = request => String(request?.code || request?.id || '').trim();

  function findClient(request) {
    const ids = [request?.clientId, request?.userId, request?.customerId].filter(Boolean).map(String);
    const phone = digits(request?.phone || request?.whatsapp);
    const email = clean(request?.email);
    const name = clean(request?.customer || request?.businessName || request?.client);
    return clients.find(client => {
      const clientIds = [client?.id, client?.userId].filter(Boolean).map(String);
      return clientIds.some(id => ids.includes(id)) ||
        (phone && phone === digits(client?.phone || client?.whatsapp)) ||
        (email && email === clean(client?.email)) ||
        (name && name === clean(client?.businessName || client?.name));
    }) || null;
  }

  function requestByCode(code) {
    const wanted = clean(code);
    return requests.find(r => clean(requestCode(r)) === wanted || clean(trackingNumber(r)) === wanted) || null;
  }

  function labelHtml(request) {
    const client = findClient(request) || {};
    const tracking = trackingNumber(request);
    const code = requestCode(request);
    const clientName = client.businessName || client.name || request.customer || request.businessName || 'Cliente GOY XPRESS';
    const clientPhone = client.whatsapp || client.phone || request.phone || '-';
    const clientEmail = client.email || request.email || '-';
    const documentId = client.documentId || '-';
    const clientAddress = client.address || '-';
    const origin = String(request.originAddress || '').trim();
    const destination = String(request.destinationAddress || request.procedureAddress || request.depositDestination || request.pickupAddress || request.address || clientAddress || '-').trim();
    const recipient = request.recipient || '-';
    const qrPayload = `GOY XPRESS\nTracking: ${tracking}\nOrden: ${code}\nCliente: ${clientName}\nDestino: ${destination}`;

    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(tracking)} | GOY XPRESS</title>
    <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"><\/script>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
    <style>
      *{box-sizing:border-box}body{margin:0;background:#eef4f6;font-family:Arial,Helvetica,sans-serif;color:#122b36}.page{width:100%;max-width:860px;margin:20px auto;background:#fff;border:2px solid #0b2f40;border-radius:20px;overflow:hidden}.head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:22px 26px;background:#0b2f40;color:#fff}.brand{display:flex;align-items:center;gap:14px}.brand img{width:72px;height:72px;object-fit:cover;border-radius:15px;background:#fff}.brand strong{display:block;font-size:25px}.brand span{font-size:13px;opacity:.8}.tracking{text-align:right}.tracking small{display:block;text-transform:uppercase;letter-spacing:.12em;font-size:11px;opacity:.75}.tracking b{display:block;font-size:27px;letter-spacing:.04em;margin-top:5px}.body{padding:22px 26px}.codes{display:grid;grid-template-columns:190px 1fr;gap:18px;align-items:center;border:2px solid #0b2f40;border-radius:16px;padding:14px;margin-bottom:18px}.qr-box{text-align:center}.qr-box #qrcode{display:inline-block;padding:8px;background:#fff}.qr-box small,.barcode-box small{display:block;margin-top:6px;color:#68808b;font-weight:700}.barcode-box{text-align:center;overflow:hidden}.barcode-box svg{max-width:100%;height:auto}.notice{background:#eaf8fc;border:1px solid #c9ebf3;border-radius:14px;padding:11px 14px;margin-bottom:16px;font-weight:700;color:#0b708b}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.card{border:1px solid #dce8ec;border-radius:13px;padding:12px;min-height:69px}.card span{display:block;color:#78909c;text-transform:uppercase;font-size:10px;font-weight:800;letter-spacing:.08em;margin-bottom:5px}.card strong{font-size:15px;overflow-wrap:anywhere}.wide{grid-column:1/-1}.route{margin-top:15px;border-top:2px dashed #cbd8dd;padding-top:14px}.route h2{font-size:16px;margin:0 0 8px}.route-item{padding:10px 0;border-bottom:1px solid #e8eff2}.route-item span{display:block;font-size:10px;text-transform:uppercase;color:#7d919a;font-weight:800}.route-item strong{display:block;margin-top:4px;font-size:15px}.foot{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-top:18px;padding-top:14px;border-top:1px solid #e5ecef}.foot small{color:#78909c}.amount{text-align:right}.amount span{display:block;color:#78909c;font-size:11px;text-transform:uppercase}.amount strong{font-size:21px}.actions{max-width:860px;margin:12px auto 24px;text-align:center}.actions button{border:0;border-radius:12px;padding:12px 18px;font-weight:800;background:#00a9e8;color:#fff;cursor:pointer}.code-status{font-size:12px;color:#78909c;margin-top:8px}@media print{body{background:#fff}.page{margin:0;max-width:none;border-radius:0}.actions{display:none}@page{size:auto;margin:7mm}}@media(max-width:620px){.head{align-items:flex-start;flex-direction:column}.tracking{text-align:left}.tracking b{font-size:21px}.codes{grid-template-columns:1fr}.grid{grid-template-columns:1fr}.wide{grid-column:auto}.page{margin:0;border-radius:0;border-width:0}.body{padding:16px}}
    </style></head><body><main class="page"><header class="head"><div class="brand"><img src="${escapeHtml(location.origin)}/assets/goy-logo.jpg" alt="GOY XPRESS"><div><strong>GOY XPRESS</strong><span>Guía de entrega y seguimiento</span></div></div><div class="tracking"><small>Número de tracking</small><b>${escapeHtml(tracking)}</b></div></header><section class="body"><div class="codes"><div class="qr-box"><div id="qrcode"></div><small>QR de seguimiento</small></div><div class="barcode-box"><svg id="barcode"></svg><small>Código de barras CODE 128</small><div class="code-status" id="codeStatus">Generando códigos…</div></div></div><div class="notice">El QR y el código de barras identifican esta orden con el mismo número de tracking.</div><div class="grid"><div class="card"><span>Cliente</span><strong>${escapeHtml(clientName)}</strong></div><div class="card"><span>WhatsApp</span><strong>${escapeHtml(clientPhone)}</strong></div><div class="card"><span>Cédula / RUC</span><strong>${escapeHtml(documentId)}</strong></div><div class="card"><span>Correo</span><strong>${escapeHtml(clientEmail)}</strong></div><div class="card wide"><span>Dirección registrada del cliente</span><strong>${escapeHtml(clientAddress)}</strong></div></div><div class="route"><h2>Datos de la orden</h2>${origin ? `<div class="route-item"><span>Retiro</span><strong>${escapeHtml(origin)}</strong></div>` : ''}<div class="route-item"><span>Dirección / destino</span><strong>${escapeHtml(destination)}</strong></div><div class="route-item"><span>Persona que recibe</span><strong>${escapeHtml(recipient)}</strong></div><div class="grid" style="margin-top:10px"><div class="card"><span>Orden</span><strong>${escapeHtml(code || '-')}</strong></div><div class="card"><span>Servicio</span><strong>${escapeHtml(serviceName(request))}</strong></div><div class="card"><span>Estado</span><strong>${escapeHtml(statusName(request.status))}</strong></div><div class="card"><span>Mensajero</span><strong>${escapeHtml(request.courier || 'Sin asignar')}</strong></div></div></div><div class="foot"><small>Generado: ${escapeHtml(formatDate(request.createdAt || request.updatedAt))}<br>GOY XPRESS · Quito, Ecuador</small><div class="amount"><span>Valor del servicio</span><strong>${escapeHtml(money(request.serviceCost ?? request.value ?? 0))}</strong></div></div></section></main><div class="actions"><button onclick="window.print()">Imprimir guía</button></div>
    <script>
      const tracking=${JSON.stringify(tracking)};
      const qrPayload=${JSON.stringify(qrPayload)};
      let tries=0;
      function renderCodes(){
        tries++;
        if(window.QRCode && window.JsBarcode){
          try{
            new QRCode(document.getElementById('qrcode'),{text:qrPayload,width:156,height:156,correctLevel:QRCode.CorrectLevel.M});
            JsBarcode('#barcode',tracking,{format:'CODE128',displayValue:true,fontSize:18,height:72,margin:6});
            document.getElementById('codeStatus').textContent='Listo para escanear e imprimir';
            setTimeout(()=>window.print(),450);
            return;
          }catch(e){document.getElementById('codeStatus').textContent='No se pudieron generar los códigos';}
        }
        if(tries<40) setTimeout(renderCodes,150);
        else document.getElementById('codeStatus').textContent='No se pudieron cargar los generadores de códigos';
      }
      renderCodes();
    <\/script></body></html>`;
  }

  function printRequest(request) {
    if (!request) return alert('No se encontró la solicitud para imprimir.');
    let popup;
    try {
      popup = window.open('about:blank', '_blank');
      if (!popup) throw new Error('popup-blocked');
      const html = labelHtml(request);
      popup.document.open('text/html', 'replace');
      popup.document.write(html);
      popup.document.close();
      popup.focus();
    } catch (error) {
      if (popup && !popup.closed) popup.close();
      alert('No se pudo abrir la guía. Permite ventanas emergentes para este sitio e inténtalo nuevamente.');
    }
  }

  function ensureStyles() {
    if (document.getElementById('goy-tracking-styles')) return;
    const style = document.createElement('style');
    style.id = 'goy-tracking-styles';
    style.textContent = `.tracking-inline{display:block;margin-top:5px;font-size:10px;font-weight:900;color:#087394}.tracking-print-btn{border:1px solid #bfe3ec;background:#eefafd;color:#087394;font-weight:800;border-radius:9px;padding:7px 9px;cursor:pointer;white-space:nowrap}.tracking-print-btn:hover{background:#dff5fa}.tracking-created-box{margin-top:12px;padding:12px;border:1px solid #cfeaf2;background:#f0fbfd;border-radius:12px}.tracking-created-box strong{display:block;color:#0b718b;font-size:16px;margin-bottom:8px}`;
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
      const tag = document.createElement('small'); tag.className='tracking-inline'; tag.textContent=`Tracking: ${trackingNumber(request)}`; row.children[0]?.appendChild(tag);
      const button = document.createElement('button'); button.type='button'; button.className='tracking-print-btn'; button.textContent='Guía QR + barras';
      button.addEventListener('click', e=>{e.preventDefault();e.stopPropagation();printRequest(request);});
      (row.querySelector('.order-actions') || row.lastElementChild)?.appendChild(button);
      row.dataset.trackingReady='1';
    }
  }

  function decorateClientHistory() {
    for (const row of document.querySelectorAll('.client-history-table tbody tr')) {
      if (row.dataset.trackingReady === '1') continue;
      const request = requestByCode(String(row.children[1]?.textContent || '').trim());
      if (!request) continue;
      const tag=document.createElement('small'); tag.className='tracking-inline'; tag.textContent=trackingNumber(request); row.children[1]?.appendChild(tag);
      const button=document.createElement('button'); button.type='button'; button.className='tracking-print-btn'; button.style.cssText='display:block;margin-top:6px'; button.textContent='Guía QR';
      button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();printRequest(request);}); row.lastElementChild?.appendChild(button); row.dataset.trackingReady='1';
    }
  }

  function decorateCreatedOrder() {
    const result=document.getElementById('adminOrderResult');
    if(!result || result.dataset.trackingReady==='1') return;
    const match=String(result.querySelector('.success-card strong')?.textContent||'').match(/Orden\s+([^\s]+)\s+creada/i);
    if(!match) return;
    const request=requestByCode(match[1]); if(!request) return;
    const box=document.createElement('div'); box.className='tracking-created-box'; box.innerHTML=`<strong>Tracking: ${escapeHtml(trackingNumber(request))}</strong><button type="button" class="tracking-print-btn">Imprimir guía con QR y código de barras</button>`;
    box.querySelector('button').addEventListener('click',()=>printRequest(request)); result.prepend(box); result.dataset.trackingReady='1';
  }

  function decorate(){ensureStyles();decorateOrderRows();decorateClientHistory();decorateCreatedOrder();}

  async function loadData(force=false){
    if(loading || !token() || !apiBase) return;
    if(!force && requests.length) return decorate();
    loading=true;
    try{
      const response=await fetch(`${apiBase}/admin/data`,{headers:{Authorization:`Bearer ${token()}`}});
      const body=await response.json().catch(()=>({}));
      if(response.ok){clients=body.clients||[];requests=body.requests||[];decorate();}
    }finally{loading=false;}
  }

  new MutationObserver(()=>{if(!requests.length)loadData();else decorate();}).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="orders"],[data-go="orders"],[data-view="clients"],[data-go="clients"]'))setTimeout(()=>loadData(true),100);});
  setTimeout(loadData,350);
})();