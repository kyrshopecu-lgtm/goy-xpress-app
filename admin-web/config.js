window.GOY_ADMIN_CONFIG = {
  mode: 'api',
  apiBaseUrl: '/api',
  registrationBaseUrl: `${window.location.origin}/registro`,
  requestTimeoutMs: 15000
};

// Evita que el panel quede cargando indefinidamente cuando la API no responde.
(()=>{
  const nativeFetch=window.fetch.bind(window);
  const timeoutMs=Number(window.GOY_ADMIN_CONFIG.requestTimeoutMs||15000);
  window.fetch=async(input,init={})=>{
    const target=typeof input==='string'?input:String(input?.url||'');
    const isGoyApi=target.startsWith('/api')||target.includes('/api/');
    if(!isGoyApi||init.signal)return nativeFetch(input,init);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{return await nativeFetch(input,{...init,signal:controller.signal});}
    catch(error){if(error?.name==='AbortError')throw new Error('El servidor tardó demasiado en responder. Revisa tu conexión e intenta nuevamente.');throw error;}
    finally{clearTimeout(timer);}
  };
})();

window.addEventListener('load',()=>{
  if(!document.querySelector('script[data-goy-sound]')){
    const sound=document.createElement('script');
    sound.src='/admin/goy-sound.js';
    sound.dataset.goySound='1';
    document.body.appendChild(sound);
  }

  if(!document.querySelector('script[data-account-approvals]')){
    const approvals=document.createElement('script');
    approvals.src='/admin/account-approvals.js';
    approvals.dataset.accountApprovals='1';
    document.body.appendChild(approvals);
  }

  if(!document.querySelector('script[data-client-accounts]')){
    const clients=document.createElement('script');
    clients.src='/admin/client-accounts.js';
    clients.dataset.clientAccounts='1';
    document.body.appendChild(clients);
  }
});
