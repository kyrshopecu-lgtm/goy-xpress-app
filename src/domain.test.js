const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PRICING,
  calculateCollectTotal,
  calculateDeliveryPrice,
  calculateExecutivePrice,
  calculatePackagePrice,
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

test('envío express incluye 4 km por $3.50 y cobra $0.50 por km adicional iniciado', () => {
  assert.equal(calculateDeliveryPrice('express', 4).total, 3.5);
  assert.equal(calculateDeliveryPrice('express', 4.1).total, 4);
  assert.equal(calculateDeliveryPrice('express', 7).total, 5);
});

test('envío programado se limita al radio de 4 km', () => {
  assert.equal(calculateDeliveryPrice('scheduled', 4).eligible, true);
  assert.equal(calculateDeliveryPrice('scheduled', 4.1).eligible, false);
  assert.equal(calculateDeliveryPrice('scheduled', 4).total, 3.5);
});

test('paquetes cobran $3.50 hasta 4 km y $0.50 por km adicional', () => {
  assert.equal(calculatePackagePrice({distanceKm:4,depthCm:30,widthCm:30,heightCm:30,weightKg:10}).total, 3.5);
  assert.equal(calculatePackagePrice({distanceKm:4.1,depthCm:30,widthCm:30,heightCm:30,weightKg:10}).total, 4);
});

test('paquetes aplican recargos por tamaño y peso dentro del máximo', () => {
  const medium = calculatePackagePrice({distanceKm:4,depthCm:35,widthCm:30,heightCm:30,weightKg:15});
  assert.equal(medium.dimensionSurcharge, 0.5);
  assert.equal(medium.weightSurcharge, 0.5);
  assert.equal(medium.total, 4.5);
  const heavy = calculatePackagePrice({distanceKm:4,depthCm:30,widthCm:30,heightCm:30,weightKg:22});
  assert.equal(heavy.weightSurcharge, 1);
  assert.equal(heavy.total, 4.5);
});

test('paquete fuera de 45x50x60 cm o 25 kg requiere servicio de auto', () => {
  assert.equal(calculatePackagePrice({distanceKm:4,depthCm:46,widthCm:30,heightCm:30,weightKg:10}).autoRequired, true);
  assert.equal(calculatePackagePrice({distanceKm:4,depthCm:45,widthCm:50,heightCm:60,weightKg:25}).eligible, true);
  assert.equal(calculatePackagePrice({distanceKm:4,depthCm:30,widthCm:30,heightCm:30,weightKg:25.1}).autoRequired, true);
});

test('paquete delicado o con valor superior a $1000 no cumple la política', () => {
  assert.match(calculatePackagePrice({distanceKm:4,depthCm:30,widthCm:30,heightCm:30,weightKg:10,delicate:true}).policyError,/delicados/i);
  assert.match(calculatePackagePrice({distanceKm:4,depthCm:30,widthCm:30,heightCm:30,weightKg:10,productValue:1000.01}).policyError,/1\.000/i);
});

test('cobro contra entrega suma el envío solo cuando paga el destinatario', () => {
  assert.equal(
    calculateCollectTotal({
      productValue: 25,
      deliveryCost: 3.5,
      cashOnDelivery: true,
      deliveryPayer: 'recipient',
    }),
    28.5,
  );
  assert.equal(
    calculateCollectTotal({
      productValue: 25,
      deliveryCost: 3.5,
      cashOnDelivery: true,
      deliveryPayer: 'sender',
    }),
    25,
  );
  assert.equal(
    calculateCollectTotal({
      productValue: 25,
      deliveryCost: 3.5,
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
  assert.equal(PRICING.scheduledDelivery, 3.5);
  assert.equal(PRICING.expressBase, 3.5);
  assert.equal(PRICING.expressIncludedKm, 4);
  assert.equal(PRICING.expressExtraKm, 0.5);
  assert.equal(PRICING.executiveBase, 6.5);
  assert.equal(PRICING.executiveIncludedMinutes, 40);
  assert.equal(PRICING.executiveExtraMinute, 0.1);
  assert.equal(PRICING.officePickup, 1);
});
