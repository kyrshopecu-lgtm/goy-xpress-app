import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {StatusBar} from 'expo-status-bar';

import BusinessApp from '../App';
import {
  adminSignIn,
  completeInvitation,
  getCurrentProfile,
  resolveInvitation,
  sendUserOtp,
  signOut,
  uploadProfileAvatar,
  verifyUserOtp,
} from './backend';
import {isBackendConfigured, supabase} from './supabaseClient';

const {
  extractInviteToken,
  normalizeEcuadorPhone,
  normalizeEmail,
  validateRegistration,
} = require('./authDomain');

const COLORS = {
  navy: '#0B2F40',
  blue: '#00A9E8',
  green: '#38A844',
  ink: '#17242D',
  muted: '#687984',
  line: '#DCE6EB',
  background: '#F3F7F9',
  white: '#FFFFFF',
  red: '#C64A4A',
};

function Field({label, value, onChangeText, multiline, ...props}) {
  return (
    <View style={styles.fieldBox}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholderTextColor="#8A9AA3"
        style={[styles.input, multiline && styles.multilineInput]}
      />
    </View>
  );
}

function Button({title, onPress, variant = 'blue', disabled = false}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        variant === 'green' && styles.greenButton,
        variant === 'light' && styles.lightButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={[styles.buttonText, variant === 'light' && styles.lightButtonText]}>
        {title}
      </Text>
    </Pressable>
  );
}

function Choice({value, onChange, options}) {
  return (
    <View style={styles.choiceRow}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.choice, active && styles.choiceActive]}>
            <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Shell({children}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" backgroundColor={COLORS.navy} />
      <View style={styles.header}>
        <Image source={require('../assets/goy-logo.jpg')} style={styles.logo} />
        <View style={styles.headerCopy}>
          <Text style={styles.brand}>GOY XPRESS</Text>
          <Text style={styles.tagline}>Acceso seguro · Quito</Text>
        </View>
      </View>
      {children}
    </SafeAreaView>
  );
}

function LoadingScreen() {
  return (
    <Shell>
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={COLORS.blue} />
        <Text style={styles.loadingText}>Verificando acceso seguro…</Text>
      </View>
    </Shell>
  );
}

function ConfigurationScreen() {
  return (
    <Shell>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.card}>
          <Text style={styles.title}>Activación pendiente</Text>
          <Text style={styles.paragraph}>
            El parche seguro está instalado, pero esta compilación todavía no tiene la
            conexión pública de Supabase. Configura las variables de compilación para
            habilitar administrador, invitaciones y códigos de acceso.
          </Text>
          <Text style={styles.securityNote}>
            La contraseña y las credenciales privadas de WhatsApp nunca deben guardarse
            dentro de la APK.
          </Text>
        </View>
      </ScrollView>
    </Shell>
  );
}

function LoginScreen({onAuthenticated, onInvite}) {
  const [mode, setMode] = useState('user');
  const [channel, setChannel] = useState('whatsapp');
  const [identifier, setIdentifier] = useState('');
  const [otpIdentifier, setOtpIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState('identify');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async operation => {
    if (busy) return;
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      Alert.alert('No se pudo ingresar', error.message);
    } finally {
      setBusy(false);
    }
  };

  const submitAdmin = () =>
    run(async () => {
      const profile = await adminSignIn(username, password);
      onAuthenticated(profile);
    });

  const sendCode = () =>
    run(async () => {
      const normalized = await sendUserOtp({
        channel,
        identifier,
        shouldCreateUser: false,
      });
      setOtpIdentifier(normalized);
      setPhase('otp');
      Alert.alert(
        'Código enviado',
        channel === 'email'
          ? 'Revisa tu correo e ingresa el código.'
          : 'Revisa el WhatsApp registrado e ingresa el código.',
      );
    });

  const verifyCode = () =>
    run(async () => {
      await verifyUserOtp({channel, identifier: otpIdentifier, token: code});
      const profile = await getCurrentProfile();
      if (!profile) {
        await signOut();
        throw new Error('Este usuario todavía no tiene una invitación registrada.');
      }
      onAuthenticated(profile);
    });

  const openInvite = () => {
    const token = extractInviteToken(inviteLink);
    if (!token) {
      Alert.alert('Enlace inválido', 'Pega el enlace completo enviado por GOY XPRESS.');
      return;
    }
    onInvite(token);
  };

  return (
    <Shell>
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
          <Text style={styles.title}>Ingresar</Text>
          <Text style={styles.subtitle}>
            El sistema mostrará únicamente las funciones autorizadas para tu cuenta.
          </Text>

          <Choice
            value={mode}
            onChange={value => {
              setMode(value);
              setPhase('identify');
              setCode('');
            }}
            options={[
              {label: 'Cliente / mensajero', value: 'user'},
              {label: 'Administrador', value: 'admin'},
            ]}
          />

          {mode === 'admin' ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Administración privada</Text>
              <Field
                label="Usuario"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Usuario administrador"
              />
              <Field
                label="Contraseña"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                placeholder="Contraseña"
              />
              <Button
                title={busy ? 'Verificando…' : 'Ingresar como administrador'}
                onPress={submitAdmin}
                disabled={busy}
              />
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Acceso con código único</Text>
              <Choice
                value={channel}
                onChange={value => {
                  setChannel(value);
                  setPhase('identify');
                  setIdentifier('');
                  setCode('');
                }}
                options={[
                  {label: 'WhatsApp', value: 'whatsapp'},
                  {label: 'Correo', value: 'email'},
                ]}
              />
              {phase === 'identify' ? (
                <>
                  <Field
                    label={channel === 'email' ? 'Correo registrado' : 'WhatsApp registrado'}
                    value={identifier}
                    onChangeText={setIdentifier}
                    autoCapitalize="none"
                    keyboardType={channel === 'email' ? 'email-address' : 'phone-pad'}
                    placeholder={channel === 'email' ? 'cliente@correo.com' : '09 9999 9999'}
                  />
                  <Button
                    title={busy ? 'Enviando…' : 'Enviar código'}
                    onPress={sendCode}
                    disabled={busy}
                    variant="green"
                  />
                </>
              ) : (
                <>
                  <Text style={styles.sentTo}>Código enviado a {otpIdentifier}</Text>
                  <Field
                    label="Código de 6 dígitos"
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    maxLength={8}
                    placeholder="000000"
                  />
                  <Button
                    title={busy ? 'Verificando…' : 'Verificar e ingresar'}
                    onPress={verifyCode}
                    disabled={busy}
                    variant="green"
                  />
                  <Button
                    title="Cambiar correo o WhatsApp"
                    onPress={() => setPhase('identify')}
                    variant="light"
                  />
                </>
              )}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>¿Recibiste una invitación?</Text>
            <Text style={styles.paragraph}>
              Abre el enlace desde WhatsApp. También puedes pegarlo aquí para registrarte.
            </Text>
            <Field
              label="Enlace de invitación"
              value={inviteLink}
              onChangeText={setInviteLink}
              autoCapitalize="none"
              placeholder="goyxpress://register?invite=…"
            />
            <Button title="Abrir invitación" onPress={openInvite} variant="light" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Shell>
  );
}

function RegistrationScreen({token, onRegistered, onCancel}) {
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('form');
  const [channel, setChannel] = useState('whatsapp');
  const [otpIdentifier, setOtpIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [asset, setAsset] = useState(null);
  const [form, setForm] = useState({
    fullName: '',
    address: '',
    whatsapp: '',
    contactPhone: '',
    documentType: 'cedula',
    documentNumber: '',
    email: '',
  });

  useEffect(() => {
    let mounted = true;
    resolveInvitation(token)
      .then(value => {
        if (mounted) setInvitation(value);
      })
      .catch(error => {
        if (mounted) Alert.alert('Invitación no disponible', error.message, [{text: 'Volver', onPress: onCancel}]);
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [token, onCancel]);

  const update = key => value => setForm(previous => ({...previous, [key]: value}));

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso necesario', 'Autoriza el acceso a fotos para elegir tu imagen de perfil.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });
    if (!result.canceled && result.assets?.[0]) setAsset(result.assets[0]);
  };

  const sendCode = async () => {
    if (busy) return;
    const validation = validateRegistration(form);
    if (!validation.valid) {
      Alert.alert('Revisa el registro', validation.errors.join('\n'));
      return;
    }

    setBusy(true);
    try {
      const identifier =
        channel === 'email'
          ? normalizeEmail(validation.value.email)
          : normalizeEcuadorPhone(validation.value.whatsapp);
      const normalized = await sendUserOtp({
        channel,
        identifier,
        shouldCreateUser: true,
      });
      setForm(validation.value);
      setOtpIdentifier(normalized);
      setPhase('otp');
      Alert.alert('Código enviado', 'Ingresa el código para terminar tu registro.');
    } catch (error) {
      Alert.alert('No se pudo enviar', error.message);
    } finally {
      setBusy(false);
    }
  };

  const finishRegistration = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await verifyUserOtp({channel, identifier: otpIdentifier, token: code});
      let profile = await completeInvitation(token, form);
      if (asset) profile = await uploadProfileAvatar(asset);
      onRegistered(profile);
      Alert.alert('Registro completo', 'Tu acceso a GOY XPRESS ya está habilitado.');
    } catch (error) {
      Alert.alert('No se pudo completar', error.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingScreen />;
  if (!invitation) return null;

  const roleLabel = invitation.role === 'courier' ? 'Mensajero' : 'Cliente';

  return (
    <Shell>
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
          <Text style={styles.eyebrow}>INVITACIÓN PARA {roleLabel.toUpperCase()}</Text>
          <Text style={styles.title}>Crear acceso personal</Text>
          {invitation.label ? (
            <Text style={styles.subtitle}>Invitación personalizada: {invitation.label}</Text>
          ) : null}

          {phase === 'form' ? (
            <>
              <View style={styles.photoCard}>
                {asset?.uri ? (
                  <Image source={{uri: asset.uri}} style={styles.profilePhoto} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.photoPlaceholderText}>Foto</Text>
                  </View>
                )}
                <View style={styles.photoCopy}>
                  <Text style={styles.cardTitle}>Imagen de perfil</Text>
                  <Text style={styles.paragraph}>Puedes elegir una foto cuadrada de hasta 5 MB.</Text>
                  <Button title="Elegir foto" onPress={pickImage} variant="light" />
                </View>
              </View>

              <View style={styles.card}>
                <Field label="Nombre completo" value={form.fullName} onChangeText={update('fullName')} />
                <Field label="Dirección" value={form.address} onChangeText={update('address')} multiline />
                <Field
                  label="Número de WhatsApp"
                  value={form.whatsapp}
                  onChangeText={update('whatsapp')}
                  keyboardType="phone-pad"
                  placeholder="09 9999 9999"
                />
                <Field
                  label="Teléfono de contacto"
                  value={form.contactPhone}
                  onChangeText={update('contactPhone')}
                  keyboardType="phone-pad"
                  placeholder="09 9999 9999"
                />
                <Text style={styles.fieldLabel}>Documento</Text>
                <Choice
                  value={form.documentType}
                  onChange={update('documentType')}
                  options={[
                    {label: 'Cédula', value: 'cedula'},
                    {label: 'RUC', value: 'ruc'},
                  ]}
                />
                <Field
                  label={form.documentType === 'ruc' ? 'Número de RUC' : 'Número de cédula'}
                  value={form.documentNumber}
                  onChangeText={update('documentNumber')}
                  keyboardType="number-pad"
                />
                <Field
                  label="Correo"
                  value={form.email}
                  onChangeText={update('email')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="nombre@correo.com"
                />
              </View>

              <Text style={styles.fieldLabel}>Recibir código por</Text>
              <Choice
                value={channel}
                onChange={setChannel}
                options={[
                  {label: 'WhatsApp', value: 'whatsapp'},
                  {label: 'Correo', value: 'email'},
                ]}
              />
              <Button
                title={busy ? 'Enviando…' : 'Enviar código y continuar'}
                onPress={sendCode}
                disabled={busy}
                variant="green"
              />
              <Button title="Cancelar" onPress={onCancel} variant="light" />
            </>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Confirma tu identidad</Text>
              <Text style={styles.sentTo}>Código enviado a {otpIdentifier}</Text>
              <Field
                label="Código de 6 dígitos"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={8}
                placeholder="000000"
              />
              <Button
                title={busy ? 'Creando perfil…' : 'Verificar y crear perfil'}
                onPress={finishRegistration}
                disabled={busy}
                variant="green"
              />
              <Button title="Corregir mis datos" onPress={() => setPhase('form')} variant="light" />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Shell>
  );
}

export default function SecureRoot() {
  const [booting, setBooting] = useState(true);
  const [profile, setProfile] = useState(null);
  const [inviteToken, setInviteToken] = useState('');

  const receiveUrl = useCallback(url => {
    const token = extractInviteToken(url);
    if (token) setInviteToken(token);
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(receiveUrl).catch(() => undefined);
    const subscription = Linking.addEventListener('url', event => receiveUrl(event.url));
    return () => subscription.remove();
  }, [receiveUrl]);

  useEffect(() => {
    if (!supabase) {
      setBooting(false);
      return undefined;
    }

    let mounted = true;
    supabase.auth
      .getSession()
      .then(async ({data}) => {
        if (data.session) {
          try {
            const savedProfile = await getCurrentProfile();
            if (mounted && savedProfile) setProfile(savedProfile);
          } catch {
            await signOut();
          }
        }
      })
      .finally(() => mounted && setBooting(false));

    const {data: listener} = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') setProfile(null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const cancelInvite = useCallback(async () => {
    setInviteToken('');
    if (supabase) await signOut();
  }, []);

  const leave = useCallback(async () => {
    await signOut();
    setProfile(null);
  }, []);

  if (!isBackendConfigured) return <ConfigurationScreen />;
  if (booting) return <LoadingScreen />;
  if (profile) {
    return (
      <BusinessApp
        profile={profile}
        onProfileChange={setProfile}
        onSignOut={leave}
      />
    );
  }
  if (inviteToken) {
    return (
      <RegistrationScreen
        token={inviteToken}
        onRegistered={value => {
          setProfile(value);
          setInviteToken('');
        }}
        onCancel={cancelInvite}
      />
    );
  }
  return <LoginScreen onAuthenticated={setProfile} onInvite={setInviteToken} />;
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: COLORS.background},
  flexOne: {flex: 1},
  header: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {width: 50, height: 50, borderRadius: 12, backgroundColor: COLORS.white},
  headerCopy: {marginLeft: 11},
  brand: {color: COLORS.white, fontSize: 20, fontWeight: '900'},
  tagline: {color: '#C7D8E0', fontSize: 12, marginTop: 2},
  page: {padding: 18, paddingBottom: 44},
  centerBox: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30},
  loadingText: {color: COLORS.muted, marginTop: 13, fontWeight: '700'},
  title: {fontSize: 28, fontWeight: '900', color: COLORS.ink},
  subtitle: {fontSize: 14, lineHeight: 20, color: COLORS.muted, marginTop: 5, marginBottom: 16},
  eyebrow: {fontSize: 12, fontWeight: '900', color: COLORS.blue, letterSpacing: 0.8},
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 16,
    marginTop: 15,
  },
  cardTitle: {fontSize: 17, fontWeight: '900', color: COLORS.ink, marginBottom: 6},
  paragraph: {fontSize: 13, lineHeight: 19, color: COLORS.muted},
  securityNote: {
    marginTop: 14,
    padding: 12,
    backgroundColor: '#EAF7FC',
    borderRadius: 10,
    color: COLORS.navy,
    lineHeight: 19,
    fontWeight: '700',
  },
  fieldBox: {marginTop: 12},
  fieldLabel: {fontSize: 12, color: COLORS.ink, fontWeight: '800', marginBottom: 6, marginTop: 8},
  input: {
    borderWidth: 1,
    borderColor: '#CAD8DF',
    borderRadius: 11,
    backgroundColor: '#FAFCFD',
    color: COLORS.ink,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  multilineInput: {minHeight: 78, textAlignVertical: 'top'},
  button: {
    backgroundColor: COLORS.blue,
    borderRadius: 12,
    minHeight: 47,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginTop: 13,
  },
  greenButton: {backgroundColor: COLORS.green},
  lightButton: {backgroundColor: '#EDF3F6', borderWidth: 1, borderColor: COLORS.line},
  buttonText: {color: COLORS.white, fontWeight: '900', fontSize: 14, textAlign: 'center'},
  lightButtonText: {color: COLORS.navy},
  disabled: {opacity: 0.55},
  pressed: {opacity: 0.75, transform: [{scale: 0.99}]},
  choiceRow: {flexDirection: 'row', gap: 8, marginTop: 12},
  choice: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 10,
    alignItems: 'center',
  },
  choiceActive: {backgroundColor: COLORS.navy, borderColor: COLORS.navy},
  choiceText: {fontSize: 12, color: COLORS.navy, fontWeight: '800', textAlign: 'center'},
  choiceTextActive: {color: COLORS.white},
  sentTo: {color: COLORS.green, fontWeight: '800', marginTop: 10},
  photoCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 14,
    marginTop: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profilePhoto: {width: 92, height: 92, borderRadius: 46, backgroundColor: '#EAF0F3'},
  photoPlaceholder: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#EAF0F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: {color: COLORS.muted, fontWeight: '900'},
  photoCopy: {flex: 1, marginLeft: 14},
});
