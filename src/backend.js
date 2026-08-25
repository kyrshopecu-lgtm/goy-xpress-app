import {
  ADMIN_LOGIN_DOMAIN,
  INVITE_BASE_URL,
  requireSupabase,
} from './supabaseClient';

const {
  adminEmailForUsername,
  buildInviteLink,
  normalizeEcuadorPhone,
  normalizeEmail,
} = require('./authDomain');

function firstRow(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function errorMessage(error, fallback = 'No se pudo completar la operación.') {
  const message = String(error?.message || error || '').toLowerCase();
  if (message.includes('invalid login credentials')) {
    return 'Usuario o contraseña incorrectos.';
  }
  if (message.includes('token has expired') || message.includes('otp_expired')) {
    return 'El código venció. Solicita uno nuevo.';
  }
  if (message.includes('token is invalid') || message.includes('invalid otp')) {
    return 'El código ingresado no es válido.';
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return 'Se realizaron demasiados intentos. Espera unos minutos.';
  }
  if (message.includes('invitation_expired')) return 'La invitación ya venció.';
  if (message.includes('invitation_used')) return 'La invitación ya fue utilizada.';
  if (message.includes('invitation_invalid')) return 'La invitación no es válida.';
  if (message.includes('profile_disabled')) return 'Este usuario está desactivado.';
  return error?.message || fallback;
}

async function withAvatarUrl(row) {
  if (!row) return null;
  if (!row.avatar_path) return {...row, avatarUrl: null};

  const client = requireSupabase();
  const {data} = await client.storage
    .from('avatars')
    .createSignedUrl(row.avatar_path, 60 * 60);

  return {...row, avatarUrl: data?.signedUrl || null};
}

export async function getCurrentProfile() {
  const client = requireSupabase();
  const {
    data: {session},
  } = await client.auth.getSession();
  if (!session?.user) return null;

  const {data, error} = await client
    .from('profiles')
    .select(
      'user_id,role,full_name,whatsapp,address,contact_phone,document_type,document_number,email,avatar_path,status,created_at,updated_at',
    )
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) throw new Error(errorMessage(error));
  if (data?.status === 'disabled') throw new Error('profile_disabled');
  return withAvatarUrl(data);
}

export async function adminSignIn(username, password) {
  const client = requireSupabase();
  const email = adminEmailForUsername(username, ADMIN_LOGIN_DOMAIN);
  if (!email || !password) throw new Error('Ingresa tu usuario y contraseña.');

  const {error} = await client.auth.signInWithPassword({email, password});
  if (error) throw new Error(errorMessage(error));

  try {
    const profile = await getCurrentProfile();
    if (profile?.role !== 'admin') throw new Error('Acceso de administrador denegado.');
    return profile;
  } catch (accessError) {
    await client.auth.signOut();
    throw accessError;
  }
}

export async function sendUserOtp({channel, identifier, shouldCreateUser}) {
  const client = requireSupabase();
  if (channel === 'email') {
    const email = normalizeEmail(identifier);
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Ingresa un correo válido.');
    const {error} = await client.auth.signInWithOtp({
      email,
      options: {shouldCreateUser},
    });
    if (error) throw new Error(errorMessage(error));
    return email;
  }

  const phone = normalizeEcuadorPhone(identifier);
  if (!phone) throw new Error('Ingresa un número de WhatsApp válido.');
  const {error} = await client.auth.signInWithOtp({
    phone,
    options: {channel: 'whatsapp', shouldCreateUser},
  });
  if (error) throw new Error(errorMessage(error));
  return phone;
}

export async function verifyUserOtp({channel, identifier, token}) {
  const client = requireSupabase();
  const cleanToken = String(token || '').replace(/\D/g, '');
  if (cleanToken.length < 6) throw new Error('Ingresa el código completo.');

  const payload =
    channel === 'email'
      ? {email: normalizeEmail(identifier), token: cleanToken, type: 'email'}
      : {
          phone: normalizeEcuadorPhone(identifier),
          token: cleanToken,
          type: 'sms',
        };
  const {data, error} = await client.auth.verifyOtp(payload);
  if (error) throw new Error(errorMessage(error));
  return data.session;
}

export async function signOut() {
  const client = requireSupabase();
  await client.auth.signOut();
}

export async function resolveInvitation(token) {
  const client = requireSupabase();
  const {data, error} = await client.rpc('resolve_invitation', {p_token: token});
  if (error) throw new Error(errorMessage(error));
  const invitation = firstRow(data);
  if (!invitation?.valid) throw new Error(errorMessage(invitation?.reason || 'invitation_invalid'));
  return invitation;
}

export async function completeInvitation(token, profile) {
  const client = requireSupabase();
  const {data, error} = await client.rpc('complete_invited_registration', {
    p_token: token,
    p_full_name: profile.fullName,
    p_address: profile.address,
    p_whatsapp: profile.whatsapp,
    p_contact_phone: profile.contactPhone,
    p_document_type: profile.documentType,
    p_document_number: profile.documentNumber,
    p_email: profile.email,
  });
  if (error) throw new Error(errorMessage(error));
  return withAvatarUrl(firstRow(data));
}

export async function uploadProfileAvatar(asset) {
  if (!asset?.uri) return getCurrentProfile();
  const client = requireSupabase();
  const {
    data: {user},
  } = await client.auth.getUser();
  if (!user) throw new Error('La sesión venció. Ingresa nuevamente.');

  const mimeType = asset.mimeType || 'image/jpeg';
  const extension = mimeType.includes('png')
    ? 'png'
    : mimeType.includes('webp')
      ? 'webp'
      : 'jpg';
  const path = `${user.id}/profile.${extension}`;
  const response = await fetch(asset.uri);
  const body = await response.arrayBuffer();
  const {error: uploadError} = await client.storage.from('avatars').upload(path, body, {
    contentType: mimeType,
    upsert: true,
    cacheControl: '3600',
  });
  if (uploadError) throw new Error(errorMessage(uploadError, 'No se pudo subir la foto.'));

  const {error: profileError} = await client.rpc('set_profile_avatar', {
    p_avatar_path: path,
  });
  if (profileError) throw new Error(errorMessage(profileError));
  return getCurrentProfile();
}

export async function createInvitation(role, label = '') {
  const client = requireSupabase();
  const {data, error} = await client.rpc('create_invitation', {
    p_role: role,
    p_label: String(label || '').trim() || null,
    p_expires_hours: 72,
  });
  if (error) throw new Error(errorMessage(error));
  const result = firstRow(data);
  if (!result?.token) throw new Error('El servidor no devolvió la invitación.');
  return {...result, link: buildInviteLink(result.token, INVITE_BASE_URL)};
}

export async function listInvitations() {
  const client = requireSupabase();
  const {data, error} = await client
    .from('invitations')
    .select('id,role,label,expires_at,used_at,revoked_at,created_at')
    .order('created_at', {ascending: false})
    .limit(30);
  if (error) throw new Error(errorMessage(error));
  return data || [];
}

export async function revokeInvitation(invitationId) {
  const client = requireSupabase();
  const {error} = await client.rpc('revoke_invitation', {
    p_invitation_id: invitationId,
  });
  if (error) throw new Error(errorMessage(error));
}

function requestFromRow(row) {
  const courier = Array.isArray(row?.courier) ? row.courier[0] : row?.courier;
  return {
    ...(row?.payload || {}),
    id: row.id,
    code: row.code,
    kind: row.kind,
    status: row.status,
    clientId: row.client_id,
    courierId: row.courier_id,
    courier: courier?.full_name || row.payload?.courier || null,
    serviceCost: Number(row.service_cost || 0),
    totalToCollect: Number(row.total_to_collect || 0),
    settled: Boolean(row.settled),
    settledAt: row.settled_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const REQUEST_SELECT =
  'id,code,kind,status,client_id,courier_id,payload,service_cost,total_to_collect,settled,settled_at,finished_at,created_at,updated_at,courier:profiles!service_requests_courier_id_fkey(full_name,avatar_path)';

export async function listServiceRequests() {
  const client = requireSupabase();
  const {data, error} = await client
    .from('service_requests')
    .select(REQUEST_SELECT)
    .order('created_at', {ascending: false});
  if (error) throw new Error(errorMessage(error));
  return (data || []).map(requestFromRow);
}

export async function createServiceRequest(request) {
  const client = requireSupabase();
  const {data, error} = await client.rpc('create_service_request', {
    p_request: request,
  });
  if (error) throw new Error(errorMessage(error));
  const row = firstRow(data);
  return row ? requestFromRow(row) : request;
}

export async function updateServiceRequest(code, patch) {
  const client = requireSupabase();
  const serverPatch = {
    status: patch.status,
    courier_id: patch.courierId,
    settled: patch.settled,
    settled_at: patch.settledAt,
    finished_at: patch.finishedAt,
  };
  Object.keys(serverPatch).forEach(key => {
    if (serverPatch[key] === undefined) delete serverPatch[key];
  });

  const {data, error} = await client.rpc('update_service_request', {
    p_code: code,
    p_patch: serverPatch,
  });
  if (error) throw new Error(errorMessage(error));
  const row = firstRow(data);
  return row ? requestFromRow(row) : null;
}

export async function listCouriers() {
  const client = requireSupabase();
  const {data, error} = await client
    .from('profiles')
    .select('user_id,full_name,whatsapp,contact_phone,avatar_path,status')
    .eq('role', 'courier')
    .eq('status', 'active')
    .order('full_name');
  if (error) throw new Error(errorMessage(error));
  return (data || []).map(item => ({
    id: item.user_id,
    fullName: item.full_name,
    whatsapp: item.whatsapp,
    contactPhone: item.contact_phone,
    avatarPath: item.avatar_path,
  }));
}

export async function listInventory() {
  const client = requireSupabase();
  const {data, error} = await client
    .from('inventory_items')
    .select('id,name,sku,quantity,price,created_at,updated_at')
    .order('created_at', {ascending: false});
  if (error) throw new Error(errorMessage(error));
  return (data || []).map(item => ({...item, price: Number(item.price || 0)}));
}

export async function createInventoryItem(item) {
  const client = requireSupabase();
  const {
    data: {user},
  } = await client.auth.getUser();
  if (!user) throw new Error('La sesión venció.');
  const {data, error} = await client
    .from('inventory_items')
    .insert({
      client_id: user.id,
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      price: item.price,
    })
    .select('id,name,sku,quantity,price,created_at,updated_at')
    .single();
  if (error) throw new Error(errorMessage(error));
  return {...data, price: Number(data.price || 0)};
}

export async function adjustInventoryItem(id, amount) {
  const client = requireSupabase();
  const {data, error} = await client.rpc('adjust_inventory_quantity', {
    p_item_id: id,
    p_amount: amount,
  });
  if (error) throw new Error(errorMessage(error));
  const row = firstRow(data);
  return row ? {...row, price: Number(row.price || 0)} : null;
}

export async function loadWorkspace(profile) {
  const [requests, inventory, couriers, invitations] = await Promise.all([
    listServiceRequests(),
    profile.role === 'client' ? listInventory() : Promise.resolve([]),
    profile.role === 'admin' ? listCouriers() : Promise.resolve([]),
    profile.role === 'admin' ? listInvitations() : Promise.resolve([]),
  ]);
  return {requests, inventory, couriers, invitations};
}

export function subscribeToWorkspace(onChange) {
  const client = requireSupabase();
  const channel = client
    .channel(`goy-workspace-${Date.now()}`)
    .on(
      'postgres_changes',
      {event: '*', schema: 'public', table: 'service_requests'},
      onChange,
    )
    .on(
      'postgres_changes',
      {event: '*', schema: 'public', table: 'inventory_items'},
      onChange,
    )
    .subscribe();
  return () => client.removeChannel(channel);
}
