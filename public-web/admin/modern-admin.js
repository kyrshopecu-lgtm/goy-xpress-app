(() => {
  const apiBase = String(window.GOY_ADMIN_CONFIG?.apiBaseUrl || '/api').replace(/\/$/, '');
  const $ = id => document.getElementById(id);
  const token = () => sessionStorage.getItem('goyAdminToken') || '';
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money = value => `$${Number(value || 0).toFixed(2)}`;

  async function api(path, options = {}) {
    const headers = {'Content-Type':'application/json', ...(options.headers || {})};
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const response = await fetch(`${apiBase}${path}`, {...options, headers, cache:'no-store'});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `No se pudo completar la operación (HTTP ${response.status}).`);
    return body;
  }

  async function fileInputDataUrl(input) {
    const file=input?.files?.[0];
    if(!file)return '';
    if(file.size>1_300_000)throw new Error('La foto del paquete es demasiado grande. Usa una imagen menor a 1,3 MB.');
    return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('No se pudo leer la foto del paquete.'));reader.readAsDataURL(file);});
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
    if (value === 'package') {
      return `
        <div class="form-grid two">
          <label>Dirección de retiro<input name="originAddress" required placeholder="Punto de retiro en Quito"></label>
          <label>Dirección de entrega<input name="destinationAddress" required placeholder="Punto de entrega en Quito"></label>
          <label>Persona que recibe<input name="recipient" required placeholder="Nombre del destinatario"></label>
          <label>WhatsApp destinatario<input name="recipientPhone" required placeholder="0991234567"></label>
          <label>Fondo (cm)<input name="depthCm" type="number" min="1" step="0.1" value="30" required></label>
          <label>Ancho (cm)<input name="widthCm" type="number" min="1" step="0.1" value="30" required></label>
          <label>Alto (cm)<input name="heightCm" type="number" min="1" step="0.1" value="30" required></label>
          <label>Peso (kg)<input name="weightKg" type="number" min="0.1" step="0.1" value="10" required></label>
          <label>Valor declarado<input name="productValue" type="number" min="0" max="1000" step="0.01" value="0"></label>
          <label>Foto del paquete<input name="packagePhoto" type="file" accept="image/jpeg,image/png,image/webp"></label>
        </div>
        <label class="check-line"><input name="packagePolicy" type="checkbox" required> Confirmo que no es delicado y su valor no supera $1.000.</label>
        <div class="map-hint">Tarifa: $3,50 hasta 4 km + $0,50/km adicional. Sobre 30×30×30 cm: +$0,50. Peso &gt;10–19 kg: +$0,50; 20–25 kg: +$1. Máximo 45×50×60 cm y 25 kg.</div>
        <div id="packageEstimate" class="map-hint"><strong>Tarifa calculada:</strong> completa cliente, retiro, entrega, medidas y peso.</div>
        <div class="map-hint warning">Si excede las medidas o 25 kg, se creará automáticamente “Servicio de auto · cotización” para revisión del administrador.</div>`;
    }
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
    if (value === 'procedure-scheduled') {
      return `
        <div class="form-grid two">
          <label>Tipo de programación<select name="scheduleType" required><option value="pickup">Retiro programado</option><option value="delivery">Entrega programada</option></select></label>
          <label>Fecha programada<input name="scheduledDate" type="date" required></label>
          <label>Hora programada<input name="scheduledTime" type="time" required></label>
          <label>Lugar del trámite<input name="procedureAddress" required placeholder="Institución o dirección"></label>
          <label>Tiempo estimado (minutos)<input name="waitMinutes" type="number" min="1" value="40"></label>
        </div>
        <label>Detalle del trámite<textarea name="procedureDetail" rows="3" required placeholder="Describe lo que debe realizar el mensajero"></textarea></label>
        <div class="map-hint"><strong>Trámite programado:</strong> el mensajero verá claramente si debe retirar o entregar, junto con la fecha y hora indicadas.</div>`;
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
    if (value === 'custom') {
      return `
        <div class="form-grid two">
          <label>Nombre del servicio<input name="customServiceLabel" required maxlength="80" placeholder="Ej. Apostilla de documentos"></label>
          <label>Tarifa acordada<input name="customServiceCost" type="number" min="0" step="0.01" required placeholder="0.00"></label>
        </div>
        <label>Detalle para el cliente<textarea name="customServiceDetail" rows="4" required maxlength="800" placeholder="Describe el servicio que aparecerá en la app del cliente"></textarea></label>
        <div class="map-hint">Este servicio se vinculará al cliente seleccionado y aparecerá en su app sin actualizar el APK.</div>`;
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
      serviceDetail:String(fd.get('serviceDetail') || '').trim(),
    };
    if (service === 'package') {
      const depthCm=Number(fd.get('depthCm')||0),widthCm=Number(fd.get('widthCm')||0),heightCm=Number(fd.get('heightCm')||0),weightKg=Number(fd.get('weightKg')||0),productValue=Number(fd.get('productValue')||0);
      const vehicleRequired=depthCm>45||widthCm>50||heightCm>60||weightKg>25;
      const packageData={
        ...common,
        kind:vehicleRequired?'diverse':'package',
        courierId:vehicleRequired?'':common.courierId,
        vehicleRequired,
        serviceLabel:vehicleRequired?'Servicio de auto · paquete sobredimensionado':'Retiro y/o entrega de paquetes',
        originAddress:String(fd.get('originAddress')||''),
        destinationAddress:String(fd.get('destinationAddress')||''),
        recipient:String(fd.get('recipient')||''),
        recipientPhone:String(fd.get('recipientPhone')||''),
        depthCm,widthCm,heightCm,weightKg,productValue,
        delicate:false,
        policyAccepted:fd.get('packagePolicy')==='on',
      };
      if(vehicleRequired) packageData.details=`Paquete fuera de límite para moto. Medidas: ${depthCm}×${widthCm}×${heightCm} cm. Peso: ${weightKg} kg. Requiere servicio de auto y cotización administrativa.`;
      return packageData;
    }
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
    if (service === 'procedure-scheduled') {
      return {
        ...common,
        kind:'procedure',
        procedureMode:'scheduled',
        scheduleType:String(fd.get('scheduleType') || 'pickup'),
        scheduledDate:String(fd.get('scheduledDate') || ''),
        scheduledTime:String(fd.get('scheduledTime') || ''),
        procedureAddress:String(fd.get('procedureAddress') || ''),
        destinationAddress:String(fd.get('procedureAddress') || ''),
        procedureDetail:String(fd.get('procedureDetail') || ''),
        waitMinutes:Number(fd.get('waitMinutes') || 40),
        serviceLabel:'Trámites programados',
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
    if (service === 'custom') {
      return {
        ...common,
        customService:true,
        kind:'diverse',
        diverseDetail:String(fd.get('customServiceDetail') || ''),
        serviceLabel:String(fd.get('customServiceLabel') || '').trim(),
        serviceCost:Number(fd.get('customServiceCost') || 0),
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

  function packageEstimatePayload(form) {
    const fd = new FormData(form);
    return {
      estimateOnly:true,
      clientId:String(fd.get('clientId') || ''),
      originAddress:String(fd.get('originAddress') || '').trim(),
      destinationAddress:String(fd.get('destinationAddress') || '').trim(),
      depthCm:Number(fd.get('depthCm') || 0),
      widthCm:Number(fd.get('widthCm') || 0),
      heightCm:Number(fd.get('heightCm') || 0),
      weightKg:Number(fd.get('weightKg') || 0),
      productValue:Number(fd.get('productValue') || 0),
    };
  }

  function schedulePackageEstimate(form) {
    clearTimeout(form._packageEstimateTimer);
    form._packageEstimateTimer = setTimeout(() => refreshPackageEstimate(form), 550);
  }

  async function refreshPackageEstimate(form) {
    const service = String(new FormData(form).get('service') || '');
    const box = form.querySelector('#packageEstimate');
    if (service !== 'package' || !box) return;
    const payload = packageEstimatePayload(form);
    const ready = payload.clientId && payload.originAddress.length >= 4 && payload.destinationAddress.length >= 4 &&
      payload.depthCm > 0 && payload.widthCm > 0 && payload.heightCm > 0 && payload.weightKg > 0;
    if (!ready) {
      box.innerHTML = '<strong>Tarifa calculada:</strong> completa cliente, retiro, entrega, medidas y peso.';
      return;
    }
    box.innerHTML = '<strong>Tarifa calculada:</strong> calculando con Google Maps…';
    try {
      const result = await api('/admin-create-request', {method:'POST', body:JSON.stringify(payload)});
      const pricing = result.pricing || {};
      const route = result.route || {};
      if (pricing.policyError) {
        box.innerHTML = '<strong>Revisar política:</strong> ' + escapeHtml(pricing.policyError);
        return;
      }
      if (pricing.autoRequired) {
        box.innerHTML = '<strong>Requiere servicio de auto.</strong> El paquete supera el máximo permitido para moto. Distancia estimada: ' + escapeHtml(route.distanceKm || pricing.distanceKm || 0) + ' km.';
        return;
      }
      box.innerHTML = '<strong>Total: ' + money(pricing.total) + '</strong> · Distancia: ' + escapeHtml(route.distanceKm || pricing.distanceKm || 0) + ' km · Base/ruta: ' + money(pricing.distanceCost) + ' · Medidas: +' + money(pricing.dimensionSurcharge) + ' · Peso: +' + money(pricing.weightSurcharge);
    } catch (error) {
      box.innerHTML = '<strong>No se pudo calcular todavía:</strong> ' + escapeHtml(error.message || 'Revisa las direcciones.');
    }
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
      const data = await api('/admin/order-options');
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
            <label>Tipo de servicio<select name="service" id="adminServiceSelect" required><option value="package">Retiro y/o entrega de paquetes</option><option value="shipment-scheduled">Entrega programada</option><option value="shipment-express">Envío Express</option><option value="procedure">Trámite ejecutivo</option><option value="procedure-scheduled">Trámites programados</option><option value="deposit-checks">Depósito de cheques</option><option value="deposit-cash">Depósito en efectivo</option><option value="custom">Servicio personalizado</option><option value="diverse">Servicio diverso / cotización</option></select></label>
          </div>
          <div id="adminServiceFields">${serviceFields('package')}</div>
          <label>Detalle para el mensajero<textarea name="serviceDetail" rows="3" maxlength="1200" placeholder="Información específica que el mensajero debe conocer para realizar este servicio"></textarea></label>
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
        const quoteOnly = serviceSelect.value === 'diverse';
        courierSelect.disabled = quoteOnly;
        if (quoteOnly) courierSelect.value = '';
        if (serviceSelect.value === 'package') schedulePackageEstimate(form);
      });
      form.addEventListener('input', event => {
        if (serviceSelect.value !== 'package') return;
        const watched = ['clientId','originAddress','destinationAddress','depthCm','widthCm','heightCm','weightKg','productValue'];
        if (watched.includes(event.target?.name)) schedulePackageEstimate(form);
      });
      form.addEventListener('change', event => {
        if (serviceSelect.value === 'package' && event.target?.name === 'clientId') schedulePackageEstimate(form);
      });
      schedulePackageEstimate(form);

      form.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = $('adminOrderSubmit');
        const message = $('adminOrderMessage');
        message.textContent = '';
        submit.disabled = true;
        submit.textContent = 'Creando…';
        try {
          const payload = buildRequest(form);
          const packagePhotoInput=form.querySelector('input[name="packagePhoto"]');
          if(packagePhotoInput?.files?.[0]) payload.packagePhoto=await fileInputDataUrl(packagePhotoInput);
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
