const APP_ROLES = Object.freeze({
  admin: 'admin',
  client: 'client',
  courier: 'courier',
});

const DOCUMENT_TYPES = Object.freeze({
  cedula: 'cedula',
  ruc: 'ruc',
});

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._-]/g, '');
}

function adminEmailForUsername(username, domain = 'admin.goyxpress.app') {
  const normalized = normalizeUsername(username);
  return normalized ? `${normalized}@${domain}` : '';
}

function normalizeEcuadorPhone(value) {
  const raw = digits(value);
  if (!raw) return '';
  if (raw.startsWith('593') && raw.length === 12) return `+${raw}`;
  if (raw.startsWith('0') && raw.length === 10) return `+593${raw.slice(1)}`;
  if (raw.length === 9) return `+593${raw}`;
  if (String(value || '').trim().startsWith('+') && raw.length >= 10) {
    return `+${raw}`;
  }
  return '';
}

function validateDocument(type, value) {
  const number = digits(value);
  if (type === DOCUMENT_TYPES.cedula) return number.length === 10;
  if (type === DOCUMENT_TYPES.ruc) return number.length === 13;
  return false;
}

function extractInviteToken(value) {
  const input = String(value || '').trim();
  if (!input) return '';

  if (/^[a-f0-9]{64}$/i.test(input)) return input.toLowerCase();

  const match = input.match(/[?&]invite=([a-f0-9]{64})(?:&|$)/i);
  return match ? match[1].toLowerCase() : '';
}

function buildInviteLink(token, baseUrl = 'goyxpress://register') {
  const cleanToken = extractInviteToken(token);
  if (!cleanToken) throw new Error('El token de invitación no es válido.');
  const separator = String(baseUrl).includes('?') ? '&' : '?';
  return `${String(baseUrl).replace(/[?&]$/, '')}${separator}invite=${cleanToken}`;
}

function validateRegistration(profile) {
  const errors = [];
  const fullName = String(profile?.fullName || '').trim();
  const address = String(profile?.address || '').trim();
  const whatsapp = normalizeEcuadorPhone(profile?.whatsapp);
  const contactPhone = normalizeEcuadorPhone(profile?.contactPhone);
  const email = normalizeEmail(profile?.email);
  const documentType = profile?.documentType;
  const documentNumber = digits(profile?.documentNumber);

  if (fullName.length < 3) errors.push('Ingresa el nombre completo.');
  if (address.length < 8) errors.push('Ingresa una dirección completa.');
  if (!whatsapp) errors.push('Ingresa un WhatsApp ecuatoriano válido.');
  if (!contactPhone) errors.push('Ingresa un teléfono de contacto válido.');
  if (!validateDocument(documentType, documentNumber)) {
    errors.push(
      documentType === DOCUMENT_TYPES.ruc
        ? 'El RUC debe tener 13 dígitos.'
        : 'La cédula debe tener 10 dígitos.',
    );
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.push('Ingresa un correo válido.');

  return {
    valid: errors.length === 0,
    errors,
    value: {
      fullName,
      address,
      whatsapp,
      contactPhone,
      documentType,
      documentNumber,
      email,
    },
  };
}

module.exports = {
  APP_ROLES,
  DOCUMENT_TYPES,
  adminEmailForUsername,
  buildInviteLink,
  digits,
  extractInviteToken,
  normalizeEcuadorPhone,
  normalizeEmail,
  normalizeUsername,
  validateDocument,
  validateRegistration,
};
