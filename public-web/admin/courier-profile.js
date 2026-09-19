(()=>{
  const apiBase=String(window.GOY_ADMIN_CONFIG?.apiBaseUrl||'/api').replace(/\/$/,'');
  const token=()=>sessionStorage.getItem('goyAdminToken')||'';
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const initials=n=>String(n||'GOY').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  const serviceName=o=>o.serviceLabel||({shipment:o.deliveryMode==='express'?'Envío Express':'Entrega programada',procedure:'Trámite ejecutivo',deposit:'Depósito',diverse:'Servicio diverso'}[o.kind]||o.kind||'Servicio');
  const fmt=d=>{try{return new Intl.DateTimeFormat('es-EC',{dateStyle:'medium',timeStyle:'short'}).format(new Date(d));}catch{return d||'-'}};
  async function api(path){const r=await fetch(`${apiBase}${path}`,{headers:{Authorization:`Bearer ${token()}`}});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'No se pudo cargar la información.');return b;}

  const style=document.createElement('style');
  style.textContent=`
    .goy-courier-photo{width:72px;height:72px;border-radius:24px;overflow:hidden;border:3px solid #e8f9ff;background:linear-gradient(145deg,#071c2a,#00a9e8);color:#fff;display:grid;place-items:center;font-weight:900;font-size:22px;cursor:pointer;margin-bottom:10px;padding:0;box-shadow:0 10px 26px rgba(0,169,232,.2);transition:.2s ease}
    .goy-courier-photo img{width:100%;height:100%;object-fit:cover;display:block}.goy-courier-photo:hover{transform:translateY(-2px);outline:3px solid rgba(0,169,232,.18)}
    .goy-history-modal{position:fixed;inset:0;background:rgba(3,20,30,.72);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}
    .goy-history-sheet{width:min(820px,100%);background:#f7fbfd;border-radius:28px;padding:22px;box-shadow:0 28px 90px rgba(0,0,0,.28)}
    .goy-history-head{display:flex;gap:14px;align-items:center}.goy-history-head .goy-courier-photo{width:88px;height:88px;margin:0;cursor:default}.goy-history-copy{flex:1}.goy-history-copy h3{margin:0;color:#071c2a;font-size:23px}.goy-history-copy p{margin:4px 0;color:#657a84}.goy-close{border:0;background:#eaf2f5;color:#173746;border-radius:50%;width:40px;height:40px;font-size:24px;cursor:pointer}
    .goy-history-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.goy-history-stat{background:#fff;border:1px solid #dce8ed;border-radius:17px;padding:13px}.goy-history-stat strong{display:block;color:#071c2a;font-size:23px}.goy-history-stat span{font-size:11px;color:#6c7e87}
    .goy-history-list{background:#fff;border:1px solid #dce8ed;border-radius:20px;overflow:hidden}.goy-history-title{margin:20px 0 10px;color:#071c2a}.goy-history-row{display:grid;grid-template-columns:130px 1.2fr 1fr 110px;gap:10px;padding:13px 15px;border-bottom:1px solid #edf2f4;align-items:center}.goy-history-row:last-child{border-bottom:0}.goy-history-row strong{color:#0b2f40}.goy-history-row small{color:#70818a}.goy-history-status{display:inline-block;padding:5px 8px;border-radius:999px;background:#edf8fd;color:#08789f;font-size:10px;font-weight:900;text-align:center}.goy-empty{padding:22px;text-align:center;color:#71838c}
    @media(max-width:650px){.goy-history-modal{padding:10px 6px}.goy-history-sheet{border-radius:20px;padding:15px}.goy-history-stats{gap:6px}.goy-history-stat{padding:10px 7px}.goy-history-row{grid-template-columns:1fr;gap:4px}.goy-history-head{align-items:flex-start}}
  `;
  document.head.appendChild(style);

  function photoMarkup(photo,name){return photo?`<img src="${esc(photo)}" alt="Foto de ${esc(name)}">`:esc(initials(name));}

  async function loadAllOrders(){
    const first=await api('/admin/data');
    const cycles=first.availableCycles||[];
    const all=[...(first.requests||[])];
    for(const cycle of cycles){
      if(cycle===first.activeCycle)continue;
      try{const part=await api(`/admin/data?cycle=${encodeURIComponent(cycle)}`);all.push(...(part.requests||[]));}catch{}
    }
    const seen=new Set();
    return {couriers:first.couriers||[],orders:all.filter(o=>{const k=o.code||o.id;if(!k||seen.has(k))return false;seen.add(k);return true;})};
  }

  async function openHistory(courier){
    const overlay=document.createElement('div');overlay.className='goy-history-modal';overlay.innerHTML='<div class="goy-history-sheet"><p>Cargando historial de entregas…</p></div>';document.body.appendChild(overlay);
    overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
    try{
      const full=await loadAllOrders();
      const id=courier.id||courier.userId;
      const name=courier.name||courier.fullName||'Mensajero';
      const phone=courier.phone||courier.whatsapp||'';
      const orders=full.orders.filter(o=>String(o.courierId||'')===String(id)||(o.courier&&String(o.courier).trim()===String(name).trim())).sort((a,b)=>String(b.finishedAt||b.updatedAt||b.createdAt||'').localeCompare(String(a.finishedAt||a.updatedAt||a.createdAt||'')));
      const completed=orders.filter(o=>['Entrega finalizada','Finalizado','Entregado'].includes(o.status)).length;
      const active=orders.filter(o=>!['Entrega finalizada','Finalizado','Entregado','Cancelado'].includes(o.status)).length;
      const sheet=overlay.querySelector('.goy-history-sheet');
      sheet.innerHTML=`
        <div class="goy-history-head">
          <div class="goy-courier-photo">${photoMarkup(courier.photo,name)}</div>
          <div class="goy-history-copy"><h3>${esc(name)}</h3><p>Operador logístico</p><p>${esc(phone)} · ${esc(courier.status||'')}</p></div>
          <button class="goy-close" type="button" aria-label="Cerrar">×</button>
        </div>
        <div class="goy-history-stats">
          <div class="goy-history-stat"><strong>${orders.length}</strong><span>Servicios registrados</span></div>
          <div class="goy-history-stat"><strong>${completed}</strong><span>Entregas finalizadas</span></div>
          <div class="goy-history-stat"><strong>${active}</strong><span>En curso</span></div>
        </div>
        <h4 class="goy-history-title">Historial de entregas</h4>
        <div class="goy-history-list">${orders.length?orders.map(o=>`<div class="goy-history-row"><div><strong>${esc(o.code||o.id||'-')}</strong><br><small>${esc(fmt(o.finishedAt||o.updatedAt||o.createdAt))}</small></div><div><strong>${esc(serviceName(o))}</strong><br><small>${esc(o.customer||'Cliente')}</small></div><div><small>${esc(o.destinationAddress||o.address||'Sin dirección')}</small></div><div><span class="goy-history-status">${esc(o.status||'Pendiente')}</span></div></div>`).join(''):'<div class="goy-empty">Este mensajero todavía no tiene entregas registradas.</div>'}</div>`;
      sheet.querySelector('.goy-close').onclick=()=>overlay.remove();
    }catch(e){overlay.querySelector('.goy-history-sheet').innerHTML=`<button class="goy-close" type="button">×</button><p>${esc(e.message)}</p>`;overlay.querySelector('.goy-close').onclick=()=>overlay.remove();}
  }

  async function decorate(){
    if(!token())return;
    let couriers=[];try{couriers=(await api('/admin/data')).couriers||[];}catch{return;}
    document.querySelectorAll('#courierCards .courier-card').forEach(card=>{
      if(card.dataset.goyHistoryReady)return;
      const text=card.textContent;
      const c=couriers.find(x=>text.includes(x.name||x.fullName||'')&&(text.includes(x.phone||x.whatsapp||'')||!x.phone));
      if(!c)return;
      card.dataset.goyHistoryReady='1';
      const btn=document.createElement('button');btn.type='button';btn.className='goy-courier-photo';btn.title='Ver perfil e historial de entregas';btn.innerHTML=photoMarkup(c.photo,c.name||c.fullName);btn.onclick=e=>{e.stopPropagation();openHistory(c)};card.insertBefore(btn,card.firstChild);
      card.style.cursor='pointer';card.title='Presiona para ver historial de entregas';card.addEventListener('click',()=>openHistory(c));
    });
  }
  const obs=new MutationObserver(()=>decorate());obs.observe(document.body,{childList:true,subtree:true});setTimeout(decorate,700);
})();