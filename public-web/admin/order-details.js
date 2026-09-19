(() => {
  const esc = v => String(v ?? '-').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money = v => `$${Number(v || 0).toFixed(2)}`;
  const css = document.createElement('style');
  css.textContent = `
    #ordersBody tr[data-order-row]{cursor:pointer;transition:background .15s ease,transform .15s ease}
    #ordersBody tr[data-order-row]:hover{background:#f1fbff;transform:translateY(-1px)}
    .order-detail-backdrop{position:fixed;inset:0;background:rgba(4,20,31,.62);z-index:9998;display:flex;align-items:center;justify-content:center;padding:18px}
    .order-detail-card{background:#fff;border-radius:22px;width:min(760px,100%);max-height:90vh;overflow:auto;box-shadow:0 24px 70px rgba(0,0,0,.28);padding:22px;color:#0d2f41}
    .order-detail-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #e7eef2;padding-bottom:14px;margin-bottom:16px}
    .order-detail-head h3{margin:3px 0 0;font-size:22px}.order-detail-close{border:0;background:#edf5f8;border-radius:50%;width:38px;height:38px;font-size:22px;cursor:pointer}
    .order-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.order-detail-item{background:#f7fafb;border:1px solid #e5eef2;border-radius:14px;padding:12px}.order-detail-item small{display:block;color:#71818b;font-size:11px;font-weight:800;text-transform:uppercase;margin-bottom:5px}.order-detail-item strong{font-size:14px;word-break:break-word}
    .order-detail-wide{grid-column:1/-1}.order-detail-section{margin-top:18px}.order-detail-section h4{margin:0 0 10px}.order-detail-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.order-detail-actions button,.order-detail-actions a{border:0;border-radius:10px;padding:10px 14px;background:#0d91b7;color:white;font-weight:800;text-decoration:none;cursor:pointer}
    @media(max-width:620px){.order-detail-grid{grid-template-columns:1fr}.order-detail-wide{grid-column:auto}.order-detail-card{padding:16px;border-radius:18px}}
  `;
  document.head.appendChild(css);

  const rawValue = (o, keys) => { for (const k of keys) { const parts=k.split('.'); let v=o; for(const p of parts) v=v?.[p]; if(v!==undefined && v!==null && v!=='') return v; } return '-'; };
  const serviceName = o => o.serviceLabel || ({procedure:'Trámite ejecutivo',shipment:o.deliveryMode==='express'?'Envío Express':'Envío programado',deposit:'Depósito',diverse:'Servicios diversos',office_pickup:'Retiro oficina',partner:'Plan inicial'}[o.kind]) || o.service || o.kind || 'Servicio';
  const statusName = s => ({pending:'Pendiente',quoted:'Cotizado',accepted:'Aceptado',assigned:'Asignado',pickedUp:'Recogido',onRoute:'En camino',finished:'Entrega finalizada',cancelled:'Cancelado','En ruta':'En camino',Entregado:'Entrega finalizada',Finalizado:'Entrega finalizada'}[s] || s || 'Pendiente');

  function item(label,value,wide=false){return `<div class="order-detail-item ${wide?'order-detail-wide':''}"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`;}
  function findOrder(code){
    const rows=[...(window.__GOY_ADMIN_ORDERS||[])];
    return rows.find(o=>String(o.code||o.id)===String(code));
  }
  async function fetchOrder(code){
    const cfg=window.GOY_ADMIN_CONFIG||{}, base=String(cfg.apiBaseUrl||'').replace(/\/$/,'');
    const token=sessionStorage.getItem('goyAdminToken')||'';
    try{
      const r=await fetch(`${base}/admin/data`,{headers:token?{Authorization:`Bearer ${token}`}:{}}); if(!r.ok)return null;
      const b=await r.json(); return (b.requests||[]).find(o=>String(o.code||o.id)===String(code))||null;
    }catch{return null;}
  }
  async function openDetails(code){
    let o=findOrder(code) || await fetchOrder(code); if(!o){alert('No se pudo cargar el detalle de esta orden.');return;}
    const pickup=rawValue(o,['pickupAddress','originAddress','origin.address']);
    const destination=rawValue(o,['destinationAddress','deliveryAddress','address','destination.address']);
    const client=rawValue(o,['customer','businessName','client','customerName']);
    const phone=rawValue(o,['customerPhone','phone','whatsapp','contactPhone']);
    const courier=rawValue(o,['courier','courierName','assignedCourier.name']);
    const notes=rawValue(o,['notes','detail','description','instructions','adminNotes']);
    const created=rawValue(o,['createdAt','date','requestedAt']);
    const wait=o.wait||{};
    const evidence=o.evidence||{};
    const photos=[evidence.pickupPhoto,evidence.deliveryPhoto,evidence.depositPhoto,...(evidence.additionalPhotos||[])].filter(Boolean);
    const overlay=document.createElement('div'); overlay.className='order-detail-backdrop';
    overlay.innerHTML=`<article class="order-detail-card" role="dialog" aria-modal="true">
      <div class="order-detail-head"><div><small>DETALLE DE OPERACIÓN</small><h3>${esc(o.code||o.id||code)}</h3></div><button class="order-detail-close" aria-label="Cerrar">×</button></div>
      <div class="order-detail-grid">
        ${item('Cliente',client)}${item('Servicio',serviceName(o))}${item('Estado',statusName(o.status))}${item('Mensajero',courier)}
        ${item('Fecha / creación',created)}${item('Valor del servicio',money(o.serviceCost??o.value??0))}
        ${item('Retiro / origen',pickup,true)}${item('Entrega / destino',destination,true)}${item('Teléfono cliente',phone)}${item('Tracking',o.trackingCode||o.tracking||'-')}
        ${item('Indicaciones / novedad',notes,true)}
      </div>
      <section class="order-detail-section"><h4>Tiempo de espera</h4><div class="order-detail-grid">${item('Tiempo gratuito',`${Number(wait.freeMinutes||0)} min`)}${item('Tiempo adicional',`${Number(wait.extraMinutes||0)} min`)}${item('Recargo',money(wait.extraCost||0))}${item('Tiempo transcurrido',`${Number(wait.elapsedMinutes||0)} min`)}</div></section>
      ${photos.length?`<section class="order-detail-section"><h4>Evidencias</h4><div class="order-detail-actions">${photos.map((p,i)=>`<a href="${esc(p)}" target="_blank" rel="noopener">Ver foto ${i+1}</a>`).join('')}</div></section>`:''}
      <div class="order-detail-actions">${destination!=='-'?`<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}" target="_blank" rel="noopener">Ver destino en Maps</a>`:''}<button class="order-detail-close">Cerrar</button></div>
    </article>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('.order-detail-close'))overlay.remove();});
  }

  function markRows(){
    document.querySelectorAll('#ordersBody tr').forEach(tr=>{
      const code=tr.querySelector('td strong')?.textContent?.trim(); if(!code)return;
      tr.dataset.orderRow=code; tr.title='Presiona para ver el detalle completo';
    });
  }
  const observer=new MutationObserver(markRows); const body=document.getElementById('ordersBody'); if(body)observer.observe(body,{childList:true,subtree:true}); markRows();
  document.addEventListener('click',e=>{
    const tr=e.target.closest('#ordersBody tr[data-order-row]'); if(!tr)return;
    if(e.target.closest('button,a,input,select'))return;
    openDetails(tr.dataset.orderRow);
  });
})();
