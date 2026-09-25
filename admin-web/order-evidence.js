(()=>{
  const apiBase=String(window.GOY_ADMIN_CONFIG?.apiBaseUrl||'/api').replace(/\/$/,'');
  const token=()=>sessionStorage.getItem('goyAdminToken')||'';
  const tbody=document.getElementById('ordersBody');
  if(!tbody)return;

  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const validImage=v=>/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(v||''));
  const addMany=(list,label,items)=>{(Array.isArray(items)?items:[]).forEach((item,index)=>{const src=typeof item==='string'?item:item?.photo;if(validImage(src))list.push([`${label} ${index+1}`,src]);});};

  function photosOf(payload){
    const e=payload?.evidence||{};
    const list=[];
    if(validImage(e.pickupPhoto))list.push(['Retiro principal',e.pickupPhoto]);
    addMany(list,'Retiro adicional',e.pickupPhotos);
    addMany(list,'Servicio',e.servicePhotos);
    if(validImage(e.deliveryPhoto))list.push(['Entrega principal',e.deliveryPhoto]);
    addMany(list,'Entrega adicional',e.deliveryPhotos);
    const deposit=e.depositPhoto||payload?.wallet?.depositPhoto;
    if(validImage(deposit))list.push(['Depósito principal',deposit]);
    addMany(list,'Depósito adicional',e.depositPhotos);
    addMany(list,'Evidencia adicional',e.additionalPhotos);
    return list;
  }

  function ensureStyle(){
    if(document.getElementById('goy-evidence-style'))return;
    const s=document.createElement('style');s.id='goy-evidence-style';s.textContent=`
      .goy-evidence-btn{border:1px solid #cbe7ef;background:#f4fbfd;color:#0b7894;border-radius:10px;padding:8px 10px;font-weight:900;cursor:pointer;margin-left:6px;white-space:nowrap}
      .goy-evidence-modal{position:fixed;inset:0;background:rgba(4,22,31,.72);z-index:100000;display:grid;place-items:center;padding:16px}
      .goy-evidence-sheet{width:min(900px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:22px;padding:20px;box-shadow:0 28px 80px rgba(0,0,0,.28)}
      .goy-evidence-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.goy-evidence-head h3{margin:3px 0;color:#0b2f40}
      .goy-evidence-close{width:40px;height:40px;border:0;border-radius:50%;font-size:24px;background:#edf4f6;cursor:pointer}
      .goy-evidence-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:18px}
      .goy-evidence-card{border:1px solid #dce8ed;border-radius:16px;padding:10px;background:#f8fbfc}.goy-evidence-card img{width:100%;aspect-ratio:4/3;object-fit:contain;border-radius:12px;background:#eaf1f4}.goy-evidence-card strong{display:block;margin-top:9px;color:#0b2f40}
      .goy-evidence-empty{padding:28px;text-align:center;color:#758790;background:#f6fafb;border-radius:15px;margin-top:16px}
      @media(max-width:600px){.goy-evidence-sheet{padding:15px;border-radius:16px}.goy-evidence-grid{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  async function fetchEvidence(code){
    const response=await fetch(`${apiBase}/admin/requests/${encodeURIComponent(code)}/evidence`,{headers:{Authorization:`Bearer ${token()}`}});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.error||'No se pudieron cargar las fotografías.');
    return body;
  }

  async function openEvidence(code,button){
    const original=button.textContent;button.disabled=true;button.textContent='Cargando…';
    try{
      const payload=await fetchEvidence(code),photos=photosOf(payload),overlay=document.createElement('div');
      overlay.className='goy-evidence-modal';
      overlay.innerHTML=`<section class="goy-evidence-sheet" role="dialog" aria-modal="true"><div class="goy-evidence-head"><div><span class="eyebrow">Evidencias del mensajero</span><h3>${esc(payload.code||code)}</h3></div><button class="goy-evidence-close" type="button">×</button></div>${photos.length?`<div class="goy-evidence-grid">${photos.map(([label,src])=>`<article class="goy-evidence-card"><img src="${src}" alt="Foto de ${esc(label.toLowerCase())}"><strong>${esc(label)}</strong></article>`).join('')}</div>`:'<div class="goy-evidence-empty">El mensajero todavía no ha registrado fotografías para esta orden.</div>'}</section>`;
      document.body.appendChild(overlay);
      const close=()=>overlay.remove();overlay.querySelector('.goy-evidence-close').onclick=close;overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    }catch(error){alert(error.message||'No se pudieron cargar las fotografías.');}
    finally{button.disabled=false;button.textContent=original;}
  }

  function decorate(){
    ensureStyle();
    tbody.querySelectorAll('tr').forEach(row=>{
      if(row.dataset.goyEvidence==='1'||row.querySelector('td[colspan]'))return;
      const code=String(row.querySelector('td strong')?.textContent||'').trim();
      const actionCell=row.lastElementChild;
      if(!code||!actionCell)return;
      const button=document.createElement('button');button.type='button';button.className='goy-evidence-btn';button.textContent='📷 Fotos';button.title='Cargar fotografías de esta orden';
      button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openEvidence(code,button);});
      actionCell.appendChild(button);row.dataset.goyEvidence='1';
    });
  }
  new MutationObserver(decorate).observe(tbody,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="orders"],[data-go="orders"]'))setTimeout(decorate,80);});
  decorate();
})();