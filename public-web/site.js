(()=>{
  const menu=document.querySelector('.menu-btn');
  const nav=document.querySelector('.main-nav');
  const leadForm=document.getElementById('leadForm');
  const serviceSelect=document.getElementById('leadService');
  const serviceData={
    delivery:{number:'01',icon:'↗',title:'Mensajería y entregas',copy:'Retiramos y entregamos paquetes, productos y documentos dentro de Quito, con coordinación administrativa y seguimiento del servicio.',features:['Mensajero asignado','Seguimiento del estado','Evidencias fotográficas','Entrega programada o exprés'],service:'Entrega programada'},
    procedures:{number:'02',icon:'▤',title:'Trámites y gestiones',copy:'Realizamos diligencias, ingreso o retiro de documentos y otras gestiones administrativas de acuerdo con la solicitud registrada.',features:['Ingreso de documentos','Retiros programados','Gestiones administrativas','Registro de la operación'],service:'Trámite o gestión'},
    finance:{number:'03',icon:'$',title:'Depósitos y cobranzas',copy:'Coordinamos depósitos y gestiones de cobro con registro de la operación y evidencias disponibles para su control.',features:['Comprobante fotográfico','Registro de gestión','Control administrativo','Seguimiento de solicitud'],service:'Depósito / cobranza'},
    business:{number:'04',icon:'▣',title:'Logística para empresas',copy:'Brindamos apoyo a emprendedores y empresas que requieren presencia operativa en Quito sin asumir toda la infraestructura logística.',features:['Recepción y despacho','Apoyo operativo local','Entregas a clientes','Historial de servicios'],service:'Logística para emprendimiento'},
    vehicle:{number:'05',icon:'◆',title:'Gestión vehicular',copy:'Coordinamos revisión, matriculación, documentación y traslado del vehículo para facilitar el cumplimiento del proceso solicitado.',features:['Coordinación previa','Revisión de requisitos','Conductor asignado','Seguimiento del trámite'],service:'Matriculación / revisión vehicular'},
    custom:{number:'06',icon:'＋',title:'Servicio personalizado',copy:'Si el servicio que necesita no aparece en la lista, describa su requerimiento para que nuestro equipo revise la posibilidad de realizarlo.',features:['Evaluación de necesidad','Cotización personalizada','Asignación operativa','Seguimiento y evidencias'],service:'Servicio personalizado'}
  };

  menu?.addEventListener('click',()=>{const open=nav?.classList.toggle('open');menu.setAttribute('aria-expanded',open?'true':'false');menu.textContent=open?'×':'☰';});
  nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu?.setAttribute('aria-expanded','false');if(menu)menu.textContent='☰';}));
  document.getElementById('year').textContent=String(new Date().getFullYear());

  const scrollToForm=(service='')=>{if(serviceSelect&&service)serviceSelect.value=service;document.getElementById('solicitar')?.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>document.getElementById('leadName')?.focus({preventScroll:true}),550);};

  document.querySelectorAll('.need-card').forEach(card=>card.addEventListener('click',()=>{
    document.querySelectorAll('.need-card').forEach(c=>c.classList.remove('active'));card.classList.add('active');
    const result=document.getElementById('needResult');
    if(result){result.querySelector('.result-icon').textContent=card.dataset.icon||'→';result.querySelector('strong').textContent=card.dataset.title||'';result.querySelector('p').textContent=card.dataset.copy||'';result.dataset.service=card.dataset.service||'';}
  }));
  document.getElementById('needCta')?.addEventListener('click',()=>scrollToForm(document.getElementById('needResult')?.dataset.service||'Entrega programada'));

  const detail=document.getElementById('serviceDetail');
  document.querySelectorAll('.service-tab').forEach(tab=>tab.addEventListener('click',()=>{
    const key=tab.dataset.tab;const data=serviceData[key];if(!data||!detail)return;
    document.querySelectorAll('.service-tab').forEach(t=>t.classList.remove('active'));tab.classList.add('active');
    detail.classList.add('switching');
    setTimeout(()=>{
      detail.querySelector('.detail-number').textContent=data.number;
      detail.querySelector('.detail-icon').textContent=data.icon;
      detail.querySelector('h3').textContent=data.title;
      detail.querySelector(':scope > p').textContent=data.copy;
      detail.querySelector('.feature-list').innerHTML=data.features.map(f=>`<span>✓ ${f}</span>`).join('');
      const btn=detail.querySelector('.service-request');btn.dataset.service=data.service;
      detail.classList.remove('switching');
    },120);
  }));

  document.querySelectorAll('.service-request').forEach(btn=>btn.addEventListener('click',()=>scrollToForm(btn.dataset.service||'')));

  document.getElementById('trackForm')?.addEventListener('submit',e=>{
    e.preventDefault();const code=document.getElementById('trackingInput')?.value.trim();if(!code){document.getElementById('trackingInput')?.focus();return;}location.href=`/tracking?code=${encodeURIComponent(code)}`;
  });

  document.querySelectorAll('.faq details').forEach(item=>item.addEventListener('toggle',()=>{if(!item.open)return;document.querySelectorAll('.faq details').forEach(other=>{if(other!==item)other.open=false;});}));

  leadForm?.addEventListener('submit',e=>{
    e.preventDefault();
    const name=document.getElementById('leadName').value.trim();
    const service=serviceSelect.value;
    const origin=document.getElementById('leadOrigin').value.trim();
    const destination=document.getElementById('leadDestination').value.trim();
    const detailText=document.getElementById('leadDetail').value.trim();
    const text=['Hola, deseo solicitar un servicio con GOY XPRESS.','',`Nombre o empresa: ${name}`,`Servicio requerido: ${service}`,origin?`Lugar de inicio: ${origin}`:'',destination?`Destino o lugar de gestión: ${destination}`:'',detailText?`Detalle de la solicitud: ${detailText}`:'','','Agradezco su ayuda para coordinar este servicio.'].filter(Boolean).join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank','noopener');
  });
})();