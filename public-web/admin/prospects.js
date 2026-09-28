(() => {
  const apiBase=String(window.GOY_ADMIN_CONFIG?.apiBaseUrl||'/api').replace(/\/$/,'');
  const $=id=>document.getElementById(id);
  const token=()=>sessionStorage.getItem('goyAdminToken')||'';
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  let prospects=[];
  let whatsappReady=null;

  async function api(path,options={}){
    const headers={'Content-Type':'application/json',...(options.headers||{})};
    if(token())headers.Authorization=`Bearer ${token()}`;
    const r=await fetch(`${apiBase}${path}`,{...options,headers,cache:'no-store'});
    const body=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(body.error||`HTTP ${r.status}`);
    return body;
  }

  function sourceLabel(p){return [p.source,p.city,p.category].filter(Boolean).join(' · ')||'Sin clasificar';}
  function growthSummary(p){
    const parts=[];
    if(p.growthOpportunities)parts.push('Oportunidad: '+String(p.growthOpportunities).slice(0,120));
    if(p.campaignIdeas)parts.push('Campaña: '+String(p.campaignIdeas).slice(0,120));
    return parts.length?'<br><small>'+parts.map(esc).join('<br>')+'</small>':'';
  }
  function renderReady(){
    const box=$('readyContactList'),count=$('readyContactCount');if(!box)return;
    const ready=prospects.filter(p=>p.status==='Aprobado para contacto'&&!p.doNotContact&&String(p.approvedMessage||'').trim()).sort((a,b)=>Number(b.score||0)-Number(a.score||0));
    if(count)count.textContent=String(ready.length);
    box.innerHTML=ready.length?`<table><thead><tr><th>Prospecto</th><th>Canal</th><th>Mensaje final</th><th>Prioridad</th><th>Acción</th></tr></thead><tbody>${ready.map(p=>`<tr><td><strong>${esc(p.business)}</strong><br><small>${esc(p.city||'')}</small></td><td>${esc(p.channel||'—')}<br><small>${esc(p.contact||'Sin contacto público registrado')}</small></td><td>${esc(p.approvedMessage)}</td><td>${esc(p.score||0)}/100</td><td><button class="primary compact ready-whatsapp-send" type="button" data-id="${esc(p.id)}">${whatsappReady===true?'Enviar por WhatsApp':'WhatsApp pendiente'}</button></td></tr>`).join('')}</tbody></table>`:'<div class="muted">Aún no hay prospectos aprobados y listos para contacto.</div>';
  }

  async function sendReadyWhatsApp(id){
    if(whatsappReady!==true){$('prospectMessage').textContent='WhatsApp comercial aún no está configurado. Revisa la plantilla y credenciales antes de enviar.';return;}
    const p=prospects.find(x=>x.id===id);if(!p)return;
    const recipient=p.contact||'sin número registrado',message=String(p.approvedMessage||'').trim();
    if(!window.confirm(`Confirmar primer contacto por WhatsApp\n\nNegocio: ${p.business}\nDestinatario: ${recipient}\n\nMensaje aprobado:\n${message}\n\n¿Enviar ahora?`))return;
    $('prospectMessage').textContent=`Enviando a ${p.business}…`;
    try{await api(`/admin/prospects/${encodeURIComponent(id)}/send-whatsapp`,{method:'POST',body:'{}'});$('prospectMessage').textContent=`WhatsApp confirmado para ${p.business}. El envío quedó registrado en el historial.`;await Promise.all([loadWhatsAppStatus(),load()]);}
    catch(e){$('prospectMessage').textContent=`No se envió a ${p.business}: ${e.message}`;}
  }

  function render(){
    const body=$('prospectsBody');if(!body)return;
    const filter=$('prospectFilter')?.value||'all',priority=$('prospectPriorityFilter')?.value||'all',city=String($('prospectCityFilter')?.value||'').trim().toLowerCase(),category=String($('prospectCategoryFilter')?.value||'').trim().toLowerCase();
    const rows=prospects.filter(p=>(filter==='all'||p.status===filter)&&(priority!=='high'||Number(p.score||0)>=70)&&(priority!=='website'||/^https?:\/\//i.test(String(p.sourceUrl||'')))&&(!city||String(p.city||'').toLowerCase().includes(city))&&(!category||String(p.category||'').toLowerCase().includes(category))).sort((a,b)=>Number(b.score||0)-Number(a.score||0));
    body.innerHTML=rows.length?rows.map(p=>`<tr>
      <td><input type="checkbox" class="prospect-check" value="${esc(p.id)}" aria-label="Seleccionar ${esc(p.business)}"></td>
      <td><strong>${esc(p.business)}</strong><br><small>${esc(p.city||'')}</small></td>
      <td>${esc(sourceLabel(p))}${p.sourceUrl?`<br><small>Fuente registrada</small>`:''}</td>
      <td>${esc(p.channel||'—')}<br><small>${esc(p.contact||'')}</small></td>
      <td><strong>${Number(p.score||0)}/100</strong><br><small>${esc(p.fitReason||'Pendiente de análisis')}</small>${growthSummary(p)}</td>
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
  async function loadWhatsAppStatus(){
    try{const s=await api('/admin/prospects/whatsapp-status');whatsappReady=Boolean(s.configured);return s;}
    catch(_){whatsappReady=false;return {configured:false,missing:[]};}
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

  function openDiscover(){
    const o=modal(`<div class="modal-head"><div><span class="eyebrow">GOY SALES AI</span><h3>Buscar prospectos públicos</h3><p>Busca candidatos y revísalos antes de importarlos.</p></div><button class="modal-close">×</button></div><div class="admin-order-form"><div class="form-grid two"><label>Ciudad<input id="discoverCity" placeholder="Ej. Cuenca"></label><label>Categoría<input id="discoverCategory" placeholder="Tecnología, ropa, accesorios…"></label><label>Cantidad máxima<input id="discoverLimit" type="number" min="1" max="177" value="50"></label></div><div id="discoverMessage" class="form-message"></div><div id="discoverResults"></div><div class="modal-actions"><button class="ghost modal-cancel">Cerrar</button><button class="primary action-primary" id="runDiscover">Buscar</button></div></div>`);
    o.querySelector('.modal-close').onclick=()=>o.remove();o.querySelector('.modal-cancel').onclick=()=>o.remove();
    o.querySelector('#runDiscover').onclick=async()=>{const button=o.querySelector('#runDiscover'),message=o.querySelector('#discoverMessage'),results=o.querySelector('#discoverResults');button.disabled=true;button.textContent='Buscando…';message.textContent='';try{const result=await api('/admin/prospects/discover',{method:'POST',body:JSON.stringify({city:o.querySelector('#discoverCity').value.trim(),category:o.querySelector('#discoverCategory').value.trim(),limit:Math.min(177,Number(o.querySelector('#discoverLimit').value||50))})}),items=result.prospects||[];const usage=result.usage||{};message.textContent=`Encontrados: ${items.length}. Hoy: ${usage.daily??'—'}/${usage.dailyLimit??177} · Mes: ${usage.monthly??'—'}/${usage.monthlyLimit??4800} · Esta búsqueda: ${usage.requestsUsed??'—'} llamada(s). Selecciona cuáles deseas importar.`;results.innerHTML=items.length?`<div class="discover-results-scroll"><div class="table-wrap"><table><thead><tr><th></th><th>Negocio</th><th>Ciudad</th><th>Categoría</th><th>Fuente</th></tr></thead><tbody>${items.map((p,i)=>`<tr><td><input type="checkbox" class="discover-check" value="${i}" checked></td><td><strong>${esc(p.business)}</strong></td><td>${esc(p.city||'')}</td><td>${esc(p.category||'')}</td><td>${esc(p.source||'')}</td></tr>`).join('')}</tbody></table></div></div><div class="discover-import-bar"><strong id="discoverSelectedCount">${items.length} seleccionados</strong><button class="primary compact" id="importDiscovered" type="button">Importar seleccionados</button></div>`:'<p class="muted">No se encontraron candidatos.</p>';const updateDiscoverCount=()=>{const count=o.querySelectorAll('.discover-check:checked').length,label=o.querySelector('#discoverSelectedCount');if(label)label.textContent=`${count} seleccionado${count===1?'':'s'}`;};o.querySelectorAll('.discover-check').forEach(box=>box.onchange=updateDiscoverCount);updateDiscoverCount();const importButton=o.querySelector('#importDiscovered');if(importButton)importButton.onclick=async()=>{const selected=[...o.querySelectorAll('.discover-check:checked')].map(x=>items[Number(x.value)]).filter(Boolean);if(!selected.length){message.textContent='Selecciona al menos un prospecto.';return;}importButton.disabled=true;try{const imported=await api('/admin/prospects/import',{method:'POST',body:JSON.stringify({prospects:selected})});message.textContent=`Importados: ${imported.imported}. Duplicados: ${imported.duplicates}. Inválidos: ${imported.invalid}. Todos quedaron pendientes de revisión.`;await load();if(imported.imported>0){setTimeout(()=>o.remove(),650);}}catch(e){message.textContent=e.message;}finally{importButton.disabled=false;}};}catch(e){message.textContent=e.message;results.innerHTML='';}finally{button.disabled=false;button.textContent='Buscar';}};
  }

  function openImport(){
    const example='[{"business":"Tienda Ejemplo","city":"Cuenca","category":"Tecnología","source":"Instagram","sourceUrl":"https://example.com/perfil","channel":"WhatsApp","contact":"+593..."}]';
    const o=modal(`<div class="modal-head"><div><span class="eyebrow">GOY SALES AI</span><h3>Importar prospectos</h3><p>Hasta 500 registros por lote. Los nuevos quedarán pendientes de revisión.</p></div><button class="modal-close">×</button></div><div class="admin-order-form"><label>Prospectos en formato JSON<textarea id="prospectImportJson" rows="12" placeholder='${esc(example)}'></textarea></label><label class="check-line"><input id="analyzeImported" type="checkbox"> Analizar automáticamente los prospectos importados</label><p class="map-hint">Analizar no aprueba ni envía contactos. Solo prepara el diagnóstico y el borrador para revisión humana.</p><div id="prospectImportMessage" class="form-message"></div><div class="modal-actions"><button class="ghost modal-cancel">Cancelar</button><button class="primary action-primary" id="runProspectImport">Importar lote</button></div></div>`);
    o.querySelector('.modal-close').onclick=()=>o.remove();o.querySelector('.modal-cancel').onclick=()=>o.remove();
    o.querySelector('#runProspectImport').onclick=async()=>{const button=o.querySelector('#runProspectImport'),message=o.querySelector('#prospectImportMessage');let items;try{items=JSON.parse(o.querySelector('#prospectImportJson').value||'[]');if(!Array.isArray(items))throw new Error('El JSON debe contener una lista de prospectos.');}catch(e){message.textContent=e.message;return;}button.disabled=true;button.textContent='Importando…';try{const result=await api('/admin/prospects/import',{method:'POST',body:JSON.stringify({prospects:items})});message.textContent=`Importados: ${result.imported}. Duplicados: ${result.duplicates}. Inválidos: ${result.invalid}.`;if(o.querySelector('#analyzeImported').checked&&result.prospects?.length){button.textContent='Analizando…';let analyzed=0,failed=0;for(const p of result.prospects){try{await api(`/admin/prospects/${encodeURIComponent(p.id)}/analyze`,{method:'POST'});analyzed++;}catch{failed++;}}message.textContent+=` Analizados: ${analyzed}. Sin analizar: ${failed}.`;}await load();}catch(e){message.textContent=e.message;}finally{button.disabled=false;button.textContent='Importar lote';}};
  }

  function openReview(id){
    const p=prospects.find(x=>x.id===id);if(!p)return;
    const isFollowup=['Respondió','Interesado','Solicita llamada'].includes(p.status);
    const proposed=isFollowup?(p.followupApprovedMessage||p.followupDraft||p.approvedMessage||p.draftMessage||''):(p.approvedMessage||p.draftMessage||'');
    const o=modal(`<div class="modal-head"><div><span class="eyebrow">Revisión humana obligatoria</span><h3>${esc(p.business)}</h3><p>${esc(sourceLabel(p))}</p></div><button class="modal-close">×</button></div>
      <div class="admin-order-form"><div class="form-grid"><label>Señales / necesidades observadas<textarea id="prospectObservedNeeds" rows="4" placeholder="Hechos o señales observables; evita asumir necesidades no confirmadas.">${esc(p.observedNeeds||'')}</textarea></label><label>Oportunidades de crecimiento<textarea id="prospectGrowthOpportunities" rows="4" placeholder="Oportunidades que el negocio podría evaluar.">${esc(p.growthOpportunities||'')}</textarea></label><label>Nuevos servicios sugeridos<textarea id="prospectSuggestedServices" rows="4" placeholder="Servicios complementarios que podrían tener sentido.">${esc(p.suggestedServices||'')}</textarea></label><label>Ideas de campañas<textarea id="prospectCampaignIdeas" rows="4" placeholder="Conceptos de campaña, oferta, público y canal sugerido.">${esc(p.campaignIdeas||'')}</textarea></label></div><label>Mensaje que GOY XPRESS utilizará<textarea id="prospectApprovedMessage" rows="8">${esc(proposed)}</textarea></label>
      ${isFollowup?'<div class="form-grid"><div><strong>Conversación reciente</strong><div class="map-hint">'+((p.conversation||[]).slice(-6).map(x=>(x.direction==='inbound'?'Prospecto: ':'GOY XPRESS: ')+esc(x.message||'')).join('<br>')||'Sin mensajes registrados')+'</div></div><div><strong>Seguimiento GOY SALES AI</strong><div class="map-hint">'+esc(p.followupIntent||'Pendiente de analizar la respuesta')+'</div><button class="ghost" type="button" id="draftFollowup">Preparar respuesta con IA</button><button class="primary compact" type="button" id="sendFollowup">Enviar respuesta revisada</button></div></div>':''}
      <label class="check-line"><input id="prospectDnc" type="checkbox" ${p.doNotContact?'checked':''}> No contactar a este prospecto</label>
      <p class="map-hint">${isFollowup?'Guardar la respuesta no la envía. “Enviar respuesta revisada” usa WhatsApp solo si la ventana de atención de 24 horas sigue abierta.':'Aprobar no envía todavía el mensaje. Solo deja autorizado el texto para el primer contacto.'}</p>
      <div id="prospectReviewMessage" class="form-message"></div><div class="modal-actions">${isFollowup?'':'<button class="ghost" id="analyzeProspect">Analizar con GOY SALES AI</button>'}<button class="ghost" id="discardProspect">Descartar</button><button class="primary action-primary" id="approveProspect" ${p.doNotContact?'disabled':''}>${isFollowup?'Guardar respuesta revisada':'Aprobar para contacto'}</button></div></div>`);
    o.querySelector('.modal-close').onclick=()=>o.remove();
    const analyze=o.querySelector('#analyzeProspect');if(analyze)analyze.onclick=async()=>{const label=analyze.textContent;analyze.disabled=true;analyze.textContent='Analizando…';$('prospectReviewMessage').textContent='GOY SALES AI está preparando el diagnóstico comercial.';try{const result=await api(`/admin/prospects/${encodeURIComponent(id)}/analyze`,{method:'POST'}),a=result.prospect||{};o.querySelector('#prospectObservedNeeds').value=a.observedNeeds||'';o.querySelector('#prospectGrowthOpportunities').value=a.growthOpportunities||'';o.querySelector('#prospectSuggestedServices').value=a.suggestedServices||'';o.querySelector('#prospectCampaignIdeas').value=a.campaignIdeas||'';o.querySelector('#prospectApprovedMessage').value=a.draftMessage||a.approvedMessage||'';$('prospectReviewMessage').textContent='Análisis generado. Revísalo y edítalo antes de aprobar el contacto.';}catch(e){$('prospectReviewMessage').textContent=e.message;}finally{analyze.disabled=false;analyze.textContent=label;}};
    const followup=o.querySelector('#draftFollowup');if(followup)followup.onclick=async()=>{const label=followup.textContent;followup.disabled=true;followup.textContent='Preparando…';$('prospectReviewMessage').textContent='GOY SALES AI está analizando la conversación.';try{const result=await api(`/admin/prospects/${encodeURIComponent(id)}/draft-followup`,{method:'POST'}),d=result.draft||{};o.querySelector('#prospectApprovedMessage').value=d.draftMessage||'';$('prospectReviewMessage').textContent=d.draftMessage?'Borrador preparado. Revísalo, edítalo y apruébalo antes de cualquier envío.':'La respuesta indica que no corresponde continuar el contacto.';}catch(e){$('prospectReviewMessage').textContent=e.message;}finally{followup.disabled=false;followup.textContent=label;}};
    const sendFollowup=o.querySelector('#sendFollowup');if(sendFollowup)sendFollowup.onclick=async()=>{const message=o.querySelector('#prospectApprovedMessage').value.trim();if(!message){$('prospectReviewMessage').textContent='Escribe o revisa la respuesta antes de enviarla.';return;}if(!confirm('¿Enviar esta respuesta revisada por WhatsApp?'))return;sendFollowup.disabled=true;const label=sendFollowup.textContent;sendFollowup.textContent='Enviando…';try{await api(`/admin/prospects/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({followupApprovedMessage:message,observedNeeds:o.querySelector('#prospectObservedNeeds').value.trim(),growthOpportunities:o.querySelector('#prospectGrowthOpportunities').value.trim(),suggestedServices:o.querySelector('#prospectSuggestedServices').value.trim(),campaignIdeas:o.querySelector('#prospectCampaignIdeas').value.trim(),doNotContact:false})});await api(`/admin/prospects/${encodeURIComponent(id)}/send-followup-whatsapp`,{method:'POST',body:'{}'});$('prospectReviewMessage').textContent='Respuesta enviada y registrada en la conversación.';o.remove();await load();}catch(e){$('prospectReviewMessage').textContent=e.message;sendFollowup.disabled=false;sendFollowup.textContent=label;}};
    const dnc=o.querySelector('#prospectDnc'),approve=o.querySelector('#approveProspect');dnc.onchange=()=>{approve.disabled=dnc.checked;if(sendFollowup)sendFollowup.disabled=dnc.checked;};if(sendFollowup)sendFollowup.disabled=dnc.checked;
    o.querySelector('#discardProspect').onclick=async()=>{try{await api(`/admin/prospects/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status:'Descartado',doNotContact:true})});o.remove();await load();}catch(e){$('prospectReviewMessage').textContent=e.message;}};
    approve.onclick=async()=>{const message=o.querySelector('#prospectApprovedMessage').value.trim();if(!message){$('prospectReviewMessage').textContent='Escribe o revisa el mensaje antes de aprobar.';return;}try{const payload={observedNeeds:o.querySelector('#prospectObservedNeeds').value.trim(),growthOpportunities:o.querySelector('#prospectGrowthOpportunities').value.trim(),suggestedServices:o.querySelector('#prospectSuggestedServices').value.trim(),campaignIdeas:o.querySelector('#prospectCampaignIdeas').value.trim(),doNotContact:false};if(isFollowup){payload.followupApprovedMessage=message;await api(`/admin/prospects/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(payload)});$('prospectReviewMessage').textContent='Respuesta revisada guardada. Puedes enviarla con el botón de seguimiento.';await load();}else{payload.approvedMessage=message;payload.status='Aprobado para contacto';await api(`/admin/prospects/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(payload)});o.remove();await load();}}catch(e){$('prospectReviewMessage').textContent=e.message;}};
  }

  function selectedIds(){return [...document.querySelectorAll('.prospect-check:checked')].map(x=>x.value);}
  function selectTop20(){
    document.querySelectorAll('.prospect-check').forEach(x=>x.checked=false);
    [...document.querySelectorAll('.prospect-check')].slice(0,20).forEach(x=>x.checked=true);
    updateSelection();
    renderReady();
    document.querySelectorAll('.ready-whatsapp-send').forEach(btn=>btn.addEventListener('click',()=>sendReadyWhatsApp(btn.dataset.id)));
  }
  async function analyzeSelected(){
    const ids=selectedIds();if(!ids.length){$('prospectMessage').textContent='Selecciona al menos un prospecto para analizar.';return;}
    const button=$('analyzeSelectedProspects');if(button)button.disabled=true;
    let ok=0,failed=0;
    for(let i=0;i<ids.length;i++){
      $('prospectMessage').textContent=`Analizando ${i+1}/${ids.length}… ${ok} completados, ${failed} con error.`;
      try{await api(`/admin/prospects/${encodeURIComponent(ids[i])}/analyze`,{method:'POST',body:'{}'});ok++;}catch(_){failed++;}
    }
    if(button)button.disabled=false;
    $('prospectMessage').textContent=`Análisis finalizado: ${ok} completados · ${failed} con error. Ningún prospecto fue aprobado ni contactado.`;
    await load();
  }

  $('discoverProspectsBtn')?.addEventListener('click',openDiscover);
  $('importProspectsBtn')?.addEventListener('click',openImport);
  $('newProspectBtn')?.addEventListener('click',openNew);
  $('selectAllProspects')?.addEventListener('click',()=>{document.querySelectorAll('.prospect-check').forEach(x=>x.checked=true);updateSelection();});
  $('selectTopProspects')?.addEventListener('click',selectTop20);
  $('analyzeSelectedProspects')?.addEventListener('click',analyzeSelected);
  $('approveSelectedProspects')?.addEventListener('click',approveSelected);
  $('prospectFilter')?.addEventListener('change',render);
  $('prospectPriorityFilter')?.addEventListener('change',render);
  $('prospectCityFilter')?.addEventListener('input',render);
  $('prospectCategoryFilter')?.addEventListener('input',render);
  document.querySelector('[data-view="prospects"]')?.addEventListener('click',()=>setTimeout(load,0));
  window.addEventListener('goy-admin-authenticated',load);
  setTimeout(load,800);
})();
