const LOGISTICS = Object.freeze({
  courierFreeWaitMinutes: 10,
  courierExtraWaitMinute: 0.10,
  depositBase: 3.50,
  depositIncludedChecks: 3,
  depositExtraCheck: 0.50,
  cashDepositLimit: 1000,
  cycleClosingDay: 30,
});

const COURIER_STAGE = Object.freeze({
  pickup: 'Recogido',
  onRoute: 'En camino',
  delivered: 'Entrega finalizada',
});

const QUOTE_STATUS = Object.freeze({
  pending: 'Pendiente de cotización',
  quoted: 'Cotizado',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
});

function money(value) {
  const n = Number(value || 0);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function calculateCourierWait(elapsedMinutes) {
  const elapsed = Math.max(0, Math.floor(Number(elapsedMinutes || 0)));
  const extraMinutes = Math.max(0, elapsed - LOGISTICS.courierFreeWaitMinutes);
  return {
    elapsedMinutes: elapsed,
    freeMinutes: LOGISTICS.courierFreeWaitMinutes,
    extraMinutes,
    extraCost: money(extraMinutes * LOGISTICS.courierExtraWaitMinute),
    requiresDecision: elapsed >= LOGISTICS.courierFreeWaitMinutes,
  };
}

function calculateDepositPrice({checkCount = 0, cashAmount = 0, method = 'checks'} = {}) {
  const checks = Math.max(0, Math.floor(Number(checkCount || 0)));
  const cash = Math.max(0, Number(cashAmount || 0));
  if (method === 'cash' && cash > LOGISTICS.cashDepositLimit) {
    return {valid: false, error: `El depósito en efectivo no puede superar $${LOGISTICS.cashDepositLimit}.`};
  }
  const extraChecks = method === 'checks' ? Math.max(0, checks - LOGISTICS.depositIncludedChecks) : 0;
  const extraCost = money(extraChecks * LOGISTICS.depositExtraCheck);
  return {
    valid: true,
    base: LOGISTICS.depositBase,
    checkCount: checks,
    includedChecks: LOGISTICS.depositIncludedChecks,
    extraChecks,
    extraCost,
    cashAmount: cash,
    total: money(LOGISTICS.depositBase + extraCost),
  };
}

function applyAdminTariff(request, {serviceCost, reason, serviceLabel, kind} = {}) {
  const cost = money(serviceCost ?? request?.serviceCost ?? 0);
  return {
    ...request,
    ...(kind ? {kind} : {}),
    ...(serviceLabel ? {serviceLabel} : {}),
    serviceCost: cost,
    tariffAdjustment: {
      previousCost: money(request?.serviceCost || 0),
      newCost: cost,
      reason: String(reason || 'Reajuste administrativo').trim(),
      adjustedAt: new Date().toISOString(),
    },
  };
}

function monthlyCycleKey(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const effectiveClosingDay = Math.min(LOGISTICS.cycleClosingDay, lastDay);
  const cycleMonth = d.getDate() > effectiveClosingDay ? month + 1 : month;
  const normalized = new Date(year, cycleMonth, 1);
  return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}`;
}

function canReleaseCourierFunds(request) {
  const hasDepositEvidence = Boolean(request?.wallet?.depositPhoto || request?.evidence?.depositPhoto);
  const finished = request?.courierStage === COURIER_STAGE.delivered || request?.status === COURIER_STAGE.delivered || request?.status === 'Finalizado' || request?.status === 'Entregado';
  return finished && hasDepositEvidence;
}

function createRecurringTemplate(request, name) {
  const excluded = new Set(['id','code','status','courier','courierId','courierStage','evidence','gps','events','createdAt','updatedAt','finishedAt','settledAt']);
  const payload = {};
  Object.entries(request || {}).forEach(([key, value]) => {
    if (!excluded.has(key)) payload[key] = value;
  });
  return {
    id: `tpl-${Date.now()}`,
    name: String(name || request?.serviceLabel || request?.customer || 'Servicio recurrente').trim(),
    payload,
    createdAt: new Date().toISOString(),
  };
}

module.exports = {
  LOGISTICS,
  COURIER_STAGE,
  QUOTE_STATUS,
  calculateCourierWait,
  calculateDepositPrice,
  applyAdminTariff,
  monthlyCycleKey,
  canReleaseCourierFunds,
  createRecurringTemplate,
};
