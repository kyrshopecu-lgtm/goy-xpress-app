import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

export const API_BASE = String(process.env.EXPO_PUBLIC_GOY_API_URL || 'https://goy-xpress-admin.vercel.app/api').replace(/\/$/, '');

async function api(path, {method='GET', token, clientId, body} = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type':'application/json',
      ...(token ? {Authorization:`Bearer ${token}`} : {}),
      ...(clientId ? {'X-Client-Id':clientId} : {}),
    },
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data;
}

export function clientLogin(credentials){return api('/client/login',{method:'POST',body:credentials});}
export function clientMe(session){return api('/client/me',{token:session.token,clientId:session.client.id});}
export function listClientRequests(session){return api('/client/requests',{token:session.token,clientId:session.client.id});}
export function createClientRequest(session,request){return api('/client/requests',{method:'POST',token:session.token,clientId:session.client.id,body:request});}
export function clientQuoteResponse(session,code,response){return api(`/client/requests/${encodeURIComponent(code)}/quote-response`,{method:'POST',token:session.token,clientId:session.client.id,body:{response}});}

export function courierLogin(credentials){return api('/courier/login',{method:'POST',body:credentials});}
export function courierMe(token){return api('/courier/me',{token});}
export function listCourierJobs(token){return api('/courier/jobs',{token});}
export function getCourierJob(token,code){return api(`/courier/jobs/${encodeURIComponent(code)}`,{token});}
export function courierAction(token,code,action,body={}){return api(`/courier/jobs/${encodeURIComponent(code)}/${action}`,{method:'POST',token,body});}

export async function cameraPhotoDataUrl() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Se necesita permiso de cámara para registrar la evidencia.');
  const result = await ImagePicker.launchCameraAsync({mediaTypes:['images'],allowsEditing:false,quality:0.45,base64:true});
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  if (!asset.base64) throw new Error('No se pudo procesar la fotografía.');
  return `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`;
}

async function ensureLocationPermission(){
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Se necesita permiso de ubicación para el seguimiento de la entrega.');
}

export async function courierPhotoAction(token,code,action,extra={}){
  const photo = await cameraPhotoDataUrl();
  if (!photo) return null;
  return courierAction(token,code,action,{...extra,photo});
}

export async function sendCourierLocation(token,code){
  await ensureLocationPermission();
  const location = await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
  return courierAction(token,code,'location',{latitude:location.coords.latitude,longitude:location.coords.longitude,accuracy:location.coords.accuracy});
}

export async function startCourierTracking(token,code,onUpdated,onError){
  await ensureLocationPermission();
  const subscription = await Location.watchPositionAsync({accuracy:Location.Accuracy.High,timeInterval:30000,distanceInterval:25},location=>{
    courierAction(token,code,'location',{latitude:location.coords.latitude,longitude:location.coords.longitude,accuracy:location.coords.accuracy})
      .then(value=>onUpdated?.(value.job || value))
      .catch(error=>onError?.(error));
  });
  return ()=>subscription.remove();
}
