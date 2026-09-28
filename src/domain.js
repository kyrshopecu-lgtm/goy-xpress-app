const PRICING = Object.freeze({
  scheduledDelivery: 3.5,
  expressBase: 3.5,
  expressIncludedKm: 4,
  expressExtraKm: 0.5,
  executiveBase: 6.5,
  executiveIncludedMinutes: 40,
  executiveExtraMinute: 0.1,
  officePickup: 1,
  depositBase: 3.5,
  depositIncludedChecks: 3,
  depositExtraCheck: 0.5,
  cashDepositLimit: 1000,
  courierFreeWaitMinutes: 10,
  courierExtraWaitMinute: 0.1,
  packageBase: 3.5,
  packageIncludedKm: 4,
  packageExtraKm: 0.5,
  packageStandardDepthCm: 30,
  packageStandardWidthCm: 30,
  packageStandardHeightCm: 30,
  packageDimensionSurcharge: 0.5,
  packageStandardWeightKg: 10,
  packageMediumWeightMaxKg: 19,
  packageMaxWeightKg: 25,
  packageMediumWeightSurcharge: 0.5,
  packageHeavyWeightSurcharge: 1,
  packageMaxDepthCm: 45,
  packageMaxWidthCm: 50,
  packageMaxHeightCm: 60,
  packageMaxDeclaredValue: 1000,
});

const REQUEST_STATUS = Object.freeze({
  pending: 'Pendiente',
  quoted: 'Cotizado',
  accepted: 'Aceptado',
  assigned: 'Asignado',
  pickedUp: 'Recogido',
  onRoute: 'En camino',
  finished: 'Entrega finalizada',
  cancelled: 'Cancelado',
});

const REQUEST_KIND = Object.freeze({
  shipment: 'shipment',
  package: 'package',
  procedure: 'procedure',
  deposit: 'deposit',
  diverse: 'diverse',
  officePickup: 'office_pickup',
  partner: 'partner',
});

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parseNumber(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const normalized = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonNegativeNumber(value) {
  return Math.max(0, parseNumber(value));
}

function calculateExecutivePrice(minutes) {
  const requestedMinutes = Math.max(0, Math.ceil(parseNumber(minutes, 0)));
  const extraMinutes = Math.max(0, requestedMinutes - PRICING.executiveIncludedMinutes);
  const surcharge = roundMoney(extraMinutes * PRICING.executiveExtraMinute);
  return {requestedMinutes, includedMinutes: PRICING.executiveIncludedMinutes, extraMinutes, surcharge, total: roundMoney(PRICING.executiveBase + surcharge)};
}

function calculateDeliveryPrice(mode, distanceKm) {
  const distance = nonNegativeNumber(distanceKm);
  if (mode === 'scheduled') {
    return {mode, distanceKm: distance, includedKm: PRICING.expressIncludedKm, extraKm: Math.max(0, Math.ceil(distance - PRICING.expressIncludedKm)), total: PRICING.scheduledDelivery, eligible: distance > 0 && distance <= PRICING.expressIncludedKm};
  }
  const extraKm = Math.max(0, Math.ceil(distance - PRICING.expressIncludedKm));
  return {mode: 'express', distanceKm: distance, includedKm: PRICING.expressIncludedKm, extraKm, total: roundMoney(PRICING.expressBase + extraKm * PRICING.expressExtraKm), eligible: distance > 0};
}

function calculatePackagePrice({distanceKm, depthCm, widthCm, heightCm, weightKg, productValue, delicate=false} = {}) {
  const distance = nonNegativeNumber(distanceKm);
  const depth = nonNegativeNumber(depthCm);
  const width = nonNegativeNumber(widthCm);
  const height = nonNegativeNumber(heightCm);
  const weight = nonNegativeNumber(weightKg);
  const declaredValue = nonNegativeNumber(productValue);

  const invalidDimensions = depth <= 0 || width <= 0 || height <= 0;
  const invalidWeight = weight <= 0;
  const exceedsDimensions =
    depth > PRICING.packageMaxDepthCm ||
    width > PRICING.packageMaxWidthCm ||
    height > PRICING.packageMaxHeightCm;
  const exceedsWeight = weight > PRICING.packageMaxWeightKg;
  const autoRequired = exceedsDimensions || exceedsWeight;

  const extraKm = Math.max(0, Math.ceil(distance - PRICING.packageIncludedKm));
  const distanceCost = roundMoney(PRICING.packageBase + extraKm * PRICING.packageExtraKm);
  const dimensionSurcharge =
    depth > PRICING.packageStandardDepthCm ||
    width > PRICING.packageStandardWidthCm ||
    height > PRICING.packageStandardHeightCm
      ? PRICING.packageDimensionSurcharge
      : 0;
  const weightSurcharge = weight > PRICING.packageMediumWeightMaxKg
    ? PRICING.packageHeavyWeightSurcharge
    : weight > PRICING.packageStandardWeightKg
      ? PRICING.packageMediumWeightSurcharge
      : 0;

  const policyError = delicate
    ? 'No se aceptan paquetes delicados en este servicio.'
    : declaredValue > PRICING.packageMaxDeclaredValue
      ? 'El valor declarado del paquete no puede superar $1.000.'
      : '';

  return {
    distanceKm: distance,
    includedKm: PRICING.packageIncludedKm,
    extraKm,
    distanceCost,
    depthCm: depth,
    widthCm: width,
    heightCm: height,
    weightKg: weight,
    productValue: declaredValue,
    dimensionSurcharge,
    weightSurcharge,
    autoRequired,
    exceedsDimensions,
    exceedsWeight,
    policyError,
    eligible: distance > 0 && !invalidDimensions && !invalidWeight && !autoRequired && !policyError,
    total: roundMoney(distanceCost + dimensionSurcharge + weightSurcharge),
  };
}

function calculateCollectTotal({productValue, deliveryCost, cashOnDelivery, deliveryPayer}) {
  if (!cashOnDelivery) return 0;
  return roundMoney(nonNegativeNumber(productValue) + (deliveryPayer === 'recipient' ? nonNegativeNumber(deliveryCost) : 0));
}

function createCode(kind, now = Date.now(), random = Math.random()) {
  const prefixByKind = {
    [REQUEST_KIND.shipment]: 'GOY',
    [REQUEST_KIND.package]: 'PAQ',
    [REQUEST_KIND.procedure]: 'TRM',
    [REQUEST_KIND.deposit]: 'DEP',
    [REQUEST_KIND.diverse]: 'DIV',
    [REQUEST_KIND.officePickup]: 'RET',
    [REQUEST_KIND.partner]: 'ALI',
  };
  const prefix = prefixByKind[kind] || 'SOL';
  return `${prefix}-${String(now).slice(-7)}-${Math.floor(random * 1000).toString().padStart(3, '0')}`;
}

function normalizeRequest(request) {
  const statusMap = {
    'Pendiente de asignación': REQUEST_STATUS.pending,
    Pendiente: REQUEST_STATUS.pending,
    Cotizado: REQUEST_STATUS.quoted,
    Aceptado: REQUEST_STATUS.accepted,
    Asignado: REQUEST_STATUS.assigned,
    Recogido: REQUEST_STATUS.pickedUp,
    'En ruta': REQUEST_STATUS.onRoute,
    'En camino': REQUEST_STATUS.onRoute,
    Finalizado: REQUEST_STATUS.finished,
    Entregado: REQUEST_STATUS.finished,
    'Entrega finalizada': REQUEST_STATUS.finished,
    Cancelado: REQUEST_STATUS.cancelled,
  };
  return {...request, status: statusMap[request?.status] || REQUEST_STATUS.pending, serviceCost: nonNegativeNumber(request?.serviceCost), totalToCollect: nonNegativeNumber(request?.totalToCollect)};
}

function requestKindLabel(kind) {
  const labels = {
    [REQUEST_KIND.shipment]: 'Envío',
    [REQUEST_KIND.package]: 'Retiro y/o entrega de paquetes',
    [REQUEST_KIND.procedure]: 'Mensajería ejecutiva',
    [REQUEST_KIND.deposit]: 'Depósito',
    [REQUEST_KIND.diverse]: 'Servicios diversos',
    [REQUEST_KIND.officePickup]: 'Retiro en oficina',
    [REQUEST_KIND.partner]: 'Bodega y ventas',
  };
  return labels[kind] || 'Solicitud';
}

function requestPrimaryAddress(request) {
  return request?.destinationAddress || request?.stops?.[0]?.address || request?.address || request?.place || request?.institution || 'Dirección no registrada';
}

module.exports = {PRICING, REQUEST_KIND, REQUEST_STATUS, calculateCollectTotal, calculateDeliveryPrice, calculateExecutivePrice, calculatePackagePrice, createCode, nonNegativeNumber, normalizeRequest, parseNumber, requestKindLabel, requestPrimaryAddress, roundMoney};
