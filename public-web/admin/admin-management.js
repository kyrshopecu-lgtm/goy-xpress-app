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
    box.innerHTML=snapshot.services.length?snapshot.services.map(s=>`<div class="goy-service-row" data-service-id="${esc(s.id)}"><div><strong>${esc(s.name)}</strong><small>${esc(s.description||'Sin descripción')}</small></div><strong>${money(s.price)}</strong><span class="service-status">${s.active===false?'Inactivo':'Activo'}</span><div class="goy-service-actions"><button type="button" data-edit-service="${esc(s.id)}">Editar</button><button type="button" class="goy-danger" data-delete-service="${esc(s.id)}">Borrar</button></div></div>`).join(''):'<div class="goy-service-empty">Aún no hay servicios personalizados.</div>';
  }

  async function createService(e){
    e.preventDefault();const message=document.getElementById('goyServiceMessage');message.textContent='Guardando…';
    try{await api('/admin/services',{method:'POST',body:JSON.stringify({name:document.getElementById('goyServiceName').value.trim(),price:document.getElementById('goyServicePrice').value,description:document.getElementById('goyServiceDescription').value.trim()})});e.currentTarget.reset();message.textContent='Servicio guardado.';await refreshSnapshot();}catch(error){message.textContent=error.message;}
  }

  async function editService(id){
    const item=snapshot.services.find(s=>s.id===id);if(!item)return;const name=prompt('Nombre del servicio:',item.name);if(name===null)return;const price=prompt('Valor del servicio:',String(item.price));if(price===null)return;const description=prompt('Descripción:',item.description||'');if(description===null)return;try{await api(`/admin/services/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({name,price,description})});await refreshSnapshot();}catch(error){alert(error.message);}
  }
  async function deleteService(id){const item=snapshot.services.find(s=>s.id===id);if(!item)return;if(!confirm(`¿Borrar el servicio “${item.name}”?`))return;try{await api(`/admin/services/${encodeURIComponent(id)}`,{method:'DELETE'});await refreshSnapshot();}catch(error){alert(error.message);}}

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
