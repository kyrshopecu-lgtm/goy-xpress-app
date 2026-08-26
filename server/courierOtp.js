const crypto = require('crypto');

function cfg() {
  return {
    databaseUrl: String(process.env.DATABASE_URL || ''),
    tokenSecret: String(process.env.TOKEN_SECRET || ''),
    allowedOrigin: String(process.env.ALLOWED_ORIGIN || '*'),
    brevoApiKey: String(process.env.BREVO_API_KEY || ''),
    brevoSenderEmail: String(process.env.BREVO_SENDER_EMAIL || ''),
    brevoSenderName: String(process.env.BREVO_SENDER_NAME || 'GOY XPRESS'),
    whatsappAccessToken: String(process.env.WHATSAPP_ACCESS_TOKEN || ''),
    whatsappPhoneNumberId: String(process.env.WHATSAPP_PHONE_NUMBER_ID || ''),
    whatsappTemplateName: String(process.env.WHATSAPP_OTP_TEMPLATE || 'goy_xpress_codigo'),
    whatsappTemplateLang: String(process.env.WHATSAPP_OTP_TEMPLATE_LANG || 'es'),
    whatsappGraphVersion: String(process.env.WHATSAPP_GRAPH_VERSION || 'v25.0'),
  };
}

function cleanPhone(value) {
  let d = String(value || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('593')) return d;
  if (d.startsWith('0') && d.length === 10) return `593${d.slice(1)}`;
  if (d.length === 9 && d.startsWith('9')) return `593${d}`;
  return d;
}

function validEcuadorMobile(value) {
  return /^5939\d{8}$/.test(cleanPhone(value));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function json(res, status, body, origin='*') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.end(JSON.stringify(body));
}

async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error('Payload demasiado grande');
  }
  return raw ? JSON.parse(raw) : {};
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function otpHash(phone, code, secret) {
  return crypto.createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
}

function signToken(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function publicUser(user) {
  if (!user) return null;
  const {passwordHash, passwordSalt, ...safe} = user;
  return safe;
}

let sqlClient;
async function sql(config) {
  if (!config.databaseUrl) throw Object.assign(new Error('DATABASE_URL no configurado'), {status:503});
  if (!sqlClient) {
    const {neon} = require('@neondatabase/serverless');
    sqlClient = neon(config.databaseUrl);
  }
  await sqlClient`CREATE TABLE IF NOT EXISTS goy_state (
    id INTEGER PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sqlClient`INSERT INTO goy_state (id, data)
    VALUES (1, ${JSON.stringify({users:[],clients:[],couriers:[],requests:[],payments:[],invites:[],templates:[],walletEntries:[],monthlyArchives:[],otpChallenges:[]})}::jsonb)
    ON CONFLICT (id) DO NOTHING`;
  return sqlClient;
}

async function readState(config) {
  const db = await sql(config);
  const rows = await db`SELECT data FROM goy_state WHERE id=1 LIMIT 1`;
  const data = rows[0]?.data || {};
  for (const key of ['users','clients','couriers','requests','payments','invites','templates','walletEntries','monthlyArchives','otpChallenges']) {
    if (!Array.isArray(data[key])) data[key] = [];
  }
  return data;
}

async function writeState(config, data) {
  const db = await sql(config);
  await db`UPDATE goy_state SET data=${JSON.stringify(data)}::jsonb, updated_at=NOW() WHERE id=1`;
}

function mirrorCourier(data, user) {
  const item = {
    id:user.id, userId:user.id, name:user.name || '',
    fullName:user.name || '', whatsapp:user.phone || '', phone:user.phone || '',
    email:user.email || '', photo:user.photo || '', approved:Boolean(user.approved),
    active:user.active !== false,
    status:user.active === false ? 'Inactivo' : user.approved ? 'Disponible' : 'Pendiente de aprobación',
    registeredAt:user.createdAt,
  };
  const i = data.couriers.findIndex(x => x.userId === user.id || x.id === user.id);
  if (i >= 0) data.couriers[i] = {...data.couriers[i], ...item};
  else data.couriers.unshift(item);
}

async function sendEmail(config, email, code) {
  if (!config.brevoApiKey || !config.brevoSenderEmail) {
    throw Object.assign(new Error('El envío por correo todavía no está configurado.'), {status:503, code:'EMAIL_OTP_NOT_CONFIGURED'});
  }
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:'POST',
    headers:{'Content-Type':'application/json','api-key':config.brevoApiKey},
    body:JSON.stringify({
      sender:{name:config.brevoSenderName,email:config.brevoSenderEmail},
      to:[{email}],
      subject:'Código de acceso GOY XPRESS',
      htmlContent:`<div style="font-family:Arial,sans-serif"><h2>GOY XPRESS</h2><p>Tu código de acceso es:</p><p style="font-size:30px;font-weight:800;letter-spacing:6px">${code}</p><p>Caduca en 10 minutos. No compartas este código.</p></div>`,
    }),
  });
  if (!response.ok) {
    const txt = await response.text().catch(()=> '');
    console.error('Brevo OTP error', response.status, txt.slice(0,300));
    throw Object.assign(new Error('No se pudo enviar el código por correo.'), {status:502});
  }
}

async function sendWhatsApp(config, phone, code) {
  if (!config.whatsappAccessToken || !config.whatsappPhoneNumberId || !config.whatsappTemplateName) {
    throw Object.assign(new Error('El envío automático por WhatsApp todavía no está configurado.'), {status:503, code:'WHATSAPP_OTP_NOT_CONFIGURED'});
  }
  const url = `https://graph.facebook.com/${config.whatsappGraphVersion}/${config.whatsappPhoneNumberId}/messages`;
  const response = await fetch(url, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization':`Bearer ${config.whatsappAccessToken}`,
    },
    body:JSON.stringify({
      messaging_product:'whatsapp',
      recipient_type:'individual',
      to:phone,
      type:'template',
      template:{
        name:config.whatsappTemplateName,
        language:{code:config.whatsappTemplateLang},
        components:[
          {type:'body',parameters:[{type:'text',text:code}]},
          {type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:code}]},
        ],
      },
    }),
  });
  if (!response.ok) {
    const txt = await response.text().catch(()=> '');
    console.error('WhatsApp OTP error', response.status, txt.slice(0,500));
    throw Object.assign(new Error('No se pudo enviar el código por WhatsApp.'), {status:502});
  }
}

function maskPhone(phone) {
  return phone.length > 4 ? `+${phone.slice(0,5)}••••${phone.slice(-3)}` : phone;
}
function maskEmail(email) {
  const [a,b=''] = String(email).split('@');
  return `${a.slice(0,2)}•••@${b}`;
}

async function requestOtp(req, res) {
  const config = cfg();
  if (req.method === 'OPTIONS') return json(res,204,{},config.allowedOrigin);
  if (req.method !== 'POST') return json(res,405,{error:'Método no permitido'},config.allowedOrigin);
  try {
    if (!config.tokenSecret) throw Object.assign(new Error('TOKEN_SECRET no configurado'), {status:503});
    const input = await body(req);
    const phone = cleanPhone(input.phone);
    const email = normalizeEmail(input.email);
    const channel = input.channel === 'email' ? 'email' : 'whatsapp';
    if (!validEcuadorMobile(phone)) return json(res,400,{error:'Ingresa un número de WhatsApp móvil válido de Ecuador.'},config.allowedOrigin);
    if (channel === 'email' && !validEmail(email)) return json(res,400,{error:'Ingresa un correo válido para recibir el código.'},config.allowedOrigin);

    const data = await readState(config);
    const now = Date.now();
    data.otpChallenges = data.otpChallenges.filter(x => Number(x.expiresAt || 0) > now - 3600_000);
    const latest = data.otpChallenges
      .filter(x => x.phone === phone)
      .sort((a,b)=>Number(b.createdAt)-Number(a.createdAt))[0];
    if (latest && now - Number(latest.createdAt) < 60_000) {
      return json(res,429,{error:'Espera un minuto antes de solicitar otro código.'},config.allowedOrigin);
    }

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6,'0');
    if (channel === 'email') await sendEmail(config,email,code);
    else await sendWhatsApp(config,phone,code);

    data.otpChallenges.push({
      id:crypto.randomUUID(), role:'courier', phone, email, channel,
      codeHash:otpHash(phone,code,config.tokenSecret),
      createdAt:now, expiresAt:now + 10*60_000, attempts:0, used:false,
    });
    await writeState(config,data);
    return json(res,200,{
      ok:true, channel,
      destination:channel === 'email' ? maskEmail(email) : maskPhone(phone),
      expiresInSeconds:600,
    },config.allowedOrigin);
  } catch (error) {
    console.error('requestOtp', error);
    return json(res,Number(error.status||500),{error:error.message||'No se pudo enviar el código.',code:error.code||null},config.allowedOrigin);
  }
}

async function verifyOtp(req, res) {
  const config = cfg();
  if (req.method === 'OPTIONS') return json(res,204,{},config.allowedOrigin);
  if (req.method !== 'POST') return json(res,405,{error:'Método no permitido'},config.allowedOrigin);
  try {
    if (!config.tokenSecret) throw Object.assign(new Error('TOKEN_SECRET no configurado'), {status:503});
    const input = await body(req);
    const phone = cleanPhone(input.phone);
    const email = normalizeEmail(input.email);
    const code = String(input.code || '').replace(/\D/g,'');
    if (!validEcuadorMobile(phone)) return json(res,400,{error:'WhatsApp inválido.'},config.allowedOrigin);
    if (!/^\d{6}$/.test(code)) return json(res,400,{error:'El código debe tener 6 dígitos.'},config.allowedOrigin);

    const data = await readState(config);
    const now = Date.now();
    const candidates = data.otpChallenges
      .filter(x => x.role === 'courier' && x.phone === phone && !x.used)
      .sort((a,b)=>Number(b.createdAt)-Number(a.createdAt));
    const challenge = candidates[0];
    if (!challenge || Number(challenge.expiresAt) < now) {
      return json(res,410,{error:'El código venció. Solicita uno nuevo.'},config.allowedOrigin);
    }
    if (Number(challenge.attempts || 0) >= 5) {
      return json(res,429,{error:'Demasiados intentos. Solicita un código nuevo.'},config.allowedOrigin);
    }
    challenge.attempts = Number(challenge.attempts || 0) + 1;
    if (!safeEqual(challenge.codeHash, otpHash(phone,code,config.tokenSecret))) {
      await writeState(config,data);
      return json(res,401,{error:'Código incorrecto.'},config.allowedOrigin);
    }
    challenge.used = true;
    challenge.usedAt = now;

    let user = data.users.find(u => u.role === 'courier' && cleanPhone(u.phone) === phone);
    if (!user) {
      if (email && data.users.some(u => normalizeEmail(u.email) === email)) {
        return json(res,409,{error:'Ese correo pertenece a otra cuenta.'},config.allowedOrigin);
      }
      user = {
        id:crypto.randomUUID(), role:'courier',
        name:String(input.name || '').trim() || `Mensajero ${phone.slice(-4)}`,
        phone, email:email || challenge.email || '', photo:'',
        approved:false, active:true, authMode:'otp',
        createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
      };
      data.users.unshift(user);
    } else {
      if (input.name && !user.name) user.name = String(input.name).trim();
      if ((email || challenge.email) && !user.email) user.email = email || challenge.email;
      user.authMode = 'otp';
      user.updatedAt = new Date().toISOString();
    }
    mirrorCourier(data,user);
    await writeState(config,data);

    const token = signToken({userId:user.id,role:'courier',exp:Date.now()+30*24*60*60*1000},config.tokenSecret);
    return json(res,200,{token,user:publicUser(user)},config.allowedOrigin);
  } catch (error) {
    console.error('verifyOtp', error);
    return json(res,Number(error.status||500),{error:error.message||'No se pudo verificar el código.'},config.allowedOrigin);
  }
}

module.exports = {
  requestOtp, verifyOtp, cleanPhone, validEcuadorMobile, validEmail, otpHash, signToken
};
