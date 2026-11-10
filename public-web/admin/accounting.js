(()=> {
  const apiBase=String(window.GOY_ADMIN_CONFIG?.apiBaseUrl||'/api').replace(/\/$/,'');
  const token=()=>sessionStorage.getItem('goyAdminToken')||'';
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money=v=>'$'+Number(v||0).toFixed(2);
  let entries=[];
  async function api(path,options={}){const headers={'Content-Type':'application/json',...(options.headers||{})};if(token())headers.Authorization='Bearer '+token();const r=await fetch(apiBase+path,{...options,headers,cache:'no-store'});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'No se pudo completar la operación.');return b;}
  function ensureView(){
    const nav=document.getElementById('nav'),main=document.querySelector('.main');if(!nav||!main||document.getElementById('accounting'))return;
    const b=document.createElement('button');b.type='button';b.className='nav-item';b.dataset.view='accounting';b.innerHTML='<span class="nav-icon">$</span><span>Contabilidad</span>';nav.append(b);
    const section=document.createElement('section');section.id='accounting';section.className='view';section.innerHTML=`
      <div class="stats-grid goy-accounting-stats">
        <article class="stat"><div><span>Ingresos</span><strong id="goyAccIncome">$0.00</strong><small>Total registrado</small></div></article>
        <article class="stat"><div><span>Egresos</span><strong id="goyAccExpense">$0.00</strong><small>Total registrado</small></div></article>
        <article class="stat"><div><span>Saldo</span><strong id="goyAccBalance">$0.00</strong><small>Ingresos menos egresos</small></div></article>
        <article class="stat"><div><span>Por conciliar</span><strong id="goyAccPending">0</strong><small>Registros pendientes</small></div></article>
      </div>
      <div class="panel-grid goy-accounting-grid">
        <article class="panel form-panel"><span class="eyebrow">Registro financiero</span><h3>Nuevo ingreso o egreso</h3>
          <form id="goyAccForm" class="goy-acc-form">
            <label>Tipo<select id="goyAccType"><option value="income">Ingreso</option><option value="expense">Egreso</option></select></label>
            <label>Valor ($)<input id="goyAccAmount" type="number" min="0.01" step="0.01" required></label>
            <label>Categoría<input id="goyAccCategory" required maxlength="80" placeholder="Ej. Mensajería, combustible"></label>
            <label>Descripción<input id="goyAccDescription" required maxlength="500" placeholder="Detalle del movimiento"></label>
            <label>Fecha<input id="goyAccDate" type="date" required></label>
            <label>Método de pago<input id="goyAccMethod" maxlength="40" placeholder="Efectivo / transferencia"></label>
            <label>Referencia<input id="goyAccReference" maxlength="100" placeholder="N.º comprobante"></label>
            <label>Notas<textarea id="goyAccNotes" rows="2" maxlength="500"></textarea></label>
            <button class="primary" type="submit">Guardar movimiento</button><p id="goyAccMessage" class="form-message"></p>
          </form>
        </article>
        <article class="panel"><div class="panel-head"><div><span class="eyebrow">Control y conciliación</span><h3>Movimientos contables</h3></div><button type="button" id="goyAccReload" class="ghost">Actualizar</button></div>
          <div class="panel-tools"><select id="goyAccFilter"><option value="">Todos</option><option value="income">Ingresos</option><option value="expense">Egresos</option></select><button type="button" id="goyAccReconcile" class="primary compact">Conciliar seleccionados</button></div>
          <div class="table-wrap"><table><thead><tr><th></th><th>Fecha</th><th>Tipo</th><th>Categoría / detalle</th><th>Método</th><th>Valor</th><th>Estado</th><th></th></tr></thead><tbody id="goyAccRows"><tr><td colspan="8">Cargando…</td></tr></tbody></table></div>
          <p class="goy-acc-note">Los movimientos conciliados quedan bloqueados para edición. Cada cambio se registra con usuario y fecha.</p>
        </article>
      </div>`;
    main.append(section);
    const style=document.createElement('style');style.textContent='.goy-accounting-grid{grid-template-columns:minmax(280px,.75fr) minmax(420px,1.5fr);align-items:start}.goy-acc-form{display:grid;gap:10px}.goy-acc-form label{display:grid;gap:5px;font-size:13px;font-weight:700}.goy-acc-form input,.goy-acc-form select,.goy-acc-form textarea{padding:10px;border:1px solid #d5e1e7;border-radius:10px;font:inherit;min-width:0}.goy-acc-note{font-size:12px;color:#71818a;margin-top:12px}@media(max-width:900px){.goy-accounting-grid{grid-template-columns:1fr}}';document.head.append(style);
    document.getElementById('goyAccDate').value=new Date().toISOString().slice(0,10);
    section.querySelector('#goyAccForm').addEventListener('submit',createEntry);
    document.getElementById('goyAccReload').addEventListener('click',load);
    document.getElementById('goyAccFilter').addEventListener('change',render);
    document.getElementById('goyAccReconcile').addEventListener('click',reconcile);
    document.getElementById('nav').addEventListener('click',e=>{const item=e.target.closest('[data-view="accounting"]');if(item){const title=document.getElementById('pageTitle');if(title)title.textContent='Contabilidad';setTimeout(load,0);}});
    document.addEventListener('click',e=>{const edit=e.target.closest('[data-goy-acc-edit]');if(edit)editEntry(edit.dataset.goyAccEdit);});
  }
  async function load(){if(!token())return;const box=document.getElementById('goyAccRows');if(box)box.innerHTML='<tr><td colspan="8">Cargando…</td></tr>';try{const [summary,list]=await Promise.all([api('/admin/accounting/summary'),api('/admin/accounting/entries')]);document.getElementById('goyAccIncome').textContent=money(summary.totals?.income);document.getElementById('goyAccExpense').textContent=money(summary.totals?.expense);document.getElementById('goyAccBalance').textContent=money(summary.totals?.balance);document.getElementById('goyAccPending').textContent=String(summary.pendingReconciliation||0);entries=list.entries||[];render();}catch(e){if(box)box.innerHTML='<tr><td colspan="8">'+esc(e.message)+'</td></tr>';}}
  function render(){const box=document.getElementById('goyAccRows');if(!box)return;const filter=document.getElementById('goyAccFilter').value;const rows=entries.filter(x=>!filter||x.type===filter);box.innerHTML=rows.length?rows.map(x=>`<tr><td>${x.reconciled?'✓':`<input type="checkbox" data-goy-acc-check="${esc(x.id)}" aria-label="Seleccionar">`}</td><td>${esc(x.date)}</td><td>${x.type==='income'?'Ingreso':'Egreso'}</td><td><strong>${esc(x.category)}</strong><br><small>${esc(x.description)}</small></td><td>${esc(x.paymentMethod||'—')}</td><td>${money(x.amount)}</td><td>${x.reconciled?'Conciliado':'Pendiente'}</td><td>${x.reconciled?'—':`<button type="button" class="ghost" data-goy-acc-edit="${esc(x.id)}">Editar</button>`}</td></tr>`).join(''):'<tr><td colspan="8">No hay movimientos registrados.</td></tr>';}
  async function createEntry(e){e.preventDefault();const form=e.currentTarget,msg=document.getElementById('goyAccMessage');const body={type:document.getElementById('goyAccType').value,amount:document.getElementById('goyAccAmount').value,category:document.getElementById('goyAccCategory').value.trim(),description:document.getElementById('goyAccDescription').value.trim(),date:document.getElementById('goyAccDate').value,paymentMethod:document.getElementById('goyAccMethod').value.trim(),reference:document.getElementById('goyAccReference').value.trim(),notes:document.getElementById('goyAccNotes').value.trim()};msg.textContent='Guardando…';try{await api('/admin/accounting/entries',{method:'POST',body:JSON.stringify(body)});form.reset();document.getElementById('goyAccDate').value=new Date().toISOString().slice(0,10);msg.textContent='Movimiento guardado.';await load();}catch(e){msg.textContent=e.message;}}
  async function editEntry(id){const item=entries.find(x=>x.id===id);if(!item)return;const amount=prompt('Nuevo valor:',String(item.amount));if(amount===null)return;const category=prompt('Categoría:',item.category);if(category===null)return;const description=prompt('Descripción:',item.description);if(description===null)return;try{await api('/admin/accounting/entries/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({amount,category,description})});await load();}catch(e){alert(e.message);}}
  async function reconcile(){const ids=[...document.querySelectorAll('[data-goy-acc-check]:checked')].map(x=>x.dataset.goyAccCheck);if(!ids.length){alert('Selecciona al menos un movimiento pendiente.');return;}if(!confirm('¿Conciliar '+ids.length+' movimiento(s)? Después no podrán editarse.'))return;try{await api('/admin/accounting/reconcile',{method:'POST',body:JSON.stringify({ids})});await load();}catch(e){alert(e.message);}}
  ensureView();window.GOY_ACCOUNTING={refresh:load};
})();
