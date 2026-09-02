(() => {
  const config = window.GOY_ADMIN_CONFIG || {};
  const $ = id => document.getElementById(id);
  const apiBase = String(config.apiBaseUrl || '').replace(/\/$/, '');
  const data = {clients:[],orders:[],couriers:[],payments:[],activeCycle:'',availableCycles:[]};

  const statusMap = {pending:'Pendiente',quoted:'Cotizado',accepted:'Aceptado',assigned:'Asignado',pickedUp:'Recogido',onRoute:'En camino',finished:'Entrega finalizada',cancelled:'Cancelado','En ruta':'En camino',Entregado:'Entrega finalizada',Finalizado:'Entrega finalizada'};
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money = value => `$${Number(value || 0).toFixed(2)}`;
  const normalizedStatus = value => statusMap[value] || value || 'Pendiente';
  const badge = status => {
    const s=normalizedStatus(status);
    const map={'Pendiente':'pending','Cotizado':'assigned','Aceptado':'active','Asignado':'assigned','Recogido':'assigned','En camino':'route','Entrega finalizada':'done','Cancelado':'pending','Activo':'active','Cobrado':'done','Disponible':'active'};
    return `<span class="badge ${map[s]||'assigned'}">${escapeHtml(s)}</span>`;
  };

  function token(){return sessionStorage.getItem('goyAdminToken')||'';}
  async function api(path,options={}){
    if(!apiBase) throw new Error('La URL de la API no está configurada');
    const {timeoutMs=15000,...requestOptions}=options;
    const headers={'Content-Type':'application/json',...(requestOptions.headers||{})};
    if(token()) headers.Authorization=`Bearer ${token()}`;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(`${apiBase}${path}`,{...requestOptions,headers,signal:controller.signal});
      let body={}; try{body=await response.json();}catch{}
      if(!response.ok){
        if(response.status===401&&path!=='/admin/login'){sessionStorage.removeItem('goyAdminToken');throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');}
        throw new Error(body.error||'No se pudo completar la operación');
      }
      return body;
    }catch(error){
      if(error?.name==='AbortError')throw new Error('El servidor tardó demasiado en responder. Intenta nuevamente.');
      throw error;
    }finally{
      clearTimeout(timeout);
    }
  }

  function mapClient(c){return{name:c.name||c.businessName||'-',phone:c.whatsapp||c.phone||c.contactPhone||'-',id:c.documentId||c.id||'-',email:c.email||'-',status:c.status||'Activo'};}
  function serviceName(o){
    if(o.serviceLabel) return o.serviceLabel;
    return {procedure:'Trámite ejecutivo',shipment:o.deliveryMode==='express'?'Envío Express':'Envío programado',deposit:'Depósito',diverse:'Servicios diversos',office_pickup:'Retiro oficina',partner:'Plan inicial'}[o.kind]||o.service||o.kind||'Servicio';
  }
  function mapOrder(o){return{
    raw:o,id:o.code||o.id||'-',client:o.customer||o.businessName||o.client||'-',service:serviceName(o),address:o.destinationAddress||o.pickupAddress||o.address||'-',courier:o.courier||'Sin asignar',status:normalizedStatus(o.status),value:Number(o.serviceCost??o.value??0),cycleKey:o.cycleKey||'',wait:o.wait||{},quote:o.quote||{},wallet:o.wallet||{},gps:o.gps||{},evidence:o.evidence||{},tariffAdjustment:o.tariffAdjustment||null
  };}
  function mapCourier(c){return{name:c.name||c.fullName||'-',phone:c.phone||c.whatsapp||'-',status:c.status||'Disponible',jobs:Number(c.jobs||0)};}
  function mapPayment(p){return{date:p.date||p.createdAt||'-',order:p.order||p.requestCode||'-',client:p.client||'-',method:p.method||'-',value:Number(p.value||p.amount||0),status:p.status||'Pendiente'};}

  async function loadData(cycle=data.activeCycle){
    const suffix=cycle?`?cycle=${encodeURIComponent(cycle)}`:'';
    const result=await api(`/admin/data${suffix}`);
    data.clients=(result.clients||[]).map(mapClient); data.orders=(result.requests||[]).map(mapOrder); data.couriers=(result.couriers||[]).map(mapCourier); data.payments=(result.payments||[]).map(mapPayment);
    data.activeCycle=result.activeCycle||cycle||''; data.availableCycles=result.availableCycles||[];
    renderAll(); renderReportControls();
    window.dispatchEvent(new CustomEvent('goy:admin-data',{detail:result}));
  }

  function renderDashboard(){
    $('statOrders').textContent=data.orders.length;
    $('statPending').textContent=data.orders.filter(o=>['Pendiente','Cotizado','Aceptado','Asignado','Recogido'].includes(o.status)).length;
    $('statRoute').textContent=data.orders.filter(o=>o.status==='En camino').length;
    $('statRevenue').textContent=money(data.orders.filter(o=>o.wallet?.released).reduce((s,o)=>s+Number(o.wallet?.depositedAmount||0),0));
    $('recentOrders').innerHTML=data.orders.slice(0,5).map(o=>`<tr><td>${escapeHtml(o.id)}</td><td>${escapeHtml(o.client)}</td><td>${escapeHtml(o.service)}</td><td>${badge(o.status)}</td><td>${money(o.value)}</td></tr>`).join('')||'<tr><td colspan="5">Aún no hay solicitudes registradas.</td></tr>';
    $('reportSummary').textContent=`Período ${data.activeCycle||'-'} · ${data.orders.length} solicitudes · ${data.clients.length} clientes`;
  }
  function renderClients(query=''){
    const q=query.trim().toLowerCase(); const rows=data.clients.filter(c=>!q||[c.name,c.phone,c.id,c.email].some(v=>String(v).toLowerCase().includes(q)));
    $('clientsBody').innerHTML=rows.map(c=>`<tr><td data-client-field="name"><strong>${escapeHtml(c.name)}</strong></td><td data-client-field="phone">${escapeHtml(c.phone)}</td><td data-client-field="document">${escapeHtml(c.id)}</td><td data-client-field="email">${escapeHtml(c.email)}</td><td data-client-field="status">${badge(c.status)}</td></tr>`).join('')||'<tr><td colspan="5">No hay clientes.</td></tr>';
  }

  function actionButtons(o){
    const id=escapeHtml(o.id); const buttons=[];
    if(o.status==='Pendiente') buttons.push(`<button data-order="${id}" data-status="Asignado">Asignar</button>`);
    if(o.status==='Asignado') buttons.push(`<button data-order="${id}" data-status="Recogido">Recogido</button>`);
    if(o.status==='Recogido') buttons.push(`<button data-order="${id}" data-status="En camino">En camino</button>`);
    if(o.status==='En camino') buttons.push(`<button data-order="${id}" data-status="Entrega finalizada">Finalizar</button>`);
    if(!['Entrega finalizada','Cancelado'].includes(o.status)) buttons.push(`<button data-manage="${id}">Gestionar</button>`);
    if(o.raw.kind==='diverse' && ['Pendiente','Cotizado'].includes(o.status)) buttons.push(`<button data-quote="${id}">Cotizar</button>`);
    if(o.gps?.last) buttons.push(`<button data-gps="${id}">GPS</button>`);
    if(o.wallet?.depositPhoto && !o.wallet?.released) buttons.push(`<button data-release="${id}">Liberar cartera</button>`);
    if(!['Entrega finalizada','Cancelado'].includes(o.status)) buttons.push(`<button data-order="${id}" data-status="Cancelado">Cancelar</button>`);
    return `<div class="order-actions">${buttons.join('')}</div>`;
  }

  function renderOrders(filter='all'){
    const rows=data.orders.filter(o=>filter==='all'||o.status===filter);
    $('ordersBody').innerHTML=rows.map(o=>`<tr><td><strong>${escapeHtml(o.id)}</strong><br><small>${escapeHtml(o.cycleKey)}</small></td><td>${escapeHtml(o.client)}</td><td>${escapeHtml(o.service)}${o.wait?.extraMinutes?`<br><small>Espera +${o.wait.extraMinutes} min (${money(o.wait.extraCost)})</small>`:''}</td><td>${escapeHtml(o.address)}</td><td>${escapeHtml(o.courier)}</td><td>${badge(o.status)}</td><td>${money(o.value)}</td><td>${actionButtons(o)}</td></tr>`).join('')||'<tr><td colspan="8">No hay solicitudes en este estado.</td></tr>';
  }
  function renderCouriers(){ $('courierCards').innerHTML=data.couriers.map(c=>`<article class="courier-card"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.phone)}</small><p>${badge(c.status)}</p><small>${c.jobs} solicitud(es) asignada(s)</small></article>`).join('')||'<p>Aún no hay mensajeros registrados.</p>'; }
  function renderPayments(){ $('paymentsBody').innerHTML=data.payments.map(p=>`<tr><td>${escapeHtml(p.date)}</td><td>${escapeHtml(p.order)}</td><td>${escapeHtml(p.client)}</td><td>${escapeHtml(p.method)}</td><td>${money(p.value)}</td><td>${badge(p.status)}</td></tr>`).join('')||'<tr><td colspan="6">Aún no hay cobros registrados.</td></tr>'; }
  function renderAll(){renderDashboard();renderClients();renderOrders($('orderFilter')?.value||'all');renderCouriers();renderPayments();}

  function renderReportControls(){
    const box=document.querySelector('.report-box'); if(!box||$('cycleSelect')) return;
    const wrap=document.createElement('div'); wrap.className='report-controls';
    wrap.innerHTML=`<select id="cycleSelect">${(data.availableCycles.length?data.availableCycles:[data.activeCycle]).filter(Boolean).map(c=>`<option value="${escapeHtml(c)}" ${c===data.activeCycle?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select><button id="downloadExcel" class="primary">Descargar Excel</button><button id="printPdf" class="ghost">Guardar PDF / imprimir</button>`;
    box.appendChild(wrap);
    $('cycleSelect')?.addEventListener('change',e=>loadData(e.target.value));
    $('downloadExcel')?.addEventListener('click',downloadExcel);
    $('printPdf')?.addEventListener('click',()=>window.print());
  }

  function showView(view){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));document.querySelectorAll('.nav-item').forEach(v=>v.classList.toggle('active',v.dataset.view===view));const el=$(view);if(el)el.classList.add('active-view');$('pageTitle').textContent={dashboard:'Dashboard',clients:'Clientes',orders:'Solicitudes',couriers:'Mensajeros',payments:'Cobros',invites:'Invitaciones',reports:'Reportes'}[view]||'GOY XPRESS';if(innerWidth<760)scrollTo({top:0,behavior:'smooth'});}
  async function authenticate(email,password){const result=await api('/admin/login',{method:'POST',body:JSON.stringify({email,password})});if(!result.token)throw new Error('El servidor no devolvió una sesión válida');sessionStorage.setItem('goyAdminToken',result.token);}
  async function enterApp(){$('loginView').classList.add('hidden');$('appView').classList.remove('hidden');try{await loadData();}catch(err){sessionStorage.removeItem('goyAdminToken');$('appView').classList.add('hidden');$('loginView').classList.remove('hidden');$('loginMessage').textContent=err.message||'No se pudieron cargar los datos';}}

  async function updateOrder(code,patch,button){if(button)button.disabled=true;try{await api(`/admin/requests/${encodeURIComponent(code)}`,{method:'PATCH',body:JSON.stringify(patch)});await loadData(data.activeCycle);}catch(err){alert(err.message||'No se pudo actualizar la solicitud');}finally{if(button)button.disabled=false;}}
  async function manageOrder(code){
    const o=data.orders.find(x=>x.id===code); if(!o)return;
    const serviceLabel=prompt('Tipo o nombre del servicio:',o.service); if(serviceLabel===null)return;
    const cost=prompt('Nueva tarifa del servicio:',String(o.value)); if(cost===null)return;
    const number=Number(String(cost).replace(',','.')); if(!Number.isFinite(number)||number<0){alert('Tarifa inválida');return;}
    const reason=prompt('Motivo del cambio o reajuste:','Ajuste administrativo')||'Ajuste administrativo';
    await updateOrder(code,{serviceLabel,serviceCost:number,reason});
  }
  async function quoteOrder(code){
    const amount=prompt('Valor de la cotización para este servicio:'); if(amount===null)return;
    const value=Number(String(amount).replace(',','.')); if(!Number.isFinite(value)||value<=0){alert('Valor inválido');return;}
    const note=prompt('Detalle de la cotización / condiciones:','')||'';
    await updateOrder(code,{status:'Cotizado',serviceCost:value,quote:{status:'Cotizado',amount:value,note,quotedAt:new Date().toISOString()}});
  }
  function showGps(code){const o=data.orders.find(x=>x.id===code);const p=o?.gps?.last;if(!p){alert('Aún no hay ubicación disponible.');return;}window.open(`https://www.google.com/maps?q=${encodeURIComponent(`${p.latitude},${p.longitude}`)}`,'_blank','noopener');}
  async function releaseWallet(code,button){if(!confirm('¿Confirmas que verificaste la foto del depósito y deseas liberar los valores recaudados?'))return;if(button)button.disabled=true;try{await api(`/admin/requests/${encodeURIComponent(code)}/release-wallet`,{method:'POST',body:'{}'});await loadData(data.activeCycle);}catch(err){alert(err.message);}finally{if(button)button.disabled=false;}}

  function rowsForExport(){return data.orders.map(o=>[o.cycleKey,o.id,o.client,o.service,o.address,o.courier,o.status,o.value,o.wait?.extraMinutes||0,o.wait?.extraCost||0,o.wallet?.depositedAmount||0,o.wallet?.released?'Sí':'No']);}
  function downloadCsv(){const header=['Período','Solicitud','Cliente','Servicio','Dirección','Mensajero','Estado','Tarifa','Min espera extra','Recargo espera','Depositado','Cartera liberada'];const csv=[header,...rowsForExport()].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});downloadBlob(blob,`goy-xpress-${data.activeCycle||'reporte'}.csv`);}
  function downloadExcel(){const header=['Período','Solicitud','Cliente','Servicio','Dirección','Mensajero','Estado','Tarifa','Min espera extra','Recargo espera','Depositado','Cartera liberada'];const html=`<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${header.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr>${rowsForExport().map(r=>`<tr>${r.map(v=>`<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</table></body></html>`;downloadBlob(new Blob(['\ufeff'+html],{type:'application/vnd.ms-excel'}),`goy-xpress-${data.activeCycle||'reporte'}.xls`);}
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}

  $('today').textContent=new Intl.DateTimeFormat('es-EC',{dateStyle:'full'}).format(new Date());
  $('loginForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const submit=e.currentTarget.querySelector('button[type="submit"]');
    if(submit?.disabled)return;
    const originalLabel=submit?.textContent||'Ingresar al panel';
    if(submit){submit.disabled=true;submit.textContent='Ingresando…';}
    $('loginMessage').textContent='Validando acceso…';
    try{await authenticate($('email').value.trim(),$('password').value);await enterApp();}
    catch(err){$('loginMessage').textContent=err.message||'No se pudo iniciar sesión';}
    finally{if(submit){submit.disabled=false;submit.textContent=originalLabel;}}
  });
  $('logoutBtn').addEventListener('click',()=>{sessionStorage.removeItem('goyAdminToken');location.reload();});
  $('nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)showView(b.dataset.view);});
  document.addEventListener('click',e=>{
    const go=e.target.closest('[data-go]');if(go){showView(go.dataset.go);return;}
    const status=e.target.closest('[data-order][data-status]');if(status){updateOrder(status.dataset.order,{status:status.dataset.status},status);return;}
    const manage=e.target.closest('[data-manage]');if(manage){manageOrder(manage.dataset.manage);return;}
    const quote=e.target.closest('[data-quote]');if(quote){quoteOrder(quote.dataset.quote);return;}
    const gps=e.target.closest('[data-gps]');if(gps){showGps(gps.dataset.gps);return;}
    const release=e.target.closest('[data-release]');if(release){releaseWallet(release.dataset.release,release);}
  });
  $('clientSearch').addEventListener('input',e=>renderClients(e.target.value));
  $('orderFilter').addEventListener('change',e=>renderOrders(e.target.value));
  $('inviteForm').addEventListener('submit',async e=>{e.preventDefault();try{const label=$('inviteName').value.trim()||'Invitación GOY XPRESS';const invite=await api('/admin/invites',{method:'POST',body:JSON.stringify({label})});const base=String(config.registrationBaseUrl||'').replace(/\/$/,'');$('inviteLink').value=`${base}/${encodeURIComponent(invite.token)}`;$('inviteResult').classList.remove('hidden');}catch(err){alert(err.message||'No se pudo crear la invitación');}});
  $('copyInvite').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('inviteLink').value);$('copyInvite').textContent='Copiado';setTimeout(()=>$('copyInvite').textContent='Copiar',1300);}catch{$('inviteLink').select();}});
  $('downloadCsv').addEventListener('click',downloadCsv);
  window.addEventListener('goy:reload-admin-data',()=>{if(token())loadData(data.activeCycle).catch(()=>{});});
  if(token())enterApp();
})();
