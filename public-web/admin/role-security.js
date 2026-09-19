(() => {
  const apiBase = String(window.GOY_ADMIN_CONFIG?.apiBaseUrl || '/api').replace(/\/$/, '');

  function token() {
    return sessionStorage.getItem('goyAdminToken') || '';
  }

  async function api(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        'Content-Type':'application/json',
        ...(token() ? {Authorization:`Bearer ${token()}`} : {}),
        ...(options.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'No se pudo completar la operación.');
    return body;
  }

  const clean = value => String(value || '').replace(/[<>&"']/g, '');
  const style = (node, values) => Object.assign(node.style, values);

  function closeModal() {
    document.getElementById('goyCourierModal')?.remove();
  }

  function modalShell(title, subtitle) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.id = 'goyCourierModal';
    style(overlay, {
      position:'fixed', inset:'0', zIndex:'99999', background:'rgba(8,30,42,.60)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:'18px',
      backdropFilter:'blur(4px)'
    });
    const box = document.createElement('section');
    style(box, {
      width:'min(680px,100%)', maxHeight:'88vh', overflow:'auto', background:'#fff',
      borderRadius:'22px', padding:'20px', boxShadow:'0 30px 80px rgba(0,0,0,.28)'
    });
    const head = document.createElement('div');
    style(head,{display:'flex',gap:'12px',alignItems:'flex-start',marginBottom:'16px'});
    const copy = document.createElement('div');
    style(copy,{flex:'1'});
    const h = document.createElement('h3');
    h.textContent = title;
    style(h,{margin:'0 0 5px',color:'#0B2F40',fontSize:'22px'});
    const p = document.createElement('p');
    p.textContent = subtitle;
    style(p,{margin:'0',color:'#687984',lineHeight:'1.45'});
    copy.append(h,p);
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '✕';
    style(x,{border:'0',background:'#EEF4F6',borderRadius:'12px',width:'40px',height:'40px',cursor:'pointer',fontWeight:'900'});
    x.onclick = closeModal;
    head.append(copy,x);
    const body = document.createElement('div');
    box.append(head,body);
    overlay.append(box);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
    return body;
  }

  function courierRow(courier, actionLabel, action) {
    const row = document.createElement('article');
    style(row,{
      display:'grid',gridTemplateColumns:'58px 1fr auto',gap:'12px',alignItems:'center',
      border:'1px solid #DCE6EB',borderRadius:'16px',padding:'12px',marginBottom:'10px',
      background:'#FBFDFE'
    });
    const avatar = courier.photo
      ? document.createElement('img')
      : document.createElement('div');
    if (courier.photo) {
      avatar.src = courier.photo;
      avatar.alt = '';
      style(avatar,{width:'58px',height:'58px',borderRadius:'50%',objectFit:'cover',background:'#E8F7FD'});
    } else {
      avatar.textContent = clean(courier.name || courier.fullName || 'MX').slice(0,2).toUpperCase();
      style(avatar,{width:'58px',height:'58px',borderRadius:'50%',display:'grid',placeItems:'center',background:'#00A9E8',color:'#fff',fontWeight:'900'});
    }
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = courier.name || courier.fullName || 'Mensajero';
    style(name,{display:'block',color:'#17242D',fontSize:'15px'});
    const phone = document.createElement('small');
    phone.textContent = courier.phone || courier.whatsapp || courier.email || '';
    style(phone,{display:'block',color:'#687984',marginTop:'3px'});
    const status = document.createElement('small');
    status.textContent = courier.approved ? '✓ Aprobado' : '• Pendiente de aprobación';
    style(status,{display:'block',marginTop:'5px',fontWeight:'800',color:courier.approved?'#38A844':'#A46A00'});
    info.append(name,phone,status);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = actionLabel;
    style(button,{
      border:'0',borderRadius:'12px',padding:'10px 12px',cursor:'pointer',
      background:courier.approved?'#38A844':'#00A9E8',color:'#fff',fontWeight:'900'
    });
    button.onclick = async () => {
      button.disabled = true;
      try { await action(courier, button); }
      catch (error) { alert(error.message || 'No se pudo completar la acción.'); button.disabled = false; }
    };
    row.append(avatar,info,button);
    return row;
  }

  async function assignCourier(code, sourceButton) {
    if (!token()) return alert('Tu sesión administrativa no está activa.');
    sourceButton.disabled = true;
    try {
      const data = await api('/admin/data');
      const available = (data.couriers || []).filter(c => c.approved && c.active !== false);
      const body = modalShell(
        `Asignar ${code}`,
        'Selecciona un mensajero registrado y aprobado. La operación aparecerá automáticamente en su app.'
      );
      if (!available.length) {
        const empty = document.createElement('p');
        empty.textContent = 'No hay mensajeros aprobados. Ve a Mensajeros para aprobar al menos uno.';
        style(empty,{padding:'16px',background:'#FFF6DE',borderRadius:'14px',color:'#74500A'});
        body.appendChild(empty);
      }
      available.forEach(courier => body.appendChild(courierRow(courier,'Asignar',async c => {
        await api(`/admin/requests/${encodeURIComponent(code)}`, {
          method:'PATCH',
          body:JSON.stringify({status:'Asignado', courierId:c.id || c.userId}),
        });
        closeModal();
        alert(`Solicitud ${code} asignada a ${c.name || c.fullName}.`);
        location.reload();
      })));
    } catch (error) {
      alert(error.message || 'No se pudieron cargar los mensajeros.');
    } finally {
      sourceButton.disabled = false;
    }
  }

  async function manageCouriers() {
    if (!token()) return alert('Tu sesión administrativa no está activa.');
    try {
      const data = await api('/admin/data');
      const couriers = data.couriers || [];
      const body = modalShell(
        'Mensajeros registrados',
        'Aprueba nuevas cuentas, revisa su foto y controla quién puede recibir operaciones.'
      );
      if (!couriers.length) {
        const empty = document.createElement('p');
        empty.textContent = 'Todavía no existen registros de mensajeros.';
        body.appendChild(empty);
      }
      couriers.forEach(courier => {
        body.appendChild(courierRow(
          courier,
          courier.approved ? 'Suspender' : 'Aprobar',
          async (c, button) => {
            const nextApproved = !Boolean(c.approved);
            await api(`/admin/couriers/${encodeURIComponent(c.id || c.userId)}/approve`, {
              method:'POST',
              body:JSON.stringify({approved:nextApproved}),
            });
            c.approved = nextApproved;
            button.textContent = nextApproved ? 'Suspender' : 'Aprobar';
            button.style.background = nextApproved ? '#38A844' : '#00A9E8';
            await refreshCourierCards();
          }
        ));
      });
    } catch (error) {
      alert(error.message || 'No se pudieron cargar los mensajeros.');
    }
  }

  async function refreshCourierCards() {
    const container = document.getElementById('courierCards');
    if (!container || !token()) return;
    try {
      const data = await api('/admin/data');
      const couriers = data.couriers || [];
      container.innerHTML = '';
      if (!couriers.length) {
        container.innerHTML = '<p>Aún no hay mensajeros registrados.</p>';
        return;
      }
      couriers.forEach(c => {
        const card = document.createElement('article');
        card.className = 'courier-card';
        style(card,{display:'grid',gridTemplateColumns:'54px 1fr',gap:'11px',alignItems:'center'});
        const avatar = c.photo ? document.createElement('img') : document.createElement('div');
        if (c.photo) {
          avatar.src = c.photo;
          style(avatar,{width:'54px',height:'54px',borderRadius:'50%',objectFit:'cover'});
        } else {
          avatar.textContent = clean(c.name || 'MX').slice(0,2).toUpperCase();
          style(avatar,{width:'54px',height:'54px',borderRadius:'50%',display:'grid',placeItems:'center',background:'#00A9E8',color:'#fff',fontWeight:'900'});
        }
        const info = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = c.name || c.fullName || 'Mensajero';
        const small = document.createElement('small');
        small.textContent = `${c.phone || c.whatsapp || ''} · ${c.approved ? 'Aprobado' : 'Pendiente'}`;
        style(small,{display:'block',marginTop:'3px'});
        const jobs = document.createElement('small');
        jobs.textContent = `${Number(c.jobs || 0)} operación(es) activa(s)`;
        style(jobs,{display:'block',marginTop:'5px',color:'#687984'});
        info.append(strong,small,jobs);
        card.append(avatar,info);
        container.appendChild(card);
      });
    } catch {}
  }

  function injectManagerButton() {
    const cards = document.getElementById('courierCards');
    if (!cards || document.getElementById('goyCourierManagerBtn')) return;
    const button = document.createElement('button');
    button.id = 'goyCourierManagerBtn';
    button.type = 'button';
    button.className = 'primary';
    button.textContent = 'Gestionar registros de mensajeros';
    button.onclick = manageCouriers;
    style(button,{margin:'0 0 14px'});
    cards.parentElement?.insertBefore(button,cards);
    refreshCourierCards();
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-order][data-status="Asignado"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    assignCourier(button.dataset.order, button);
  }, true);

  const observer = new MutationObserver(() => injectManagerButton());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded', injectManagerButton);
  setTimeout(injectManagerButton, 400);
})();
