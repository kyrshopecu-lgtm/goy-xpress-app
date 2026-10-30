'use strict';

// Central RBAC policy primitives. These helpers are intentionally not wired into
// routes until internal-user authentication and migration tests are in place.
const ROLE_PERMISSIONS = Object.freeze({
  admin: Object.freeze(['*']),
  sales: Object.freeze([
    'crm.contacts.read', 'crm.contacts.update', 'crm.contacts.assign',
    'sales.prospects.read', 'sales.prospects.create', 'sales.prospects.update',
    'sales.whatsapp.send', 'procedures.read'
  ]),
  accounting: Object.freeze([
    'crm.contacts.read_billing', 'operations.requests.read_billing',
    'operations.evidence.read', 'accounting.read', 'accounting.entries.create',
    'accounting.entries.update', 'accounting.reconcile', 'accounting.reports',
    'procedures.read'
  ]),
  courier: Object.freeze([
    'courier.jobs.read_assigned', 'courier.jobs.update_assigned',
    'courier.evidence.upload', 'procedures.read'
  ])
});

function normalizePermissions(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => /^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/.test(item))]
  ];
}

function permissionsFor(user) {
  if (!user || user.active === false || user.blocked === true) return [];
  const role = String(user.role || '');
  const defaults = ROLE_PERMISSIONS[role] || [];
  const overrides = normalizePermissions(user.permissions);
  // Explicit permissions may supplement non-admin role defaults; '*' is never
  // accepted from user data, so only the trusted admin role gets full access.
  return role === 'admin' ? ['*'] : [...new Set([...defaults, ...overrides])];
}

function hasPermission(user, permission) {
  const requested = String(permission || '').trim();
  if (!requested || requested === '*') return false;
  const permissions = permissionsFor(user);
  return permissions.includes('*') || permissions.includes(requested);
}

function isAssignedTo(user, resource) {
  if (!user || !resource || user.active === false || user.blocked === true) return false;
  if (user.role === 'admin') return true;
  const userId = String(user.id || user.userId || '');
  return Boolean(userId && (
    String(resource.courierId || '') === userId ||
    String(resource.assignedCourierId || '') === userId
  ));
}

module.exports = { ROLE_PERMISSIONS, normalizePermissions, permissionsFor, hasPermission, isAssignedTo };
