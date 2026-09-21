import {Linking} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {pbkdf2Async} from '@noble/hashes/pbkdf2.js';
import {sha256, sha512} from '@noble/hashes/sha2.js';
import {hmac} from '@noble/hashes/hmac.js';
import {bytesToHex, utf8ToBytes} from '@noble/hashes/utils.js';

export const API_BASE = String(
  process.env.EXPO_PUBLIC_GOY_API_URL || 'https://goy-xpress-app.kyrshopecu.workers.dev/api',
).replace(/\/$/, '');

const GOY_WHATSAPP = String(
  process.env.EXPO_PUBLIC_GOY_WHATSAPP_NUMBER || '593997729964',
).replace(/\D/g, '');

async function request(path, {method='GET', token, body, headers={}} = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? {'Content-Type':'application/json'} : {}),
      ...(token ? {Authorization:`Bearer ${token}`} : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'No se pudo completar la operación.');
    error.status = response.status;
    error.code = data.code;
    error.pendingApproval = Boolean(data.pendingApproval);
    throw error;
  }
  return data;
}

function serviceName(kind) {
  return {
    shipment:'Entrega',
    procedure:'Trámite ejecutivo',
    deposit:'Depósito bancario',
    diverse:'Servicio diverso',
  }[kind] || kind || 'Solicitud';
}

async function notifyGoyWhatsapp(token, created, payload={}) {
  if (!GOY_WHATSAPP || !created) return;
  try {
    const meData = await request('/me', {token});
    const user = meData.user || {};
    const recipient = typeof created.recipient === 'string'
      ? created.recipient
      : created.recipient?.name || payload.recipient || '-';
    const lines = [
      'NUEVA SOLICITUD DESDE APP CLIENTE - GOY XPRESS',
      '',
      `Seguimiento: ${created.code || created.id || '-'}`,
      `Servicio: ${serviceName(created.kind || payload.kind)}`,
      `Cliente: ${user.businessName || user.name || created.customer || '-'}`,
      `WhatsApp cliente: ${user.phone || '-'}`,
      created.originAddress || payload.originAddress ? `Retiro: ${created.originAddress || payload.originAddress}` : '',
      recipient && recipient !== '-' ? `Destinatario: ${recipient}` : '',
      created.destinationAddress || payload.destinationAddress ? `Entrega: ${created.destinationAddress || payload.destinationAddress}` : '',
      Number(created.productValue || payload.productValue || 0) > 0 ? `Valor producto: $${Number(created.productValue || payload.productValue).toFixed(2)}` : '',
      Number(created.serviceCost || 0) > 0 ? `Valor servicio: $${Number(created.serviceCost).toFixed(2)}` : '',
      created.cashOnDelivery || payload.cashOnDelivery ? 'Cobro contra entrega: Sí' : '',
      '',
      'Solicitud registrada correctamente en el sistema.',
    ].filter(Boolean);
    const url = `https://wa.me/${GOY_WHATSAPP}?text=${encodeURIComponent(lines.join('\n'))}`;
    Linking.openURL(url).catch(() => {});
  } catch {
    // La solicitud ya quedó guardada. Un fallo al abrir WhatsApp no debe duplicarla ni bloquearla.
  }
}

async function derivePasswordHash(password, salt, iterations) {
  const count = Number(iterations);
  if (!Number.isInteger(count) || count < 1 || count > 1000000) {
    throw new Error('La configuración de seguridad del acceso no es válida.');
  }
  return pbkdf2Async(
    sha512,
    utf8ToBytes(String(password || '')),
    utf8ToBytes(String(salt || '')),
    {c:count, dkLen:64},
  );
}

async function registerWithProof(role, payload) {
  const start = await request('/auth/register-params', {
    method:'POST',
    body:{role, email:payload.email},
  });
  const derived = await derivePasswordHash(payload.password, start.salt, start.iterations);
  return request('/auth/register-proof', {
    method:'POST',
    body:{...payload, challenge:start.challenge, passwordHash:bytesToHex(derived)},
  });
}

export async function registerClient(payload) {
  return registerWithProof('client', payload);
}

export async function registerCourier(payload) {
  return registerWithProof('courier', payload);
}

export async function login(role, email, password) {
  const start = await request('/auth/challenge', {
    method:'POST',
    body:{role, email},
  });
  const derived = await derivePasswordHash(password, start.salt, start.iterations);
  const proof = bytesToHex(hmac(sha256, derived, utf8ToBytes(String(start.challenge))));
  return request('/auth/login-proof', {
    method:'POST',
    body:{challenge:start.challenge, proof},
  });
}

export async function getMe(token) {
  const data = await request('/me', {token});
  return data.user;
}

export async function updateMe(token, patch) {
  const data = await request('/me', {method:'PATCH', token, body:patch});
  return data.user;
}

export async function getClientRequests(token) {
  const data = await request('/client/requests', {token});
  return data.requests || [];
}

export async function createClientRequest(token, payload) {
  const data = await request('/client/requests', {method:'POST', token, body:payload});
  notifyGoyWhatsapp(token, data.request, payload);
  return data.request;
}

export async function estimateGoogleRoute(token, {origin, destination, mode='scheduled'}) {
  return request('/maps/route', {
    method:'POST',
    token,
    body:{origin, destination, mode},
  });
}

export async function getCourierJobs(token) {
  const data = await request('/courier/jobs', {token});
  return data.jobs || [];
}

export async function getCourierJob(token, code) {
  const data = await request(`/courier/jobs/${encodeURIComponent(code)}`, {token});
  return data.request;
}

export async function respondToQuote(token, code, response) {
  return request(`/requests/${encodeURIComponent(code)}/quote-response`, {
    method:'POST',
    token,
    body:{response},
  });
}

async function imageDataUrl({camera=false, aspect=[1,1], quality=0.5} = {}) {
  if (camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Se necesita permiso de cámara para tomar la fotografía.');
    }
  } else {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Se necesita acceso a tus imágenes para seleccionar la fotografía.');
    }
  }

  const options = {
    mediaTypes:['images'],
    allowsEditing:true,
    aspect,
    quality,
    base64:true,
  };
  const result = camera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  if (!asset.base64) throw new Error('No se pudo procesar la imagen.');
  const mime = asset.mimeType || 'image/jpeg';
  const dataUrl = `data:${mime};base64,${asset.base64}`;
  if (dataUrl.length > 1_750_000) {
    throw new Error('La imagen es demasiado grande. Selecciona una imagen más liviana.');
  }
  return dataUrl;
}

export function pickClientLogo() {
  return imageDataUrl({camera:false, aspect:[1,1], quality:0.45});
}

export function pickCourierPhoto(fromCamera=false) {
  return imageDataUrl({camera:fromCamera, aspect:[1,1], quality:0.45});
}

export function takeEvidencePhoto() {
  return imageDataUrl({camera:true, aspect:[4,3], quality:0.5});
}

async function courierAction(token, code, action, body={}) {
  return request(`/requests/${encodeURIComponent(code)}/${action}`, {
    method:'POST',
    token,
    body,
  });
}

export async function registerPickupEvidence(token, code, note='') {
  const photo = await takeEvidencePhoto();
  if (!photo) return null;
  return courierAction(token, code, 'pickup', {photo, note});
}

export async function registerDeliveryEvidence(token, code, note='') {
  const photo = await takeEvidencePhoto();
  if (!photo) return null;
  return courierAction(token, code, 'delivery', {photo, note});
}

export async function registerDepositEvidence(token, code, amount=0) {
  const photo = await takeEvidencePhoto();
  if (!photo) return null;
  return courierAction(token, code, 'deposit-evidence', {photo, amount});
}

async function ensureLocationPermission() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Se necesita permiso de ubicación para compartir la posición de la operación.');
  }
}

async function postLocation(token, code, location) {
  return courierAction(token, code, 'location', {
    latitude:location.coords.latitude,
    longitude:location.coords.longitude,
    accuracy:location.coords.accuracy,
  });
}

export async function sendCurrentLocation(token, code) {
  await ensureLocationPermission();
  const location = await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
  return postLocation(token, code, location);
}

export async function startLocationTracking(token, code, onUpdated, onError) {
  await ensureLocationPermission();
  const subscription = await Location.watchPositionAsync(
    {
      accuracy:Location.Accuracy.High,
      timeInterval:30000,
      distanceInterval:25,
    },
    location => {
      postLocation(token, code, location)
        .then(value => onUpdated?.(value))
        .catch(error => onError?.(error));
    },
  );
  return () => subscription.remove();
}

export function updateCourierWait(token, code, elapsedMinutes) {
  return courierAction(token, code, 'wait', {elapsedMinutes});
}

export function setWaitDecision(token, code, decision) {
  return courierAction(token, code, 'wait-decision', {decision});
}
