(() => {
  const apiBase = String(window.GOY_ADMIN_CONFIG?.apiBaseUrl || '/api').replace(/\/$/, '');
  const token = () => sessionStorage.getItem('goyAdminToken') || '';
  const tbody = document.getElementById('clientsBody');
  if (!tbody) return;

  let clients = [];
  let requests = [];
  let loading = false;

  const clean = value => String(value || '').trim().toLowerCase();
  const digits = value => String(value || '').replace(/\D/g, '');
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money = value => `$${Number(value || 0).toFixed(2)}`;
  const serviceName = request => request.serviceLabel || ({shipment:request.deliveryMode === 'express' ? 'Envío Express' : 'Entrega programada',procedure:'Trámite ejecutivo',deposit:'Depósito',diverse:'Servicio diverso'}[request.kind]) || request.service || request.kind || 'Servicio';
  const statusName = value => ({pending:'Pendiente',quoted:'Cotizado',accepted:'Aceptado',assigned:'Asignado',pickedUp:'Recogido',onRoute:'En camino',finished:'Entrega finalizada',cancelled:'Cancelado','En ruta':'En camino',Entregado:'Entrega finalizada',Finalizado:'Entrega finalizada'}[value] || value || 'Pendiente');
  const formatDate = value => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('es-EC', {dateStyle:'medium', timeStyle:'short'}).format(date);
  };

  function ensureStyles() {
    if (document.getElementById('goy-client-location-styles')) return;
    const style = document.createElement('style');
    style.id = 'goy-client-location-styles';
    style.textContent = `
      .client-row{cursor:pointer;transition:.16s ease}.client-row:hover{background:#f4fbfd}.client-row:focus{outline:2px solid #30b9d3;outline-offset:-2px}
      .client-address-cell{min-width:210px;max-width:330px;white-space:normal;line-height:1.45;color:#294957}
      .client-address-cell small{display:block;color:#78909c;margin-top:3px}
      .client-map-link{display:inline-flex;align-items:center;gap:6px;padding:8px 11px;border-radius:10px;background:#e8f7fb;color:#087394;font-weight:800;text-decoration:none;white-space:nowrap;border:1px solid #cfeaf2;transition:.18s ease}
      .client-map-link:hover{background:#d9f2f8;transform:translateY(-1px)}.client-map-link.exact{background:#eafaf2;color:#167447;border-color:#ccebdc}
      .client-map-missing{color:#9aaab2;font-size:12px;white-space:nowrap}.client-history-btn{border:1px solid #cfe8ef;background:#fff;color:#0b7894;font-weight:800;border-radius:10px;padding:8px 11px;white-space:nowrap}
      .client-detail-overlay{position:fixed;inset:0;z-index:9999;background:rgba(5,25,35,.58);display:grid;place-items:center;padding:18px}
      .client-detail-modal{width:min(980px,96vw);max-height:90vh;overflow:auto;background:#fff;border-radius:24px;box-shadow:0 24px 80px rgba(0,0,0,.25);padding:22px;color:#17313d}
      .client-detail-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:18px}.client-detail-head h3{margin:2px 0 5px;font-size:26px}.client-detail-close{border:0;background:#eef5f7;border-radius:50%;width:40px;height:40px;font-size:25px;cursor:pointer}
      .client-detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px}.client-detail-card{background:#f6fafb;border:1px solid #e4eef1;border-radius:14px;padding:12px;min-width:0}.client-detail-card span{display:block;font-size:11px;text-transform:uppercase;color:#78909c;font-weight:800;letter-spacing:.05em;margin-bottom:4px}.client-detail-card strong{display:block;overflow-wrap:anywhere}
      .client-history-summary{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 14px}.client-history-pill{background:#e9f8fb;border-radius:999px;padding:7px 10px;font-weight:800;color:#126d84;font-size:12px}
      .client-history-table{width:100%;border-collapse:collapse}.client-history-table th,.client-history-table td{text-align:left;padding:10px 8px;border-bottom:1px solid #e7eef1;vertical-align:top}.client-history-table th{font-size:11px;color:#7c909a;text-transform:uppercase}.client-history-table small{color:#748892}.client-history-empty{padding:24px;text-align:center;background:#f7fafb;border-radius:14px;color:#78909c}
      @media(max-width:760px){.client-detail-modal{padding:16px;border-radius:18px}.client-detail-grid{grid-template-columns:1fr 1fr}.client-history-table{min-width:720px}.client-history-scroll{overflow:auto}.client-detail-head h3{font-size:22px}}
    `;
    document.head.appendChild(style);
  }

  function ensureHeaders() {
    const row = document.querySelector('#clients table thead tr');
    if (!row || row.querySelector('[data-client-location-header]')) return;
    const address = document.createElement('th');
    address.textContent = 'Dirección';
    address.setAttribute('data-client-location-header', 'address');
    const location = document.createElement('th');
    location.textContent = 'Ubicación';
    location.setAttribute('data-client-location-header', 'gps');
    const history = document.createElement('th');
    history.textContent = 'Historial';
    history.setAttribute('data-client-location-header', 'history');
    const anchor = row.children[2] || null;
    row.insertBefore(address, anchor);
    row.insertBefore(location, anchor);
    row.appendChild(history);
  }

  function findClient(row) {
    const cells = Array.from(row.children);
    if (cells.length < 5) return null;
    const name = clean(cells[0]?.textContent);
    const phone = digits(cells[1]?.textContent);
    return clients.find(client => {
      const cPhone = digits(client.phone || client.whatsapp);
      const cName = clean(client.businessName || client.name);
      return (phone && cPhone === phone) || (name && cName === name);
    }) || null;
  }

  function mapsInfo(client) {
    const location = client?.location || client?.gpsLocation || client?.coordinates || {};
    const latitude = Number(location.latitude ?? location.lat);
    const longitude = Number(location.longitude ?? location.lng ?? location.lon);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return {exact:true,label:'GPS exacto',url:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`};
    }
    const address = String(client?.address || '').trim();
    if (address) return {exact:false,label:'Ver en Maps',url:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`};
    return null;
  }

  function clientRequests(client) {
    const clientIds = [client?.id, client?.userId].filter(Boolean).map(String);
    const phone = digits(client?.phone || client?.whatsapp);
    const email = clean(client?.email);
    const name = clean(client?.businessName || client?.name);
    return requests.filter(request => {
      const requestIds = [request?.clientId, request?.userId, request?.customerId, request?.clientUserId].filter(Boolean).map(String);
      if (clientIds.some(id => requestIds.includes(id))) return true;
      if (phone && phone === digits(request?.phone || request?.whatsapp)) return true;
      if (email && email === clean(request?.email)) return true;
      return Boolean(name && name === clean(request?.customer || request?.businessName || request?.client));
    }).sort((a,b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0));
  }

  function closeClientModal() {
    document.getElementById('goyClientDetailModal')?.remove();
  }

  function openClientModal(client) {
    if (!client) return;
    closeClientModal();
    const history = clientRequests(client);
    const finished = history.filter(r => statusName(r.status) === 'Entrega finalizada').length;
    const total = history.reduce((sum,r) => sum + Number(r.serviceCost ?? r.value ?? 0), 0);
    const overlay = document.createElement('div');
    overlay.id = 'goyClientDetailModal';
    overlay.className = 'client-detail-overlay';
    overlay.innerHTML = `
      <section class="client-detail-modal" role="dialog" aria-modal="true" aria-label="Detalle de cliente">
        <div class="client-detail-head"><div><small>Ficha del cliente</small><h3>${escapeHtml(client.businessName || client.name || 'Cliente')}</h3><div>${escapeHtml(client.status || 'Activo')}</div></div><button class="client-detail-close" type="button" aria-label="Cerrar">×</button></div>
        <div class="client-detail-grid">
          <div class="client-detail-card"><span>WhatsApp</span><strong>${escapeHtml(client.whatsapp || client.phone || '-')}</strong></div>
          <div class="client-detail-card"><span>Cédula / RUC</span><strong>${escapeHtml(client.documentId || '-')}</strong></div>
          <div class="client-detail-card"><span>Correo</span><strong>${escapeHtml(client.email || '-')}</strong></div>
          <div class="client-detail-card"><span>Dirección</span><strong>${escapeHtml(client.address || 'Sin dirección registrada')}</strong></div>
        </div>
        <h4>Carreras y entregas realizadas</h4>
        <div class="client-history-summary"><span class="client-history-pill">${history.length} solicitud(es)</span><span class="client-history-pill">${finished} finalizada(s)</span><span class="client-history-pill">Total servicios: ${money(total)}</span></div>
        ${history.length ? `<div class="client-history-scroll"><table class="client-history-table"><thead><tr><th>Fecha</th><th>#</th><th>Servicio</th><th>Dirección / destino</th><th>Mensajero</th><th>Estado</th><th>Valor</th></tr></thead><tbody>${history.map(r => `<tr><td>${escapeHtml(formatDate(r.createdAt || r.updatedAt))}</td><td><strong>${escapeHtml(r.code || r.id || '-')}</strong></td><td>${escapeHtml(serviceName(r))}</td><td>${escapeHtml(r.destinationAddress || r.procedureAddress || r.depositDestination || r.pickupAddress || r.address || '-')}</td><td>${escapeHtml(r.courier || 'Sin asignar')}</td><td>${escapeHtml(statusName(r.status))}</td><td>${money(r.serviceCost ?? r.value ?? 0)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="client-history-empty">Este cliente todavía no tiene carreras o entregas registradas.</div>'}
      </section>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.client-detail-close').addEventListener('click', closeClientModal);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeClientModal(); });
  }

  function decorateRows() {
    ensureStyles();
    ensureHeaders();
    for (const row of tbody.querySelectorAll('tr')) {
      if (row.dataset.goyLocationReady === '1') continue;
      if (row.querySelector('td[colspan]')) continue;
      const client = findClient(row);
      if (!client) continue;

      const addressText = String(client.address || '').trim();
      const info = mapsInfo(client);
      const addressCell = document.createElement('td');
      addressCell.className = 'client-address-cell';
      addressCell.textContent = addressText || 'Sin dirección registrada';
      if (info?.exact) {
        const hint = document.createElement('small');
        hint.textContent = 'Ubicación GPS guardada';
        addressCell.appendChild(hint);
      }

      const locationCell = document.createElement('td');
      if (info) {
        const link = document.createElement('a');
        link.href = info.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = `client-map-link${info.exact ? ' exact' : ''}`;
        link.textContent = `⌖ ${info.label}`;
        locationCell.appendChild(link);
      } else {
        const missing = document.createElement('span');
        missing.className = 'client-map-missing';
        missing.textContent = 'Sin ubicación';
        locationCell.appendChild(missing);
      }

      const historyCell = document.createElement('td');
      const historyButton = document.createElement('button');
      historyButton.type = 'button';
      historyButton.className = 'client-history-btn';
      historyButton.textContent = `Ver (${clientRequests(client).length})`;
      historyButton.addEventListener('click', event => { event.stopPropagation(); openClientModal(client); });
      historyCell.appendChild(historyButton);

      const anchor = row.children[2] || null;
      row.insertBefore(addressCell, anchor);
      row.insertBefore(locationCell, anchor);
      row.appendChild(historyCell);
      row.classList.add('client-row');
      row.tabIndex = 0;
      row.addEventListener('click', event => { if (!event.target.closest('a,button')) openClientModal(client); });
      row.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('a,button')) { event.preventDefault(); openClientModal(client); } });
      row.dataset.goyLocationReady = '1';
    }
  }

  async function loadClients() {
    if (loading || !token() || !apiBase) return;
    loading = true;
    try {
      const response = await fetch(`${apiBase}/admin/data`, {headers:{Authorization:`Bearer ${token()}`}});
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        clients = body.clients || [];
        requests = body.requests || [];
        decorateRows();
      }
    } finally {
      loading = false;
    }
  }

  const observer = new MutationObserver(() => {
    if (!clients.length) loadClients();
    else decorateRows();
  });
  observer.observe(tbody, {childList:true, subtree:true});

  document.addEventListener('click', event => {
    if (event.target.closest('[data-view="clients"],[data-go="clients"]')) setTimeout(loadClients, 80);
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeClientModal(); });

  setTimeout(loadClients, 250);
})();
