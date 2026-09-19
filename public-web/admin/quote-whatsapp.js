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

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-quote]');
    if (!button) return;

    // Evita que el manejador antiguo vuelva a abrir los mismos prompts.
    event.preventDefault();
    event.stopImmediatePropagation();

    const code = button.dataset.quote;
    const amount = prompt('Valor de la cotización para este servicio:');
    if (amount === null) return;
    const value = Number(String(amount).replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      alert('Valor inválido');
      return;
    }
    const note = prompt('Detalle de la cotización / condiciones:', '') || '';

    // Se abre durante el gesto del usuario para evitar bloqueo de popups.
    const whatsappWindow = window.open('about:blank', '_blank');
    button.disabled = true;
    try {
      const current = await api('/admin/data');
      const request = (current.requests || []).find(item => item.code === code || item.id === code);

      await api(`/admin/requests/${encodeURIComponent(code)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'Cotizado',
          serviceCost: value,
          reason: 'Cotización personalizada',
          quote: {
            status: 'Cotizado',
            amount: value,
            note,
            quotedAt: new Date().toISOString(),
          },
        }),
      });

      const phone = whatsappNumber(request?.phone || request?.whatsapp || request?.contactPhone);
      const message = [
        'GOY XPRESS - Cotización de servicio',
        `Solicitud: ${code}`,
        `Valor: $${value.toFixed(2)}`,
        note ? `Detalle: ${note}` : '',
        '',
        'La cotización quedó registrada. Ingresa a GOY XPRESS para aceptarla o rechazarla antes de que iniciemos el servicio.',
      ].filter(Boolean).join('\n');

      if (phone.length >= 11) {
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        if (whatsappWindow) whatsappWindow.location.href = url;
        else window.open(url, '_blank', 'noopener');
      } else {
        if (whatsappWindow) whatsappWindow.close();
        alert('La cotización se guardó, pero el cliente no tiene un WhatsApp válido registrado.');
      }
      location.reload();
    } catch (error) {
      if (whatsappWindow) whatsappWindow.close();
      alert(error.message || 'No se pudo cotizar el servicio');
    } finally {
      button.disabled = false;
    }
  }, true);
})();
