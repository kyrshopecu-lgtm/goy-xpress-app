const API_BASE=String(process.env.EXPO_PUBLIC_GOY_API_URL||'https://goy-xpress-admin.vercel.app/api').replace(/\/$/,'');

export async function fetchPrivateRequest(code,secret){
  const response=await fetch(`${API_BASE}/request-status?code=${encodeURIComponent(code)}`,{headers:{'X-Request-Secret':secret}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'No se pudo consultar la solicitud.');
  return data.request||data;
}
