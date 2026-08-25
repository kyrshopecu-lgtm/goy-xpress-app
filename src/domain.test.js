const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PRICING,
  calculateCollectTotal,
  calculateDeliveryPrice,
  calculateExecutivePrice,
  createCode,
  normalizeRequest,
} = require('./domain');

test('mensajería ejecutiva cuesta $6.50 hasta 40 minutos', () => {
  assert.deepEqual(calculateExecutivePrice(40), {
    requestedMinutes: 40,
    includedMinutes: 40,
    extraMinutes: 0,
    surcharge: 0,
    total: 6.5,
  });
});

test('mensajería ejecutiva suma $0.10 por minuto adicional', () => {
  assert.equal(calculateExecutivePrice(41).total, 6.6);
  assert.equal(calculateExecutivePrice(55).total, 8);
});

test('envío express incluye 5 km y cobra cada km adicional iniciado', () => {
  assert.equal(calculateDeliveryPrice('express', 5).total, 3);
  assert.equal(calculateDeliveryPrice('express', 5.1).total, 3.5);
  assert.equal(calculateDeliveryPrice('express', 8).total, 4.5);
});

test('envío programado se limita al radio de 5 km', () => {
  assert.equal(calculateDeliveryPrice('scheduled', 5).eligible, true);
  assert.equal(calculateDeliveryPrice('scheduled', 6).eligible, false);
  assert.equal(calculateDeliveryPrice('scheduled', 5).total, 3);
});

test('cobro contra entrega suma el envío solo cuando paga el destinatario', () => {
  assert.equal(
    calculateCollectTotal({
      productValue: 25,
      deliveryCost: 3,
      cashOnDelivery: true,
      deliveryPayer: 'recipient',
    }),
    28,
  );
  assert.equal(
    calculateCollectTotal({
      productValue: 25,
      deliveryCost: 3,
      cashOnDelivery: true,
      deliveryPayer: 'sender',
    }),
    25,
  );
  assert.equal(
    calculateCollectTotal({
      productValue: 25,
      deliveryCost: 3,
      cashOnDelivery: false,
      deliveryPayer: 'recipient',
    }),
    0,
  );
});

test('genera códigos únicos con el prefijo del servicio', () => {
  assert.equal(createCode('procedure', 1234567890, 0.007), 'TRM-4567890-007');
});

test('normaliza solicitudes creadas por la versión anterior', () => {
  const normalized = normalizeRequest({
    code: 'GOY-1',
    status: 'Pendiente de asignación',
    serviceCost: '3,50',
  });
  assert.equal(normalized.status, 'Pendiente');
  assert.equal(normalized.serviceCost, 3.5);
  assert.equal(normalized.totalToCollect, 0);
});

test('mantiene las tarifas comerciales centrales', () => {
  assert.equal(PRICING.executiveBase, 6.5);
  assert.equal(PRICING.executiveIncludedMinutes, 40);
  assert.equal(PRICING.executiveExtraMinute, 0.1);
  assert.equal(PRICING.officePickup, 1);
});
