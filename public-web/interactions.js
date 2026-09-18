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

// approved-final.css ocultaba las etiquetas IMG y dibujaba un bloque vacío con :before.
// Este estilo se inserta al final para que las fotografías reales sean las que se muestren.
const fix=document.createElement('style');
fix.id='goy-service-images-fix';
fix.textContent=`
.ref-service-card:before{display:none!important;content:none!important;height:0!important;min-height:0!important}
.ref-service-card>img{display:block!important;width:100%!important;height:auto!important;aspect-ratio:auto!important;object-fit:contain!important;object-position:center!important;background:#fff!important;border:0!important}
.ref-service-card{height:auto!important;min-height:0!important;background:#fff!important;overflow:hidden!important}
.ref-service-card>span{min-height:150px!important}
@media(max-width:980px){.ref-service-scroll{grid-template-columns:repeat(2,minmax(0,1fr))!important}.ref-service-card>span{min-height:138px!important}}
@media(max-width:820px){.ref-service-scroll{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;overflow:visible!important;gap:10px!important}.ref-service-card{min-width:0!important;max-width:none!important;flex:none!important}.ref-service-card>span{min-height:132px!important;padding:9px 10px 11px!important}.ref-service-card strong{font-size:12px!important}.ref-service-card .service-desc{font-size:8.5px!important}.ref-service-card small{padding:6px 11px!important;font-size:8.5px!important}}
@media(max-width:430px){.ref-service-scroll{grid-template-columns:1fr!important}.ref-service-card>span{min-height:118px!important}.ref-service-card strong{font-size:14px!important}.ref-service-card .service-desc{font-size:10px!important}.ref-service-card small{font-size:9px!important}}
`;
document.head.appendChild(fix);

const cards=[...document.querySelectorAll('.ref-service-card')];
cards.forEach((card,i)=>{if(!serviceImages[i])return;const img=card.querySelector('img');if(!img)return;img.src=serviceImages[i];img.loading=i<2?'eager':'lazy';img.decoding='async';img.removeAttribute('width');img.removeAttribute('height');});
})();