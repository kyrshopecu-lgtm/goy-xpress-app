const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateCourierWait,
  calculateDepositPrice,
  monthlyCycleKey,
  canReleaseCourierFunds,
  createRecurringTemplate,
} = require('./logisticsRules');

test('espera del mensajero incluye 10 minutos sin recargo', () => {
  assert.deepEqual(calculateCourierWait(10), {
    elapsedMinutes: 10,
    freeMinutes: 10,
    extraMinutes: 0,
    extraCost: 0,
    requiresDecision: true,
  });
  assert.equal(calculateCourierWait(17).extraCost, 0.7);
});

test('depósito cuesta 3.50 hasta 3 cheques y 0.50 por cheque adicional', () => {
  assert.equal(calculateDepositPrice({checkCount: 3}).total, 3.5);
  assert.equal(calculateDepositPrice({checkCount: 5}).total, 4.5);
});

test('depósito en efectivo se limita a 1000 dólares', () => {
  assert.equal(calculateDepositPrice({method: 'cash', cashAmount: 1000}).valid, true);
  assert.equal(calculateDepositPrice({method: 'cash', cashAmount: 1000.01}).valid, false);
});

test('cierre mensual usa día 30 como corte', () => {
  assert.equal(monthlyCycleKey(new Date('2026-08-30T12:00:00')), '2026-08');
  assert.equal(monthlyCycleKey(new Date('2026-08-31T12:00:00')), '2026-09');
});

test('febrero cierra el último día disponible', () => {
  assert.equal(monthlyCycleKey(new Date('2026-02-28T12:00:00')), '2026-02');
  assert.equal(monthlyCycleKey(new Date('2026-03-01T12:00:00')), '2026-03');
});

test('cartera solo se libera con entrega finalizada y foto de depósito', () => {
  assert.equal(canReleaseCourierFunds({status:'Entrega finalizada', evidence:{depositPhoto:'x'}}), true);
  assert.equal(canReleaseCourierFunds({status:'Entregado', evidence:{depositPhoto:'x'}}), true);
  assert.equal(canReleaseCourierFunds({status:'Entregado', evidence:{}}), false);
});

test('plantilla recurrente elimina datos transitorios', () => {
  const tpl = createRecurringTemplate({code:'GOY-1', status:'En ruta', courier:'Ana', customer:'Tienda', destinationAddress:'Quito'}, 'Ruta diaria');
  assert.equal(tpl.payload.code, undefined);
  assert.equal(tpl.payload.status, undefined);
  assert.equal(tpl.payload.customer, 'Tienda');
});
