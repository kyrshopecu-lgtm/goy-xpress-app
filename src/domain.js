const PRICING = Object.freeze({
  scheduledDelivery: 3,
  expressBase: 3,
  expressIncludedKm: 5,
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

function calculateCollectTotal({productValue, deliveryCost, cashOnDelivery, deliveryPayer}) {
  if (!cashOnDelivery) return 0;
  return roundMoney(nonNegativeNumber(productValue) + (deliveryPayer === 'recipient' ? nonNegativeNumber(deliveryCost) : 0));
}

function createCode(kind, now = Date.now(), random = Math.random()) {
  const prefixByKind = {
    [REQUEST_KIND.shipment]: 'GOY',
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
    [REQUEST_KIND.procedure]: 'Mensajería ejecutiva',
    [REQUEST_KIND.deposit]: 'Depósito',
    [REQUEST_KIND.diverse]: 'Servicios diversos',
    [REQUEST_KIND.officePickup]: 'Retiro en oficina',
    [REQUEST_KIND.partner]: 'Bodega y ventas',
  };
  return labels[kind] || 'Solicitud';
}

function requestPrimaryAddress(request) {
  return request?.destinationAddress || request?.address || request?.place || request?.institution || 'Dirección no registrada';
}

module.exports = {PRICING, REQUEST_KIND, REQUEST_STATUS, calculateCollectTotal, calculateDeliveryPrice, calculateExecutivePrice, createCode, nonNegativeNumber, normalizeRequest, parseNumber, requestKindLabel, requestPrimaryAddress, roundMoney};
