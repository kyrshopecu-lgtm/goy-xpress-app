(() => {
  const apiBase = String(window.GOY_ADMIN_CONFIG?.apiBaseUrl || '/api').replace(/\/$/, '');
  const $ = id => document.getElementById(id);
  const token = () => sessionStorage.getItem('goyAdminToken') || '';
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money = value => `$${Number(value || 0).toFixed(2)}`;

  async function api(path, options = {}) {
    const headers = {'Content-Type':'application/json', ...(options.headers || {})};
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const response = await fetch(`${apiBase}${path}`, {...options, headers});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'No se pudo completar la operación.');
    return body;
  }

  function closeModal() {
    document.getElementById('adminOrderModal')?.remove();
  }

  function logoFallback(img) {
    img.style.display = 'none';
    img.parentElement?.classList.add('logo-fallback-active');
  }

  function enhanceLogos() {
    document.querySelectorAll('.brand-mark img, .hero-logo-3d img').forEach(img => {
      img.addEventListener('error', () => logoFallback(img), {once:true});
    });
  }

  function serviceFields(value) {
    if (value === 'shipment-scheduled' || value === 'shipment-express') {
      return `
        <div class="form-grid two">
          <label>Dirección de retiro<input name="originAddress" required placeholder="Ej. Jorge Juan y Mariana de Jesús, Quito"></label>
          <label>Dirección de entrega<input name="destinationAddress" required placeholder="Ej. Av. República y Eloy Alfaro, Quito"></label>
          <label>Persona que recibe<input name="recipient" placeholder="Nombre del destinatario"></label>
          <label>Valor del producto<input name="productValue" type="number" min="0" step="0.01" value="0"></label>
          <label class="check-line"><input name="cashOnDelivery" type="checkbox"> Cobrar producto contra entrega</label>
          <label>¿Quién paga la entrega?<select name="deliveryPayer"><option value="recipient">Destinatario</option><option value="sender">Cliente/remitente</option></select></label>
        </div>
        <div class="map-hint">La distancia, duración y tarifa se calcularán automáticamente con Google Maps al guardar.</div>`;
    }
    if (value === 'procedure') {
      return `
        <div class="form-grid two">
          <label>Lugar del trámite<input name="procedureAddress" required placeholder="Institución o dirección"></label>
          <label>Tiempo estimado (minutos)<input name="waitMinutes" type="number" min="1" value="40"></label>
        </div>
        <label>Detalle del trámite<textarea name="procedureDetail" rows="3" required placeholder="Describe lo que debe realizar el mensajero"></textarea></label>`;
    }
    if (value === 'deposit-checks') {
      return `
        <div class="form-grid two">
          <label>Número de cheques<input name="checkCount" type="number" min="1" value="1" required></label>
          <label>Banco / destino<input name="depositDestination" placeholder="Banco o institución"></label>
        </div>
        <div class="map-hint">Tarifa: $3,50 hasta 3 cheques; $0,50 por cada cheque adicional.</div>`;
    }
    if (value === 'deposit-cash') {
      return `
        <div class="form-grid two">
          <label>Valor en efectivo<input name="cashAmount" type="number" min="0" max="1000" step="0.01" required></label>
          <label>Banco / destino<input name="depositDestination" placeholder="Banco o institución"></label>
        </div>
        <div class="map-hint">El depósito en efectivo tiene un límite operativo de $1.000.</div>`;
    }
    return `
      <label>Servicio solicitado<textarea name="diverseDetail" rows="4" required placeholder="Describe el servicio que deseas cotizar para este cliente"></textarea></label>
      <div class="map-hint warning">Se creará como “Pendiente de cotización”. El mensajero se asigna después de que el cliente acepte.</div>`;
  }

  function buildRequest(form) {
    const fd = new FormData(form);
    const service = String(fd.get('service') || '');
    const common = {
      clientId:String(fd.get('clientId') || ''),
      courierId:String(fd.get('courierId') || ''),
      adminNotes:String(fd.get('adminNotes') || ''),
      internalReference:String(fd.get('internalReference') || ''),
    };
    if (service === 'shipment-scheduled' || service === 'shipment-express') {
      return {
        ...common,
        kind:'shipment',
        deliveryMode:service === 'shipment-express' ? 'express' : 'scheduled',
        originAddress:String(fd.get('originAddress') || ''),
        destinationAddress:String(fd.get('destinationAddress') || ''),
        recipient:String(fd.get('recipient') || ''),
        productValue:Number(fd.get('productValue') || 0),
        cashOnDelivery:fd.get('cashOnDelivery') === 'on',
        deliveryPayer:String(fd.get('deliveryPayer') || 'recipient'),
        serviceLabel:service === 'shipment-express' ? 'Envío Express' : 'Entrega programada',
      };
    }
    if (service === 'procedure') {
      return {
        ...common,
        kind:'procedure',
        procedureAddress:String(fd.get('procedureAddress') || ''),
        procedureDetail:String(fd.get('procedureDetail') || ''),
        waitMinutes:Number(fd.get('waitMinutes') || 40),
        serviceLabel:'Trámite ejecutivo',
      };
    }
    if (service === 'deposit-checks') {
      return {
        ...common,
        kind:'deposit',
        depositMethod:'checks',
        checkCount:Number(fd.get('checkCount') || 0),
        cashAmount:0,
        depositDestination:String(fd.get('depositDestination') || ''),
        serviceLabel:'Depósito de cheques',
      };
    }
    if (service === 'deposit-cash') {
      return {
        ...common,
        kind:'deposit',
        depositMethod:'cash',
        checkCount:0,
        cashAmount:Number(fd.get('cashAmount') || 0),
        depositDestination:String(fd.get('depositDestination') || ''),
        serviceLabel:'Depósito en efectivo',
      };
    }
    return {
      ...common,
      courierId:'',
      kind:'diverse',
      diverseDetail:String(fd.get('diverseDetail') || ''),
      serviceLabel:'Servicio diverso',
    };
  }

  function renderSummary(result) {
    const request = result.request || {};
    const route = request.route || {};
    return `
      <div class="success-card">
        <div class="success-icon">✓</div>
        <div>
          <strong>Orden ${escapeHtml(request.code || request.id || '')} creada</strong>
          <p>${escapeHtml(result.client?.name || request.customer || 'Cliente')} · ${escapeHtml(request.serviceLabel || request.kind || 'Servicio')}</p>
          <div class="result-pills">
            <span>${escapeHtml(request.status || 'Pendiente')}</span>
            <span>${money(request.serviceCost)}</span>
            ${route.distanceKm ? `<span>${escapeHtml(route.distanceKm)} km</span>` : ''}
            ${route.durationMinutes ? `<span>${escapeHtml(route.durationMinutes)} min</span>` : ''}
          </div>
          ${result.assignmentWarning ? `<p class="warning-text">${escapeHtml(result.assignmentWarning)}</p>` : ''}
        </div>
      </div>`;
  }

  async function openOrderModal() {
    if (!token()) return alert('Inicia sesión como administrador para crear órdenes.');
    const overlay = document.createElement('div');
    overlay.id = 'adminOrderModal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modern-modal"><div class="modal-loading"><span class="spinner"></span> Cargando clientes y mensajeros…</div></div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeModal(); });

    try {
      const data = await api('/admin/data');
      const clients = (data.clients || []).filter(c => c.active !== false);
      const couriers = (data.couriers || []).filter(c => c.approved && c.active !== false);
      if (!clients.length) {
        overlay.querySelector('.modern-modal').innerHTML = `<div class="modal-head"><div><span class="eyebrow">Nueva orden</span><h3>Primero registra un cliente</h3></div><button class="modal-close" type="button">×</button></div><p>No existen clientes activos. Registra o invita a un cliente antes de crear una orden administrativa.</p>`;
        overlay.querySelector('.modal-close').onclick = closeModal;
        return;
      }

      overlay.querySelector('.modern-modal').innerHTML = `
        <div class="modal-head">
          <div><span class="eyebrow">Centro operativo</span><h3>Crear orden para un cliente</h3><p>La orden quedará vinculada al cliente seleccionado y puede delegarse a un mensajero aprobado.</p></div>
          <button class="modal-close" type="button" aria-label="Cerrar">×</button>
        </div>
        <form id="adminOrderForm" class="admin-order-form">
          <div class="form-grid two">
            <label>Cliente<select name="clientId" required><option value="">Selecciona un cliente</option>${clients.map(c => `<option value="${escapeHtml(c.id || c.userId)}">${escapeHtml(c.businessName || c.name || c.email || 'Cliente')} · ${escapeHtml(c.phone || '')}</option>`).join('')}</select></label>
            <label>Tipo de servicio<select name="service" id="adminServiceSelect" required><option value="shipment-scheduled">Entrega programada</option><option value="shipment-express">Envío Express</option><option value="procedure">Trámite ejecutivo</option><option value="deposit-checks">Depósito de cheques</option><option value="deposit-cash">Depósito en efectivo</option><option value="diverse">Servicio diverso / cotización</option></select></label>
          </div>
          <div id="adminServiceFields">${serviceFields('shipment-scheduled')}</div>
          <div class="form-grid two">
            <label>Delegar a mensajero<select name="courierId" id="adminCourierSelect"><option value="">Dejar pendiente de asignación</option>${couriers.map(c => `<option value="${escapeHtml(c.id || c.userId)}">${escapeHtml(c.name || c.fullName || 'Mensajero')} · ${escapeHtml(c.phone || '')}</option>`).join('')}</select></label>
            <label>Referencia interna<input name="internalReference" placeholder="Ej. Pedido #154 / Cliente VIP"></label>
          </div>
          <label>Notas para operación<textarea name="adminNotes" rows="3" placeholder="Indicaciones internas para esta orden"></textarea></label>
          <div id="adminOrderMessage" class="form-message"></div>
          <div class="modal-actions"><button type="button" class="ghost modal-cancel">Cancelar</button><button id="adminOrderSubmit" type="submit" class="primary action-primary">Crear orden</button></div>
        </form>
        <div id="adminOrderResult"></div>`;

      const form = $('adminOrderForm');
      const serviceSelect = $('adminServiceSelect');
      const courierSelect = $('adminCourierSelect');
      overlay.querySelector('.modal-close').onclick = closeModal;
      overlay.querySelector('.modal-cancel').onclick = closeModal;
      serviceSelect.addEventListener('change', () => {
        $('adminServiceFields').innerHTML = serviceFields(serviceSelect.value);
        const diverse = serviceSelect.value === 'diverse';
        courierSelect.disabled = diverse;
        if (diverse) courierSelect.value = '';
      });

      form.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = $('adminOrderSubmit');
        const message = $('adminOrderMessage');
        message.textContent = '';
        submit.disabled = true;
        submit.textContent = 'Creando…';
        try {
          const payload = buildRequest(form);
          const result = await api('/admin-create-request', {method:'POST', body:JSON.stringify(payload)});
          form.classList.add('hidden');
          $('adminOrderResult').innerHTML = `${renderSummary(result)}<div class="modal-actions"><button type="button" class="ghost" id="createAnotherOrder">Crear otra</button><button type="button" class="primary action-primary" id="goToOrders">Ver solicitudes</button></div>`;
          $('createAnotherOrder').onclick = () => { closeModal(); openOrderModal(); };
          $('goToOrders').onclick = () => { closeModal(); document.querySelector('[data-view="orders"]')?.click(); setTimeout(() => location.reload(), 120); };
        } catch (error) {
          message.textContent = error.message || 'No se pudo crear la orden.';
          submit.disabled = false;
          submit.textContent = 'Crear orden';
        }
      });
    } catch (error) {
      overlay.querySelector('.modern-modal').innerHTML = `<div class="modal-head"><h3>No se pudo abrir Nueva orden</h3><button class="modal-close" type="button">×</button></div><p>${escapeHtml(error.message || 'Error de conexión')}</p>`;
      overlay.querySelector('.modal-close').onclick = closeModal;
    }
  }

  function wireButtons() {
    ['newOrderNav','heroNewOrder','quickNewOrder'].forEach(id => {
      const button = $(id);
      if (button) button.addEventListener('click', openOrderModal);
    });
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && token()) {
        event.preventDefault();
        openOrderModal();
      }
      if (event.key === 'Escape') closeModal();
    });
  }

  function updateGreeting() {
    const greeting = $('heroGreeting');
    if (!greeting) return;
    const hour = new Date().getHours();
    greeting.textContent = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
  }

  enhanceLogos();
  wireButtons();
  updateGreeting();
})();
