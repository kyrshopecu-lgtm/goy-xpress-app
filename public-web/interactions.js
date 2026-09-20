(()=>{
  if(!document.querySelector('link[data-goy-professional-ui]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/web/professional-ui.css?v=20260920-1';
    link.dataset.goyProfessionalUi='1';
    document.head.appendChild(link);
  }

  if(!document.querySelector('link[data-goy-social-mobile-fixes]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/web/social-mobile-hotfix.css?v=20260920-2';
    link.dataset.goySocialMobileFixes='1';
    document.head.appendChild(link);
  }

  const socialLinks={
    Facebook:'https://www.facebook.com/share/19K8a7ncxH/',
    Instagram:'https://www.instagram.com/goyxpress',
    TikTok:'https://www.tiktok.com/@goyxpressmensajeria',
    WhatsApp:'https://wa.me/593992705565?text=Hola%20GOY%20XPRESS'
  };
  const waIcon='<img class="gx-wa-icon" src="/web/assets/whatsapp-brand.svg" alt="" aria-hidden="true">';

  /* Portada profesional: mensaje claro, acciones principales y confianza. */
  const heroCopy=document.querySelector('.ref-hero-copy');
  if(heroCopy){
    const kicker=heroCopy.querySelector('.ref-kicker');
    const title=heroCopy.querySelector('h1');
    const summary=heroCopy.querySelector(':scope > p');
    const benefits=heroCopy.querySelector('.ref-benefits');

    if(kicker)kicker.textContent='TRÁMITES · ENVÍOS · GESTIONES · EN QUITO';
    if(title)title.innerHTML='Tu aliado en <em>trámites, envíos y gestiones en Quito</em>';
    if(summary)summary.textContent='En GOY XPRESS te ayudamos a resolver entregas, mensajería, trámites y gestiones de forma rápida, segura y organizada.';

    if(benefits){
      benefits.classList.add('gx-hero-trust');
      benefits.innerHTML=`
        <div class="ref-benefit"><b>⚡</b><div><strong>ATENCIÓN RÁPIDA</strong><small>Coordinación ágil</small></div></div>
        <div class="ref-benefit"><b>📦</b><div><strong>SEGUIMIENTO</strong><small>Consulta tu pedido</small></div></div>
        <div class="ref-benefit"><b>📍</b><div><strong>EN QUITO</strong><small>Gestiones locales</small></div></div>
        <div class="ref-benefit"><b>💬</b><div><strong>WHATSAPP</strong><small>Soporte directo</small></div></div>`;
    }
  }

  /* Botones de WhatsApp con el icono de marca. */
  const headerWa=document.querySelector('.ref-header-cta');
  if(headerWa){
    headerWa.innerHTML=`${waIcon}<span class="gx-wa-label">WhatsApp</span>`;
    headerWa.setAttribute('aria-label','Contactar a GOY XPRESS por WhatsApp');
  }

  const floatingWa=document.querySelector('.floating-wa');
  if(floatingWa){
    floatingWa.innerHTML=waIcon;
    floatingWa.setAttribute('aria-label','Abrir WhatsApp de GOY XPRESS');
    setTimeout(()=>floatingWa.classList.add('visible'),500);
  }

  const quickWa=document.querySelector('.gx-quick-card.whatsapp .gx-quick-icon');
  if(quickWa)quickWa.innerHTML=waIcon;

  const mainWa=document.querySelector('.gx-hero-actions .gx-btn.primary');
  if(mainWa){
    mainWa.innerHTML=`${waIcon}<span>Solicitar servicio</span>`;
  }

  /* Redes sociales oficiales visibles también en teléfonos. */
  const header=document.querySelector('.ref-header');
  if(header&&!document.querySelector('.gx-social-strip')){
    const strip=document.createElement('div');
    strip.className='gx-social-strip';
    strip.setAttribute('aria-label','Redes sociales oficiales de GOY XPRESS');
    strip.innerHTML=`
      <a href="${socialLinks.Facebook}" target="_blank" rel="noopener noreferrer" aria-label="Facebook de GOY XPRESS"><span class="gx-social-icon">f</span><span class="gx-social-label">Facebook</span></a>
      <a href="${socialLinks.Instagram}" target="_blank" rel="noopener noreferrer" aria-label="Instagram de GOY XPRESS"><span class="gx-social-icon instagram">◎</span><span class="gx-social-label">Instagram</span></a>
      <a href="${socialLinks.TikTok}" target="_blank" rel="noopener noreferrer" aria-label="TikTok de GOY XPRESS"><span class="gx-social-icon tiktok">♪</span><span class="gx-social-label">TikTok</span></a>
      <a href="${socialLinks.WhatsApp}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp de GOY XPRESS"><span class="gx-social-icon whatsapp">${waIcon}</span><span class="gx-social-label">WhatsApp</span></a>`;
    header.insertAdjacentElement('afterend',strip);
  }

  const stage=document.querySelector('.interactive-stage');
  if(stage){
    stage.addEventListener('pointermove',e=>{
      if(innerWidth<900)return;
      const r=stage.getBoundingClientRect();
      const x=(e.clientX-r.left)/r.width-.5;
      const y=(e.clientY-r.top)/r.height-.5;
      stage.style.transform=`perspective(900px) rotateY(${x*3}deg) rotateX(${-y*3}deg)`;
    });
    stage.addEventListener('pointerleave',()=>stage.style.transform='');
  }

  document.querySelectorAll('.company-chips span,.address-card,.access-grid a').forEach(el=>{
    el.addEventListener('pointerenter',()=>el.animate([{transform:'translateY(0)'},{transform:'translateY(-3px)'}],{duration:180,fill:'forwards',easing:'ease-out'}));
    el.addEventListener('pointerleave',()=>el.animate([{transform:'translateY(-3px)'},{transform:'translateY(0)'}],{duration:180,fill:'forwards',easing:'ease-out'}));
  });

  document.querySelectorAll('.ref-top-right span').forEach(el=>{
    const name=Object.keys(socialLinks).find(k=>el.textContent.includes(k));
    if(!name)return;
    const a=document.createElement('a');
    a.href=socialLinks[name];
    a.target='_blank';
    a.rel='noopener noreferrer';
    a.className='social-official-link';
    a.setAttribute('aria-label',`Abrir ${name} oficial de GOY XPRESS`);
    a.innerHTML=el.innerHTML;
    el.replaceWith(a);
  });

  const sectionIds=['inicio','servicios','como-funciona','instalaciones','contacto'];
  const navLinks=[...document.querySelectorAll('.ref-nav a[href^="#"]')];
  const setActive=id=>navLinks.forEach(a=>a.classList.toggle('active',a.getAttribute('href')===`#${id}`));
  if('IntersectionObserver'in window){
    const observer=new IntersectionObserver(entries=>{
      const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
      if(visible?.target?.id)setActive(visible.target.id);
    },{rootMargin:'-30% 0px -55% 0px',threshold:[0,.15,.35,.6]});
    sectionIds.map(id=>document.getElementById(id)).filter(Boolean).forEach(el=>observer.observe(el));
  }
})();