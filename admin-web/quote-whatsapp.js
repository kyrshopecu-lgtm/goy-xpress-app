(() => {
  const config = window.GOY_ADMIN_CONFIG || {};
  const apiBase = String(config.apiBaseUrl || '').replace(/\/$/, '');

  function adminToken() {
    return sessionStorage.getItem('goyAdminToken') || '';
  }

  async function api(path, options = {}) {
    const headers = {'Content-Type': 'application/json', ...(options.headers || {})};
    if (adminToken()) headers.Authorization = `Bearer ${adminToken()}`;
    const response = await fetch(`${apiBase}${path}`, {...options, headers});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'No se pudo completar la operación');
    return body;
  }

  function whatsappNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('593') && digits.length >= 11) return digits;
    if (digits.startsWith('0') && digits.length === 10) return `593${digits.slice(1)}`;
    if (digits.length === 9) return `593${digits}`;
    return digits;
  }

  function closeModal() {
    document.getElementById('diverseReviewModal')?.remove();
  }

  function field(label, name, type = 'text') {
    const wrap = document.createElement('label');
    wrap.textContent = label;
    const input = type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    input.name = name;
    if (type !== 'textarea') input.type = type;
    if (type === 'textarea') input.rows = 4;
    wrap.appendChild(input);
    return {wrap, input};
  }

  function openReviewModal(request, code) {
    closeModal();

    const overlay = document.createElement('div');
    overlay.id = 'diverseReviewModal';
    overlay.className = 'modal-overlay';

    const modal = document.createElement('section');
    modal.className = 'modern-modal';

    const head = document.createElement('div');
    head.className = 'modal-head';
    head.innerHTML = '<div><span class="eyebrow">Servicio diverso</span><h3>Revisar antes de confirmar</h3><p>Edita la solicitud, define la cotización y envía el resumen al cliente por WhatsApp para que confirme si procede.</p></div>';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'modal-close';
    close.textContent = '×';
    close.onclick = closeModal;
    head.appendChild(close);

    const form = document.createElement('form');
    form.className = 'admin-order-form';

    const service = field('Nombre del servicio', 'serviceLabel');
    const details = field('Detalle del servicio', 'details', 'textarea');
    const origin = field('Lugar de retiro / origen (opcional)', 'originAddress');
    const destination = field('Lugar de entrega / destino (opcional)', 'destinationAddress');
    const amount = field('Valor de la cotización', 'amount', 'number');
    amount.input.step = '0.01';
    amount.input.min = '0.01';
    const note = field('Condiciones / observaciones para el cliente', 'note', 'textarea');
    const stopEditors = [];
    const stopsBox = document.createElement('div');
    if (Array.isArray(request.stops) && request.stops.length) {
      const title = document.createElement('h4');
      title.textContent = 'Direcciones / paradas del servicio';
      stopsBox.appendChild(title);
      request.stops.forEach((stop,index)=>{
        const box=document.createElement('div');
        box.className='panel';
        box.style.margin='10px 0';
        const address=field(`Dirección ${index+1}`,'stopAddress');
        const type=field('Tipo de servicio','stopType');
        const description=field('Qué debe realizarse aquí','stopDescription','textarea');
        address.input.value=stop.address||'';
        type.input.value=stop.serviceType||'Otro';
        description.input.value=stop.description||'';
        box.append(address.wrap,type.wrap,description.wrap);
        stopsBox.appendChild(box);
        stopEditors.push({address:address.input,type:type.input,description:description.input});
      });
    }

    service.input.value = request.serviceLabel || 'Servicio diverso';
    details.input.value = request.details || request.diverseDetail || '';
    origin.input.value = request.originAddress || request.pickupAddress || '';
    destination.input.value = request.destinationAddress || request.deliveryAddress || request.address || '';
    amount.input.value = Number(request.quote?.amount || request.serviceCost || 0) > 0 ? Number(request.quote?.amount || request.serviceCost).toFixed(2) : '';
    note.input.value = request.quote?.note || '';

    const grid1 = document.createElement('div');
    grid1.className = 'form-grid two';
    grid1.append(service.wrap, amount.wrap);

    const grid2 = document.createElement('div');
    grid2.className = 'form-grid two';
    grid2.append(origin.wrap, destination.wrap);

    const info = document.createElement('div');
    info.className = 'map-hint';
    info.textContent = 'La solicitud seguirá en estado Cotizado hasta que el cliente confirme. No se podrá asignar mensajero antes de la aceptación.';

    const message = document.createElement('p');
    message.className = 'form-message';

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'ghost';
    cancel.textContent = 'Cancelar';
    cancel.onclick = closeModal;
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'primary action-primary';
    submit.textContent = 'Guardar y enviar WhatsApp';
    actions.append(cancel, submit);

    form.append(grid1, details.wrap, grid2);
    if (stopEditors.length) form.append(stopsBox);
    form.append(note.wrap, info, message, actions);
    modal.append(head, form);
    overlay.appendChild(modal);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeModal(); });
    document.body.appendChild(overlay);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      message.textContent = '';
      const value = Number(String(amount.input.value).replace(',', '.'));
      if (!service.input.value.trim()) {
        message.textContent = 'Escribe el nombre del servicio.';
        return;
      }
      if (details.input.value.trim().length < 5) {
        message.textContent = 'Completa el detalle del servicio.';
        return;
      }
      if (!Number.isFinite(value) || value <= 0) {
        message.textContent = 'Ingresa un valor válido para la cotización.';
        return;
      }

      // Abrir durante el gesto del usuario evita que el navegador bloquee WhatsApp.
      const whatsappWindow = window.open('about:blank', '_blank');
      submit.disabled = true;
      submit.textContent = 'Guardando…';

      try {
        const quotedAt = new Date().toISOString();
        const patch = {
          status: 'Cotizado',
          serviceLabel: service.input.value.trim(),
          details: details.input.value.trim(),
          diverseDetail: details.input.value.trim(),
          originAddress: origin.input.value.trim(),
          destinationAddress: destination.input.value.trim(),
          ...(stopEditors.length ? {stops:stopEditors.map((editor,index)=>({
            order:index+1,
            address:editor.address.value.trim(),
            serviceType:editor.type.value.trim()||'Otro',
            description:editor.description.value.trim(),
          })).filter(stop=>stop.address)} : {}),
          serviceCost: value,
          reason: 'Cotización de servicio diverso revisada por administración',
          quote: {
            status: 'Cotizado',
            amount: value,
            note: note.input.value.trim(),
            quotedAt,
            confirmationStatus: 'Pendiente',
            confirmationChannel: 'WhatsApp',
            summarySentAt: quotedAt,
          },
        };

        await api(`/admin/requests/${encodeURIComponent(code)}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });

        const phone = whatsappNumber(request?.phone || request?.whatsapp || request?.contactPhone || request?.customerPhone);
        const lines = [
          'GOY XPRESS - CONFIRMACIÓN DE SERVICIO',
          '',
          `Solicitud: ${code}`,
          `Servicio: ${patch.serviceLabel}`,
          `Detalle: ${patch.details}`,
          patch.originAddress ? `Origen / retiro: ${patch.originAddress}` : '',
          patch.destinationAddress ? `Destino / entrega: ${patch.destinationAddress}` : '',
          ...(Array.isArray(patch.stops) ? patch.stops.map(stop=>`Parada ${stop.order}: ${stop.serviceType} · ${stop.address} · ${stop.description}`) : []),
          `Valor: ${value.toFixed(2)}`,
          patch.quote.note ? `Condiciones: ${patch.quote.note}` : '',
          '',
          'Por favor confirma si deseas que GOY XPRESS proceda con este servicio.',
          'Responde: CONFIRMO para proceder o NO PROCEDE para cancelar.',
          'También puedes aceptar o rechazar la cotización desde la app GOY XPRESS.',
        ].filter(Boolean);

        if (phone.length >= 11) {
          const url = `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
          if (whatsappWindow) whatsappWindow.location.href = url;
          else window.open(url, '_blank', 'noopener');
        } else {
          if (whatsappWindow) whatsappWindow.close();
          alert('La solicitud fue guardada como cotizada, pero el cliente no tiene un WhatsApp válido registrado.');
        }

        closeModal();
        location.reload();
      } catch (error) {
        if (whatsappWindow) whatsappWindow.close();
        message.textContent = error.message || 'No se pudo guardar la cotización.';
        submit.disabled = false;
        submit.textContent = 'Guardar y enviar WhatsApp';
      }
    });
  }

  async function loadRequest(code) {
    const current = await api('/admin/data');
    const request = (current.requests || []).find(item => item.code === code || item.id === code);
    if (!request) return null;
    const client = (current.clients || []).find(item =>
      String(item.id || item.userId || '') === String(request.clientId || '')
    );
    return {
      ...request,
      customerPhone: request.customerPhone || request.phone || request.whatsapp || request.contactPhone || client?.whatsapp || client?.phone || '',
    };
  }

  async function registerDecision(code, decision, button) {
    const accepted = decision === 'accepted';
    const question = accepted
      ? '¿Confirmas que el cliente respondió por WhatsApp que SÍ desea proceder?'
      : '¿Confirmas que el cliente indicó por WhatsApp que NO desea proceder?';
    if (!confirm(question)) return;

    button.disabled = true;
    try {
      const now = new Date().toISOString();
      await api(`/admin/requests/${encodeURIComponent(code)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: accepted ? 'Aceptado' : 'Cancelado',
          quote: accepted
            ? {status:'Aceptado', acceptedAt:now, confirmationStatus:'Confirmado', confirmationChannel:'WhatsApp', confirmedAt:now}
            : {status:'Rechazado', rejectedAt:now, confirmationStatus:'No procede', confirmationChannel:'WhatsApp', confirmedAt:now},
        }),
      });
      location.reload();
    } catch (error) {
      alert(error.message || 'No se pudo registrar la respuesta del cliente.');
      button.disabled = false;
    }
  }

  document.addEventListener('click', async event => {
    const decisionButton = event.target.closest('[data-quote-decision]');
    if (decisionButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      await registerDecision(decisionButton.dataset.quoteOrder, decisionButton.dataset.quoteDecision, decisionButton);
      return;
    }

    const button = event.target.closest('[data-quote]');
    if (!button) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    button.disabled = true;
    try {
      const request = await loadRequest(button.dataset.quote);
      if (!request) throw new Error('No se encontró la solicitud.');
      openReviewModal(request, button.dataset.quote);
    } catch (error) {
      alert(error.message || 'No se pudo cargar la solicitud.');
    } finally {
      button.disabled = false;
    }
  }, true);
})();
