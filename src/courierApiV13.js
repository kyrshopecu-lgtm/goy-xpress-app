import {API_BASE} from './goyApiV5';
export * from './goyApiV5';

async function publicRequest(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'No se pudo completar la operación.');
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

export function requestCourierOtp({phone, email='', channel='whatsapp'}) {
  return publicRequest('/courier/otp/request', {phone, email, channel});
}

export function verifyCourierOtp({phone, email='', code, name=''}) {
  return publicRequest('/courier/otp/verify', {phone, email, code, name});
}
