(() => {
  const config=window.GOY_ADMIN_CONFIG||{};
  const apiBase=String(config.apiBaseUrl||'/api').replace(/\/$/,'');
  const $=id=>document.getElementById(id);
  const token=()=>sessionStorage.getItem('goyAdminToken')||'';
  const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

  async function api(path,options={}){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    const headers={'Content-Type':'application/json',...(options.headers||{})};
    if(token())headers.Authorization=`Bearer ${token()}`;
    try{
      const response=await fetch(`${apiBase}${path}`,{...options,headers,signal:controller.signal});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||'No se pudo crear el cliente.');
      return body;
    }catch(error){
      if(error?.name==='AbortError')throw new Error('El servidor tardó demasiado en responder.');
      throw error;
    }finally{clearTimeout(timeout);}
  }

  function generatePassword(){
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes=new Uint32Array(9);
    crypto.getRandomValues(bytes);
    return `Goy${2+(bytes[0]%8)}${Array.from(bytes.slice(1),value=>alphabet[value%alphabet.length]).join('')}`;
  }

  function closeModal(){document.getElementById('clientAccountModal')?.remove();}
  function whatsappNumber(value){
    const digits=String(value||'').replace(/\D/g,'');
    if(digits.startsWith('593'))return digits;
    if(digits.startsWith('0'))return `593${digits.slice(1)}`;
    return digits;
  }
  function accessMessage({name,email,password}){
    return `Hola ${name}, tu acceso a GOY XPRESS está listo.\n\nUsuario: ${email}\nContraseña: ${password}\n\nIngresa en la aplicación de clientes con estos datos.`;
  }

  function renderSuccess(result,payload){
    const user=result.user||{};
    const message=accessMessage({name:user.name||payload.name,email:user.email||payload.email,password:payload.password});
    const phone=whatsappNumber(user.phone||payload.phone);
    return `
      <div class="success-card client-account-success">
        <div class="success-icon">✓</div>
        <div>
          <strong>Cuenta creada y activa</strong>
          <p>${escapeHtml(user.businessName||user.name||payload.name)} ya puede ingresar sin completar un registro.</p>
        </div>
      </div>
      <div class="credentials-card">
        <span class="eyebrow">Datos para enviar al cliente</span>
        <div class="credential-row"><span>Usuario</span><strong>${escapeHtml(user.email||payload.email)}</strong></div>
        <div class="credential-row"><span>Contraseña</span><strong>${escapeHtml(payload.password)}</strong></div>
        <p>Guarda o envía estos datos ahora. Por seguridad, la contraseña no podrá consultarse después.</p>
      </div>
      <div class="modal-actions client-account-actions">
        <button type="button" class="ghost" id="copyClientAccess">Copiar acceso</button>
        ${phone?'<button type="button" class="primary action-primary" id="sendClientWhatsApp">Enviar por WhatsApp</button>':''}
        <button type="button" class="primary" id="finishClientAccount">Finalizar</button>
      </div>
      <textarea id="clientAccessMessage" class="hidden">${escapeHtml(message)}</textarea>`;
  }

  function openModal(){
    if(!token())return alert('Inicia sesión como administrador para crear clientes.');
    closeModal();
    const overlay=document.createElement('div');
    overlay.id='clientAccountModal';
    overlay.className='modal-overlay';
    overlay.innerHTML=`
      <div class="modern-modal client-account-modal" role="dialog" aria-modal="true" aria-labelledby="clientAccountTitle">
        <div class="modal-head">
          <div><span class="eyebrow">Cuenta de acceso</span><h3 id="clientAccountTitle">Crear cliente</h3><p>El correo será el usuario. La cuenta quedará habilitada inmediatamente.</p></div>
          <button class="modal-close" type="button" aria-label="Cerrar">×</button>
        </div>
        <form id="clientAccountForm" class="admin-order-form client-account-form">
          <div class="form-grid two">
            <label>Nombre de contacto<input name="name" required minlength="2" autocomplete="name" placeholder="Nombre completo"></label>
            <label>Empresa / emprendimiento<input name="businessName" autocomplete="organization" placeholder="Nombre comercial"></label>
            <label>WhatsApp<input name="phone" required inputmode="tel" autocomplete="tel" placeholder="0991234567"></label>
            <label>Cédula / RUC<input name="documentId" inputmode="numeric" placeholder="Identificación"></label>
          </div>
          <label>Dirección<input name="address" autocomplete="street-address" placeholder="Dirección habitual del cliente"></label>
          <div class="form-grid two">
            <label>Usuario (correo electrónico)<input name="email" type="email" required autocomplete="off" placeholder="cliente@ejemplo.com"></label>
            <label>Contraseña
              <div class="password-tools"><input id="clientAccountPassword" name="password" type="text" required minlength="8" autocomplete="new-password" placeholder="Mínimo 8 caracteres"><button id="generateClientPassword" class="ghost" type="button">Generar</button></div>
            </label>
          </div>
          <div class="map-hint">La contraseña debe tener al menos 8 caracteres e incluir letras y números. Se guarda protegida y no se mostrará nuevamente.</div>
          <div id="clientAccountMessage" class="form-message" aria-live="polite"></div>
          <div class="modal-actions"><button type="button" class="ghost modal-cancel">Cancelar</button><button id="clientAccountSubmit" type="submit" class="primary action-primary">Crear y habilitar cliente</button></div>
        </form>
        <div id="clientAccountResult"></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click',event=>{if(event.target===overlay)closeModal();});
    overlay.querySelector('.modal-close').addEventListener('click',closeModal);
    overlay.querySelector('.modal-cancel').addEventListener('click',closeModal);
    $('generateClientPassword').addEventListener('click',()=>{$('clientAccountPassword').value=generatePassword();$('clientAccountPassword').focus();});
    $('clientAccountPassword').value=generatePassword();
    overlay.querySelector('input[name="name"]')?.focus();

    $('clientAccountForm').addEventListener('submit',async event=>{
      event.preventDefault();
      const form=event.currentTarget;
      const submit=$('clientAccountSubmit');
      const message=$('clientAccountMessage');
      const values=new FormData(form);
      const payload=Object.fromEntries(['name','businessName','phone','documentId','address','email','password'].map(key=>[key,String(values.get(key)||'').trim()]));
      message.textContent='';
      submit.disabled=true;
      submit.textContent='Creando…';
      try{
        const result=await api('/admin/clients',{method:'POST',body:JSON.stringify(payload)});
        form.classList.add('hidden');
        $('clientAccountResult').innerHTML=renderSuccess(result,payload);
        window.dispatchEvent(new CustomEvent('goy:reload-admin-data'));
        $('copyClientAccess').addEventListener('click',async event=>{
          const text=$('clientAccessMessage').value;
          try{await navigator.clipboard.writeText(text);event.currentTarget.textContent='Acceso copiado';}
          catch{const area=$('clientAccessMessage');area.classList.remove('hidden');area.select();}
        });
        $('sendClientWhatsApp')?.addEventListener('click',()=>{
          const phone=whatsappNumber(result.user?.phone||payload.phone);
          const text=$('clientAccessMessage').value;
          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`,'_blank','noopener');
        });
        $('finishClientAccount').addEventListener('click',()=>{closeModal();document.querySelector('[data-view="clients"]')?.click();});
      }catch(error){
        message.textContent=error.message||'No se pudo crear el cliente.';
        submit.disabled=false;
        submit.textContent='Crear y habilitar cliente';
      }
    });
  }

  ['createClientButton','quickCreateClient'].forEach(id=>$(id)?.addEventListener('click',openModal));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('clientAccountModal'))closeModal();});
})();
