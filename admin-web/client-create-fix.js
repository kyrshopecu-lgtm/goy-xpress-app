(()=>{
  const config=window.GOY_ADMIN_CONFIG||{};
  const apiBase=String(config.apiBaseUrl||'/api').replace(/\/$/,'');
  const token=()=>sessionStorage.getItem('goyAdminToken')||'';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const bytesToHex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const randomHex=(size=16)=>{const bytes=new Uint8Array(size);crypto.getRandomValues(bytes);return bytesToHex(bytes);};

  async function protectPassword(password,salt,iterations=100000){
    if(!globalThis.crypto?.subtle)throw new Error('Este navegador no permite proteger la contraseña. Actualiza el navegador e intenta nuevamente.');
    const encoder=new TextEncoder();
    const key=await crypto.subtle.importKey('raw',encoder.encode(String(password||'')),'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-512',salt:encoder.encode(String(salt||'')),iterations},key,512);
    return bytesToHex(new Uint8Array(bits));
  }

  document.addEventListener('submit',async event=>{
    if(event.target?.id!=='createClientForm')return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const submit=$('submitClientCreate'),message=$('createClientMessage'),success=$('createClientSuccess');
    if(!submit||!message||!success)return;
    const password=$('newClientPassword')?.value||'';
    if(password.length<8||!/[A-Za-z]/.test(password)||!/\d/.test(password)){
      message.textContent='La contraseña debe tener al menos 8 caracteres e incluir letras y números.';
      return;
    }
    const username=String($('newClientUsername')?.value||'').trim().toLowerCase();
    if(!/^[a-z0-9._-]{3,30}$/.test(username)){
      message.textContent='El usuario debe tener entre 3 y 30 caracteres y usar solo letras, números, punto, guion o guion bajo.';
      return;
    }

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
    message.textContent='Protegiendo contraseña…';
    try{
      const passwordSalt=randomHex(16),passwordIterations=100000;
      const passwordHash=await protectPassword(password,passwordSalt,passwordIterations);
      const payload={
        name:String($('newClientName')?.value||'').trim(),
        businessName:String($('newClientBusiness')?.value||'').trim(),
        username,
        phone:String($('newClientPhone')?.value||'').trim(),
        documentId:String($('newClientDocument')?.value||'').trim(),
        address:String($('newClientAddress')?.value||'').trim(),
        mapUrl:String($('newClientMapUrl')?.value||'').trim(),
        email:String($('newClientEmail')?.value||'').trim(),
        logo:image,
        passwordSalt,passwordHash,passwordIterations,
        bankAccounts:(bank.bank||bank.accountNumber||bank.holderName)?[bank]:[],
      };

      message.textContent='Creando cliente…';
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

      message.textContent='Cliente creado y activo.';
      success.innerHTML=`<strong>Credenciales listas para enviar</strong><code>Usuario: ${esc(username)}</code>${payload.email?`<code>Correo opcional: ${esc(payload.email)}</code>`:''}<code>Contraseña: ${esc(password)}</code>${payload.bankAccounts.length?`<code>Cuenta bancaria: ${esc(bank.bank)} · ${esc(bank.accountNumber)}</code>`:''}<button id="copyClientCredentialsSecure" class="ghost goy-client-copy" type="button">Copiar credenciales</button><button id="refreshClientsSecure" class="primary goy-client-copy" type="button">Cerrar y actualizar lista</button>`;
      success.classList.remove('hidden');
      $('copyClientCredentialsSecure')?.addEventListener('click',async()=>{
        const text=`GOY XPRESS\nUsuario: ${username}${payload.email?`\nCorreo: ${payload.email}`:''}\nContraseña: ${password}`;
        try{await navigator.clipboard.writeText(text);$('copyClientCredentialsSecure').textContent='Copiado';}catch{alert(text);}
      });
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
