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

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

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
