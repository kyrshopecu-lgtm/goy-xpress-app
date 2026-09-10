(()=>{
  const menu=document.querySelector('.menu-btn');
  const nav=document.querySelector('.main-nav');
  menu?.addEventListener('click',()=>{const open=nav?.classList.toggle('open');menu.setAttribute('aria-expanded',open?'true':'false');menu.textContent=open?'×':'☰';});
  nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu?.setAttribute('aria-expanded','false');if(menu)menu.textContent='☰';}));
  document.getElementById('year').textContent=String(new Date().getFullYear());
  document.getElementById('leadForm')?.addEventListener('submit',e=>{
    e.preventDefault();
    const name=document.getElementById('leadName').value.trim();
    const service=document.getElementById('leadService').value;
    const origin=document.getElementById('leadOrigin').value.trim();
    const destination=document.getElementById('leadDestination').value.trim();
    const detail=document.getElementById('leadDetail').value.trim();
    const text=[
      'Hola, quiero solicitar un servicio con GOY XPRESS.',
      '',`Nombre/empresa: ${name}`,`Servicio: ${service}`,
      origin?`Origen/retiro: ${origin}`:'',destination?`Destino/gestión: ${destination}`:'',detail?`Detalle: ${detail}`:'',
      '','Por favor ayúdenme con la coordinación.'
    ].filter(Boolean).join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank','noopener');
  });
})();