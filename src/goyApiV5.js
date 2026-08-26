import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

export const API_BASE = String(
  process.env.EXPO_PUBLIC_GOY_API_URL || 'https://goy-xpress-admin.vercel.app/api',
).replace(/\/$/, '');

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

export async function registerClient(payload) {
  return request('/auth/client/register', {method:'POST', body:payload});
}

export async function registerCourier(payload) {
  return request('/auth/courier/register', {method:'POST', body:payload});
}

export async function login(role, email, password) {
  return request('/auth/login', {
    method:'POST',
    body:{role, email, password},
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
