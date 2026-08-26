import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {StatusBar} from 'expo-status-bar';
import {
  getCourierJob,
  getCourierJobs,
  getMe,
  login,
  pickCourierPhoto,
  registerCourier,
  registerDeliveryEvidence,
  registerDepositEvidence,
  registerPickupEvidence,
  sendCurrentLocation,
  setWaitDecision,
  startLocationTracking,
  updateCourierWait,
  updateMe,
} from './goyApiV5';

const SESSION_KEY = 'goy_courier_session_v12';
const C = {
  navy: '#0B2F40',
  blue: '#00A9E8',
  green: '#38A844',
  red: '#C64A4A',
  bg: '#F4F8FA',
  white: '#FFFFFF',
  ink: '#17242D',
  muted: '#687984',
  line: '#DCE6EB',
  soft: '#E8F7FD',
};

const money = value => `$${Number(value || 0).toFixed(2)}`;

function Btn({title, onPress, green = false, outline = false, danger = false, disabled = false}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.btn,
        green && styles.green,
        outline && styles.outline,
        danger && styles.danger,
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.btnText, outline && styles.outlineText]}>{title}</Text>
    </Pressable>
  );
}

function Field({label, ...props}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...props} placeholderTextColor="#8A9BA4" style={styles.input} />
    </View>
  );
}

function Card({children, muted = false}) {
  return <View style={[styles.card, muted && styles.cardMuted]}>{children}</View>;
}

function Avatar({uri, label = 'GX', size = 58}) {
  if (uri) {
    return (
      <Image
        source={{uri}}
        style={{width: size, height: size, borderRadius: size / 2, backgroundColor: C.soft}}
      />
    );
  }
  return (
    <View style={[styles.avatar, {width: size, height: size, borderRadius: size / 2}]}>
      <Text style={styles.avatarText}>{String(label).slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

function Auth({onOk}) {
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({name: '', phone: '', email: '', password: '', photo: ''});

  const set = (key, value) => setForm(current => ({...current, [key]: value}));

  const choosePhoto = async (camera = false) => {
    try {
      const value = await pickCourierPhoto(camera);
      if (value) set('photo', value);
    } catch (error) {
      Alert.alert('Foto', error.message);
    }
  };

  const submit = async () => {
    if (!form.email.trim() || !form.password) {
      Alert.alert('Faltan datos', 'Ingresa correo y contraseña.');
      return;
    }
    if (mode === 'register' && (!form.name.trim() || !form.phone.trim() || !form.photo)) {
      Alert.alert('Registro', 'Completa nombre, WhatsApp y una foto de perfil.');
      return;
    }

    setBusy(true);
    try {
      const result = mode === 'register'
        ? await registerCourier({...form, email: form.email.trim(), phone: form.phone.trim()})
        : await login('courier', form.email.trim(), form.password);
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({token: result.token}));
      onOk(result.token, result.user);
    } catch (error) {
      Alert.alert('Acceso', error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" backgroundColor={C.navy} />
      <View style={styles.authTop}>
        <View style={styles.mark}><Text style={styles.markText}>GX</Text></View>
        <Text style={styles.authTitle}>GOY XPRESS</Text>
        <Text style={styles.authSub}>Mensajeros</Text>
      </View>
      <ScrollView contentContainerStyle={styles.authPage} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={styles.segment}>
            <Pressable onPress={() => setMode('login')} style={[styles.seg, mode === 'login' && styles.segOn]}>
              <Text style={styles.segText}>Ingresar</Text>
            </Pressable>
            <Pressable onPress={() => setMode('register')} style={[styles.seg, mode === 'register' && styles.segOn]}>
              <Text style={styles.segText}>Registrarme</Text>
            </Pressable>
          </View>

          {mode === 'register' ? (
            <View>
              <View style={styles.photoRow}>
                <Avatar uri={form.photo} label={form.name} size={76} />
                <View style={styles.flexOne}>
                  <Text style={styles.h3}>Tu foto identifica tus entregas</Text>
                  <Text style={styles.note}>Administración la verá antes de asignarte operaciones.</Text>
                  <View style={styles.row}>
                    <Btn title="Galería" outline onPress={() => choosePhoto(false)} />
                    <Btn title="Cámara" outline onPress={() => choosePhoto(true)} />
                  </View>
                </View>
              </View>
              <Field label="Nombre completo" value={form.name} onChangeText={value => set('name', value)} />
              <Field label="WhatsApp" keyboardType="phone-pad" value={form.phone} onChangeText={value => set('phone', value)} />
            </View>
          ) : null}

          <Field
            label="Correo"
            keyboardType="email-address"
            autoCapitalize="none"
            value={form.email}
            onChangeText={value => set('email', value)}
          />
          <Field
            label="Contraseña (mínimo 8 caracteres, letras y números)"
            secureTextEntry
            autoCapitalize="none"
            value={form.password}
            onChangeText={value => set('password', value)}
          />
          <Btn
            title={busy ? 'Procesando…' : mode === 'register' ? 'Crear cuenta' : 'Ingresar'}
            green
            disabled={busy}
            onPress={submit}
          />
          <Text style={styles.secure}>🔒 Solo las operaciones asignadas a tu cuenta aparecerán aquí.</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Pending({profile, onReload, onProfile, onLogout}) {
  return (
    <View>
      <View style={styles.center}>
        <Avatar uri={profile.photo} label={profile.name} size={90} />
        <Text style={styles.heading}>Cuenta en revisión</Text>
        <Text style={styles.noteCenter}>
          Tu registro fue recibido. Un administrador debe aprobar tu cuenta antes de asignarte solicitudes.
        </Text>
      </View>
      <Card>
        <Text style={styles.h3}>¿Qué puedes hacer ahora?</Text>
        <Text style={styles.note}>• Verifica que tu foto, nombre y WhatsApp sean correctos.</Text>
        <Text style={styles.note}>• Pulsa “Verificar aprobación” para actualizar el estado.</Text>
        <Btn title="Verificar aprobación" green onPress={onReload} />
        <Btn title="Editar mi perfil" outline onPress={onProfile} />
        <Btn title="Cerrar sesión" danger onPress={onLogout} />
      </Card>
    </View>
  );
}

function JobCard({job, onOpen}) {
  const final = ['Entrega finalizada', 'Cancelado'].includes(job.status);
  return (
    <Pressable onPress={() => onOpen(job)} style={[styles.card, final && styles.cardMuted]}>
      <View style={styles.between}>
        <View style={styles.flexOne}>
          <Text style={styles.h3}>{job.code}</Text>
          <Text style={styles.note}>
            {job.customer || 'Cliente'} · {job.serviceLabel || ({shipment: 'Entrega', procedure: 'Trámite', deposit: 'Depósito', diverse: 'Servicio'}[job.kind] || job.kind)}
          </Text>
        </View>
        <View style={styles.badge}><Text style={styles.badgeText}>{job.status}</Text></View>
      </View>
      {job.destinationAddress ? <Text style={styles.address}>📍 {job.destinationAddress}</Text> : null}
      {job.route?.distanceKm ? <Text style={styles.note}>{job.route.distanceKm} km · ≈ {job.route.durationMinutes} min</Text> : null}
      <Text style={styles.price}>{money(job.serviceCost)}</Text>
      <Text style={styles.link}>{final ? 'Ver detalle' : 'Abrir operación →'}</Text>
    </Pressable>
  );
}

function WaitPanel({token, request, onUpdated}) {
  const [seconds, setSeconds] = useState(Number(request.wait?.elapsedMinutes || 0) * 60);
  const [running, setRunning] = useState(false);
  const lastSentMinute = useRef(-1);

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setSeconds(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const minutes = Math.floor(seconds / 60);
  const extra = Math.max(0, minutes - 10);
  const cost = extra * 0.1;

  useEffect(() => {
    if (!running || minutes === lastSentMinute.current) return;
    lastSentMinute.current = minutes;
    if (minutes > 0) {
      updateCourierWait(token, request.code, minutes).then(onUpdated).catch(() => {});
    }
  }, [minutes, running, token, request.code, onUpdated]);

  const decide = async decision => {
    try {
      const updated = await setWaitDecision(token, request.code, decision);
      onUpdated(updated);
      if (decision === 'withdraw') setRunning(false);
    } catch (error) {
      Alert.alert('Espera', error.message);
    }
  };

  return (
    <Card>
      <Text style={styles.h3}>Tiempo de espera</Text>
      <Text style={styles.timer}>
        {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
      </Text>
      <Text style={styles.noteCenter}>10 minutos incluidos · luego $0.10 por minuto.</Text>
      <Text style={styles.waitCost}>Recargo: {money(cost)}</Text>
      <Btn
        title={running ? 'Pausar contador' : 'Iniciar espera'}
        outline={!running}
        danger={running}
        onPress={() => setRunning(value => !value)}
      />
      {minutes >= 10 ? (
        <View style={styles.row}>
          <Btn title="Me retiro" danger onPress={() => decide('withdraw')} />
          <Btn title="Continuar" green onPress={() => decide('continue')} />
        </View>
      ) : null}
    </Card>
  );
}

function JobDetail({token, job, onBack, onUpdate}) {
  const [request, setRequest] = useState(job);
  const [busy, setBusy] = useState('');
  const [tracking, setTracking] = useState(false);
  const stopTrackingRef = useRef(null);

  useEffect(() => () => {
    stopTrackingRef.current?.();
  }, []);

  const applyUpdate = updated => {
    if (!updated) return;
    setRequest(updated);
    onUpdate(updated);
  };

  const run = async (name, action) => {
    if (busy) return;
    setBusy(name);
    try {
      applyUpdate(await action());
    } catch (error) {
      Alert.alert('Operación', error.message);
    } finally {
      setBusy('');
    }
  };

  const pickup = () => run('pickup', () => registerPickupEvidence(token, request.code));
  const location = () => run('gps', () => sendCurrentLocation(token, request.code));
  const deposit = () => run('deposit', () => registerDepositEvidence(token, request.code, request.totalToCollect || request.cashAmount || 0));
  const delivery = () => run('delivery', () => registerDeliveryEvidence(token, request.code));

  const toggleTracking = async () => {
    if (tracking) {
      stopTrackingRef.current?.();
      stopTrackingRef.current = null;
      setTracking(false);
      return;
    }
    try {
      stopTrackingRef.current = await startLocationTracking(
        token,
        request.code,
        applyUpdate,
        error => Alert.alert('GPS', error.message),
      );
      setTracking(true);
    } catch (error) {
      Alert.alert('GPS', error.message);
    }
  };

  const mapUrl = request.route?.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(request.destinationAddress || request.institution || 'Quito')}`;
  const done = ['Entrega finalizada', 'Cancelado'].includes(request.status);

  return (
    <View>
      <View style={styles.head}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.flexOne}>
          <Text style={styles.heading}>{request.code}</Text>
          <Text style={styles.note}>{request.status}</Text>
        </View>
      </View>

      <Card>
        <Text style={styles.h3}>{request.customer || 'Cliente'}</Text>
        {request.originAddress ? <Text style={styles.address}>Retiro: {request.originAddress}</Text> : null}
        {request.destinationAddress ? <Text style={styles.address}>Entrega: {request.destinationAddress}</Text> : null}
        {request.recipient ? <Text style={styles.note}>Destinatario: {request.recipient}</Text> : null}
        {request.route?.distanceKm ? <Text style={styles.note}>{request.route.distanceKm} km · ≈ {request.route.durationMinutes} min</Text> : null}
        <Text style={styles.price}>Tarifa {money(request.serviceCost)}</Text>
        {Number(request.totalToCollect || 0) > 0 ? <Text style={styles.collect}>Recaudar {money(request.totalToCollect)}</Text> : null}
        <Btn title="Abrir navegación en Google Maps" outline onPress={() => Linking.openURL(mapUrl)} />
      </Card>

      {!done ? (
        <View>
          <Card>
            <Text style={styles.h3}>Acciones de operación</Text>
            <Text style={styles.note}>Cada acción se registra en administración con tu cuenta de mensajero.</Text>
            <Btn
              title={busy === 'pickup' ? 'Procesando…' : '1. Recogido · tomar foto'}
              disabled={Boolean(busy)}
              onPress={pickup}
            />
            <Btn
              title={busy === 'gps' ? 'Enviando…' : 'Enviar ubicación ahora'}
              green
              disabled={Boolean(busy)}
              onPress={location}
            />
            <Btn
              title={tracking ? 'Detener seguimiento GPS' : '2. En camino · iniciar GPS'}
              danger={tracking}
              green={!tracking}
              onPress={toggleTracking}
            />
            {tracking ? <Text style={styles.tracking}>● GPS activo mientras mantengas esta operación abierta.</Text> : null}
            {request.kind === 'deposit' || Number(request.totalToCollect || 0) > 0 ? (
              <Btn
                title={busy === 'deposit' ? 'Procesando…' : 'Foto de depósito / valores'}
                disabled={Boolean(busy)}
                onPress={deposit}
              />
            ) : null}
            <Btn
              title={busy === 'delivery' ? 'Procesando…' : '3. Entrega finalizada · tomar foto'}
              green
              disabled={Boolean(busy)}
              onPress={delivery}
            />
          </Card>
          <WaitPanel token={token} request={request} onUpdated={applyUpdate} />
        </View>
      ) : (
        <Card>
          <Text style={styles.h3}>Operación cerrada</Text>
          <Text style={styles.note}>Esta solicitud ya no admite acciones operativas.</Text>
        </Card>
      )}
    </View>
  );
}

function Profile({token, profile, onChange, onLogout}) {
  const [form, setForm] = useState(profile);
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(profile), [profile]);

  const choosePhoto = async (camera = false) => {
    try {
      const value = await pickCourierPhoto(camera);
      if (value) setForm(current => ({...current, photo: value}));
    } catch (error) {
      Alert.alert('Foto', error.message);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const updated = await updateMe(token, {
        name: form.name,
        phone: form.phone,
        photo: form.photo,
      });
      onChange(updated);
      Alert.alert('Perfil', 'Perfil actualizado.');
    } catch (error) {
      Alert.alert('Perfil', error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Text style={styles.heading}>Mi perfil</Text>
      <Card>
        <View style={styles.photoRow}>
          <Avatar uri={form.photo} label={form.name} size={82} />
          <View style={styles.flexOne}>
            <Text style={styles.h3}>{form.name}</Text>
            <Text style={styles.note}>{form.email}</Text>
            <View style={styles.row}>
              <Btn title="Galería" outline onPress={() => choosePhoto(false)} />
              <Btn title="Cámara" outline onPress={() => choosePhoto(true)} />
            </View>
          </View>
        </View>
        <Field
          label="Nombre"
          value={form.name || ''}
          onChangeText={value => setForm(current => ({...current, name: value}))}
        />
        <Field
          label="WhatsApp"
          value={form.phone || ''}
          onChangeText={value => setForm(current => ({...current, phone: value}))}
        />
        <Btn title={busy ? 'Guardando…' : 'Guardar cambios'} green disabled={busy} onPress={save} />
        <Btn title="Cerrar sesión" danger onPress={onLogout} />
      </Card>
    </View>
  );
}

function Tabs({tab, setTab}) {
  const tabs = [
    ['jobs', '▤', 'Operaciones'],
    ['profile', '●', 'Perfil'],
  ];
  return (
    <View style={styles.tabs}>
      {tabs.map(([key, icon, title]) => (
        <Pressable key={key} onPress={() => setTab(key)} style={styles.tab}>
          <Text style={[styles.tabIcon, tab === key && styles.tabOn]}>{icon}</Text>
          <Text style={[styles.tabText, tab === key && styles.tabOn]}>{title}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function CourierAppV12() {
  const [token, setToken] = useState('');
  const [profile, setProfile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [boot, setBoot] = useState(true);
  const [tab, setTab] = useState('jobs');
  const [selected, setSelected] = useState(null);

  const logout = async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setToken('');
    setProfile(null);
    setJobs([]);
    setSelected(null);
  };

  const refresh = async (sessionToken = token) => {
    if (!sessionToken) return;
    try {
      const me = await getMe(sessionToken);
      setProfile(me);
      if (me.approved) {
        setJobs(await getCourierJobs(sessionToken));
      } else {
        setJobs([]);
      }
    } catch (error) {
      if (error.status === 401) {
        await logout();
      } else if (!error.pendingApproval) {
        Alert.alert('Actualización', error.message);
      }
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        const sessionToken = raw ? JSON.parse(raw).token : '';
        if (sessionToken) {
          const me = await getMe(sessionToken);
          setToken(sessionToken);
          setProfile(me);
          if (me.approved) setJobs(await getCourierJobs(sessionToken));
        }
      } catch {
        await AsyncStorage.removeItem(SESSION_KEY);
      } finally {
        setBoot(false);
      }
    })();
  }, []);

  const handleAuth = (sessionToken, user) => {
    setToken(sessionToken);
    setProfile(user);
    setTab('jobs');
    refresh(sessionToken);
  };

  const updateJob = updated => {
    setJobs(current => current.map(job => job.code === updated.code ? updated : job));
    setSelected(updated);
  };

  if (boot) {
    return (
      <SafeAreaView style={styles.loading}>
        <StatusBar style="light" backgroundColor={C.navy} />
        <View style={styles.mark}><Text style={styles.markText}>GX</Text></View>
        <Text style={styles.authSub}>Preparando mensajería…</Text>
      </SafeAreaView>
    );
  }

  if (!token || !profile) return <Auth onOk={handleAuth} />;

  let content;
  if (selected) {
    content = (
      <JobDetail
        token={token}
        job={selected}
        onBack={() => {
          setSelected(null);
          refresh();
        }}
        onUpdate={updateJob}
      />
    );
  } else if (!profile.approved) {
    content = (
      <Pending
        profile={profile}
        onReload={() => refresh()}
        onProfile={() => setTab('profile')}
        onLogout={logout}
      />
    );
  } else if (tab === 'profile') {
    content = <Profile token={token} profile={profile} onChange={setProfile} onLogout={logout} />;
  } else {
    content = (
      <View>
        <View style={styles.listTop}>
          <View style={styles.flexOne}>
            <Text style={styles.heading}>Mis operaciones</Text>
            <Text style={styles.note}>Solo aparecen solicitudes asignadas por administración a tu cuenta.</Text>
          </View>
          <Btn title="Actualizar" outline onPress={() => refresh()} />
        </View>
        {jobs.length ? jobs.map(job => (
          <JobCard
            key={job.code}
            job={job}
            onOpen={async selectedJob => {
              try {
                setSelected(await getCourierJob(token, selectedJob.code));
              } catch (error) {
                Alert.alert('Operación', error.message);
              }
            }}
          />
        )) : (
          <Card>
            <Text style={styles.h3}>Sin operaciones asignadas</Text>
            <Text style={styles.note}>Cuando administración te asigne una solicitud, aparecerá aquí.</Text>
            <Btn title="Actualizar" green onPress={() => refresh()} />
          </Card>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" backgroundColor={C.navy} />
      <View style={styles.top}>
        <Avatar uri={profile.photo} label={profile.name} size={44} />
        <View style={styles.flexOne}>
          <Text style={styles.topBrand}>GOY XPRESS</Text>
          <Text style={styles.topSub}>{profile.name}</Text>
        </View>
        <View style={styles.active}>
          <Text style={styles.activeText}>{profile.approved ? '● Aprobado' : '● En revisión'}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {content}
      </ScrollView>
      {!selected && profile.approved ? <Tabs tab={tab} setTab={setTab} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: C.bg},
  loading: {flex: 1, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center', gap: 14},
  authTop: {backgroundColor: C.navy, paddingTop: 38, paddingBottom: 42, alignItems: 'center'},
  mark: {width: 64, height: 64, borderRadius: 19, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center'},
  markText: {color: C.white, fontSize: 24, fontWeight: '900'},
  authTitle: {color: C.white, fontSize: 27, fontWeight: '900', marginTop: 12},
  authSub: {color: '#BFE9F7', fontWeight: '700', marginTop: 4},
  authPage: {padding: 16, marginTop: -24, paddingBottom: 40},
  card: {backgroundColor: C.white, borderRadius: 19, padding: 16, borderWidth: 1, borderColor: '#E3EBEF', marginBottom: 12, elevation: 2},
  cardMuted: {opacity: 0.72},
  segment: {flexDirection: 'row', backgroundColor: '#EDF3F6', borderRadius: 13, padding: 4, marginBottom: 8},
  seg: {flex: 1, padding: 10, alignItems: 'center', borderRadius: 10},
  segOn: {backgroundColor: C.white},
  segText: {fontWeight: '900', color: C.navy},
  photoRow: {flexDirection: 'row', gap: 13, alignItems: 'center', marginVertical: 7},
  avatar: {backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center'},
  avatarText: {color: C.white, fontWeight: '900'},
  flexOne: {flex: 1},
  field: {marginTop: 11},
  label: {fontSize: 12, fontWeight: '900', color: C.ink, marginBottom: 6},
  input: {borderWidth: 1, borderColor: C.line, borderRadius: 13, padding: 12, minHeight: 47, backgroundColor: '#FBFDFE', color: C.ink},
  btn: {backgroundColor: C.blue, borderRadius: 13, padding: 12, alignItems: 'center', marginTop: 9, flex: 1},
  green: {backgroundColor: C.green},
  danger: {backgroundColor: C.red},
  outline: {backgroundColor: C.white, borderWidth: 1, borderColor: C.line},
  btnText: {color: C.white, fontWeight: '900', textAlign: 'center'},
  outlineText: {color: C.navy},
  disabled: {opacity: 0.45},
  row: {flexDirection: 'row', gap: 8},
  secure: {fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 12},
  note: {color: C.muted, lineHeight: 19, marginTop: 3},
  noteCenter: {color: C.muted, lineHeight: 20, textAlign: 'center', marginTop: 7},
  h3: {fontSize: 16, fontWeight: '900', color: C.ink},
  top: {backgroundColor: C.navy, padding: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10},
  topBrand: {color: C.white, fontWeight: '900', fontSize: 18},
  topSub: {color: '#BFE9F7', fontSize: 11, fontWeight: '700'},
  active: {backgroundColor: 'rgba(255,255,255,.12)', padding: 7, borderRadius: 20},
  activeText: {color: '#70E17A', fontSize: 10, fontWeight: '900'},
  page: {padding: 16, paddingBottom: 30},
  heading: {fontSize: 26, fontWeight: '900', color: C.navy, lineHeight: 31},
  center: {alignItems: 'center', paddingVertical: 18},
  listTop: {flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 8},
  between: {flexDirection: 'row', justifyContent: 'space-between', gap: 8},
  badge: {backgroundColor: C.soft, borderRadius: 16, paddingHorizontal: 9, paddingVertical: 5},
  badgeText: {fontSize: 10, fontWeight: '900', color: C.navy},
  address: {color: C.ink, fontWeight: '700', marginTop: 10, lineHeight: 18},
  price: {fontSize: 20, fontWeight: '900', color: C.ink, marginTop: 8},
  collect: {fontSize: 16, fontWeight: '900', color: C.green, marginTop: 4},
  link: {color: C.blue, fontWeight: '900', marginTop: 10},
  head: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10},
  back: {width: 40, height: 40, borderRadius: 12, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center'},
  backText: {fontSize: 30, color: C.navy, lineHeight: 32},
  tracking: {color: C.green, fontWeight: '900', fontSize: 11, marginTop: 9},
  timer: {fontSize: 34, fontWeight: '900', color: C.navy, textAlign: 'center', marginTop: 10},
  waitCost: {fontSize: 16, fontWeight: '900', color: C.navy, textAlign: 'center', marginTop: 7},
  tabs: {flexDirection: 'row', backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 7, paddingBottom: 10},
  tab: {flex: 1, alignItems: 'center'},
  tabIcon: {fontSize: 20, color: '#9AABB3', fontWeight: '900'},
  tabText: {fontSize: 10, color: '#81939D', fontWeight: '800'},
  tabOn: {color: C.blue},
});
