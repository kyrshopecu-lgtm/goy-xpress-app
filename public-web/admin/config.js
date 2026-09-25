window.GOY_ADMIN_CONFIG = {
  mode: 'api',
  apiBaseUrl: '/api',
  registrationBaseUrl: `${window.location.origin}/registro`,
  requestTimeoutMs: 15000
};

(()=>{
  const nativeFetch=window.fetch.bind(window);
  const timeoutMs=Number(window.GOY_ADMIN_CONFIG.requestTimeoutMs||15000);
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  window.fetch=async(input,init={})=>{
    let target=typeof input==='string'?input:String(input?.url||'');
    const isGoyApi=target.startsWith('/api')||target.includes('/api/');
    if(!isGoyApi||init.signal)return nativeFetch(input,init);

    const isAdminData=/\/api\/admin\/data(?:\?|$)/.test(target);
    const attempts=isAdminData?3:1;
    let lastError=null;

    for(let attempt=1;attempt<=attempts;attempt++){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),timeoutMs);
      try{
        const response=await nativeFetch(input,{...init,cache:'no-store',signal:controller.signal});
        if(isAdminData && attempt<attempts && (response.status===429||response.status>=500)){
          await sleep(300*attempt);
          continue;
        }
        if(isAdminData && !response.ok && !String(response.headers.get('content-type')||'').includes('application/json')){
          const detail=await response.clone().text().catch(()=> '');
          return new Response(JSON.stringify({error:`No se pudo cargar la información administrativa (HTTP ${response.status})${detail?`: ${detail.slice(0,180)}`:''}`}),{
            status:response.status,
            headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
          });
        }
        return response;
      }catch(error){
        lastError=error;
        if(attempt<attempts){await sleep(300*attempt);continue;}
        if(error?.name==='AbortError')throw new Error('El servidor tardó demasiado en responder. Revisa tu conexión e intenta nuevamente.');
        throw error;
      }finally{clearTimeout(timer);}
    }
    throw lastError||new Error('No se pudo completar la operación.');
  };
})();

function goyHideInternalIds(){
  const table=document.querySelector('#clients table');
  if(!table)return;
  const headers=Array.from(table.querySelectorAll('thead th'));
  const idx=headers.findIndex(th=>/c[eé]dula\s*\/\s*ruc/i.test(th.textContent||''));
  if(idx<0)return;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  table.querySelectorAll('tbody tr').forEach(row=>{
    const cell=row.children[idx];
    if(cell&&uuid.test(String(cell.textContent||'').trim()))cell.textContent='—';
  });
}

window.addEventListener('load',()=>{
  const load=(attr,src)=>{if(document.querySelector(`script[${attr}]`))return;const s=document.createElement('script');s.src=src;s.setAttribute(attr,'1');document.body.appendChild(s);};
  load('data-goy-sound','/admin/goy-sound.js');
  load('data-account-approvals','/admin/account-approvals.js');
  load('data-client-accounts','/admin/client-accounts.js');
  load('data-client-create-fix','/admin/client-create-fix.js');
  load('data-admin-management','/admin/admin-management.js');
  load('data-custom-service-orders','/admin/custom-service-orders.js');
  load('data-courier-profile','/admin/courier-profile.js');
  load('data-wait-notifications','/admin/wait-notifications.js');
  load('data-order-evidence','/admin/order-evidence.js');
  load('data-report-filters','/admin/report-filters.js');
  load('data-client-banking','/admin/client-banking.js');
  load('data-assignment-fix','/admin/assignment-fix.js');

  const body=document.getElementById('clientsBody');
  if(body){
    const observer=new MutationObserver(()=>goyHideInternalIds());
    observer.observe(body,{childList:true,subtree:true,characterData:true});
    goyHideInternalIds();
  }
});
