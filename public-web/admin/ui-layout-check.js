(() => {
 const ids=['loginView','appView','nav','dashboard','clients','orders','couriers','payments','invites','reports','heroNewOrder','ordersBody','clientsBody','courierCards','paymentsBody'];
 const missing=ids.filter(id=>!document.getElementById(id));
 if(missing.length) console.error('[GOY ADMIN UI] Faltan:',missing.join(', '));
 else console.info('[GOY ADMIN UI] Estructura principal validada');
})();
