(() => {
  const config = window.GOY_ADMIN_CONFIG || {};
  const $ = id => document.getElementById(id);
  const apiBase = String(config.apiBaseUrl || '').replace(/\/$/, '');

  const data = {clients: [], orders: [], couriers: [], payments: []};
  const statusMap = {
    pending: 'Pendiente', assigned: 'Asignado', onRoute: 'En ruta', finished: 'Entregado', cancelled: 'Cancelado',
    Pendiente: 'Pendiente', Asignado: 'Asignado', 'En ruta': 'En ruta', Entregado: 'Entregado', Cancelado: 'Cancelado'
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money = value => `$${Number(value || 0).toFixed(2)}`;
  const normalizedStatus = value => statusMap[value] || value || 'Pendiente';
  const badge = status => {
    const s = normalizedStatus(status);
    const map = {'Pendiente':'pending','Asignado':'assigned','En ruta':'route','Entregado':'done','Cancelado':'pending','Activo':'active','Cobrado':'done','Disponible':'active'};
    return `<span class="badge ${map[s] || 'assigned'}">${escapeHtml(s)}</span>`;
  };

  function token(){ return sessionStorage.getItem('goyAdminToken') || ''; }

  async function api(path, options = {}) {
    if (!apiBase) throw new Error('La URL de la API no está configurada');
    const headers = {'Content-Type': 'application/json', ...(options.headers || {})};
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const response = await fetch(`${apiBase}${path}`, {...options, headers});
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) {
      if (response.status === 401 && path !== '/admin/login') {
        sessionStorage.removeItem('goyAdminToken');
        throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
      }
      throw new Error(body.error || 'No se pudo completar la operación');
    }
    return body;
  }

  function mapClient(c){
    return {
      name: c.name || c.businessName || '-',
      phone: c.whatsapp || c.phone || c.contactPhone || '-',
      id: c.documentId || c.id || '-',
      email: c.email || '-',
      status: c.status || 'Activo'
    };
  }

  function mapOrder(o){
    return {
      id: o.code || o.id || '-',
      client: o.customer || o.businessName || o.client || '-',
      service: o.kind === 'procedure' ? 'Trámite' : o.kind === 'shipment' ? 'Entrega' : o.kind === 'officePickup' ? 'Retiro oficina' : o.kind === 'partner' ? 'Plan inicial' : (o.service || o.kind || 'Servicio'),
      address: o.destinationAddress || o.pickupAddress || o.address || '-',
      courier: o.courier || 'Sin asignar',
      status: normalizedStatus(o.status),
      value: Number(o.serviceCost ?? o.value ?? 0)
    };
  }

  function mapCourier(c){
    return {name:c.name || c.fullName || '-', phone:c.phone || c.whatsapp || '-', status:c.status || 'Disponible', jobs:Number(c.jobs || 0)};
  }

  function mapPayment(p){
    return {
      date: p.date || p.createdAt || '-', order:p.order || p.requestCode || '-', client:p.client || '-', method:p.method || '-',
      value:Number(p.value || p.amount || 0), status:p.status || 'Pendiente'
    };
  }

  async function loadData(){
    const result = await api('/admin/data');
    data.clients = (result.clients || []).map(mapClient);
    data.orders = (result.requests || []).map(mapOrder);
    data.couriers = (result.couriers || []).map(mapCourier);
    data.payments = (result.payments || []).map(mapPayment);
    renderAll();
  }

  function renderDashboard(){
    $('statOrders').textContent = data.orders.length;
    $('statPending').textContent = data.orders.filter(o => o.status === 'Pendiente').length;
    $('statRoute').textContent = data.orders.filter(o => o.status === 'En ruta').length;
    $('statRevenue').textContent = money(data.payments.filter(p => p.status === 'Cobrado').reduce((s,p) => s+p.value,0));
    $('recentOrders').innerHTML = data.orders.slice(0,5).map(o => `<tr><td>${escapeHtml(o.id)}</td><td>${escapeHtml(o.client)}</td><td>${escapeHtml(o.service)}</td><td>${badge(o.status)}</td><td>${money(o.value)}</td></tr>`).join('') || '<tr><td colspan="5">Aún no hay solicitudes registradas.</td></tr>';
    $('reportSummary').textContent = `${data.orders.length} solicitudes · ${data.clients.length} clientes · ${data.couriers.length} mensajeros`;
  }

  function renderClients(query=''){
    const q = query.trim().toLowerCase();
    const rows = data.clients.filter(c => !q || [c.name,c.phone,c.id,c.email].some(v => String(v).toLowerCase().includes(q)));
    $('clientsBody').innerHTML = rows.map(c => `<tr><td><strong>${escapeHtml(c.name)}</strong></td><td>${escapeHtml(c.phone)}</td><td>${escapeHtml(c.id)}</td><td>${escapeHtml(c.email)}</td><td>${badge(c.status)}</td></tr>`).join('') || '<tr><td colspan="5">No hay clientes.</td></tr>';
  }

  function actionButtons(order){
    const id = escapeHtml(order.id);
    if (order.status === 'Pendiente') {
      return `<div class="order-actions"><button data-order="${id}" data-status="Asignado">Asignar</button><button data-order="${id}" data-status="Cancelado">Cancelar</button></div>`;
    }
    if (order.status === 'Asignado') {
      return `<div class="order-actions"><button data-order="${id}" data-status="En ruta">Iniciar ruta</button><button data-order="${id}" data-status="Cancelado">Cancelar</button></div>`;
    }
    if (order.status === 'En ruta') {
      return `<div class="order-actions"><button data-order="${id}" data-status="Entregado">Entregado</button></div>`;
    }
    return '<span class="muted">Sin acciones</span>';
  }

  function renderOrders(filter='all'){
    const rows = data.orders.filter(o => filter === 'all' || o.status === filter);
    $('ordersBody').innerHTML = rows.map(o => `<tr><td><strong>${escapeHtml(o.id)}</strong></td><td>${escapeHtml(o.client)}</td><td>${escapeHtml(o.service)}</td><td>${escapeHtml(o.address)}</td><td>${escapeHtml(o.courier)}</td><td>${badge(o.status)}</td><td>${money(o.value)}</td><td>${actionButtons(o)}</td></tr>`).join('') || '<tr><td colspan="8">No hay solicitudes en este estado.</td></tr>';
  }

  function renderCouriers(){
    $('courierCards').innerHTML = data.couriers.map(c => `<article class="courier-card"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.phone)}</small><p>${badge(c.status)}</p><small>${c.jobs} solicitud(es) asignada(s)</small></article>`).join('') || '<p>Aún no hay mensajeros registrados.</p>';
  }

  function renderPayments(){
    $('paymentsBody').innerHTML = data.payments.map(p => `<tr><td>${escapeHtml(p.date)}</td><td>${escapeHtml(p.order)}</td><td>${escapeHtml(p.client)}</td><td>${escapeHtml(p.method)}</td><td>${money(p.value)}</td><td>${badge(p.status)}</td></tr>`).join('') || '<tr><td colspan="6">Aún no hay cobros registrados.</td></tr>';
  }

  function renderAll(){ renderDashboard(); renderClients(); renderOrders($('orderFilter')?.value || 'all'); renderCouriers(); renderPayments(); }

  function showView(view){
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    document.querySelectorAll('.nav-item').forEach(v => v.classList.toggle('active', v.dataset.view === view));
    const el = $(view); if(el) el.classList.add('active-view');
    const title = {dashboard:'Dashboard',clients:'Clientes',orders:'Solicitudes',couriers:'Mensajeros',payments:'Cobros',invites:'Invitaciones',reports:'Reportes'}[view] || 'GOY XPRESS';
    $('pageTitle').textContent = title;
    if(innerWidth < 760) scrollTo({top:0,behavior:'smooth'});
  }

  async function authenticate(email,password){
    const result = await api('/admin/login', {method:'POST', body:JSON.stringify({email,password})});
    if (!result.token) throw new Error('El servidor no devolvió una sesión válida');
    sessionStorage.setItem('goyAdminToken', result.token);
  }

  async function enterApp(){
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    try { await loadData(); }
    catch(err){
      sessionStorage.removeItem('goyAdminToken');
      $('appView').classList.add('hidden');
      $('loginView').classList.remove('hidden');
      $('loginMessage').textContent = err.message || 'No se pudieron cargar los datos';
    }
  }

  async function updateOrderStatus(code, status, button){
    if (button) button.disabled = true;
    try {
      await api(`/admin/requests/${encodeURIComponent(code)}`, {method:'PATCH', body:JSON.stringify({status})});
      await loadData();
    } catch(err) {
      alert(err.message || 'No se pudo actualizar la solicitud');
    } finally {
      if (button) button.disabled = false;
    }
  }

  $('today').textContent = new Intl.DateTimeFormat('es-EC',{dateStyle:'full'}).format(new Date());
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault(); $('loginMessage').textContent = '';
    try { await authenticate($('email').value.trim(), $('password').value); await enterApp(); }
    catch(err){ $('loginMessage').textContent = err.message || 'No se pudo iniciar sesión'; }
  });

  $('logoutBtn').addEventListener('click',()=>{sessionStorage.removeItem('goyAdminToken'); location.reload();});
  $('nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)showView(b.dataset.view);});
  document.addEventListener('click',e=>{
    const go = e.target.closest('[data-go]');
    if(go){ showView(go.dataset.go); return; }
    const statusButton = e.target.closest('[data-order][data-status]');
    if(statusButton) updateOrderStatus(statusButton.dataset.order, statusButton.dataset.status, statusButton);
  });
  $('clientSearch').addEventListener('input',e=>renderClients(e.target.value));
  $('orderFilter').addEventListener('change',e=>renderOrders(e.target.value));

  $('inviteForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const label = $('inviteName').value.trim() || 'Invitación GOY XPRESS';
      const invite = await api('/admin/invites', {method:'POST', body:JSON.stringify({label})});
      const base = String(config.registrationBaseUrl || '').replace(/\/$/, '');
      $('inviteLink').value = `${base}/${encodeURIComponent(invite.token)}`;
      $('inviteResult').classList.remove('hidden');
    } catch(err) { alert(err.message || 'No se pudo crear la invitación'); }
  });

  $('copyInvite').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('inviteLink').value);$('copyInvite').textContent='Copiado';setTimeout(()=>$('copyInvite').textContent='Copiar',1300);}catch{$('inviteLink').select();}});

  $('downloadCsv').addEventListener('click',()=>{
    const header=['Solicitud','Cliente','Servicio','Dirección','Mensajero','Estado','Valor'];
    const rows=data.orders.map(o=>[o.id,o.client,o.service,o.address,o.courier,o.status,o.value.toFixed(2)]);
    const csv=[header,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download='goy-xpress-solicitudes.csv';a.click();URL.revokeObjectURL(url);
  });

  if(token()) enterApp();
})();
