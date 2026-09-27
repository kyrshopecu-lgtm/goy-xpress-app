(() => {
  const apiBase=String(window.GOY_ADMIN_CONFIG?.apiBaseUrl||'/api').replace(/\/$/,'');
  const $=id=>document.getElementById(id);
  const token=()=>sessionStorage.getItem('goyAdminToken')||'';
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  let prospects=[];

  async function api(path,options={}){
    const headers={'Content-Type':'application/json',...(options.headers||{})};
    if(token())headers.Authorization=`Bearer ${token()}`;
    const r=await fetch(`${apiBase}${path}`,{...options,headers,cache:'no-store'});
    const body=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(body.error||`HTTP ${r.status}`);
    return body;
  }

  function sourceLabel(p){return [p.source,p.city,p.category].filter(Boolean).join(' · ')||'Sin clasificar';}
  function render(){
    const body=$('prospectsBody');if(!body)return;
    const filter=$('prospectFilter')?.value||'all';
    const rows=prospects.filter(p=>filter==='all'||p.status===filter);
    body.innerHTML=rows.length?rows.map(p=>`<tr>
      <td><input type="checkbox" class="prospect-check" value="${esc(p.id)}" aria-label="Seleccionar ${esc(p.business)}"></td>
      <td><strong>${esc(p.business)}</strong><br><small>${esc(p.city||'')}</small></td>
      <td>${esc(sourceLabel(p))}${p.sourceUrl?`<br><small>Fuente registrada</small>`:''}</td>
      <td>${esc(p.channel||'—')}<br><small>${esc(p.contact||'')}</small></td>
      <td><strong>${Number(p.score||0)}/100</strong><br><small>${esc(p.fitReason||'Pendiente de análisis')}</small></td>
      <td><span class="status-pill">${esc(p.status||'Pendiente de revisión')}</span>${p.doNotContact?'<br><small>⛔ No contactar</small>':''}</td>
      <td><button class="ghost prospect-review" data-id="${esc(p.id)}">Revisar contacto</button></td>
    </tr>`).join(''):'<tr><td colspan="7">No hay prospectos en este estado.</td></tr>';
    document.querySelectorAll('.prospect-review').forEach(b=>b.onclick=()=>openReview(b.dataset.id));
    document.querySelectorAll('.prospect-check').forEach(box=>box.onchange=updateSelection);updateSelection();
  }

  function selectedIds(){return [...document.querySelectorAll('.prospect-check:checked')].map(x=>x.value);}
  function updateSelection(){const count=selectedIds().length;if($('prospectSelectionCount'))$('prospectSelectionCount').textContent=`${count} seleccionado${count===1?'':'s'}`;}
  async function approveSelected(){
    const ids=selectedIds();if(!ids.length)return;
    const selected=prospects.filter(p=>ids.includes(p.id));
    const blocked=selected.filter(p=>p.doNotContact||!String(p.draftMessage||p.approvedMessage||'').trim());
    if(blocked.length){$('prospectMessage').textContent=`${blocked.length} prospecto(s) requieren revisión individual porque no tienen mensaje o están marcados como no contactar.`;return;}
    if(!confirm(`Aprobar ${selected.length} prospecto(s) para contacto? Esto no enviará mensajes todavía.`))return;
    let ok=0;for(const p of selected){try{await api(`/admin/prospects/${encodeURIComponent(p.id)}`,{method:'PATCH',body:JSON.stringify({approvedMessage:p.approvedMessage||p.draftMessage,status:'Aprobado para contacto'})});ok++;}catch{}}
    $('prospectMessage').textContent=`${ok} prospecto(s) aprobados para contacto. Ningún mensaje fue enviado.`;await load();
  }
  async function load(){
    if(!token()||!$('prospectsBody'))return;
    try{const data=await api('/admin/prospects');prospects=data.prospects||[];render();}
    catch(e){$('prospectsBody').innerHTML=`<tr><td colspan="7">${esc(e.message)}</td></tr>`;}
  }

  function modal(html){
    const o=document.createElement('div');o.className='modal-overlay';o.id='prospectModal';
    o.innerHTML=`<div class="modern-modal">${html}</div>`;document.body.appendChild(o);
    o.addEventListener('click',e=>{if(e.target===o)o.remove();});return o;
  }

  function openNew(){
    const o=modal(`<div class="modal-head"><div><span class="eyebrow">GOY SALES AI</span><h3>Registrar prospecto</h3></div><button class="modal-close">×</button></div>
      <form id="prospectForm" class="admin-order-form">
      <div class="form-grid two"><label>Negocio / prospecto<input name="business" required></label><label>Ciudad<input name="city" placeholder="Ej. Cuenca"></label><label>Categoría<input name="category" placeholder="Tecnología, ropa, accesorios…"></label><label>Fuente<select name="source"><option>web</option><option>Instagram</option><option>Facebook</option><option>TikTok</option></select></label><label>URL pública de origen<input name="sourceUrl" type="url"></label><label>Canal público<select name="channel"><option value="">Por definir</option><option>WhatsApp</option><option>Instagram</option><option>Facebook</option><option>Correo</option></select></label><label>Contacto público<input name="contact"></label><label>Puntuación IA (0-100)<input name="score" type="number" min="0" max="100" value="0"></label></div>
      <label>Por qué encaja con GOY XPRESS<textarea name="fitReason" rows="3"></textarea></label><label>Borrador propuesto<textarea name="draftMessage" rows="5" placeholder="Mensaje que será revisado antes de aprobarse"></textarea></label>
      <div class="form-message" id="prospectFormMessage"></div><div class="modal-actions"><button type="button" class="ghost modal-cancel">Cancelar</button><button class="primary action-primary">Guardar para revisión</button></div></form>`);
    o.querySelector('.modal-close').onclick=()=>o.remove();o.querySelector('.modal-cancel').onclick=()=>o.remove();
    o.querySelector('#prospectForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const payload=Object.fromEntries(fd.entries());payload.score=Number(payload.score||0);try{await api('/admin/prospects',{method:'POST',body:JSON.stringify(payload)});o.remove();await load();}catch(err){$('prospectFormMessage').textContent=err.message;}};
  }

  function openReview(id){
    const p=prospects.find(x=>x.id===id);if(!p)return;
    const proposed=p.approvedMessage||p.draftMessage||'';
    const o=modal(`<div class="modal-head"><div><span class="eyebrow">Revisión humana obligatoria</span><h3>${esc(p.business)}</h3><p>${esc(sourceLabel(p))}</p></div><button class="modal-close">×</button></div>
      <div class="admin-order-form"><div class="form-grid"><label>Señales / necesidades observadas<textarea id="prospectObservedNeeds" rows="4" placeholder="Hechos o señales observables; evita asumir necesidades no confirmadas.">${esc(p.observedNeeds||'')}</textarea></label><label>Oportunidades de crecimiento<textarea id="prospectGrowthOpportunities" rows="4" placeholder="Oportunidades que el negocio podría evaluar.">${esc(p.growthOpportunities||'')}</textarea></label><label>Nuevos servicios sugeridos<textarea id="prospectSuggestedServices" rows="4" placeholder="Servicios complementarios que podrían tener sentido.">${esc(p.suggestedServices||'')}</textarea></label><label>Ideas de campañas<textarea id="prospectCampaignIdeas" rows="4" placeholder="Conceptos de campaña, oferta, público y canal sugerido.">${esc(p.campaignIdeas||'')}</textarea></label></div><label>Mensaje que GOY XPRESS utilizará<textarea id="prospectApprovedMessage" rows="8">${esc(proposed)}</textarea></label>
      <label class="check-line"><input id="prospectDnc" type="checkbox" ${p.doNotContact?'checked':''}> No contactar a este prospecto</label>
      <p class="map-hint">Aprobar no envía todavía el mensaje. Solo deja autorizado el texto para cuando exista un canal oficial configurado.</p>
      <div id="prospectReviewMessage" class="form-message"></div><div class="modal-actions"><button class="ghost" id="discardProspect">Descartar</button><button class="primary action-primary" id="approveProspect" ${p.doNotContact?'disabled':''}>Aprobar para contacto</button></div></div>`);
    o.querySelector('.modal-close').onclick=()=>o.remove();
    const dnc=o.querySelector('#prospectDnc'),approve=o.querySelector('#approveProspect');dnc.onchange=()=>approve.disabled=dnc.checked;
    o.querySelector('#discardProspect').onclick=async()=>{try{await api(`/admin/prospects/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status:'Descartado',doNotContact:true})});o.remove();await load();}catch(e){$('prospectReviewMessage').textContent=e.message;}};
    approve.onclick=async()=>{const message=o.querySelector('#prospectApprovedMessage').value.trim();if(!message){$('prospectReviewMessage').textContent='Escribe o revisa el mensaje antes de aprobar.';return;}try{await api(`/admin/prospects/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({approvedMessage:message,observedNeeds:o.querySelector('#prospectObservedNeeds').value.trim(),growthOpportunities:o.querySelector('#prospectGrowthOpportunities').value.trim(),suggestedServices:o.querySelector('#prospectSuggestedServices').value.trim(),campaignIdeas:o.querySelector('#prospectCampaignIdeas').value.trim(),status:'Aprobado para contacto',doNotContact:false})});o.remove();await load();}catch(e){$('prospectReviewMessage').textContent=e.message;}};
  }

  $('newProspectBtn')?.addEventListener('click',openNew);
  $('selectAllProspects')?.addEventListener('click',()=>{document.querySelectorAll('.prospect-check').forEach(x=>x.checked=true);updateSelection();});
  $('approveSelectedProspects')?.addEventListener('click',approveSelected);
  $('prospectFilter')?.addEventListener('change',render);
  document.querySelector('[data-view="prospects"]')?.addEventListener('click',()=>setTimeout(load,0));
  window.addEventListener('goy-admin-authenticated',load);
  setTimeout(load,800);
})();
