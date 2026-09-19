(()=>{
  const apiBase=String(window.GOY_ADMIN_CONFIG?.apiBaseUrl||'/api').replace(/\/$/,'');
  const token=()=>sessionStorage.getItem('goyAdminToken')||'';
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const shown=new Map();

  const style=document.createElement('style');
  style.textContent=`
    .goy-wait-stack{position:fixed;right:18px;top:18px;z-index:100000;width:min(390px,calc(100vw - 24px));display:grid;gap:10px}
    .goy-wait-toast{background:linear-gradient(135deg,#fff8dc,#fff);border:1px solid #f0cd67;border-left:6px solid #e3a400;border-radius:18px;padding:14px 14px 12px;box-shadow:0 18px 50px rgba(67,47,0,.20)}
    .goy-wait-toast strong{display:block;color:#5f4300;font-size:15px}.goy-wait-toast p{margin:5px 0;color:#695d3d;font-size:12px;line-height:1.45}.goy-wait-actions{display:flex;gap:8px;margin-top:10px}.goy-wait-actions button{flex:1;border:0;border-radius:11px;padding:10px 8px;font-weight:900;cursor:pointer}.goy-wait-open{background:#071c2a;color:#fff}.goy-wait-close{background:#f4ecd4;color:#705b1d}
    .goy-wait-indicator{position:fixed;right:18px;bottom:18px;z-index:99998;background:#071c2a;color:#fff;border-radius:999px;padding:10px 14px;font-size:11px;font-weight:900;box-shadow:0 12px 30px rgba(7,28,42,.25);display:none}.goy-wait-indicator.active{display:block}
    @media(max-width:650px){.goy-wait-stack{right:8px;top:8px;width:calc(100vw - 16px)}.goy-wait-indicator{right:10px;bottom:10px}}
  `;
  document.head.appendChild(style);
  const stack=document.createElement('div');stack.className='goy-wait-stack';document.body.appendChild(stack);
  const indicator=document.createElement('div');indicator.className='goy-wait-indicator';document.body.appendChild(indicator);

  function beep(){
    try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;const ctx=new AC(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=880;gain.gain.setValueAtTime(.05,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.35);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.35);}catch{}
  }
  function needsDecision(o){
    const free=Number(o.wait?.freeMinutes||10),elapsed=Number(o.wait?.elapsedMinutes||0),notes=String(o.adminNotes||'');
    return elapsed>=free&&!notes.includes('WAIT_CONTINUE')&&!notes.includes('WAIT_NEXT_DELIVERY')&&!['Entrega finalizada','Cancelado'].includes(o.status);
  }
  function openOrders(){
    document.querySelector('[data-view="orders"]')?.click();
    const f=document.getElementById('orderFilter');if(f){f.value='En camino';f.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  function toast(o){
    const id=String(o.code||o.id||'');if(!id||shown.has(id))return;
    const el=document.createElement('div');el.className='goy-wait-toast';el.innerHTML=`<strong>⏱ Tiempo de espera agotado</strong><p><b>${esc(id)}</b> · ${esc(o.courier||'Mensajero')}</p><p>Se alcanzó el tiempo gratuito. Debes decidir si continúa esperando o pasa a la siguiente entrega antes de generar tiempo adicional.</p><div class="goy-wait-actions"><button class="goy-wait-open">Revisar orden</button><button class="goy-wait-close">Cerrar aviso</button></div>`;
    stack.appendChild(el);shown.set(id,el);beep();
    el.querySelector('.goy-wait-open').onclick=()=>{openOrders();el.remove();shown.delete(id)};
    el.querySelector('.goy-wait-close').onclick=()=>{el.remove();shown.delete(id)};
  }
  async function poll(){
    if(!token())return;
    try{
      const r=await fetch(`${apiBase}/admin/data`,{headers:{Authorization:`Bearer ${token()}`}});if(!r.ok)return;const d=await r.json();const waiting=(d.requests||[]).filter(needsDecision);
      indicator.textContent=`⏱ ${waiting.length} espera${waiting.length===1?'':'s'} requiere${waiting.length===1?'':'n'} decisión`;
      indicator.classList.toggle('active',waiting.length>0);
      waiting.forEach(toast);
      const activeIds=new Set(waiting.map(o=>String(o.code||o.id||'')));
      for(const [id,el] of shown){if(!activeIds.has(id)){el.remove();shown.delete(id)}}
    }catch{}
  }
  setInterval(poll,5000);setTimeout(poll,1200);
})();