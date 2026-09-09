(()=>{
  const config=window.GOY_ADMIN_CONFIG||{};
  const apiBase=String(config.apiBaseUrl||'/api').replace(/\/$/,'');
  let currentCode='';
  let busy=false;

  function token(){return sessionStorage.getItem('goyAdminToken')||'';}
  function ensureStyles(){
    if(document.getElementById('goyWaitAdminStyles'))return;
    const style=document.createElement('style');
    style.id='goyWaitAdminStyles';
    style.textContent=`
      .goy-wait-overlay{position:fixed;inset:0;background:rgba(3,18,28,.66);z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px}
      .goy-wait-card{width:min(520px,100%);background:#fff;border-radius:22px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.28);font-family:inherit;color:#102c39}
      .goy-wait-kicker{font-size:12px;font-weight:900;letter-spacing:.08em;color:#c47a00;text-transform:uppercase}
      .goy-wait-title{font-size:25px;line-height:1.15;font-weight:900;margin:7px 0 8px}
      .goy-wait-meta{background:#f4f8fa;border:1px solid #dce8ed;border-radius:14px;padding:13px;margin:14px 0;color:#48616d;line-height:1.55}
      .goy-wait-time{font-size:36px;font-weight:900;color:#0b2f40;margin:4px 0}
      .goy-wait-note{font-size:13px;line-height:1.5;color:#617985;margin-bottom:16px}
      .goy-wait-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .goy-wait-actions button{border:0;border-radius:13px;padding:14px 12px;font-weight:900;cursor:pointer;font-size:14px}
      .goy-wait-continue{background:#38a844;color:#fff}.goy-wait-next{background:#0b2f40;color:#fff}
      .goy-wait-actions button:disabled{opacity:.5;cursor:wait}
      @media(max-width:560px){.goy-wait-actions{grid-template-columns:1fr}.goy-wait-card{padding:18px}.goy-wait-title{font-size:22px}}
    `;
    document.head.appendChild(style);
  }

  function close(){document.getElementById('goyWaitAdminOverlay')?.remove();currentCode='';document.title=document.title.replace(/^⚠️ ESPERA · /,'');}
  function show(order){
    if(!order?.code||currentCode===order.code)return;
    close();ensureStyles();currentCode=order.code;
    document.title=`⚠️ ESPERA · ${document.title}`;
    const overlay=document.createElement('div');
    overlay.id='goyWaitAdminOverlay';overlay.className='goy-wait-overlay';
    const wait=order.wait||{};
    overlay.innerHTML=`<section class="goy-wait-card" role="dialog" aria-modal="true" aria-labelledby="goyWaitTitle">
      <div class="goy-wait-kicker">Decisión requerida</div>
      <div class="goy-wait-title" id="goyWaitTitle">El mensajero llegó al límite de espera</div>
      <div class="goy-wait-meta"><strong>${escapeHtml(order.code)}</strong><br>${escapeHtml(order.customer||order.businessName||'Cliente')}<br>Mensajero: ${escapeHtml(order.courier||'Asignado')}</div>
      <div class="goy-wait-time">${Number(wait.elapsedMinutes||wait.freeMinutes||10)} min</div>
      <div class="goy-wait-note">Todavía no se está sumando ningún valor adicional. Elige si el mensajero debe continuar esperando o pasar a la siguiente entrega.</div>
      <div class="goy-wait-actions"><button class="goy-wait-continue" data-wait-choice="continue">Continuar esperando</button><button class="goy-wait-next" data-wait-choice="next">Pasar a siguiente entrega</button></div>
    </section>`;
    overlay.addEventListener('click',async e=>{const button=e.target.closest('[data-wait-choice]');if(!button||busy)return;busy=true;overlay.querySelectorAll('button').forEach(b=>b.disabled=true);try{const response=await fetch(`${apiBase}/admin/requests/${encodeURIComponent(order.code)}/wait-decision`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token()}`},body:JSON.stringify({decision:button.dataset.waitChoice})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'No se pudo guardar la decisión.');close();window.dispatchEvent(new CustomEvent('goy-wait-decision',{detail:{code:order.code,decision:button.dataset.waitChoice}}));}catch(error){alert(error.message||'No se pudo guardar la decisión.');overlay.querySelectorAll('button').forEach(b=>b.disabled=false);}finally{busy=false;}});
    document.body.appendChild(overlay);
  }
  function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  async function check(){
    if(!token()||busy)return;
    try{const response=await fetch(`${apiBase}/admin/data`,{headers:{Authorization:`Bearer ${token()}`}});if(!response.ok)return;const data=await response.json();const pending=(data.requests||[]).find(r=>r.wait?.requiresDecision&&!r.wait?.decision&&!['Entrega finalizada','Cancelado'].includes(r.status));if(pending)show(pending);else if(currentCode)close();}catch{}
  }
  setInterval(check,5000);setTimeout(check,1200);
})();
