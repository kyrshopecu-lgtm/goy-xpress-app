(() => {
  const config=window.GOY_ADMIN_CONFIG||{};
  const apiBase=String(config.apiBaseUrl||'/api').replace(/\/$/,'');
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const token=()=>sessionStorage.getItem('goyAdminToken')||'';
  const REFRESH_MS=30000;
  let busy=false,lastData=null,decorating=false,decorateQueued=false;
  let clientsTarget=null,couriersTarget=null;

  async function api(path,options={}){
    const {timeoutMs=12000,...requestOptions}=options;
    const headers={'Content-Type':'application/json',...(requestOptions.headers||{})};
    if(token())headers.Authorization=`Bearer ${token()}`;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const r=await fetch(`${apiBase}${path}`,{...requestOptions,headers,signal:requestOptions.signal||controller.signal});
      const body=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(body.error||'No se pudo completar la operación');
      return body;
    }catch(error){
      if(error?.name==='AbortError')throw new Error('La conexión con el servidor tardó demasiado. Intenta nuevamente.');
      throw error;
    }finally{clearTimeout(timer);}
  }

  const digits=v=>String(v||'').replace(/\D/g,'');
  function statusText(user){return user.active===false?'Inactivo':user.approved?'Aprobado':'Pendiente de aprobación';}
  function buttonHtml(role,user){
    const action=user.approved?'revocar':'aprobar';
    const label=user.approved?'Revocar acceso':'Aprobar cuenta';
    return `<button type="button" data-account-${action}="${esc(user.id)}" data-account-role="${role}" style="margin-left:8px;padding:6px 9px;border:0;border-radius:9px;font-weight:800;cursor:pointer;background:${user.approved?'#eef3f5':'#38A844'};color:${user.approved?'#0b2f40':'#fff'}">${label}</button>`;
  }

  function updateHtml(node,html){
    if(!node||node.innerHTML===html)return;
    node.innerHTML=html;
  }

  function decorateClients(clients){
    document.querySelectorAll('#clientsBody tr').forEach(row=>{
      const cells=row.querySelectorAll('td');if(cells.length<5)return;
      const emailCell=row.querySelector('[data-client-field="email"]')||cells[3];
      const phoneCell=row.querySelector('[data-client-field="phone"]')||cells[1];
      const statusCell=row.querySelector('[data-client-field="status"]')||cells[4];
      const email=(emailCell?.textContent||'').trim().toLowerCase();
      const phone=digits(phoneCell?.textContent||'');
      const user=clients.find(c=>(c.email||'').toLowerCase()===email||(phone&&digits(c.phone||c.whatsapp)===phone));
      if(!user)return;
      updateHtml(statusCell,`<span class="badge ${user.approved?'active':'pending'}">${esc(statusText(user))}</span>${buttonHtml('clients',user)}`);
    });
  }

  function decorateCouriers(couriers){
    document.querySelectorAll('#courierCards .courier-card').forEach(card=>{
      const texts=[...card.querySelectorAll('strong,small')].map(x=>(x.textContent||'').trim());
      const name=texts[0]||'',phone=digits(texts[1]||'');
      const user=couriers.find(c=>(phone&&digits(c.phone||c.whatsapp)===phone)||String(c.name||c.fullName||'').trim()===name);
      if(!user)return;
      let actions=card.querySelector('.account-approval-actions');
      if(!actions){actions=document.createElement('div');actions.className='account-approval-actions';actions.style.marginTop='10px';card.appendChild(actions);}
      updateHtml(actions,`<strong style="font-size:11px">${esc(statusText(user))}</strong>${buttonHtml('couriers',user)}`);
    });
  }

  const observer=new MutationObserver(()=>queueDecorate());
  function observeTargets(){
    if(clientsTarget)observer.observe(clientsTarget,{childList:true,subtree:true});
    if(couriersTarget)observer.observe(couriersTarget,{childList:true,subtree:true});
  }
  function redecorate(){
    if(decorating||!lastData)return;
    decorating=true;
    observer.disconnect();
    try{
      decorateClients(lastData.clients||[]);
      decorateCouriers(lastData.couriers||[]);
    }finally{
      observeTargets();
      decorating=false;
    }
  }
  function queueDecorate(){
    if(decorateQueued||decorating||!lastData)return;
    decorateQueued=true;
    requestAnimationFrame(()=>{decorateQueued=false;redecorate();});
  }
  function applyData(nextData){
    if(!nextData)return;
    lastData=nextData;
    redecorate();
  }

  async function refresh(){
    if(busy||!token())return;busy=true;
    try{applyData(await api('/admin/data'));}catch{}finally{busy=false;}
  }

  async function setApproval(role,id,approved,button){
    if(button)button.disabled=true;
    try{
      await api(`/admin/${role}/${encodeURIComponent(id)}/approve`,{method:'POST',body:JSON.stringify({approved})});
      await refresh();
      document.querySelector('[data-view="clients"]')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    }catch(e){alert(e.message||'No se pudo actualizar la cuenta');}finally{if(button)button.disabled=false;}
  }

  document.addEventListener('click',e=>{
    const approve=e.target.closest('[data-account-aprobar]');
    if(approve){setApproval(approve.dataset.accountRole,approve.dataset.accountAprobar,true,approve);return;}
    const revoke=e.target.closest('[data-account-revocar]');
    if(revoke){if(confirm('¿Deseas revocar el acceso de esta cuenta?'))setApproval(revoke.dataset.accountRole,revoke.dataset.accountRevocar,false,revoke);}
  });

  window.addEventListener('goy:admin-data',e=>applyData(e.detail));

  const start=()=>{
    clientsTarget=document.getElementById('clientsBody');
    couriersTarget=document.getElementById('courierCards');
    observeTargets();
    refresh();
    setInterval(()=>{if(!document.hidden)refresh();},REFRESH_MS);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
