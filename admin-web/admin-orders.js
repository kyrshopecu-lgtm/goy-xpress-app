(() => {
  const $ = id => document.getElementById(id);
  const apiBase = String(window.GOY_ADMIN_CONFIG?.apiBaseUrl || '').replace(/\/$/, '');
  const token = () => sessionStorage.getItem('goyAdminToken') || '';

  function toast(message, type = 'ok') {
    let el = $('adminToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'adminToast';
      el.className = 'admin-toast';
      document.body.appendChild(el);
    }
    el.className = `admin-toast show ${type}`;
    el.textContent = message;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 3400);
  }

  async function api(path, options = {}) {
    const headers = {'Content-Type':'application/json', ...(options.headers || {})};
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const response = await fetch(`${apiBase}${path}`, {...options, headers});
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) throw new Error(body.error || 'No se pudo completar la operación');
    return body;
  }

  const esc = value => String(value ?? '').replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));

  async function populateSelectors() {
    const clientSelect = $('adminOrderClient');
    const courierSelect = $('adminOrderCourier');
    if (!clientSelect || !courierSelect) return;
    clientSelect.innerHTML = '<option value="">Cargando clientes…</option>';
    courierSelect.innerHTML = '<option value="">Sin asignar por ahora</option>';
    try {
      const result = await api('/admin/data');
      const clients = result.clients || [];
      const couriers = (result.couriers || []).filter(c => c.approved === true && c.active !== false);
      clientSelect.innerHTML = '<option value="">Selecciona un cliente</option>' + clients.map(c => {
        const id = c.userId || c.id;
        const name = c.businessName || c.name || c.email || 'Cliente';
        const phone = c.whatsapp || c.phone || '';
        return `<option value="${esc(id)}">${esc(name)}${phone ? ` · ${esc(phone)}` : ''}</option>`;
      }).join('');
      courierSelect.innerHTML = '<option value="">Sin asignar por ahora</option>' + couriers.map(c => {
        const id = c.userId || c.id;
        const name = c.name || c.fullName || 'Mensajero';
        return `<option value="${esc(id)}">${esc(name)}</option>`;
      }).join('');
      $('adminOrderCourierHint').textContent = couriers.length
        ? `${couriers.length} mensajero(s) aprobado(s) disponibles para asignación.`
        : 'No hay mensajeros aprobados disponibles. Puedes crear la orden sin asignar.';
    } catch (error) {
      clientSelect.innerHTML = '<option value="">No se pudieron cargar clientes</option>';
      toast(error.message, 'error');
    }
  }

  function openModal() {
    const modal = $('adminOrderModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    populateSelectors();
    setTimeout(() => $('adminOrderClient')?.focus(), 60);
  }

  function closeModal() {
    const modal = $('adminOrderModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function serviceDefaults() {
    const kind = $('adminOrderKind')?.value || 'shipment';
    const label = $('adminOrderLabel');
    if (!label) return;
    const map = {
      shipment: 'Entrega adicional',
      procedure: 'Trámite adicional',
      deposit: 'Depósito',
      diverse: 'Servicio diverso',
      office_pickup: 'Retiro en oficina'
    };
    if (!label.dataset.edited) label.value = map[kind] || 'Orden administrativa';
  }

  async function submitOrder(event) {
    event.preventDefault();
    const button = $('adminOrderSubmit');
    const payload = {
      clientId: $('adminOrderClient').value,
      courierId: $('adminOrderCourier').value,
      kind: $('adminOrderKind').value,
      serviceLabel: $('adminOrderLabel').value.trim(),
      pickupAddress: $('adminOrderPickup').value.trim(),
      destinationAddress: $('adminOrderDestination').value.trim(),
      serviceCost: Number(String($('adminOrderCost').value).replace(',', '.')),
      notes: $('adminOrderNotes').value.trim()
    };
    if (!payload.clientId) return toast('Selecciona el cliente al que pertenece la orden.', 'error');
    if (!Number.isFinite(payload.serviceCost) || payload.serviceCost < 0) return toast('Ingresa una tarifa válida.', 'error');
    button.disabled = true;
    button.textContent = 'Creando orden…';
    try {
      const result = await api('/admin-orders', {method:'POST', body:JSON.stringify(payload)});
      const order = result.request || {};
      closeModal();
      $('adminOrderForm').reset();
      $('adminOrderLabel').dataset.edited = '';
      serviceDefaults();
      toast(`Orden ${order.code || ''} creada${order.courier ? ` y asignada a ${order.courier}` : ''}.`);
      setTimeout(() => location.reload(), 900);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Crear orden';
    }
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-new-admin-order]')) openModal();
    if (event.target.closest('[data-close-admin-order]')) closeModal();
    if (event.target.classList.contains('modal-backdrop')) closeModal();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('adminOrderModal')?.classList.contains('hidden')) closeModal();
  });

  $('adminOrderForm')?.addEventListener('submit', submitOrder);
  $('adminOrderKind')?.addEventListener('change', serviceDefaults);
  $('adminOrderLabel')?.addEventListener('input', event => { event.target.dataset.edited = '1'; });
  serviceDefaults();
})();

/* Dirección y ubicación de clientes en Google Maps */
(() => {
  const apiBase = String(window.GOY_ADMIN_CONFIG?.apiBaseUrl || '').replace(/\/$/, '');
  const token = () => sessionStorage.getItem('goyAdminToken') || '';
  const tbody = document.getElementById('clientsBody');
  if (!tbody) return;

  let clients = [];
  let loading = false;

  const clean = value => String(value || '').trim().toLowerCase();
  const digits = value => String(value || '').replace(/\D/g, '');

  function ensureStyles() {
    if (document.getElementById('goyClientLocationStyles')) return;
    const style = document.createElement('style');
    style.id = 'goyClientLocationStyles';
    style.textContent = `
      .client-address-cell{min-width:210px;max-width:330px;white-space:normal;line-height:1.45;color:#294957}
      .client-address-cell small{display:block;color:#78909c;margin-top:3px}
      .client-map-link{display:inline-flex;align-items:center;gap:6px;padding:8px 11px;border-radius:10px;background:#e8f7fb;color:#087394;font-weight:800;text-decoration:none;white-space:nowrap;border:1px solid #cfeaf2;transition:.18s ease}
      .client-map-link:hover{background:#d9f2f8;transform:translateY(-1px)}
      .client-map-link.exact{background:#eafaf2;color:#167447;border-color:#ccebdc}
      .client-map-missing{color:#9aaab2;font-size:12px;white-space:nowrap}
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
    const anchor = row.children[2] || null;
    row.insertBefore(address, anchor);
    row.insertBefore(location, anchor);
  }

  function findClient(row) {
    const cells = Array.from(row.children);
    if (cells.length < 5) return null;
    const name = clean(cells[0]?.textContent);
    const phone = digits(cells[1]?.textContent);
    const documentId = clean(cells[2]?.textContent);
    const email = clean(cells[3]?.textContent);
    return clients.find(client => {
      const cEmail = clean(client.email);
      const cPhone = digits(client.phone || client.whatsapp);
      const cDocument = clean(client.documentId || client.id);
      const cName = clean(client.businessName || client.name);
      return (email && cEmail === email) || (phone && cPhone === phone) || (documentId && cDocument === documentId) || (name && cName === name);
    }) || null;
  }

  function locationInfo(client) {
    const location = client?.location || client?.gpsLocation || client?.coordinates || {};
    const latitude = Number(location.latitude ?? location.lat);
    const longitude = Number(location.longitude ?? location.lng ?? location.lon);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return {
        exact: true,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`,
        label: 'GPS exacto'
      };
    }
    const address = String(client?.address || '').trim();
    if (address) {
      return {
        exact: false,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
        label: 'Ver en Maps'
      };
    }
    return null;
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
      const info = locationInfo(client);
      const addressCell = document.createElement('td');
      addressCell.className = 'client-address-cell';
      addressCell.textContent = addressText || 'Sin dirección registrada';
      if (info?.exact) {
        const hint = document.createElement('small');
        hint.textContent = 'Cuenta con coordenadas GPS';
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
      const anchor = row.children[2] || null;
      row.insertBefore(addressCell, anchor);
      row.insertBefore(locationCell, anchor);
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
    if (event.target.closest('[data-view="clients"],[data-go="clients"]')) {
      setTimeout(loadClients, 80);
    }
  });

  setTimeout(loadClients, 250);
})();
