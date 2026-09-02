(()=>{
  const config=window.GOY_ADMIN_CONFIG||{};
  const apiBase=String(config.apiBaseUrl||'').replace(/\/$/,'');
  const token=()=>sessionStorage.getItem('goyAdminToken')||'';
  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const clients=document.getElementById('clients');
  if(!clients||document.getElementById('createClientBtn'))return;

  const style=document.createElement('style');
  style.textContent=`
    .goy-client-tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.goy-client-modal{position:fixed;inset:0;background:rgba(4,20,31,.72);z-index:9999;display:grid;place-items:center;padding:18px}.goy-client-modal.hidden{display:none}.goy-client-card{width:min(760px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:22px;padding:22px;box-shadow:0 30px 80px rgba(0,0,0,.25)}.goy-client-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.goy-client-head button{border:0;background:#eef4f7;border-radius:12px;width:38px;height:38px;font-size:22px;cursor:pointer}.goy-client-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}.goy-client-grid label{display:grid;gap:7px;font-weight:700;color:#173545}.goy-client-grid input{width:100%;box-sizing:border-box;padding:12px 13px;border:1px solid #cbd9e0;border-radius:12px;font:inherit}.goy-client-grid .wide{grid-column:1/-1}.goy-client-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}.goy-client-message{min-height:22px;margin-top:12px;font-weight:700}.goy-client-success{background:#edf9f2;border:1px solid #bde6cb;border-radius:14px;padding:14px;margin-top:14px}.goy-client-success code{display:block;margin-top:6px;word-break:break-all}.goy-client-copy{margin-top:10px}.goy-client-photo-row{display:flex;gap:14px;align-items:center}.goy-client-preview{width:76px;height:76px;border-radius:18px;object-fit:cover;border:1px solid #d5e2e8;background:#f1f6f8}.goy-client-photo-help{font-size:12px;color:#687984;font-weight:500}@media(max-width:700px){.goy-client-grid{grid-template-columns:1fr}.goy-client-grid .wide{grid-column:auto}.goy-client-actions{flex-direction:column-reverse}.goy-client-actions button{width:100%}}
  `;
  document.head.appendChild(style);

  const search=document.getElementById('clientSearch');
  const head=clients.querySelector('.panel-head');
  if(head){
    const tools=document.createElement('div');tools.className='goy-client-tools';
    const btn=document.createElement('button');btn.id='createClientBtn';btn.type='button';btn.className='primary compact';btn.textContent='＋ Crear cliente';
    if(search){search.parentNode.insertBefore(tools,search);tools.appendChild(search);} else head.appendChild(tools);
    tools.appendChild(btn);
  }

  const modal=document.createElement('div');modal.id='createClientModal';modal.className='goy-client-modal hidden';modal.innerHTML=`
    <section class="goy-client-card" role="dialog" aria-modal="true" aria-labelledby="createClientTitle">
      <div class="goy-client-head"><div><span class="eyebrow">Acceso directo</span><h3 id="createClientTitle">Crear cliente</h3><p class="muted">Crea una cuenta con nombre de usuario y contraseña. El correo y la imagen son opcionales.</p></div><button id="closeClientModal" type="button" aria-label="Cerrar">×</button></div>
      <form id="createClientForm">
        <div class="goy-client-grid">
          <label>Nombre completo<input id="newClientName" required autocomplete="off" /></label>
          <label>Negocio / empresa<input id="newClientBusiness" autocomplete="off" /></label>
          <label>Nombre de usuario<input id="newClientUsername" required minlength="3" maxlength="30" pattern="[A-Za-z0-9._-]+" autocomplete="off" placeholder="ej. tiendaquito" /></label>
          <label>WhatsApp<input id="newClientPhone" required inputmode="tel" placeholder="0999999999" /></label>
          <label>Cédula / RUC<input id="newClientDocument" autocomplete="off" /></label>
          <label>Correo (opcional)<input id="newClientEmail" type="email" autocomplete="off" placeholder="cliente@correo.com" /></label>
          <label class="wide">Dirección<input id="newClientAddress" autocomplete="street-address" /></label>
          <label class="wide">Imagen / logotipo (opcional)<div class="goy-client-photo-row"><img id="newClientPreview" class="goy-client-preview" alt="Vista previa" /><div style="flex:1"><input id="newClientImage" type="file" accept="image/jpeg,image/png,image/webp" /><div class="goy-client-photo-help">JPG, PNG o WebP. Máximo recomendado: 1.2 MB.</div></div></div></label>
          <label class="wide">Contraseña temporal<input id="newClientPassword" type="text" required minlength="8" autocomplete="new-password" placeholder="Mínimo 8 caracteres, letras y números" /></label>
        </div>
        <p id="createClientMessage" class="goy-client-message"></p>
        <div id="createClientSuccess" class="goy-client-success hidden"></div>
        <div class="goy-client-actions"><button id="cancelClientCreate" type="button" class="ghost">Cancelar</button><button id="submitClientCreate" type="submit" class="primary">Crear y activar cliente</button></div>
      </form>
    </section>`;
  document.body.appendChild(modal);

  const $=id=>document.getElementById(id);
  let imageData='';
  function open(){modal.classList.remove('hidden');$('newClientName')?.focus();}
  function close(){modal.classList.add('hidden');$('createClientMessage').textContent='';$('createClientSuccess').classList.add('hidden');}
  $('createClientBtn')?.addEventListener('click',open);$('closeClientModal')?.addEventListener('click',close);$('cancelClientCreate')?.addEventListener('click',close);
  modal.addEventListener('click',e=>{if(e.target===modal)close();});

  $('newClientImage')?.addEventListener('change',e=>{
    const file=e.target.files?.[0];imageData='';$('newClientPreview').removeAttribute('src');
    if(!file)return;
    if(file.size>1300000){e.target.value='';$('createClientMessage').textContent='La imagen es demasiado grande. Usa una de máximo 1.2 MB.';return;}
    const reader=new FileReader();
    reader.onload=()=>{imageData=String(reader.result||'');$('newClientPreview').src=imageData;$('createClientMessage').textContent='';};
    reader.onerror=()=>{$('createClientMessage').textContent='No se pudo leer la imagen seleccionada.';};
    reader.readAsDataURL(file);
  });

  $('createClientForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const submit=$('submitClientCreate'),message=$('createClientMessage'),success=$('createClientSuccess');
    const payload={name:$('newClientName').value.trim(),businessName:$('newClientBusiness').value.trim(),username:$('newClientUsername').value.trim().toLowerCase(),phone:$('newClientPhone').value.trim(),documentId:$('newClientDocument').value.trim(),address:$('newClientAddress').value.trim(),email:$('newClientEmail').value.trim(),logo:imageData,password:$('newClientPassword').value};
    message.textContent='Creando cliente…';success.classList.add('hidden');submit.disabled=true;
    try{
      const response=await fetch(`${apiBase}/admin/clients`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token()}`},body:JSON.stringify(payload)});
      let body={};try{body=await response.json();}catch{}
      if(!response.ok)throw new Error(body.error||'No se pudo crear el cliente.');
      message.textContent='Cliente creado y activo.';
      success.innerHTML=`<strong>Credenciales listas para enviar</strong><code>Usuario: ${esc(payload.username)}</code>${payload.email?`<code>Correo opcional: ${esc(payload.email)}</code>`:''}<code>Contraseña: ${esc(payload.password)}</code><button id="copyClientCredentials" class="ghost goy-client-copy" type="button">Copiar credenciales</button><button id="refreshClients" class="primary goy-client-copy" type="button">Cerrar y actualizar lista</button>`;
      success.classList.remove('hidden');
      $('copyClientCredentials')?.addEventListener('click',async()=>{const text=`GOY XPRESS\nUsuario: ${payload.username}${payload.email?`\nCorreo: ${payload.email}`:''}\nContraseña: ${payload.password}`;try{await navigator.clipboard.writeText(text);$('copyClientCredentials').textContent='Copiado';}catch{alert(text);}});
      $('refreshClients')?.addEventListener('click',()=>location.reload());
      e.currentTarget.reset();imageData='';$('newClientPreview').removeAttribute('src');
    }catch(err){message.textContent=err.message||'No se pudo crear el cliente.';}finally{submit.disabled=false;}
  });
})();
