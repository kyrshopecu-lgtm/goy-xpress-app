import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

const API_BASE = String(process.env.EXPO_PUBLIC_GOY_API_URL || '').replace(/\/$/, '');

async function api(path, {method='POST', secret, body} = {}) {
  if (!API_BASE) throw new Error('Falta configurar EXPO_PUBLIC_GOY_API_URL.');
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? {'X-Request-Secret': secret} : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data;
}

async function cameraPhotoDataUrl() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Se necesita permiso de cámara para registrar la evidencia.');
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.55,
    base64: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  if (!asset.base64) throw new Error('No se pudo procesar la fotografía.');
  const mime = asset.mimeType || 'image/jpeg';
  return `data:${mime};base64,${asset.base64}`;
}

export async function registerPickupEvidence(code, secret, note='') {
  const photo = await cameraPhotoDataUrl();
  if (!photo) return null;
  return api(`/requests/${encodeURIComponent(code)}/pickup`, {secret, body:{photo,note}});
}

export async function registerDeliveryEvidence(code, secret, note='') {
  const photo = await cameraPhotoDataUrl();
  if (!photo) return null;
  return api(`/requests/${encodeURIComponent(code)}/delivery`, {secret, body:{photo,note}});
}

export async function registerDepositEvidence(code, secret, amount=0) {
  const photo = await cameraPhotoDataUrl();
  if (!photo) return null;
  return api(`/requests/${encodeURIComponent(code)}/deposit-evidence`, {secret, body:{photo,amount}});
}

export async function sendCurrentLocation(code, secret) {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Se necesita permiso de ubicación para iniciar el seguimiento.');
  const location = await Location.getCurrentPositionAsync({accuracy: Location.Accuracy.High});
  return api(`/requests/${encodeURIComponent(code)}/location`, {
    secret,
    body:{
      latitude:location.coords.latitude,
      longitude:location.coords.longitude,
      accuracy:location.coords.accuracy,
    },
  });
}

export async function updateCourierWait(code, secret, elapsedMinutes) {
  return api(`/requests/${encodeURIComponent(code)}/wait`, {secret,body:{elapsedMinutes}});
}

export async function setWaitDecision(code, secret, decision) {
  return api(`/requests/${encodeURIComponent(code)}/wait-decision`, {secret,body:{decision}});
}

export async function respondToQuote(code, secret, response) {
  return api(`/requests/${encodeURIComponent(code)}/quote-response`, {secret,body:{response}});
}
