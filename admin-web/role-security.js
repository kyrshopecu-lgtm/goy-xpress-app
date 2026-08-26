(() => {
  const apiBase = String(window.GOY_ADMIN_CONFIG?.apiBaseUrl || '/api').replace(/\/$/, '');
  const cleanPhone = value => String(value || '').replace(/\D/g, '').replace(/^0/, '593');

  async function assignCourier(code, button) {
    const courier = prompt('Nombre del mensajero asignado:');
    if (!courier || !courier.trim()) return;
    const phone = prompt('WhatsApp del mensajero (opcional, para enviarle el acceso):', '') || '';
    const token = sessionStorage.getItem('goyAdminToken') || '';
    if (!token) {
      alert('Tu sesión administrativa no está activa.');
      return;
    }
    button.disabled = true;
    try {
      const response = await fetch(`${apiBase}/admin/requests/${encodeURIComponent(code)}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
        body: JSON.stringify({status: 'Asignado', courier: courier.trim(), issueCourierAccess: true})
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'No se pudo asignar el mensajero.');
      if (!body.courierAccess) throw new Error('El servidor no generó el acceso del mensajero.');

      const message = [
        'GOY XPRESS - OPERACIÓN ASIGNADA',
        `Solicitud: ${code}`,
        `Mensajero: ${courier.trim()}`,
        '',
        'Acceso exclusivo para la app GOY XPRESS Mensajero:',
        body.courierAccess,
        '',
        'Este acceso permite registrar recogida, GPS, espera, evidencias y finalización. No compartir.'
      ].join('\n');

      const digits = cleanPhone(phone);
      if (digits.length >= 10) {
        window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
      } else {
        await navigator.clipboard?.writeText(message).catch(() => {});
        alert(`${message}\n\nEl mensaje también se intentó copiar al portapapeles.`);
      }
      location.reload();
    } catch (error) {
      alert(error.message || 'No se pudo asignar el mensajero.');
      button.disabled = false;
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-order][data-status="Asignado"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    assignCourier(button.dataset.order, button);
  }, true);
})();
