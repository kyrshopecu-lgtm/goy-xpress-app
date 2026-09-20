(()=>{
  const apiBase=String(window.GOY_ADMIN_CONFIG?.apiBaseUrl||'/api').replace(/\/$/,'');
  const token=()=>sessionStorage.getItem('goyAdminToken')||'';
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  async function api(path,options={}){
    const headers={'Content-Type':'application/json',...(options.headers||{})};
    if(token())headers.Authorization=`Bearer ${token()}`;
    const response=await fetch(`${apiBase}${path}`,{...options,headers,cache:'no-store'});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.error||`No se pudo completar la operación (HTTP ${response.status}).`);
    return body;
  }

  function close(){document.getElementById('assignCourierModal')?.remove();}

  async function openAssign(code){
    if(!token())return alert('Tu sesión venció. Vuelve a iniciar sesión.');
    const overlay=document.createElement('div');
    overlay.id='assignCourierModal';
    overlay.className='modal-overlay';
    overlay.innerHTML='<div class="modern-modal"><div class="modal-loading"><span class="spinner"></span> Cargando mensajeros…</div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});

    try{
      const data=await api('/admin/order-options');
      const couriers=(data.couriers||[]).filter(c=>c.approved&&c.active!==false);
      if(!couriers.length){
        overlay.querySelector('.modern-modal').innerHTML='<div class="modal-head"><div><span class="eyebrow">Asignar orden</span><h3>No hay mensajeros disponibles</h3></div><button class="modal-close" type="button">×</button></div><p>Primero registra o aprueba un mensajero activo.</p>';
        overlay.querySelector('.modal-close').onclick=close;
        return;
      }
      overlay.querySelector('.modern-modal').innerHTML=`
        <div class="modal-head">
          <div><span class="eyebrow">Asignar orden</span><h3>Selecciona un mensajero</h3><p>Solicitud ${esc(code)}</p></div>
          <button class="modal-close" type="button">×</button>
        </div>
        <form id="assignCourierForm" class="admin-order-form">
          <label>Mensajero
            <select name="courierId" required>
              <option value="">Selecciona un mensajero</option>
              ${couriers.map(c=>`<option value="${esc(c.id||c.userId)}">${esc(c.name||c.fullName||'Mensajero')} · ${esc(c.phone||'')}</option>`).join('')}
            </select>
          </label>
          <div id="assignCourierMessage" class="form-message"></div>
          <div class="modal-actions"><button type="button" class="ghost modal-cancel">Cancelar</button><button type="submit" class="primary action-primary">Asignar mensajero</button></div>
        </form>`;
      overlay.querySelector('.modal-close').onclick=close;
      overlay.querySelector('.modal-cancel').onclick=close;
      overlay.querySelector('#assignCourierForm').addEventListener('submit',async e=>{
        e.preventDefault();
        const form=e.currentTarget;
        const button=form.querySelector('button[type="submit"]');
        const message=overlay.querySelector('#assignCourierMessage');
        const courierId=String(new FormData(form).get('courierId')||'');
        if(!courierId)return;
        button.disabled=true;button.textContent='Asignando…';message.textContent='';
        try{
          await api(`/admin/requests/${encodeURIComponent(code)}`,{method:'PATCH',body:JSON.stringify({courierId})});
          close();
          location.reload();
        }catch(error){
          message.textContent=error.message||'No se pudo asignar el mensajero.';
          button.disabled=false;button.textContent='Asignar mensajero';
        }
      });
    }catch(error){
      overlay.querySelector('.modern-modal').innerHTML=`<div class="modal-head"><h3>No se pudo cargar mensajeros</h3><button class="modal-close" type="button">×</button></div><p>${esc(error.message||'Error de conexión')}</p>`;
      overlay.querySelector('.modal-close').onclick=close;
    }
  }

  document.addEventListener('click',e=>{
    const button=e.target.closest('[data-order][data-status="Asignado"]');
    if(!button)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openAssign(button.dataset.order);
  },true);
})();
