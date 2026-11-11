(()=>{
  const apiBase=String(window.GOY_ADMIN_CONFIG?.apiBaseUrl||'/api').replace(/\/$/,'');
  const token=()=>sessionStorage.getItem('goyAdminToken')||'';
  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money=value=>`$${Number(value||0).toFixed(2)}`;
  let snapshot={clients:[],couriers:[],services:[]};

  async function api(path,options={}){
    const headers={'Content-Type':'application/json',...(options.headers||{})};
    if(token())headers.Authorization=`Bearer ${token()}`;
    const res=await fetch(`${apiBase}${path}`,{...options,headers});
    const body=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(body.error||'No se pudo completar la operación.');
    return body;
  }

  const style=document.createElement('style');
  style.textContent=`
    .goy-danger{background:#fff0f0!important;color:#a72727!important;border:1px solid #efb7b7!important}.goy-danger:hover{background:#ffe1e1!important}
    .goy-delete-small{margin-top:10px;width:100%;padding:9px 10px;border-radius:10px;cursor:pointer;font-weight:800}.goy-client-delete{padding:7px 10px;border-radius:9px;cursor:pointer;font-weight:800;white-space:nowrap}
    .goy-services-grid{display:grid;grid-template-columns:minmax(280px,.8fr) minmax(420px,1.4fr);gap:18px}.goy-service-form{display:grid;gap:13px}.goy-service-form label{display:grid;gap:6px;font-weight:700}.goy-service-form input,.goy-service-form textarea{padding:12px;border:1px solid #cbd9e0;border-radius:11px;font:inherit}.goy-service-row{display:grid;grid-template-columns:1fr 110px 100px 92px;gap:10px;align-items:center;padding:13px 0;border-bottom:1px solid #e7eef2}.goy-service-row small{display:block;color:#6f8089;margin-top:3px}.goy-service-actions{display:flex;gap:6px}.goy-service-actions button{padding:7px 9px;border-radius:8px;border:1px solid #d3dfe5;background:#fff;cursor:pointer}.goy-service-empty{padding:24px;text-align:center;color:#6f8089}.goy-management-note{font-size:12px;color:#6f8089;margin-top:8px}@media(max-width:900px){.goy-services-grid{grid-template-columns:1fr}.goy-service-row{grid-template-columns:1fr 90px}.goy-service-actions{grid-column:1/-1}.goy-service-row .service-status{text-align:right}}
  `;
  document.head.appendChild(style);

  function ensureServicesView(){
    const nav=document.getElementById('nav');
    if(nav&&!nav.querySelector('[data-view="services"]')){
      const btn=document.createElement('button');btn.className='nav-item';btn.dataset.view='services';btn.innerHTML='<span class="nav-icon">⚙</span><span>Servicios y tarifas</span>';nav.appendChild(btn);
    }
    const main=document.querySelector('.main');
    if(main&&!document.getElementById('services')){
      const section=document.createElement('section');section.id='services';section.className='view';section.innerHTML=`
        <div class="goy-services-grid">
          <article class="panel form-panel"><span class="eyebrow">Configuración</span><h3>Nuevo servicio</h3><p class="muted">Crea servicios adicionales con un valor definido por administración.</p>
            <form id="goyServiceForm" class="goy-service-form">
              <label>Nombre del servicio<input id="goyServiceName" required placeholder="Ej. Retiro especial"></label>
              <label>Valor ($)<input id="goyServicePrice" type="number" min="0" step="0.01" required placeholder="0.00"></label>
              <label>Descripción<textarea id="goyServiceDescription" rows="3" placeholder="Qué incluye este servicio"></textarea></label>
              <label>Tiempo estimado<input id="goyServiceExpectedTime" maxlength="160" placeholder="Ej. 1 a 2 días hábiles; sujeto a turno"></label>
              <label>Requisitos (uno por línea)<textarea id="goyServiceRequirements" rows="4" placeholder="Documento de identidad&#10;Comprobante de pago&#10;Autorización, si aplica"></textarea></label>
              <label>Pasos del proceso (uno por línea)<textarea id="goyServiceSteps" rows="4" placeholder="Revisar requisitos&#10;Coordinar turno&#10;Realizar la gestión&#10;Entregar resultado"></textarea></label>
              <button class="primary" type="submit">Guardar servicio</button><p id="goyServiceMessage" class="form-message"></p>
            </form><p class="goy-management-note">Los servicios personalizados aparecerán también al crear una nueva orden desde administración.</p>
          </article>
          <article class="panel"><div class="panel-head"><div><span class="eyebrow">Catálogo</span><h3>Servicios y valores</h3></div></div><div id="goyServicesList"></div></article>
        </div>`;main.appendChild(section);
      section.querySelector('#goyServiceForm')?.addEventListener('submit',createService);
    }
  }

  async function refreshSnapshot(){
    if(!token())return;
    try{const [data,services]=await Promise.all([api('/admin/data'),api('/admin/services')]);snapshot.clients=data.clients||[];snapshot.couriers=data.couriers||[];snapshot.services=services.services||[];renderServices();decorateAccounts();}catch(error){console.warn('GOY management',error);}
  }

  function renderServices(){
    const box=document.getElementById('goyServicesList');if(!box)return;
    box.innerHTML=snapshot.services.length?snapshot.services.map(s=>`<div class="goy-service-row" data-service-id="${esc(s.id)}"><div><strong>${esc(s.name)}</strong><small>${esc(s.description||'Sin descripción')}</small><small>Tiempo estimado: ${esc(s.expectedTime||'Por definir')}</small><details><summary>Requisitos y pasos</summary><small><b>Requisitos:</b> ${esc((s.requirements||[]).join(' · ')||'Por definir')}</small><small><b>Pasos:</b> ${esc((s.steps||[]).join(' → ')||'Por definir')}</small></details></div><strong>${money(s.price)}</strong><span class="service-status">${s.active===false?'Inactivo':'Activo'}</span><div class="goy-service-actions"><button type="button" data-edit-service="${esc(s.id)}">Editar</button><button type="button" class="goy-danger" data-delete-service="${esc(s.id)}">Borrar</button></div></div>`).join(''):'<div class="goy-service-empty">Aún no hay servicios personalizados.</div>';
  }

  async function createService(e){
    e.preventDefault();const message=document.getElementById('goyServiceMessage');message.textContent='Guardando…';
    try{await api('/admin/services',{method:'POST',body:JSON.stringify({name:document.getElementById('goyServiceName').value.trim(),price:document.getElementById('goyServicePrice').value,description:document.getElementById('goyServiceDescription').value.trim(),expectedTime:document.getElementById('goyServiceExpectedTime').value.trim(),requirements:document.getElementById('goyServiceRequirements').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),steps:document.getElementById('goyServiceSteps').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)})});e.currentTarget.reset();message.textContent='Servicio guardado.';await refreshSnapshot();}catch(error){message.textContent=error.message;}
  }

  async function editService(id){
    const item=snapshot.services.find(s=>s.id===id);if(!item)return;const name=prompt('Nombre del servicio:',item.name);if(name===null)return;const price=prompt('Valor del servicio:',String(item.price));if(price===null)return;const description=prompt('Descripción:',item.description||'');if(description===null)return;const expectedTime=prompt('Tiempo estimado:',item.expectedTime||'');if(expectedTime===null)return;const requirements=prompt('Requisitos (uno por línea):',(item.requirements||[]).join('\n'));if(requirements===null)return;const steps=prompt('Pasos (uno por línea):',(item.steps||[]).join('\n'));if(steps===null)return;try{await api(`/admin/services/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({name,price,description,expectedTime,requirements:requirements.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),steps:steps.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)})});await refreshSnapshot();}catch(error){alert(error.message);}
  }
  async function deleteService(id){const item=snapshot.services.find(s=>s.id===id);if(!item)return;if(!confirm(`¿Borrar el servicio “${item.name}”?`))return;try{await api(`/admin/services/${encodeURIComponent(id)}`,{method:'DELETE'});await refreshSnapshot();}catch(error){alert(error.message);}}


  const permissionCatalog={
    sales:[
      ['sales.prospects.read','Consultar prospectos'],['sales.prospects.create','Crear prospectos'],['sales.prospects.update','Editar prospectos'],['sales.whatsapp.send','Enviar WhatsApp'],
      ['crm.contacts.read','Consultar contactos'],['crm.contacts.update','Actualizar contactos'],['crm.contacts.assign','Asignar contactos'],['procedures.read','Consultar trámites']
    ],
    courier:[
      ['courier.jobs.read_assigned','Consultar órdenes asignadas'],['courier.jobs.update_assigned','Actualizar órdenes asignadas'],['courier.evidence.upload','Subir evidencias'],['procedures.read','Consultar trámites']
    ],
    accounting:[
      ['crm.contacts.read_billing','Consultar datos para facturación'],['operations.requests.read_billing','Consultar solicitudes y cobros'],['operations.evidence.read','Consultar comprobantes'],
      ['accounting.read','Consultar contabilidad'],['accounting.entries.create','Crear registros contables'],['accounting.entries.update','Editar registros contables'],['accounting.reconcile','Conciliar movimientos'],['accounting.reports','Ver reportes contables'],['procedures.read','Consultar trámites']
    ]
  };
  const permissionLabels=items=>items.map(([key,label])=>`<label class="goy-permission"><input type="checkbox" value="${esc(key)}"><span>${esc(label)}</span></label>`).join('');
  function ensureInternalUsersView(){
    const nav=document.getElementById('nav'),main=document.querySelector('.main');
    if(nav&&!nav.querySelector('[data-view="internal-users"]')){const b=document.createElement('button');b.type='button';b.className='nav-item';b.dataset.view='internal-users';b.innerHTML='<span class="nav-icon">♙</span><span>Equipo y permisos</span>';nav.append(b);}
    if(main&&!document.getElementById('internal-users')){
      const section=document.createElement('section');section.id='internal-users';section.className='view';
      section.innerHTML=`<div class="goy-staff-grid">
        <article class="panel form-panel"><span class="eyebrow">Acceso interno</span><h3 id="goyStaffFormTitle">Crear trabajador</h3><p class="muted">Crea cuentas independientes para Ventas, Contabilidad y Mensajeros. La contraseña se guarda protegida y nunca se muestra nuevamente.</p>
        <form id="goyStaffForm" class="goy-staff-form">
          <label>Nombre completo<input id="goyStaffName" required minlength="2" autocomplete="name"></label>
          <label>Usuario<input id="goyStaffUsername" required minlength="3" maxlength="30" pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,29}" autocomplete="username"></label>
          <label>Correo<input id="goyStaffEmail" type="email" required autocomplete="email"></label>
          <label>WhatsApp<input id="goyStaffPhone" required inputmode="tel"></label>
          <label>Área<select id="goyStaffRole"><option value="sales">Ventas</option><option value="accounting">Contabilidad</option><option value="courier">Mensajero</option></select></label>
          <label id="goyStaffPasswordLabel">Contraseña inicial<input id="goyStaffPassword" type="password" minlength="8" autocomplete="new-password" placeholder="Mínimo 8 caracteres, letras y números"></label>
          <div class="goy-permissions-wrap"><strong>Permisos individuales</strong><small>Los permisos del área aparecen seleccionados inicialmente. Desmarca los que no debe utilizar; si no queda ninguno, la cuenta no tendrá acceso a esas funciones.</small><div id="goyStaffPermissions" class="goy-permissions"></div></div>
          <div class="goy-staff-actions"><button class="primary" type="submit" id="goyStaffSubmit">Crear cuenta</button><button type="button" id="goyStaffCancel" class="ghost" hidden>Cancelar edición</button></div><p id="goyStaffMessage" class="form-message" role="status"></p>
        </form></article>
        <article class="panel"><div class="panel-head"><div><span class="eyebrow">Equipo de trabajo</span><h3>Usuarios internos</h3><small class="muted">Activa, bloquea y administra los permisos de cada persona.</small></div><div class="goy-staff-actions"><a href="/equipo" target="_blank" rel="noopener" class="goy-staff-portal-link">Abrir portal del equipo</a><button id="goyStaffRefresh" class="ghost" type="button">Actualizar</button></div></div><div id="goyStaffList" class="goy-staff-list">Cargando usuarios…</div></article>
      </div>
      <article class="panel" style="margin-top:16px"><div class="panel-head"><div><span class="eyebrow">Trazabilidad</span><h3>Actividad administrativa</h3></div></div><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Acción</th><th>Usuario</th><th>Detalle</th></tr></thead><tbody id="goyStaffAudit"><tr><td colspan="4">Sin registros.</td></tr></tbody></table></div></article>`;
      main.append(section);
      section.querySelector('#goyStaffForm').addEventListener('submit',saveInternalUser);
      section.querySelector('#goyStaffRole').addEventListener('change',event=>renderPermissionChoices(event.target.value));
      section.querySelector('#goyStaffCancel').addEventListener('click',resetInternalForm);
      section.querySelector('#goyStaffRefresh').addEventListener('click',loadInternalUsers);
    }
  }
  function renderPermissionChoices(role='sales',selected=permissionCatalog[role].filter(item=>role!=='sales'||item[0]!=='sales.whatsapp.send').map(item=>item[0])){
    const box=document.getElementById('goyStaffPermissions');if(!box)return;
    box.innerHTML=permissionCatalog[role].map(([key,label])=>`<label class="goy-permission"><input type="checkbox" value="${esc(key)}" ${selected.includes(key)?'checked':''}><span>${esc(label)}</span></label>`).join('');
  }
  function resetInternalForm(){
    const form=document.getElementById('goyStaffForm');if(!form)return;form.reset();form.dataset.editId='';document.getElementById('goyStaffUsername').disabled=false;document.getElementById('goyStaffRole').disabled=false;document.getElementById('goyStaffPasswordLabel').hidden=false;document.getElementById('goyStaffPassword').required=true;document.getElementById('goyStaffFormTitle').textContent='Crear trabajador';document.getElementById('goyStaffSubmit').textContent='Crear cuenta';document.getElementById('goyStaffCancel').hidden=true;document.getElementById('goyStaffMessage').textContent='';renderPermissionChoices('sales');
  }
  function editInternalUser(id){
    const user=internalUsers.find(u=>u.id===id);if(!user)return;const form=document.getElementById('goyStaffForm');form.dataset.editId=id;
    document.getElementById('goyStaffName').value=user.name||'';document.getElementById('goyStaffUsername').value=user.username||'';document.getElementById('goyStaffEmail').value=user.email||'';document.getElementById('goyStaffPhone').value=user.phone||'';document.getElementById('goyStaffRole').value=user.role;document.getElementById('goyStaffUsername').disabled=true;document.getElementById('goyStaffRole').disabled=true;document.getElementById('goyStaffPasswordLabel').hidden=false;document.getElementById('goyStaffPassword').required=false;document.getElementById('goyStaffPassword').value='';document.getElementById('goyStaffPassword').placeholder='Dejar vacío para conservar la contraseña';document.getElementById('goyStaffFormTitle').textContent='Editar trabajador';document.getElementById('goyStaffSubmit').textContent='Guardar cambios';document.getElementById('goyStaffCancel').hidden=false;document.getElementById('goyStaffMessage').textContent='';renderPermissionChoices(user.role,Array.isArray(user.permissions)?user.permissions:permissionCatalog[user.role].filter(item=>user.role!=='sales'||item[0]!=='sales.whatsapp.send').map(item=>item[0]));
    document.querySelector('[data-view="internal-users"]')?.click();document.getElementById('goyStaffName').focus();
  }
  let internalUsers=[];
  async function loadInternalUsers(){
    const box=document.getElementById('goyStaffList');if(!box)return;box.textContent='Cargando usuarios…';
    try{const data=await api('/admin/internal-users');internalUsers=data.users||[];renderInternalUsers();renderInternalAudit(data.auditLog||[]);}
    catch(error){box.textContent=error.message;}
  }
  function renderInternalUsers(){
    const box=document.getElementById('goyStaffList');if(!box)return;
    box.innerHTML=internalUsers.length?internalUsers.map(user=>{
      const role=user.role==='sales'?'Ventas':user.role==='accounting'?'Contabilidad':'Mensajero',active=user.active!==false&&!user.blocked;
      const granted=Array.isArray(user.permissions)?user.permissions.length+' permisos personalizados':'Permisos predeterminados del área';
      return `<article class="goy-staff-card"><div class="goy-staff-card-head"><div><strong>${esc(user.name)}</strong><small>@${esc(user.username||'')}</small><small>${esc(user.email)} · ${esc(user.phone)}</small></div><span class="goy-staff-status ${active?'is-active':'is-blocked'}">${active?'Activo':'Bloqueado'}</span></div><div class="goy-staff-meta"><span>${role}</span><span>${esc(granted)}</span></div><div class="goy-staff-actions"><button type="button" data-edit-staff="${esc(user.id)}">Editar y permisos</button><button type="button" class="${active?'goy-danger':''}" data-toggle-staff="${esc(user.id)}" data-active="${active?'true':'false'}">${active?'Bloquear':'Activar'}</button><button type="button" data-reset-staff-password="${esc(user.id)}">Cambiar contraseña</button></div></article>`;
    }).join(''):'<p class="goy-service-empty">Todavía no hay trabajadores internos. Crea la primera cuenta desde el formulario.</p>';
  }
  function renderInternalAudit(rows){
    const body=document.getElementById('goyStaffAudit');if(!body)return;
    body.innerHTML=rows.length?rows.map(row=>`<tr><td>${esc(new Date(row.createdAt).toLocaleString('es-EC'))}</td><td>${esc(row.action)}</td><td>${esc(row.actorId)}</td><td>${esc(row.targetId)} · ${esc(JSON.stringify(row.details||{}))}</td></tr>`).join(''):'<tr><td colspan="4">Sin registros.</td></tr>';
  }
  async function saveInternalUser(event){
    event.preventDefault();const form=event.currentTarget,message=document.getElementById('goyStaffMessage'),id=form.dataset.editId;
    const body={name:document.getElementById('goyStaffName').value.trim(),phone:document.getElementById('goyStaffPhone').value.trim(),permissions:[...form.querySelectorAll('#goyStaffPermissions input:checked')].map(input=>input.value)};
    if(!id){body.role=document.getElementById('goyStaffRole').value;body.username=document.getElementById('goyStaffUsername').value.trim();body.email=document.getElementById('goyStaffEmail').value.trim();body.password=document.getElementById('goyStaffPassword').value;}
    else if(document.getElementById('goyStaffPassword').value)body.password=document.getElementById('goyStaffPassword').value;
    message.textContent='Guardando…';
    try{const result=await api(id?`/admin/internal-users/${encodeURIComponent(id)}`:'/admin/internal-users',{method:id?'PATCH':'POST',body:JSON.stringify(body)});message.textContent=id?'Cambios guardados.':'Cuenta creada correctamente.';resetInternalForm();await loadInternalUsers();}
    catch(error){message.textContent=error.message;}
  }
  async function toggleInternalUser(id,active){
    if(!confirm(active?'¿Bloquear el acceso de este trabajador?':'¿Activar nuevamente esta cuenta?'))return;
    await api(`/admin/internal-users/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({active:!active})});await loadInternalUsers();
  }
  async function resetInternalPassword(id){
    const password=prompt('Nueva contraseña (mínimo 8 caracteres, letras y números):');if(password===null)return;
    await api(`/admin/internal-users/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({password})});alert('Contraseña actualizada. Comunícala al trabajador por un canal seguro.');
  }
  document.addEventListener('click',async event=>{
    const edit=event.target.closest('[data-edit-staff]');if(edit){editInternalUser(edit.dataset.editStaff);return;}
    const toggle=event.target.closest('[data-toggle-staff]');if(toggle){try{await toggleInternalUser(toggle.dataset.toggleStaff,toggle.dataset.active==='true');}catch(error){alert(error.message);}return;}
    const reset=event.target.closest('[data-reset-staff-password]');if(reset){try{await resetInternalPassword(reset.dataset.resetStaffPassword);}catch(error){alert(error.message);}return;}
    const nav=event.target.closest('[data-view="internal-users"]');if(nav){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));document.querySelectorAll('.nav-item').forEach(v=>v.classList.toggle('active',v===nav));document.getElementById('internal-users')?.classList.add('active-view');const title=document.getElementById('pageTitle');if(title)title.textContent='Equipo y permisos';loadInternalUsers();}
  });
  const staffStyle=document.createElement('style');staffStyle.textContent=`
    .goy-staff-grid{display:grid;grid-template-columns:minmax(280px,.8fr) minmax(320px,1.2fr);gap:16px;align-items:start}
    .goy-staff-form{display:grid;gap:12px}.goy-staff-form label{display:grid;gap:6px;font-size:13px;font-weight:750;color:#31434e}.goy-staff-form input,.goy-staff-form select{padding:11px;border:1px solid #d5e1e7;border-radius:11px;min-width:0}
    .goy-permissions-wrap{border:1px solid #dfe8ed;border-radius:14px;padding:12px}.goy-permissions-wrap>small{display:block;color:#6c7c86;line-height:1.45;margin:6px 0 10px}.goy-permissions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.goy-permission{display:flex!important;grid-template-columns:none!important;align-items:center;gap:8px!important;background:#f5f9fb;padding:8px;border-radius:9px;font-weight:650!important}.goy-permission input{width:auto;flex:0 0 auto}
    .goy-staff-list{display:grid;gap:10px}.goy-staff-card{border:1px solid #dfe8ed;border-radius:15px;padding:13px;background:#fbfdfe}.goy-staff-card-head{display:flex;justify-content:space-between;gap:10px}.goy-staff-card-head>div{display:grid;gap:4px;min-width:0}.goy-staff-card-head small{color:#687984;overflow-wrap:anywhere}.goy-staff-status{font-size:11px;font-weight:900;padding:6px 9px;border-radius:99px;height:max-content}.goy-staff-status.is-active{background:#e8f8eb;color:#247b31}.goy-staff-status.is-blocked{background:#fff0f0;color:#a72727}.goy-staff-meta{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.goy-staff-meta span{background:#eef5f8;padding:6px 9px;border-radius:8px;font-size:11px;color:#40545e}.goy-staff-actions{display:flex;gap:8px;flex-wrap:wrap}.goy-staff-portal-link{display:inline-flex;align-items:center;text-decoration:none;border:1px solid #d5e1e7;background:#eef8fc;color:#075b7e;border-radius:10px;padding:9px 11px;font-weight:800;font-size:12px}.goy-staff-actions button{border:1px solid #d5e1e7;background:#fff;border-radius:10px;padding:9px 11px;font-weight:800;cursor:pointer}.goy-staff-actions .primary{background:#0b2f40;color:#fff}.goy-staff-actions .ghost{background:#f5f9fb}.goy-staff-actions [hidden]{display:none!important}
    @media(max-width:980px){.goy-staff-grid{grid-template-columns:1fr}}@media(max-width:560px){.goy-permissions{grid-template-columns:1fr}.goy-staff-card-head{flex-direction:column}}
  `;document.head.appendChild(staffStyle);
  renderPermissionChoices('sales');
  ensureInternalUsersView();
  
  function normalize(v){return String(v||'').trim().toLowerCase();}
  function decorateAccounts(){
    const rows=[...document.querySelectorAll('#clientsBody tr')];
    rows.forEach(row=>{if(row.querySelector('[data-delete-client]'))return;const cells=row.querySelectorAll('td');if(cells.length<4)return;const phone=normalize(cells[1]?.textContent),doc=normalize(cells[2]?.textContent),email=normalize(cells[3]?.textContent);const client=snapshot.clients.find(c=>(phone&&normalize(c.phone||c.whatsapp)===phone)||(doc&&doc!=='-'&&normalize(c.documentId||c.id)===doc)||(email&&email!=='-'&&normalize(c.email)===email));if(!client)return;const td=document.createElement('td');td.innerHTML=`<button type="button" class="goy-danger goy-client-delete" data-delete-client="${esc(client.id||client.userId)}">Borrar</button>`;row.appendChild(td);});
    const clientHead=document.querySelector('#clients table thead tr');if(clientHead&&!clientHead.querySelector('[data-goy-actions-head]')){const th=document.createElement('th');th.dataset.goyActionsHead='1';th.textContent='Acciones';clientHead.appendChild(th);}
    [...document.querySelectorAll('#courierCards .courier-card')].forEach(card=>{if(card.querySelector('[data-delete-courier]'))return;const texts=card.textContent;const courier=snapshot.couriers.find(c=>texts.includes(c.name||c.fullName||'')&&texts.includes(c.phone||c.whatsapp||''));if(!courier)return;const btn=document.createElement('button');btn.type='button';btn.className='goy-danger goy-delete-small';btn.dataset.deleteCourier=courier.id||courier.userId;btn.textContent='Borrar mensajero';card.appendChild(btn);});
  }

  async function deleteAccount(role,id){
    const label=role==='clients'?'cliente':'mensajero';if(!confirm(`¿Seguro que deseas borrar este ${label}? Esta acción elimina su acceso al sistema.`))return;
    try{await api(`/admin/${role}/${encodeURIComponent(id)}`,{method:'DELETE'});alert(`${label[0].toUpperCase()+label.slice(1)} eliminado correctamente.`);location.reload();}catch(error){alert(error.message);}
  }

  document.addEventListener('click',e=>{
    const edit=e.target.closest('[data-edit-service]');if(edit){editService(edit.dataset.editService);return;}
    const delService=e.target.closest('[data-delete-service]');if(delService){deleteService(delService.dataset.deleteService);return;}
    const delClient=e.target.closest('[data-delete-client]');if(delClient){deleteAccount('clients',delClient.dataset.deleteClient);return;}
    const delCourier=e.target.closest('[data-delete-courier]');if(delCourier){deleteAccount('couriers',delCourier.dataset.deleteCourier);return;}
    const nav=e.target.closest('[data-view="services"]');if(nav){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));document.querySelectorAll('.nav-item').forEach(v=>v.classList.toggle('active',v===nav));document.getElementById('services')?.classList.add('active-view');const title=document.getElementById('pageTitle');if(title)title.textContent='Servicios y tarifas';refreshSnapshot();}
  });

  ensureServicesView();
  const observer=new MutationObserver(()=>decorateAccounts());observer.observe(document.body,{subtree:true,childList:true});
  setTimeout(refreshSnapshot,800);
  window.GOY_CUSTOM_SERVICES={refresh:refreshSnapshot,get:()=>snapshot.services.slice()};
})();
