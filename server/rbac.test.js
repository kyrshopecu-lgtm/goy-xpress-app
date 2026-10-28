'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePermissions, permissionsFor, hasPermission, isAssignedTo } = require('./rbac');

test('admin tiene acceso completo solo por rol confiable', () => {
  assert.equal(hasPermission({ role: 'admin', active: true }, 'accounting.reconcile'), true);
  assert.equal(hasPermission({ role: 'sales', permissions: ['*'] }, 'accounting.reconcile'), false);
});

test('ventas y contabilidad permanecen separadas por defecto', () => {
  const sales = { id: 's1', role: 'sales', active: true };
  const accounting = { id: 'a1', role: 'accounting', active: true };
  assert.equal(hasPermission(sales, 'sales.prospects.update'), true);
  assert.equal(hasPermission(sales, 'accounting.reconcile'), false);
  assert.equal(hasPermission(accounting, 'accounting.reconcile'), true);
  assert.equal(hasPermission(accounting, 'sales.whatsapp.send'), false);
});

test('usuario bloqueado o inactivo no tiene permisos', () => {
  assert.deepEqual(permissionsFor({ role: 'admin', active: false }), []);
  assert.equal(hasPermission({ role: 'sales', blocked: true }, 'sales.prospects.read'), false);
});

test('normalización elimina duplicados y permisos malformados', () => {
  assert.deepEqual(normalizePermissions(['sales.prospects.read', ' sales.prospects.read ', '*', '', null]), ['sales.prospects.read']);
});

test('mensajero solo tiene alcance sobre órdenes asignadas a su cuenta', () => {
  const courier = { id: 'c1', role: 'courier', active: true };
  assert.equal(isAssignedTo(courier, { courierId: 'c1' }), true);
  assert.equal(isAssignedTo(courier, { courierId: 'c2' }), false);
  assert.equal(isAssignedTo({ ...courier, active: false }, { courierId: 'c1' }), false);
});
