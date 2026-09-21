(() => {
  const required = ['loginView','appView','nav','dashboard','clients','orders','couriers','payments','invites','reports','heroNewOrder','ordersBody','clientsBody','courierCards','paymentsBody'];
  const missing = required.filter(id => !document.getElementById(id));
  if (missing.length) console.error('[GOY ADMIN UI] Elementos requeridos ausentes:', missing.join(', '));
  else console.info('[GOY ADMIN UI] Estructura principal validada.');
})();
