(() => {
  const apiBase = String(window.GOY_ADMIN_CONFIG?.apiBaseUrl || '/api').replace(/\/$/, '');
  const token = () => sessionStorage.getItem('goyAdminToken') || '';
  const tbody = document.getElementById('clientsBody');
  if (!tbody) return;

  let clients = [];
  let loading = false;

  const clean = value => String(value || '').trim().toLowerCase();
  const digits = value => String(value || '').replace(/\D/g, '');

  function ensureStyles() {
    if (document.getElementById('goy-client-location-styles')) return;
    const style = document.createElement('style');
    style.id = 'goy-client-location-styles';
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

  function mapsInfo(client) {
    const location = client?.location || client?.gpsLocation || client?.coordinates || {};
    const latitude = Number(location.latitude ?? location.lat);
    const longitude = Number(location.longitude ?? location.lng ?? location.lon);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return {
        exact:true,
        label:'GPS exacto',
        url:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`,
      };
    }
    const address = String(client?.address || '').trim();
    if (address) {
      return {
        exact:false,
        label:'Ver en Maps',
        url:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
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
      const response = await fetch(`${apiBase}/admin/data`, {
        headers:{Authorization:`Bearer ${token()}`},
      });
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
