window.GOY_ADMIN_CONFIG = {
  mode: 'api',
  apiBaseUrl: '/api',
  registrationBaseUrl: `${window.location.origin}/registro`,
  requestTimeoutMs: 15000
};

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
  const load=(attr,src)=>{if(document.querySelector(`script[${attr}]`))return;const s=document.createElement('script');s.src=src;s.setAttribute(attr,'1');document.body.appendChild(s);};
  load('data-goy-sound','/admin/goy-sound.js');
  load('data-account-approvals','/admin/account-approvals.js');
  load('data-client-accounts','/admin/client-accounts.js');
  load('data-admin-management','/admin/admin-management.js');
  load('data-custom-service-orders','/admin/custom-service-orders.js');
  load('data-courier-profile','/admin/courier-profile.js');
  load('data-wait-notifications','/admin/wait-notifications.js');
  load('data-order-evidence','/admin/order-evidence.js');
  load('data-report-filters','/admin/report-filters.js');
  load('data-client-banking','/admin/client-banking.js');
});
