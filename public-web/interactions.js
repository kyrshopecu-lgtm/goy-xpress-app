(()=>{
  if(!document.querySelector('link[data-goy-professional-ui]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/web/professional-ui.css?v=20260920-1';
    link.dataset.goyProfessionalUi='1';
    document.head.appendChild(link);
  }

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

  const wa=document.querySelector('.floating-whatsapp');
  if(wa)setTimeout(()=>wa.classList.add('visible'),500);

  document.querySelectorAll('.company-chips span,.address-card,.access-grid a').forEach(el=>{
    el.addEventListener('pointerenter',()=>el.animate([{transform:'translateY(0)'},{transform:'translateY(-3px)'}],{duration:180,fill:'forwards',easing:'ease-out'}));
    el.addEventListener('pointerleave',()=>el.animate([{transform:'translateY(-3px)'},{transform:'translateY(0)'}],{duration:180,fill:'forwards',easing:'ease-out'}));
  });

  const socialLinks={
    Facebook:'https://www.facebook.com/share/19K8a7ncxH/',
    Instagram:'https://www.instagram.com/goyxpress?stkn=Z3k2eDVzczNobGp2',
    TikTok:'https://www.tiktok.com/@goyxpressmensajeria?_r=1&_d=f1fhe9l6g9515d&sec_uid=MS4wLjABAAAAyQ-tu5sjWwOzwUE15Ui6G8DeAzd_e1dr3a_EC-1FBBjP1OoWzIg43Edzev5cp0FT&share_author_id=6952963572843971590&sharer_language=es&source=h5_m&u_code=e1g61h6h81b7f3&timestamp=1789694874&user_id=7093920362173350917&sec_user_id=MS4wLjABAAAAMAcKlYnF0lh3RZa-lJpaFIPPjC3EcxBLQxrT-zfy_ayBGADmoexa5kMSFDyO8Ygx&item_author_type=2&utm_source=copy&utm_campaign=client_share&utm_medium=android&share_iid=7684721753910593300&share_link_id=39ba2e54-2ca5-4036-9006-adbd1c41c557&share_app_id=1233&ugbiz_name=ACCOUNT&ug_btm=b6880%2Cb5836&social_share_type=5&share_enter_from=others_homepage&item_author_type=2&enable_checksum=1'
  };

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