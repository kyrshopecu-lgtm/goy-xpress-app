(()=>{
  const menu=document.querySelector('.menu-btn');
  const nav=document.querySelector('.main-nav');
  menu?.addEventListener('click',()=>{const open=nav?.classList.toggle('open');menu.setAttribute('aria-expanded',open?'true':'false');menu.textContent=open?'×':'☰';});
  nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu?.setAttribute('aria-expanded','false');if(menu)menu.textContent='☰';}));
  document.getElementById('year').textContent=String(new Date().getFullYear());
  const reveal=()=>document.querySelectorAll('.reveal').forEach((el,i)=>{if(el.getBoundingClientRect().top<innerHeight-55){setTimeout(()=>el.classList.add('visible'),Math.min(i%6,5)*45);}});
  addEventListener('scroll',reveal,{passive:true});reveal();
  document.querySelectorAll('.service-card').forEach(card=>card.addEventListener('pointermove',e=>{if(innerWidth<900)return;const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;card.style.transform=`perspective(700px) rotateY(${x*5}deg) rotateX(${-y*5}deg) translateY(-7px)`;}));
  document.querySelectorAll('.service-card').forEach(card=>card.addEventListener('pointerleave',()=>card.style.transform=''));
})();