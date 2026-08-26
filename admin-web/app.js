(() => {
  const config = window.GOY_ADMIN_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const data = {
    clients: [
      {name:'Tecnología Andina', phone:'+593 99 111 2233', id:'1792456789001', email:'ventas@tecnologiaandina.ec', status:'Activo'},
      {name:'Anime Store EC', phone:'+593 98 765 4321', id:'1723456789', email:'pedidos@animestore.ec', status:'Activo'},
      {name:'María P.', phone:'+593 96 222 3344', id:'1712345678', email:'maria@example.com', status:'Activo'}
    ],
    orders: [
      {id:'GX-1048', client:'Tecnología Andina', service:'Entrega', address:'La Carolina', courier:'Carlos M.', status:'En ruta', value:4.50},
      {id:'GX-1047', client:'Anime Store EC', service:'Trámite', address:'Centro Norte', courier:'Sin asignar', status:'Pendiente', value:6.50},
      {id:'GX-1046', client:'María P.', service:'Entrega', address:'Cumbayá', courier:'Luis A.', status:'Asignado', value:5.00},
      {id:'GX-1045', client:'Tecnología Andina', service:'Entrega', address:'Iñaquito', courier:'Carlos M.', status:'Entregado', value:4.00}
    ],
    couriers: [
      {name:'Carlos M.', phone:'+593 99 300 1001', status:'En ruta', jobs:3},
      {name:'Luis A.', phone:'+593 99 300 1002', status:'Disponible', jobs:1},
      {name:'Andrea V.', phone:'+593 99 300 1003', status:'Disponible', jobs:0}
    ],
    payments: [
      {date:'Hoy 17:40', order:'GX-1045', client:'Tecnología Andina', method:'Efectivo', value:4.00, status:'Cobrado'},
      {date:'Hoy 15:12', order:'GX-1044', client:'Anime Store EC', method:'Transferencia', value:6.50, status:'Cobrado'},
      {date:'Hoy 12:08', order:'GX-1043', client:'María P.', method:'Contra entrega', value:5.00, status:'Pendiente'}
    ]
  };

  const badge = (status) => {
    const map = {'Pendiente':'pending','Asignado':'assigned','En ruta':'route','Entregado':'done','Activo':'active','Cobrado':'done','Disponible':'active'};
    return `<span class="badge ${map[status] || 'assigned'}">${escapeHtml(status)}</span>`;
  };

  const money = (n) => `$${Number(n).toFixed(2)}`;
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function renderDashboard(){
    $('statOrders').textContent = data.orders.length;
    $('statPending').textContent = data.orders.filter(o => o.status === 'Pendiente').length;
    $('statRoute').textContent = data.orders.filter(o => o.status === 'En ruta').length;
    $('statRevenue').textContent = money(data.payments.filter(p => p.status === 'Cobrado').reduce((s,p) => s+p.value,0));
    $('recentOrders').innerHTML = data.orders.slice(0,5).map(o => `<tr><td>${escapeHtml(o.id)}</td><td>${escapeHtml(o.client)}</td><td>${escapeHtml(o.service)}</td><td>${badge(o.status)}</td><td>${money(o.value)}</td></tr>`).join('');
    $('reportSummary').textContent = `${data.orders.length} solicitudes · ${data.clients.length} clientes · ${data.couriers.length} mensajeros`;
  }

  function renderClients(query=''){
    const q = query.trim().toLowerCase();
    const rows = data.clients.filter(c => !q || [c.name,c.phone,c.id,c.email].some(v => v.toLowerCase().includes(q)));
    $('clientsBody').innerHTML = rows.map(c => `<tr><td><strong>${escapeHtml(c.name)}</strong></td><td>${escapeHtml(c.phone)}</td><td>${escapeHtml(c.id)}</td><td>${escapeHtml(c.email)}</td><td>${badge(c.status)}</td></tr>`).join('');
  }

  function renderOrders(filter='all'){
    const rows = data.orders.filter(o => filter === 'all' || o.status === filter);
    $('ordersBody').innerHTML = rows.map(o => `<tr><td><strong>${escapeHtml(o.id)}</strong></td><td>${escapeHtml(o.client)}</td><td>${escapeHtml(o.service)}</td><td>${escapeHtml(o.address)}</td><td>${escapeHtml(o.courier)}</td><td>${badge(o.status)}</td><td>${money(o.value)}</td></tr>`).join('');
  }

  function renderCouriers(){
    $('courierCards').innerHTML = data.couriers.map(c => `<article class="courier-card"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.phone)}</small><p>${badge(c.status)}</p><small>${c.jobs} solicitud(es) asignada(s)</small></article>`).join('');
  }

  function renderPayments(){
    $('paymentsBody').innerHTML = data.payments.map(p => `<tr><td>${escapeHtml(p.date)}</td><td>${escapeHtml(p.order)}</td><td>${escapeHtml(p.client)}</td><td>${escapeHtml(p.method)}</td><td>${money(p.value)}</td><td>${badge(p.status)}</td></tr>`).join('');
  }

  function showView(view){
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    document.querySelectorAll('.nav-item').forEach(v => v.classList.toggle('active', v.dataset.view === view));
    const el = $(view); if(el) el.classList.add('active-view');
    const title = {dashboard:'Dashboard',clients:'Clientes',orders:'Solicitudes',couriers:'Mensajeros',payments:'Cobros',invites:'Invitaciones',reports:'Reportes'}[view] || 'GOY XPRESS';
    $('pageTitle').textContent = title;
    if(innerWidth < 760) scrollTo({top:0,behavior:'smooth'});
  }

  async function authenticate(email,password){
    if(config.mode === 'api' && config.apiBaseUrl){
      const response = await fetch(`${config.apiBaseUrl.replace(/\/$/,'')}/admin/login`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
      if(!response.ok) throw new Error('Usuario o contraseña incorrectos');
      const result = await response.json();
      sessionStorage.setItem('goyAdminToken', result.token || 'authenticated');
      return;
    }
    if(email === config.demoAdmin?.email && password === config.demoAdmin?.password){
      sessionStorage.setItem('goyAdminToken','demo');
      return;
    }
    throw new Error('Credenciales de demostración incorrectas');
  }

  function enterApp(){
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    renderDashboard(); renderClients(); renderOrders(); renderCouriers(); renderPayments();
  }

  $('today').textContent = new Intl.DateTimeFormat('es-EC',{dateStyle:'full'}).format(new Date());
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); $('loginMessage').textContent = '';
    try{ await authenticate($('email').value.trim(), $('password').value); enterApp(); }
    catch(err){ $('loginMessage').textContent = err.message || 'No se pudo iniciar sesión'; }
  });

  $('logoutBtn').addEventListener('click',()=>{sessionStorage.removeItem('goyAdminToken'); location.reload();});
  $('nav').addEventListener('click',(e)=>{const b=e.target.closest('[data-view]');if(b)showView(b.dataset.view);});
  document.addEventListener('click',(e)=>{const b=e.target.closest('[data-go]');if(b)showView(b.dataset.go);});
  $('clientSearch').addEventListener('input',(e)=>renderClients(e.target.value));
  $('orderFilter').addEventListener('change',(e)=>renderOrders(e.target.value));

  $('inviteForm').addEventListener('submit',(e)=>{
    e.preventDefault();
    const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`.toUpperCase();
    const base = (config.registrationBaseUrl || 'https://goyxpress.com/registro').replace(/\/$/,'');
    $('inviteLink').value = `${base}/${token}`;
    $('inviteResult').classList.remove('hidden');
  });
  $('copyInvite').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('inviteLink').value);$('copyInvite').textContent='Copiado';setTimeout(()=>$('copyInvite').textContent='Copiar',1300);}catch{ $('inviteLink').select(); }});

  $('downloadCsv').addEventListener('click',()=>{
    const header=['Solicitud','Cliente','Servicio','Dirección','Mensajero','Estado','Valor'];
    const rows=data.orders.map(o=>[o.id,o.client,o.service,o.address,o.courier,o.status,o.value.toFixed(2)]);
    const csv=[header,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download='goy-xpress-solicitudes.csv';a.click();URL.revokeObjectURL(url);
  });

  if(sessionStorage.getItem('goyAdminToken')) enterApp();
})();
