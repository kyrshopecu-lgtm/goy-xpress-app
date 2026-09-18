(()=>{const stage=document.querySelector('.interactive-stage');if(stage){stage.addEventListener('pointermove',e=>{if(innerWidth<900)return;const r=stage.getBoundingClientRect();const x=(e.clientX-r.left)/r.width-.5;const y=(e.clientY-r.top)/r.height-.5;stage.style.transform=`perspective(900px) rotateY(${x*3}deg) rotateX(${-y*3}deg)`;});stage.addEventListener('pointerleave',()=>stage.style.transform='');}const wa=document.querySelector('.floating-whatsapp');if(wa){setTimeout(()=>wa.classList.add('visible'),500);}document.querySelectorAll('.company-chips span,.address-card,.access-grid a').forEach(el=>{el.addEventListener('pointerenter',()=>el.animate([{transform:'translateY(0)'},{transform:'translateY(-3px)'}],{duration:180,fill:'forwards',easing:'ease-out'}));el.addEventListener('pointerleave',()=>el.animate([{transform:'translateY(-3px)'},{transform:'translateY(0)'}],{duration:180,fill:'forwards',easing:'ease-out'}));});

// Imágenes oficiales cargadas por GOY XPRESS para la sección de servicios.
const serviceImages=[
'/01_mensajeria_envios.png',
'/02_tramites_generales.png',
'/04_apoyo_legal_judicial.png',
'/06_apostilla_documentos.png',
'/05_tramites_vehiculares.png',
'/07_mensajeria_ejecutiva.png',
'/03_cambio_dinero_negocio.png',
'/08_servicios_adicionales.png'
];
const cards=[...document.querySelectorAll('.ref-service-card')];
cards.forEach((card,i)=>{if(!serviceImages[i])return;const img=card.querySelector('img');if(!img)return;img.src=serviceImages[i];img.removeAttribute('width');img.removeAttribute('height');img.style.width='100%';img.style.height='auto';img.style.aspectRatio='3 / 4';img.style.objectFit='cover';img.style.display='block';img.style.background='#fff';card.style.height='auto';card.style.minHeight='0';});
})();