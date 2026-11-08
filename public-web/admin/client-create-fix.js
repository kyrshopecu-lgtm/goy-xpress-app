(()=>{
  const config=window.GOY_ADMIN_CONFIG||{};
  const apiBase=String(config.apiBaseUrl||'/api').replace(/\/$/,'');
  const token=()=>sessionStorage.getItem('goyAdminToken')||'';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const bytesToHex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const randomHex=(size=16)=>{const bytes=new Uint8Array(size);crypto.getRandomValues(bytes);return bytesToHex(bytes);};

  document.addEventListener('submit',async event=>{
    if(event.target?.id!=='createClientForm')return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const submit=$('submitClientCreate'),message=$('createClientMessage'),success=$('createClientSuccess');
    if(!submit||!message||!success)return;
    const phone=String($('newClientPhone')?.value||'').trim();
    const enteredCode=String($('newClientUsername')?.value||'').trim().toLowerCase();
    const username=enteredCode||('cli'+phone.replace(/\D/g,'').slice(-7)+randomHex(2));
    if(!/^[a-z0-9._-]{3,30}$/.test(username)){
      message.textContent='El código interno debe tener entre 3 y 30 caracteres y usar solo letras, números, punto, guion o guion bajo.';
      return;
    }
    if($('newClientUsername'))$('newClientUsername').value=username;

    const bank={
      bank:String($('newClientBank')?.value||'').trim(),
      accountType:String($('newClientAccountType')?.value||'').trim(),
      accountNumber:String($('newClientAccountNumber')?.value||'').trim(),
      holderName:String($('newClientHolderName')?.value||'').trim(),
      holderDocument:String($('newClientHolderDocument')?.value||'').trim(),
    };
    const image=$('newClientPreview')?.getAttribute('src')||'';

    submit.disabled=true;
    success.classList.add('hidden');
    message.textContent='Preparando ficha de cliente…';
    try{
      const payload={
        name:String($('newClientName')?.value||'').trim(),
        businessName:String($('newClientBusiness')?.value||'').trim(),
        username,
        phone,
        documentId:String($('newClientDocument')?.value||'').trim(),
        address:String($('newClientAddress')?.value||'').trim(),
        mapUrl:String($('newClientMapUrl')?.value||'').trim(),
        email:String($('newClientEmail')?.value||'').trim(),
        logo:image,
        bankAccounts:(bank.bank||bank.accountNumber||bank.holderName)?[bank]:[],
      };

      message.textContent='Creando ficha de cliente…';
      const response=await fetch(`${apiBase}/admin/clients`,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${token()}`},
        body:JSON.stringify(payload),
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok){
        if(response.status===401){
          sessionStorage.removeItem('goyAdminToken');
          throw new Error('Tu sesión administrativa venció. Vuelve a iniciar sesión.');
        }
        throw new Error(body.error||`No se pudo crear el cliente (HTTP ${response.status}).`);
      }

      message.textContent='Ficha de cliente creada. Las órdenes se gestionan desde administración.';
      success.innerHTML=`<strong>Ficha de cliente creada</strong><code>Código interno: ${esc(username)}</code>${payload.bankAccounts.length?`<code>Cuenta bancaria: ${esc(bank.bank)} · ${esc(bank.accountNumber)}</code>`:''}<button id="refreshClientsSecure" class="primary goy-client-copy" type="button">Cerrar y actualizar lista</button>`;
      success.classList.remove('hidden');
      $('refreshClientsSecure')?.addEventListener('click',()=>location.reload());
      event.target.reset();
      $('newClientPreview')?.removeAttribute('src');
    }catch(error){
      message.textContent=error.message||'No se pudo crear el cliente.';
    }finally{
      submit.disabled=false;
    }
  },true);
})();
