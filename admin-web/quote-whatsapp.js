(() => {
  const config = window.GOY_ADMIN_CONFIG || {};
  const apiBase = String(config.apiBaseUrl || '').replace(/\/$/, '');

  function adminToken() { return sessionStorage.getItem('goyAdminToken') || ''; }
  async function api(path, options = {}) {
    const headers = {'Content-Type':'application/json', ...(options.headers || {})};
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

  function installCourierForm(){
    const cards=document.getElementById('courierCards');
    if(!cards||document.getElementById('goyCourierForm'))return;
    const box=document.createElement('div');
    box.style.cssText='border:1px solid #dce6eb;border-radius:14px;padding:14px;margin:0 0 16px;background:#f7fbfd';
    box.innerHTML='<h4 style="margin:0 0 8px">Crear acceso de mensajero</h4><form id="goyCourierForm" style="display:grid;gap:8px"><input id="goyCourierName" required placeholder="Nombre del mensajero"><input id="goyCourierPhone" required placeholder="WhatsApp / teléfono"><input id="goyCourierUser" required placeholder="Usuario (mínimo 4 caracteres)"><input id="goyCourierPass" required type="password" minlength="8" placeholder="Contraseña (mínimo 8 caracteres)"><button class="primary" type="submit">Crear mensajero</button><small>La contraseña no se muestra después de guardarla. Entrégala directamente al mensajero.</small></form>';
    cards.parentElement.insertBefore(box,cards);
    document.getElementById('goyCourierForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const button=e.target.querySelector('button');button.disabled=true;
      try{
        await api('/admin/couriers',{method:'POST',body:JSON.stringify({name:document.getElementById('goyCourierName').value.trim(),phone:document.getElementById('goyCourierPhone').value.trim(),username:document.getElementById('goyCourierUser').value.trim(),password:document.getElementById('goyCourierPass').value})});
        alert('Mensajero creado. Ya puede ingresar en GOY XPRESS Mensajero.');location.reload();
      }catch(error){alert(error.message);}finally{button.disabled=false;}
    });
  }
  document.addEventListener('DOMContentLoaded',installCourierForm);
  setTimeout(installCourierForm,500);

  document.addEventListener('click', async event => {
    const assign = event.target.closest('[data-order][data-status="Asignado"]');
    if (!assign) return;
    event.preventDefault();event.stopImmediatePropagation();assign.disabled=true;
    try{
      const current=await api('/admin/data');
      const couriers=(current.couriers||[]).filter(c=>c.status==='Activo');
      if(!couriers.length){alert('Primero crea un mensajero activo en la sección Mensajeros.');return;}
      const menu=couriers.map((c,i)=>`${i+1}. ${c.name} (${c.username||'sin usuario'})`).join('\n');
      const choice=prompt(`Selecciona mensajero para ${assign.dataset.order}:\n\n${menu}\n\nEscribe el número:`);
      if(choice===null)return;
      const courier=couriers[Number(choice)-1];
      if(!courier){alert('Selección inválida');return;}
      await api(`/admin/requests/${encodeURIComponent(assign.dataset.order)}`,{method:'PATCH',body:JSON.stringify({courierId:courier.id,status:'Asignado'})});
      alert(`Solicitud asignada a ${courier.name}`);location.reload();
    }catch(error){alert(error.message);}finally{assign.disabled=false;}
  }, true);

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-quote]');
    if (!button) return;
    event.preventDefault();event.stopImmediatePropagation();
    const code = button.dataset.quote;
    const amount = prompt('Valor de la cotización para este servicio:');
    if (amount === null) return;
    const value = Number(String(amount).replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) { alert('Valor inválido'); return; }
    const note = prompt('Detalle de la cotización / condiciones:', '') || '';
    const whatsappWindow = window.open('about:blank', '_blank');
    button.disabled = true;
    try {
      const current = await api('/admin/data');
      const request = (current.requests || []).find(item => item.code === code || item.id === code);
      await api(`/admin/requests/${encodeURIComponent(code)}`, {method:'PATCH',body:JSON.stringify({status:'Cotizado',serviceCost:value,reason:'Cotización personalizada',quote:{status:'Cotizado',amount:value,note,quotedAt:new Date().toISOString()}})});
      const phone = whatsappNumber(request?.phone || request?.whatsapp || request?.contactPhone);
      const message = ['GOY XPRESS - Cotización de servicio',`Solicitud: ${code}`,`Valor: $${value.toFixed(2)}`,note ? `Detalle: ${note}` : '','','La cotización quedó registrada. Ingresa a GOY XPRESS Cliente para aceptarla o rechazarla.'].filter(Boolean).join('\n');
      if (phone.length >= 11) { const url=`https://wa.me/${phone}?text=${encodeURIComponent(message)}`; if(whatsappWindow)whatsappWindow.location.href=url;else window.open(url,'_blank','noopener'); }
      else { if(whatsappWindow)whatsappWindow.close(); alert('La cotización se guardó, pero el cliente no tiene un WhatsApp válido registrado.'); }
      location.reload();
    } catch (error) { if (whatsappWindow) whatsappWindow.close(); alert(error.message || 'No se pudo cotizar el servicio'); }
    finally { button.disabled = false; }
  }, true);
})();
