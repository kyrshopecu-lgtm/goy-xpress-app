import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
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
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {Picker} from '@react-native-picker/picker';
import {StatusBar} from 'expo-status-bar';

import {
  adjustInventoryItem as adjustRemoteInventoryItem,
  createInventoryItem as createRemoteInventoryItem,
  createInvitation as createRemoteInvitation,
  createServiceRequest,
  loadWorkspace,
  revokeInvitation as revokeRemoteInvitation,
  subscribeToWorkspace,
  updateServiceRequest,
} from './src/backend';

const {
  PRICING,
  REQUEST_KIND,
  REQUEST_STATUS,
  calculateCollectTotal,
  calculateDeliveryPrice,
  calculateExecutivePrice,
  createCode,
  nonNegativeNumber,
  requestKindLabel,
  requestPrimaryAddress,
} = require('./src/domain');

const COLORS = {
  navy: '#0B2F40',
  navySoft: '#153E50',
  blue: '#00A9E8',
  blueSoft: '#E8F8FE',
  green: '#38A844',
  greenSoft: '#ECF8ED',
  lime: '#B6D532',
  yellow: '#F5B940',
  red: '#C64A4A',
  redSoft: '#FCEEEE',
  ink: '#17242D',
  muted: '#687984',
  line: '#DCE6EB',
  background: '#F3F7F9',
  white: '#FFFFFF',
};

const ADMIN_WHATSAPP = '593997729964';
const OFFICE_ADDRESS = 'Jorge Juan y Av. Mariana de Jesús, Quito';

const STATUS_META = {
  [REQUEST_STATUS.pending]: {color: COLORS.yellow, background: '#FFF6DF'},
  [REQUEST_STATUS.assigned]: {color: COLORS.blue, background: COLORS.blueSoft},
  [REQUEST_STATUS.onRoute]: {color: COLORS.green, background: COLORS.greenSoft},
  [REQUEST_STATUS.finished]: {color: COLORS.navy, background: '#EAF0F3'},
  [REQUEST_STATUS.cancelled]: {color: COLORS.red, background: COLORS.redSoft},
};

function money(value) {
  return `$${nonNegativeNumber(value).toFixed(2)}`;
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('es-EC', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function hasValidPhone(value) {
  return phoneDigits(value).length >= 9;
}

async function openExternalUrl(url, failureMessage) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('No se pudo abrir', failureMessage);
  }
}

function openAdminWhatsApp(request) {
  const details = [
    '🔔 *NUEVA SOLICITUD GOY XPRESS*',
    '',
    `Servicio: ${requestKindLabel(request.kind)}`,
    `Código: ${request.code}`,
    `Cliente: ${request.customer || request.businessName || '-'}`,
    `Teléfono: ${request.phone || '-'}`,
    `Lugar: ${requestPrimaryAddress(request)}`,
    request.deliveryMode
      ? `Modalidad: ${request.deliveryMode === 'express' ? 'Express' : 'Programada'}`
      : '',
    request.procedureType ? `Trámite: ${request.procedureType}` : '',
    request.waitMinutes != null
      ? `Espera estimada: ${request.waitMinutes} minutos`
      : '',
    `Valor del servicio: ${money(request.serviceCost)}`,
    request.totalToCollect > 0
      ? `Cobro al destinatario: ${money(request.totalToCollect)}`
      : '',
    request.amountToHandle > 0
      ? `Fondos para el trámite: ${money(request.amountToHandle)}`
      : '',
    request.notes || request.details
      ? `Indicaciones: ${request.notes || request.details}`
      : '',
    '',
    'Por favor, revisar y asignar la solicitud.',
  ]
    .filter(Boolean)
    .join('\n');

  return openExternalUrl(
    `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(details)}`,
    'Verifica que WhatsApp esté instalado y vuelve a intentarlo.',
  );
}

function contactAdmin() {
  const message = 'Hola, necesito ayuda con un servicio de GOY XPRESS.';
  return openExternalUrl(
    `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(message)}`,
    'Verifica que WhatsApp esté instalado y vuelve a intentarlo.',
  );
}

function internationalWhatsAppNumber(phone) {
  const digits = phoneDigits(phone);
  if (digits.startsWith('593')) return digits;
  if (digits.startsWith('0')) return `593${digits.slice(1)}`;
  if (digits.length === 9) return `593${digits}`;
  return digits;
}

function contactRequester(request) {
  const destination = internationalWhatsAppNumber(request.phone);
  if (destination.length < 11) {
    Alert.alert('WhatsApp inválido', 'La solicitud no tiene un WhatsApp válido.');
    return;
  }
  const message = `Hola, te contactamos de GOY XPRESS por tu solicitud ${request.code}.`;
  openExternalUrl(
    `https://wa.me/${destination}?text=${encodeURIComponent(message)}`,
    'Verifica el número del cliente y vuelve a intentarlo.',
  );
}

function callPhone(phone) {
  const digits = phoneDigits(phone);
  if (!digits) {
    Alert.alert('Sin teléfono', 'Esta solicitud no tiene un teléfono válido.');
    return;
  }
  openExternalUrl(`tel:${digits}`, 'No se encontró una aplicación para realizar llamadas.');
}

function openDirections(address) {
  if (!address) {
    Alert.alert('Sin dirección', 'Esta solicitud no tiene una dirección registrada.');
    return;
  }
  openExternalUrl(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    'No se pudo abrir el mapa.',
  );
}

function roleLabel(role) {
  if (role === 'admin') return 'Administrador';
  if (role === 'courier') return 'Mensajero';
  return 'Cliente';
}

function AppHeader({profile, onSignOut}) {
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <Image
          source={
            profile?.avatarUrl
              ? {uri: profile.avatarUrl}
              : require('./assets/goy-logo.jpg')
          }
          style={styles.logo}
        />
        <View style={styles.brandCopy}>
          <Text style={styles.brandTitle}>GOY XPRESS</Text>
          <Text numberOfLines={1} style={styles.brandSubtitle}>
            {profile?.full_name || 'Acceso seguro'} · {roleLabel(profile?.role)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
          onPress={onSignOut}
          style={({pressed}) => [styles.logoutButton, pressed && styles.pressed]}>
          <Text style={styles.logoutText}>Salir</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Page({children, style, ...props}) {
  return (
    <ScrollView
      {...props}
      style={styles.flexOne}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.page, style]}>
      {children}
    </ScrollView>
  );
}

function Card({children, style}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function PrimaryButton({
  title,
  onPress,
  variant = 'blue',
  disabled = false,
  compact = false,
}) {
  const variantStyle =
    variant === 'green'
      ? styles.buttonGreen
      : variant === 'navy'
        ? styles.buttonNavy
        : variant === 'light'
          ? styles.buttonLight
          : variant === 'danger'
            ? styles.buttonDanger
            : styles.buttonBlue;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        variantStyle,
        compact && styles.buttonCompact,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text
        style={[
          styles.buttonText,
          variant === 'light' && styles.buttonTextDark,
        ]}>
        {title}
      </Text>
    </Pressable>
  );
}

function Field({label, required, multiline, helper, style, ...inputProps}) {
  return (
    <View style={style}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        {...inputProps}
        multiline={multiline}
        placeholderTextColor="#91A0A9"
        style={[styles.input, multiline && styles.inputMultiline]}
      />
      {helper ? <Text style={styles.fieldHelper}>{helper}</Text> : null}
    </View>
  );
}

function SelectField({label, value, onValueChange, items}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.pickerShell}>
        <Picker selectedValue={value} onValueChange={onValueChange}>
          {items.map(item => (
            <Picker.Item key={item.value} label={item.label} value={item.value} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

function ChoiceRow({label, value, onChange, options}) {
  return (
    <View>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.choiceRow}>
        {options.map(option => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={({pressed}) => [
                styles.choice,
                active && styles.choiceActive,
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SummaryRow({label, value, strong, note}) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryLabelBox}>
        <Text style={[styles.summaryLabel, strong && styles.summaryLabelStrong]}>
          {label}
        </Text>
        {note ? <Text style={styles.summaryNote}>{note}</Text> : null}
      </View>
      <Text style={[styles.summaryValue, strong && styles.summaryValueStrong]}>
        {value}
      </Text>
    </View>
  );
}

function StatusPill({status}) {
  const meta = STATUS_META[status] || STATUS_META[REQUEST_STATUS.pending];
  return (
    <View style={[styles.statusPill, {backgroundColor: meta.background}]}>
      <View style={[styles.statusDot, {backgroundColor: meta.color}]} />
      <Text style={[styles.statusText, {color: meta.color}]}>{status}</Text>
    </View>
  );
}

function EmptyState({title, message, actionTitle, onAction}) {
  return (
    <Card style={styles.emptyCard}>
      <Text style={styles.emptyIcon}>◎</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {actionTitle ? (
        <PrimaryButton title={actionTitle} onPress={onAction} compact />
      ) : null}
    </Card>
  );
}

function StatCard({label, value, accent = COLORS.blue}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statAccent, {backgroundColor: accent}]} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RequestCard({request, children}) {
  return (
    <Card>
      <View style={styles.requestHeader}>
        <View style={styles.requestTitleBox}>
          <Text style={styles.requestCode}>{request.code}</Text>
          <Text style={styles.requestKind}>{requestKindLabel(request.kind)}</Text>
        </View>
        <StatusPill status={request.status} />
      </View>

      <View style={styles.requestDivider} />
      <Text style={styles.requestCustomer}>
        {request.customer || request.businessName || 'Cliente GOY XPRESS'}
      </Text>
      <Text style={styles.requestAddress}>{requestPrimaryAddress(request)}</Text>

      <View style={styles.requestAmounts}>
        <View>
          <Text style={styles.miniLabel}>Servicio</Text>
          <Text style={styles.moneyText}>{money(request.serviceCost)}</Text>
        </View>
        {request.totalToCollect > 0 ? (
          <View style={styles.amountRight}>
            <Text style={styles.miniLabel}>Cobrar</Text>
            <Text style={styles.moneyText}>{money(request.totalToCollect)}</Text>
          </View>
        ) : null}
      </View>

      {request.courier ? (
        <Text style={styles.requestMeta}>Mensajero: {request.courier}</Text>
      ) : null}
      {request.status === REQUEST_STATUS.finished && request.totalToCollect > 0 ? (
        <Text style={request.settled ? styles.settledText : styles.pendingSettlementText}>
          {request.settled ? '✓ Liquidación transferida' : '● Liquidación pendiente (máx. 24 h)'}
        </Text>
      ) : null}
      <Text style={styles.requestDate}>{formatDate(request.createdAt)}</Text>
      {children}
    </Card>
  );
}

function ServiceTile({icon, title, subtitle, color, onPress}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({pressed}) => [
        styles.serviceTile,
        {backgroundColor: color},
        pressed && styles.pressed,
      ]}>
      <Text style={styles.serviceIcon}>{icon}</Text>
      <Text style={styles.serviceTileTitle}>{title}</Text>
      <Text style={styles.serviceTileSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

function ClientHome({requests, inventory, onOpenForm, onOpenHistory}) {
  const stats = useMemo(() => {
    const active = requests.filter(request =>
      [REQUEST_STATUS.pending, REQUEST_STATUS.assigned, REQUEST_STATUS.onRoute].includes(
        request.status,
      ),
    ).length;
    const finished = requests.filter(
      request => request.status === REQUEST_STATUS.finished,
    ).length;
    const pendingSettlement = requests
      .filter(
        request =>
          request.status === REQUEST_STATUS.finished &&
          request.totalToCollect > 0 &&
          !request.settled,
      )
      .reduce((sum, request) => sum + request.totalToCollect, 0);
    return {active, finished, pendingSettlement};
  }, [requests]);

  return (
    <Page>
      <Text style={styles.eyebrow}>OPERACIÓN EN QUITO</Text>
      <Text style={styles.screenTitle}>Hola, emprendedor</Text>
      <Text style={styles.screenSubtitle}>
        Gestiona envíos, cobros, trámites e inventario desde un solo lugar.
      </Text>

      <View style={styles.statsGrid}>
        <StatCard label="En curso" value={stats.active} />
        <StatCard label="Finalizados" value={stats.finished} accent={COLORS.green} />
        <StatCard
          label="Por liquidar"
          value={money(stats.pendingSettlement)}
          accent={COLORS.lime}
        />
        <StatCard
          label="Unidades stock"
          value={inventory.reduce((sum, item) => sum + item.quantity, 0)}
          accent={COLORS.navy}
        />
      </View>

      <Text style={styles.sectionTitle}>Solicitar ahora</Text>
      <View style={styles.serviceGrid}>
        <ServiceTile
          icon="↗"
          title="Envío programado"
          subtitle="$3 hasta 5 km"
          color={COLORS.blue}
          onPress={() => onOpenForm('scheduled')}
        />
        <ServiceTile
          icon="⚡"
          title="Envío Express"
          subtitle="$3 + km adicional"
          color={COLORS.navySoft}
          onPress={() => onOpenForm('express')}
        />
        <ServiceTile
          icon="✓"
          title="Trámite ejecutivo"
          subtitle="$6.50 hasta 40 min"
          color={COLORS.green}
          onPress={() => onOpenForm('procedure')}
        />
        <ServiceTile
          icon="□"
          title="Bodega y ventas"
          subtitle="Solicitar plan inicial"
          color="#738C1D"
          onPress={() => onOpenForm('partner')}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Últimas solicitudes</Text>
        {requests.length ? (
          <Pressable onPress={onOpenHistory}>
            <Text style={styles.linkText}>Ver todas</Text>
          </Pressable>
        ) : null}
      </View>

      {requests.length === 0 ? (
        <EmptyState
          title="Aún no hay solicitudes"
          message="Crea tu primer envío o trámite; aparecerá aquí con su estado actualizado."
          actionTitle="Crear envío"
          onAction={() => onOpenForm('scheduled')}
        />
      ) : (
        requests.slice(0, 3).map(request => (
          <RequestCard key={request.code} request={request} />
        ))
      )}

      <Card style={styles.infoCard}>
        <Text style={styles.infoTitle}>Cobro contra entrega sin comisión</Text>
        <Text style={styles.infoText}>
          Cobramos a tu cliente y transferimos la liquidación en un máximo de 24 horas.
        </Text>
      </Card>
    </Page>
  );
}

function ServiceRow({icon, title, description, price, onPress, color}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({pressed}) => [styles.serviceRow, pressed && styles.pressed]}>
      <View style={[styles.serviceRowIcon, {backgroundColor: color || COLORS.blueSoft}]}>
        <Text style={styles.serviceRowIconText}>{icon}</Text>
      </View>
      <View style={styles.serviceRowCopy}>
        <Text style={styles.serviceRowTitle}>{title}</Text>
        <Text style={styles.serviceRowDescription}>{description}</Text>
        <Text style={styles.serviceRowPrice}>{price}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function ServicesScreen({onOpenForm}) {
  return (
    <Page>
      <Text style={styles.screenTitle}>Servicios GOY XPRESS</Text>
      <Text style={styles.screenSubtitle}>
        Selecciona el servicio y conoce el valor antes de confirmar.
      </Text>

      <ServiceRow
        icon="↗"
        title="Entrega programada"
        description="Rutas programadas dentro de un radio de 5 km en Quito."
        price="$3.00"
        onPress={() => onOpenForm('scheduled')}
      />
      <ServiceRow
        icon="⚡"
        title="Entrega Express"
        description="Atención inmediata; se calcula según la distancia."
        price="$3 hasta 5 km + $0.50 por km adicional"
        color={COLORS.greenSoft}
        onPress={() => onOpenForm('express')}
      />
      <ServiceRow
        icon="✓"
        title="Mensajería ejecutiva"
        description="Ingreso, retiro o entrega de documentos, depósitos y diligencias."
        price="$6.50 hasta 40 min + $0.10/min adicional"
        color="#F1F7D8"
        onPress={() => onOpenForm('procedure')}
      />
      <ServiceRow
        icon="⌂"
        title="Retiro en oficina"
        description="Despacho y atención al cliente desde nuestro punto físico."
        price="$1.00"
        color="#EEF1F4"
        onPress={() => onOpenForm('officePickup')}
      />
      <ServiceRow
        icon="□"
        title="Bodega, empaque y ventas"
        description="Recepción, inventario, almacenamiento, preparación, exhibición y ventas."
        price="Plan inicial: hasta 1 m³ gratis por 3 meses · cupos limitados"
        color={COLORS.blueSoft}
        onPress={() => onOpenForm('partner')}
      />
    </Page>
  );
}

function HistoryScreen({requests, onOpenForm}) {
  const [filter, setFilter] = useState('all');
  const filtered = requests.filter(request => {
    if (filter === 'active') {
      return [REQUEST_STATUS.pending, REQUEST_STATUS.assigned, REQUEST_STATUS.onRoute].includes(
        request.status,
      );
    }
    if (filter === 'finished') return request.status === REQUEST_STATUS.finished;
    return true;
  });

  return (
    <Page>
      <Text style={styles.screenTitle}>Mis solicitudes</Text>
      <Text style={styles.screenSubtitle}>
        Consulta el avance de tus envíos, retiros y trámites.
      </Text>

      <ChoiceRow
        value={filter}
        onChange={setFilter}
        options={[
          {label: 'Todas', value: 'all'},
          {label: 'En curso', value: 'active'},
          {label: 'Finalizadas', value: 'finished'},
        ]}
      />

      <View style={styles.blockSpacer} />
      {filtered.length === 0 ? (
        <EmptyState
          title="No hay resultados"
          message="Cuando registres una solicitud podrás seguir su estado desde aquí."
          actionTitle="Nueva solicitud"
          onAction={() => onOpenForm('scheduled')}
        />
      ) : (
        filtered.map(request => (
          <RequestCard key={request.code} request={request}>
            <PrimaryButton
              title="Consultar por WhatsApp"
              onPress={() => openAdminWhatsApp(request)}
              variant="light"
              compact
            />
          </RequestCard>
        ))
      )}
    </Page>
  );
}

function InventoryScreen({inventory, onAddItem, onAdjustItem}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('0');

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert('Falta el producto', 'Escribe el nombre del producto.');
      return;
    }
    const created = await onAddItem({
      name: name.trim(),
      sku: sku.trim() || 'Sin SKU',
      quantity: Math.max(0, Math.floor(nonNegativeNumber(quantity))),
      price: nonNegativeNumber(price),
    });
    if (!created) return;
    setName('');
    setSku('');
    setQuantity('1');
    setPrice('0');
    setShowForm(false);
  };

  return (
    <Page>
      <View style={styles.sectionHeaderTop}>
        <View style={styles.flexOne}>
          <Text style={styles.screenTitle}>Inventario</Text>
          <Text style={styles.screenSubtitle}>Control básico de productos almacenados.</Text>
        </View>
        <Pressable
          onPress={() => setShowForm(value => !value)}
          style={({pressed}) => [styles.roundAdd, pressed && styles.pressed]}>
          <Text style={styles.roundAddText}>{showForm ? '×' : '+'}</Text>
        </Pressable>
      </View>

      {showForm ? (
        <Card>
          <Text style={styles.cardTitle}>Agregar producto</Text>
          <Field label="Producto" required value={name} onChangeText={setName} />
          <Field label="SKU / código" value={sku} onChangeText={setSku} />
          <View style={styles.formColumns}>
            <Field
              style={styles.flexOne}
              label="Cantidad"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
            />
            <Field
              style={styles.flexOne}
              label="Precio unitario"
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
            />
          </View>
          <PrimaryButton title="Guardar producto" onPress={submit} variant="green" />
        </Card>
      ) : null}

      {inventory.length === 0 ? (
        <EmptyState
          title="Inventario vacío"
          message="Registra tus productos para mantener visible el stock disponible."
          actionTitle="Agregar producto"
          onAction={() => setShowForm(true)}
        />
      ) : (
        inventory.map(item => (
          <Card key={item.id} style={styles.inventoryCard}>
            <View style={styles.inventoryCopy}>
              <Text style={styles.inventoryName}>{item.name}</Text>
              <Text style={styles.inventorySku}>{item.sku}</Text>
              <Text style={styles.inventoryPrice}>{money(item.price)} c/u</Text>
            </View>
            <View style={styles.quantityBox}>
              <Pressable
                onPress={() => onAdjustItem(item.id, -1)}
                style={styles.quantityButton}>
                <Text style={styles.quantityButtonText}>−</Text>
              </Pressable>
              <Text style={styles.quantityValue}>{item.quantity}</Text>
              <Pressable
                onPress={() => onAdjustItem(item.id, 1)}
                style={styles.quantityButton}>
                <Text style={styles.quantityButtonText}>+</Text>
              </Pressable>
            </View>
          </Card>
        ))
      )}
    </Page>
  );
}

function ProfileScreen({profile, onSignOut}) {
  return (
    <Page>
      <Text style={styles.screenTitle}>Mi perfil</Text>
      <Text style={styles.screenSubtitle}>Datos verificados de tu cuenta GOY XPRESS.</Text>

      <Card style={styles.profileIdentityCard}>
        <Image
          source={
            profile?.avatarUrl
              ? {uri: profile.avatarUrl}
              : require('./assets/goy-logo.jpg')
          }
          style={styles.profileAvatar}
        />
        <View style={styles.flexOne}>
          <Text style={styles.cardTitle}>{profile?.full_name || 'Usuario GOY XPRESS'}</Text>
          <Text style={styles.profileHint}>{roleLabel(profile?.role)}</Text>
          <Text style={styles.profileText}>{profile?.email || 'Correo no registrado'}</Text>
          <Text style={styles.profileText}>{profile?.whatsapp || 'WhatsApp no registrado'}</Text>
        </View>
      </Card>

      {profile?.address ? (
        <Card>
          <Text style={styles.cardTitle}>Dirección y documento</Text>
          <Text style={styles.profileText}>{profile.address}</Text>
          <Text style={styles.profileHint}>
            {profile.document_type === 'ruc' ? 'RUC' : 'Cédula'}: {profile.document_number}
          </Text>
          <Text style={styles.profileHint}>Contacto: {profile.contact_phone}</Text>
        </Card>
      ) : null}

      <Card>
        <Text style={styles.profileIcon}>⌂</Text>
        <Text style={styles.cardTitle}>Punto físico</Text>
        <Text style={styles.profileText}>{OFFICE_ADDRESS}</Text>
        <Text style={styles.profileHint}>Sector norte · centro financiero de Quito</Text>
        <PrimaryButton
          title="Abrir ubicación"
          onPress={() => openDirections(OFFICE_ADDRESS)}
          variant="light"
          compact
        />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Lo hacemos por tu negocio</Text>
        {[
          'Recepción y registro de mercadería',
          'Almacenamiento e inventario',
          'Empaque y preparación de pedidos',
          'Entregas programadas y Express',
          'Cobro contra entrega y liquidación',
          'Exhibición y apoyo comercial',
        ].map(item => (
          <View key={item} style={styles.checkRow}>
            <Text style={styles.checkMark}>✓</Text>
            <Text style={styles.checkText}>{item}</Text>
          </View>
        ))}
      </Card>

      <PrimaryButton
        title="Hablar con GOY XPRESS"
        onPress={contactAdmin}
        variant="green"
      />
      <PrimaryButton title="Cerrar sesión" onPress={onSignOut} variant="light" />
      <Text style={styles.versionText}>Aplicación GOY XPRESS · versión 3.2.0</Text>
    </Page>
  );
}

const CLIENT_NAV = [
  {key: 'home', icon: '⌂', label: 'Inicio'},
  {key: 'services', icon: '＋', label: 'Servicios'},
  {key: 'history', icon: '≡', label: 'Solicitudes'},
  {key: 'inventory', icon: '□', label: 'Inventario'},
  {key: 'profile', icon: '●', label: 'Perfil'},
];

function BottomNav({screen, onChange}) {
  return (
    <View style={styles.bottomNav}>
      {CLIENT_NAV.map(item => {
        const active = screen === item.key;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.label}
            key={item.key}
            onPress={() => onChange(item.key)}
            style={({pressed}) => [styles.bottomNavItem, pressed && styles.pressed]}>
            <Text style={[styles.bottomNavIcon, active && styles.bottomNavIconActive]}>
              {item.icon}
            </Text>
            <Text style={[styles.bottomNavLabel, active && styles.bottomNavLabelActive]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FormShell({title, subtitle, onBack, children}) {
  return (
    <KeyboardAvoidingView
      style={styles.flexOne}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Page>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.screenTitle}>{title}</Text>
        <Text style={styles.screenSubtitle}>{subtitle}</Text>
        {children}
      </Page>
    </KeyboardAvoidingView>
  );
}

function ShipmentForm({initialMode, onBack, onCreate}) {
  const [deliveryMode, setDeliveryMode] = useState(initialMode || 'scheduled');
  const [customer, setCustomer] = useState('');
  const [originAddress, setOriginAddress] = useState(OFFICE_ADDRESS);
  const [recipient, setRecipient] = useState('');
  const [phone, setPhone] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [reference, setReference] = useState('');
  const [distanceKm, setDistanceKm] = useState('5');
  const [weightKg, setWeightKg] = useState('1');
  const [parcels, setParcels] = useState('1');
  const [productValue, setProductValue] = useState('0');
  const [deliveryPayer, setDeliveryPayer] = useState('recipient');
  const [cashOnDelivery, setCashOnDelivery] = useState(true);
  const [notes, setNotes] = useState('');

  const pricing = useMemo(
    () => calculateDeliveryPrice(deliveryMode, distanceKm),
    [deliveryMode, distanceKm],
  );
  const totalToCollect = useMemo(
    () =>
      calculateCollectTotal({
        productValue,
        deliveryCost: pricing.total,
        cashOnDelivery,
        deliveryPayer,
      }),
    [productValue, pricing.total, cashOnDelivery, deliveryPayer],
  );

  const submit = () => {
    if (!customer.trim() || !recipient.trim() || !destinationAddress.trim()) {
      Alert.alert(
        'Faltan datos',
        'Completa el emprendimiento, destinatario y dirección de entrega.',
      );
      return;
    }
    if (!hasValidPhone(phone)) {
      Alert.alert('Teléfono inválido', 'Ingresa un WhatsApp o teléfono válido.');
      return;
    }
    if (!pricing.eligible) {
      Alert.alert(
        deliveryMode === 'scheduled' ? 'Fuera de ruta programada' : 'Falta la distancia',
        deliveryMode === 'scheduled'
          ? 'La entrega programada aplica hasta 5 km. Selecciona Express para calcular kilómetros adicionales.'
          : 'Ingresa una distancia mayor a 0 km.',
      );
      return;
    }

    onCreate({
      code: createCode(REQUEST_KIND.shipment),
      kind: REQUEST_KIND.shipment,
      deliveryMode,
      customer: customer.trim(),
      originAddress: originAddress.trim(),
      recipient: recipient.trim(),
      phone: phone.trim(),
      destinationAddress: destinationAddress.trim(),
      reference: reference.trim(),
      distanceKm: pricing.distanceKm,
      weightKg: nonNegativeNumber(weightKg),
      parcels: Math.max(1, Math.floor(nonNegativeNumber(parcels))),
      productValue: nonNegativeNumber(productValue),
      deliveryPayer,
      cashOnDelivery,
      notes: notes.trim(),
      serviceCost: pricing.total,
      totalToCollect,
      status: REQUEST_STATUS.pending,
      courier: null,
      settled: totalToCollect === 0,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <FormShell
      title="Nuevo envío"
      subtitle="Registra la entrega y revisa el valor antes de confirmar."
      onBack={onBack}>
      <ChoiceRow
        label="Modalidad"
        value={deliveryMode}
        onChange={setDeliveryMode}
        options={[
          {label: 'Programada', value: 'scheduled'},
          {label: 'Express', value: 'express'},
        ]}
      />

      <Card style={styles.formCard}>
        <Text style={styles.cardTitle}>Datos de la entrega</Text>
        <Field
          label="Emprendimiento / cliente"
          required
          value={customer}
          onChangeText={setCustomer}
          placeholder="Nombre de tu negocio"
        />
        <Field
          label="Punto de retiro / origen"
          required
          value={originAddress}
          onChangeText={setOriginAddress}
          placeholder="Dirección de retiro"
          multiline
        />
        <Field
          label="Destinatario"
          required
          value={recipient}
          onChangeText={setRecipient}
          placeholder="Nombre completo"
        />
        <Field
          label="WhatsApp del destinatario"
          required
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="09 9999 9999"
        />
        <Field
          label="Dirección de entrega"
          required
          value={destinationAddress}
          onChangeText={setDestinationAddress}
          placeholder="Calle principal, intersección y número"
          multiline
        />
        <Field
          label="Referencia"
          value={reference}
          onChangeText={setReference}
          placeholder="Edificio, color de puerta, local..."
        />

        <View style={styles.formColumns}>
          <Field
            style={styles.flexOne}
            label="Distancia (km)"
            required
            value={distanceKm}
            onChangeText={setDistanceKm}
            keyboardType="decimal-pad"
          />
          <Field
            style={styles.flexOne}
            label="Peso (kg)"
            value={weightKg}
            onChangeText={setWeightKg}
            keyboardType="decimal-pad"
          />
          <Field
            style={styles.flexOne}
            label="Bultos"
            value={parcels}
            onChangeText={setParcels}
            keyboardType="number-pad"
          />
        </View>
      </Card>

      <Card style={styles.formCard}>
        <Text style={styles.cardTitle}>Cobro</Text>
        <Field
          label="Valor de la compra"
          value={productValue}
          onChangeText={setProductValue}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />
        <ChoiceRow
          label="¿Quién paga el envío?"
          value={deliveryPayer}
          onChange={setDeliveryPayer}
          options={[
            {label: 'Destinatario', value: 'recipient'},
            {label: 'Emprendimiento', value: 'sender'},
          ]}
        />
        <View style={styles.switchRow}>
          <View style={styles.flexOne}>
            <Text style={styles.switchTitle}>Cobro contra entrega</Text>
            <Text style={styles.switchDescription}>Sin comisión de cobranza</Text>
          </View>
          <Switch
            value={cashOnDelivery}
            onValueChange={setCashOnDelivery}
            trackColor={{false: '#BCC8CE', true: '#8ED397'}}
            thumbColor={cashOnDelivery ? COLORS.green : '#F4F4F4'}
          />
        </View>
        <Field
          label="Indicaciones adicionales"
          value={notes}
          onChangeText={setNotes}
          placeholder="Horario, producto frágil u otra instrucción"
          multiline
        />
      </Card>

      <Card style={styles.priceCard}>
        <Text style={styles.cardTitle}>Detalle del cálculo</Text>
        <SummaryRow label="Valor del producto" value={money(productValue)} />
        <SummaryRow
          label={deliveryMode === 'express' ? 'Servicio Express' : 'Entrega programada'}
          value={money(pricing.total)}
          note={
            deliveryMode === 'express' && pricing.extraKm > 0
              ? `${pricing.extraKm} km adicional(es)`
              : deliveryMode === 'express'
                ? 'Hasta 5 km incluidos'
                : 'Disponible hasta 5 km'
          }
        />
        <SummaryRow
          label="Total a cobrar al destinatario"
          value={money(totalToCollect)}
          strong
        />
      </Card>

      <PrimaryButton title="Confirmar y crear envío" onPress={submit} />
    </FormShell>
  );
}

function ExecutiveForm({onBack, onCreate}) {
  const [procedureType, setProcedureType] = useState('Ingreso de documentos');
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [pickupAddress, setPickupAddress] = useState(OFFICE_ADDRESS);
  const [institution, setInstitution] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [details, setDetails] = useState('');
  const [waitMinutes, setWaitMinutes] = useState('40');
  const [amountToHandle, setAmountToHandle] = useState('0');

  const pricing = useMemo(
    () => calculateExecutivePrice(waitMinutes),
    [waitMinutes],
  );

  const submit = () => {
    if (!customer.trim() || !institution.trim() || !destinationAddress.trim()) {
      Alert.alert(
        'Faltan datos',
        'Completa el cliente, la institución y la dirección del trámite.',
      );
      return;
    }
    if (!hasValidPhone(phone)) {
      Alert.alert('Teléfono inválido', 'Ingresa un WhatsApp o teléfono válido.');
      return;
    }
    if (pricing.requestedMinutes < 1) {
      Alert.alert('Tiempo inválido', 'Ingresa al menos 1 minuto de espera estimada.');
      return;
    }

    onCreate({
      code: createCode(REQUEST_KIND.procedure),
      kind: REQUEST_KIND.procedure,
      procedureType,
      customer: customer.trim(),
      phone: phone.trim(),
      pickupAddress: pickupAddress.trim(),
      institution: institution.trim(),
      destinationAddress: destinationAddress.trim(),
      details: details.trim(),
      waitMinutes: pricing.requestedMinutes,
      extraMinutes: pricing.extraMinutes,
      amountToHandle: nonNegativeNumber(amountToHandle),
      serviceCost: pricing.total,
      totalToCollect: 0,
      status: REQUEST_STATUS.pending,
      courier: null,
      settled: true,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <FormShell
      title="Mensajería ejecutiva"
      subtitle="Para documentos, depósitos, pagos, retiros e ingreso de trámites."
      onBack={onBack}>
      <Card style={styles.tariffBanner}>
        <Text style={styles.tariffBannerTitle}>Tarifa clara</Text>
        <Text style={styles.tariffBannerPrice}>$6.50</Text>
        <Text style={styles.tariffBannerText}>
          Incluye hasta 40 minutos de espera. Después: $0.10 por cada minuto adicional.
        </Text>
      </Card>

      <Card style={styles.formCard}>
        <SelectField
          label="Tipo de trámite"
          value={procedureType}
          onValueChange={setProcedureType}
          items={[
            {label: 'Ingreso de documentos', value: 'Ingreso de documentos'},
            {label: 'Retiro de documentos', value: 'Retiro de documentos'},
            {label: 'Entrega de documentos', value: 'Entrega de documentos'},
            {label: 'Depósito bancario', value: 'Depósito bancario'},
            {label: 'Pago de servicios', value: 'Pago de servicios'},
            {label: 'Gestión en institución pública', value: 'Gestión en institución pública'},
            {label: 'Otra diligencia', value: 'Otra diligencia'},
          ]}
        />
        <Field
          label="Cliente / empresa"
          required
          value={customer}
          onChangeText={setCustomer}
          placeholder="Nombre del solicitante"
        />
        <Field
          label="WhatsApp"
          required
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="09 9999 9999"
        />
        <Field
          label="Lugar de retiro de documentos"
          value={pickupAddress}
          onChangeText={setPickupAddress}
          multiline
        />
        <Field
          label="Institución / lugar del trámite"
          required
          value={institution}
          onChangeText={setInstitution}
          placeholder="Banco, empresa, notaría o entidad"
        />
        <Field
          label="Dirección exacta"
          required
          value={destinationAddress}
          onChangeText={setDestinationAddress}
          placeholder="Calle, intersección, edificio y oficina"
          multiline
        />
        <Field
          label="Instrucciones"
          value={details}
          onChangeText={setDetails}
          placeholder="Qué se debe ingresar, retirar, pagar o entregar"
          multiline
        />
        <View style={styles.formColumns}>
          <Field
            style={styles.flexOne}
            label="Espera estimada (min)"
            required
            value={waitMinutes}
            onChangeText={setWaitMinutes}
            keyboardType="number-pad"
            helper="40 min incluidos"
          />
          <Field
            style={styles.flexOne}
            label="Valor a pagar/depositar"
            value={amountToHandle}
            onChangeText={setAmountToHandle}
            keyboardType="decimal-pad"
            helper="No se suma a la tarifa"
          />
        </View>
      </Card>

      <Card style={styles.priceCard}>
        <Text style={styles.cardTitle}>Cálculo del servicio</Text>
        <SummaryRow label="Tarifa base (hasta 40 min)" value="$6.50" />
        <SummaryRow
          label="Minutos adicionales"
          value={`${pricing.extraMinutes} min`}
        />
        <SummaryRow label="Recargo" value={money(pricing.surcharge)} />
        <SummaryRow label="Total del servicio" value={money(pricing.total)} strong />
      </Card>

      <PrimaryButton
        title="Confirmar mensajería ejecutiva"
        onPress={submit}
        variant="green"
      />
    </FormShell>
  );
}

function OfficePickupForm({onBack, onCreate}) {
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [items, setItems] = useState('');
  const [collectAmount, setCollectAmount] = useState('0');
  const [pickupTime, setPickupTime] = useState('');

  const submit = () => {
    if (!customer.trim() || !items.trim()) {
      Alert.alert('Faltan datos', 'Completa el cliente y el detalle del pedido.');
      return;
    }
    if (!hasValidPhone(phone)) {
      Alert.alert('Teléfono inválido', 'Ingresa un WhatsApp o teléfono válido.');
      return;
    }
    onCreate({
      code: createCode(REQUEST_KIND.officePickup),
      kind: REQUEST_KIND.officePickup,
      customer: customer.trim(),
      phone: phone.trim(),
      orderCode: orderCode.trim(),
      items: items.trim(),
      pickupTime: pickupTime.trim(),
      destinationAddress: OFFICE_ADDRESS,
      serviceCost: PRICING.officePickup,
      totalToCollect: nonNegativeNumber(collectAmount),
      status: REQUEST_STATUS.pending,
      courier: null,
      settled: nonNegativeNumber(collectAmount) === 0,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <FormShell
      title="Retiro en oficina"
      subtitle="Preparamos el pedido y atendemos al cliente en nuestro punto físico."
      onBack={onBack}>
      <Card style={styles.formCard}>
        <Field
          label="Nombre del cliente"
          required
          value={customer}
          onChangeText={setCustomer}
        />
        <Field
          label="WhatsApp"
          required
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Field label="Código de pedido" value={orderCode} onChangeText={setOrderCode} />
        <Field
          label="Productos a entregar"
          required
          value={items}
          onChangeText={setItems}
          multiline
        />
        <Field
          label="Valor a cobrar"
          value={collectAmount}
          onChangeText={setCollectAmount}
          keyboardType="decimal-pad"
        />
        <Field
          label="Fecha y hora aproximada"
          value={pickupTime}
          onChangeText={setPickupTime}
          placeholder="Ej: martes, 15:30"
        />
      </Card>
      <Card style={styles.priceCard}>
        <SummaryRow label="Preparación y despacho en oficina" value="$1.00" strong />
        <SummaryRow label="Dirección" value="Jorge Juan y Mariana de Jesús" />
      </Card>
      <PrimaryButton title="Confirmar retiro" onPress={submit} />
    </FormShell>
  );
}

function PartnerForm({onBack, onCreate}) {
  const [businessName, setBusinessName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [volume, setVolume] = useState('Hasta 1 m³');
  const [socialLink, setSocialLink] = useState('');
  const [details, setDetails] = useState('');

  const submit = () => {
    if (!businessName.trim() || !city.trim() || !productCategory.trim()) {
      Alert.alert(
        'Faltan datos',
        'Completa el emprendimiento, ciudad y tipo de producto.',
      );
      return;
    }
    if (!hasValidPhone(phone)) {
      Alert.alert('Teléfono inválido', 'Ingresa un WhatsApp o teléfono válido.');
      return;
    }
    onCreate({
      code: createCode(REQUEST_KIND.partner),
      kind: REQUEST_KIND.partner,
      businessName: businessName.trim(),
      customer: businessName.trim(),
      city: city.trim(),
      phone: phone.trim(),
      productCategory: productCategory.trim(),
      volume,
      socialLink: socialLink.trim(),
      details: details.trim(),
      destinationAddress: OFFICE_ADDRESS,
      serviceCost: 0,
      totalToCollect: 0,
      status: REQUEST_STATUS.pending,
      courier: null,
      settled: true,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <FormShell
      title="Quiero vender en Quito"
      subtitle="Solicita el plan de bodega, empaque, entregas y apoyo comercial."
      onBack={onBack}>
      <Card style={styles.planCard}>
        <Text style={styles.planEyebrow}>PLAN INICIAL · CUPOS LIMITADOS</Text>
        <Text style={styles.planTitle}>Hasta 1 m³ sin costo por 3 meses</Text>
        <Text style={styles.planText}>
          Para emprendimientos que desean tener presencia y operación en Quito sin abrir un local propio.
        </Text>
      </Card>

      <Card style={styles.formCard}>
        <Field
          label="Nombre del emprendimiento"
          required
          value={businessName}
          onChangeText={setBusinessName}
        />
        <Field label="Ciudad actual" required value={city} onChangeText={setCity} />
        <Field
          label="WhatsApp"
          required
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Field
          label="Producto que comercializa"
          required
          value={productCategory}
          onChangeText={setProductCategory}
          placeholder="Tecnología, moda, artesanías..."
        />
        <SelectField
          label="Espacio aproximado"
          value={volume}
          onValueChange={setVolume}
          items={[
            {label: 'Hasta 0.25 m³', value: 'Hasta 0.25 m³'},
            {label: 'Hasta 0.50 m³', value: 'Hasta 0.50 m³'},
            {label: 'Hasta 1 m³', value: 'Hasta 1 m³'},
            {label: 'Más de 1 m³', value: 'Más de 1 m³'},
          ]}
        />
        <Field
          label="Enlace de tienda o redes"
          value={socialLink}
          onChangeText={setSocialLink}
          keyboardType="url"
          autoCapitalize="none"
        />
        <Field
          label="Objetivo con GOY XPRESS"
          value={details}
          onChangeText={setDetails}
          multiline
        />
      </Card>
      <PrimaryButton title="Solicitar plan inicial" onPress={submit} variant="green" />
    </FormShell>
  );
}

function ClientPortal({
  requests,
  inventory,
  profile,
  onSignOut,
  onAddRequest,
  onAddInventoryItem,
  onAdjustInventoryItem,
}) {
  const [screen, setScreen] = useState('home');
  const [form, setForm] = useState(null);

  const createRequest = async request => {
    try {
      await onAddRequest(request);
      setForm(null);
      setScreen('history');
      setTimeout(() => {
        Alert.alert(
          'Solicitud registrada',
          `${request.code}\nValor del servicio: ${money(request.serviceCost)}\n\n¿Deseas avisar ahora al administrador?`,
          [
            {text: 'Ahora no', style: 'cancel'},
            {text: 'Avisar por WhatsApp', onPress: () => openAdminWhatsApp(request)},
          ],
        );
      }, 120);
    } catch {
      // GoyXpressApplication muestra el error del servidor.
    }
  };

  if (form === 'scheduled' || form === 'express') {
    return (
      <ShipmentForm
        initialMode={form}
        onBack={() => setForm(null)}
        onCreate={createRequest}
      />
    );
  }
  if (form === 'procedure') {
    return <ExecutiveForm onBack={() => setForm(null)} onCreate={createRequest} />;
  }
  if (form === 'officePickup') {
    return <OfficePickupForm onBack={() => setForm(null)} onCreate={createRequest} />;
  }
  if (form === 'partner') {
    return <PartnerForm onBack={() => setForm(null)} onCreate={createRequest} />;
  }

  let content = null;
  if (screen === 'services') content = <ServicesScreen onOpenForm={setForm} />;
  else if (screen === 'history') {
    content = <HistoryScreen requests={requests} onOpenForm={setForm} />;
  } else if (screen === 'inventory') {
    content = (
      <InventoryScreen
        inventory={inventory}
        onAddItem={onAddInventoryItem}
        onAdjustItem={onAdjustInventoryItem}
      />
    );
  } else if (screen === 'profile') {
    content = <ProfileScreen profile={profile} onSignOut={onSignOut} />;
  } else {
    content = (
      <ClientHome
        requests={requests}
        inventory={inventory}
        onOpenForm={setForm}
        onOpenHistory={() => setScreen('history')}
      />
    );
  }

  return (
    <View style={styles.flexOne}>
      {content}
      <BottomNav screen={screen} onChange={setScreen} />
    </View>
  );
}

function AdminPanel({
  requests,
  couriers,
  invitations,
  onUpdateRequest,
  onCreateInvitation,
  onRevokeInvitation,
}) {
  const [section, setSection] = useState('operation');
  const [filter, setFilter] = useState('pending');
  const [inviteLabel, setInviteLabel] = useState('');
  const [lastInvite, setLastInvite] = useState(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const stats = useMemo(
    () => ({
      pending: requests.filter(request => request.status === REQUEST_STATUS.pending).length,
      active: requests.filter(request =>
        [REQUEST_STATUS.assigned, REQUEST_STATUS.onRoute].includes(request.status),
      ).length,
      finished: requests.filter(request => request.status === REQUEST_STATUS.finished).length,
      unsettled: requests
        .filter(
          request =>
            request.status === REQUEST_STATUS.finished &&
            request.totalToCollect > 0 &&
            !request.settled,
        )
        .reduce((sum, request) => sum + request.totalToCollect, 0),
    }),
    [requests],
  );

  const visibleRequests = requests.filter(request => {
    if (filter === 'pending') return request.status === REQUEST_STATUS.pending;
    if (filter === 'active') {
      return [REQUEST_STATUS.assigned, REQUEST_STATUS.onRoute].includes(request.status);
    }
    return [REQUEST_STATUS.finished, REQUEST_STATUS.cancelled].includes(request.status);
  });

  const settlements = requests.filter(
    request =>
      request.status === REQUEST_STATUS.finished && request.totalToCollect > 0,
  );

  const assign = async (request, courier) => {
    const updated = await onUpdateRequest(request.code, {
      courierId: courier.id,
      status: REQUEST_STATUS.assigned,
    });
    if (updated) {
      Alert.alert(
        'Solicitud asignada',
        `${request.code} fue asignada a ${courier.fullName}.`,
      );
    }
  };

  const finishPartnerLead = request => {
    onUpdateRequest(request.code, {status: REQUEST_STATUS.finished});
    Alert.alert('Solicitud atendida', `${request.code} fue marcada como atendida.`);
  };

  const settle = request => {
    Alert.alert(
      'Confirmar liquidación',
      `¿Confirmas la transferencia de ${money(request.totalToCollect)} para ${request.customer}?`,
      [
        {text: 'Cancelar', style: 'cancel'},
        {
          text: 'Confirmar',
          onPress: () =>
            onUpdateRequest(request.code, {
              settled: true,
              settledAt: new Date().toISOString(),
            }),
        },
      ],
    );
  };

  const createInvite = async role => {
    if (inviteBusy) return;
    setInviteBusy(true);
    try {
      const invitation = await onCreateInvitation(role, inviteLabel);
      setLastInvite(invitation);
      setInviteLabel('');
      const recipient = role === 'courier' ? 'mensajero' : 'cliente';
      const message = [
        `Hola${invitation.label ? ` ${invitation.label}` : ''},`,
        `GOY XPRESS te invita a registrarte como ${recipient}.`,
        'Abre este enlace desde el teléfono donde usarás la aplicación:',
        invitation.link,
        'El enlace es personal, funciona una sola vez y vence en 72 horas.',
      ].join('\n\n');
      await Share.share({title: 'Invitación GOY XPRESS', message});
    } catch (error) {
      Alert.alert('No se pudo crear', error.message);
    } finally {
      setInviteBusy(false);
    }
  };

  return (
    <Page>
      <Text style={styles.eyebrow}>CENTRO DE OPERACIONES</Text>
      <Text style={styles.screenTitle}>Panel administrador</Text>
      <Text style={styles.screenSubtitle}>
        Revisa solicitudes, asigna mensajeros y controla liquidaciones.
      </Text>

      <View style={styles.statsGrid}>
        <StatCard label="Nuevas" value={stats.pending} accent={COLORS.yellow} />
        <StatCard label="En curso" value={stats.active} />
        <StatCard label="Finalizadas" value={stats.finished} accent={COLORS.green} />
        <StatCard label="Por transferir" value={money(stats.unsettled)} accent={COLORS.lime} />
      </View>

      <ChoiceRow
        value={section}
        onChange={setSection}
        options={[
          {label: 'Operación', value: 'operation'},
          {label: 'Liquidaciones COD', value: 'settlements'},
          {label: 'Accesos', value: 'access'},
        ]}
      />
      <View style={styles.blockSpacer} />

      {section === 'access' ? (
        <>
          <Card style={styles.infoCard}>
            <Text style={styles.infoTitle}>Invitaciones privadas</Text>
            <Text style={styles.infoText}>
              Escribe el nombre del invitado y genera un enlace de un solo uso. El rol
              queda fijado por el servidor y no puede cambiarse desde la APK.
            </Text>
          </Card>
          <Card style={styles.formCard}>
            <Field
              label="Nombre o negocio del invitado (opcional)"
              value={inviteLabel}
              onChangeText={setInviteLabel}
              placeholder="Ej: Comercial Anita"
            />
            <PrimaryButton
              title={inviteBusy ? 'Creando…' : 'Crear enlace para cliente'}
              onPress={() => createInvite('client')}
              disabled={inviteBusy}
              variant="green"
            />
            <PrimaryButton
              title={inviteBusy ? 'Creando…' : 'Crear enlace para mensajero'}
              onPress={() => createInvite('courier')}
              disabled={inviteBusy}
              variant="blue"
            />
          </Card>

          {lastInvite ? (
            <Card style={styles.inviteResultCard}>
              <Text style={styles.cardTitle}>Último enlace creado</Text>
              <Text selectable style={styles.inviteLink}>{lastInvite.link}</Text>
              <PrimaryButton
                title="Compartir nuevamente"
                onPress={() =>
                  Share.share({
                    title: 'Invitación GOY XPRESS',
                    message: lastInvite.link,
                  })
                }
                variant="light"
                compact
              />
            </Card>
          ) : null}

          <Text style={styles.sectionTitle}>Invitaciones recientes</Text>
          {invitations.length === 0 ? (
            <EmptyState
              title="Aún no existen invitaciones"
              message="Los enlaces creados aparecerán aquí con su estado y vencimiento."
            />
          ) : (
            invitations.map(invitation => {
              const isActive =
                !invitation.used_at &&
                !invitation.revoked_at &&
                new Date(invitation.expires_at).getTime() > Date.now();
              return (
                <Card key={invitation.id}>
                  <Text style={styles.cardTitle}>
                    {invitation.label || 'Invitación sin nombre'}
                  </Text>
                  <Text style={styles.profileHint}>
                    {invitation.role === 'courier' ? 'Mensajero' : 'Cliente'} ·{' '}
                    {invitation.used_at
                      ? 'Utilizada'
                      : invitation.revoked_at
                        ? 'Revocada'
                        : isActive
                          ? 'Activa'
                          : 'Vencida'}
                  </Text>
                  <Text style={styles.profileHint}>
                    Vence: {formatDate(invitation.expires_at)}
                  </Text>
                  {isActive ? (
                    <PrimaryButton
                      title="Revocar enlace"
                      onPress={() => onRevokeInvitation(invitation.id)}
                      variant="light"
                      compact
                    />
                  ) : null}
                </Card>
              );
            })
          )}
        </>
      ) : section === 'settlements' ? (
        <>
          <Card style={styles.infoCard}>
            <Text style={styles.infoTitle}>Transferencias en máximo 24 horas</Text>
            <Text style={styles.infoText}>
              Confirma aquí cada valor cobrado contra entrega después de transferirlo al aliado.
            </Text>
          </Card>
          {settlements.length === 0 ? (
            <EmptyState
              title="Sin liquidaciones"
              message="Los pedidos finalizados con cobro contra entrega aparecerán aquí."
            />
          ) : (
            settlements.map(request => (
              <RequestCard key={request.code} request={request}>
                {!request.settled ? (
                  <PrimaryButton
                    title={`Marcar transferido · ${money(request.totalToCollect)}`}
                    onPress={() => settle(request)}
                    variant="green"
                    compact
                  />
                ) : null}
              </RequestCard>
            ))
          )}
        </>
      ) : (
        <>
          <ChoiceRow
            value={filter}
            onChange={setFilter}
            options={[
              {label: `Nuevas (${stats.pending})`, value: 'pending'},
              {label: `En curso (${stats.active})`, value: 'active'},
              {label: 'Historial', value: 'history'},
            ]}
          />
          <View style={styles.blockSpacer} />
          {visibleRequests.length === 0 ? (
            <EmptyState
              title="Bandeja vacía"
              message="No existen solicitudes dentro de este estado."
            />
          ) : (
            visibleRequests.map(request => (
              <RequestCard key={request.code} request={request}>
                {request.status === REQUEST_STATUS.pending ? (
                  [REQUEST_KIND.partner, REQUEST_KIND.officePickup].includes(
                    request.kind,
                  ) ? (
                    <View style={styles.actionStack}>
                      <PrimaryButton
                        title={
                          request.kind === REQUEST_KIND.partner
                            ? 'Contactar emprendimiento'
                            : 'Contactar cliente'
                        }
                        onPress={() => contactRequester(request)}
                        variant="green"
                        compact
                      />
                      <PrimaryButton
                        title={
                          request.kind === REQUEST_KIND.partner
                            ? 'Marcar como atendida'
                            : 'Marcar como entregado'
                        }
                        onPress={() => finishPartnerLead(request)}
                        variant="light"
                        compact
                      />
                    </View>
                  ) : (
                    <View style={styles.assignmentBox}>
                      <Text style={styles.assignmentTitle}>Asignar mensajero</Text>
                      {couriers.length === 0 ? (
                        <Text style={styles.infoText}>
                          Primero registra un mensajero desde la sección Accesos.
                        </Text>
                      ) : couriers.map(courier => (
                        <Pressable
                          key={courier.id}
                          onPress={() => assign(request, courier)}
                          style={({pressed}) => [
                            styles.assignmentButton,
                            pressed && styles.pressed,
                          ]}>
                          <Text style={styles.assignmentName}>{courier.fullName}</Text>
                          <Text style={styles.assignmentAction}>Asignar ›</Text>
                        </Pressable>
                      ))}
                    </View>
                  )
                ) : null}
              </RequestCard>
            ))
          )}
        </>
      )}
    </Page>
  );
}

function CourierPanel({requests, profile, onUpdateRequest}) {
  const jobs = requests.filter(
    request =>
      [REQUEST_STATUS.assigned, REQUEST_STATUS.onRoute].includes(request.status),
  );
  const completedToday = requests.filter(
    request => request.status === REQUEST_STATUS.finished,
  ).length;

  const advance = request => {
    if (request.status === REQUEST_STATUS.assigned) {
      onUpdateRequest(request.code, {status: REQUEST_STATUS.onRoute});
      Alert.alert('Ruta iniciada', `${request.code} ahora figura En ruta.`);
      return;
    }

    Alert.alert(
      'Finalizar servicio',
      request.totalToCollect > 0
        ? `Confirma que finalizaste el servicio y recibiste ${money(request.totalToCollect)}.`
        : 'Confirma que el servicio fue completado correctamente.',
      [
        {text: 'Cancelar', style: 'cancel'},
        {
          text: 'Finalizar',
          onPress: () =>
            onUpdateRequest(request.code, {
              status: REQUEST_STATUS.finished,
              finishedAt: new Date().toISOString(),
            }),
        },
      ],
    );
  };

  return (
    <Page>
      <View style={styles.courierHeading}>
        <View style={styles.flexOne}>
          <Text style={styles.eyebrow}>MENSAJERO EN LÍNEA</Text>
          <Text style={styles.screenTitle}>Mis asignaciones</Text>
        </View>
        <View style={styles.completedBadge}>
          <Text style={styles.completedValue}>{completedToday}</Text>
          <Text style={styles.completedLabel}>finalizadas</Text>
        </View>
      </View>

      <Text style={styles.fieldLabel}>Mensajero activo</Text>
      <View style={[styles.courierChoice, styles.courierChoiceActive]}>
        <Text style={[styles.courierChoiceText, styles.courierChoiceTextActive]}>
          {profile?.full_name || 'Mensajero GOY XPRESS'}
        </Text>
      </View>

      <View style={styles.blockSpacer} />
      {jobs.length === 0 ? (
        <EmptyState
          title="Sin tareas activas"
          message="Las solicitudes que asigne el administrador aparecerán aquí."
        />
      ) : (
        jobs.map(request => (
          <RequestCard key={request.code} request={request}>
            {request.recipient ? (
              <Text style={styles.jobDetail}>Destinatario: {request.recipient}</Text>
            ) : null}
            {request.procedureType ? (
              <Text style={styles.jobDetail}>Gestión: {request.procedureType}</Text>
            ) : null}
            {request.reference ? (
              <Text style={styles.jobDetail}>Referencia: {request.reference}</Text>
            ) : null}
            <View style={styles.jobActions}>
              <PrimaryButton
                title="Llamar"
                onPress={() => callPhone(request.phone)}
                variant="light"
                compact
              />
              <PrimaryButton
                title="Abrir mapa"
                onPress={() => openDirections(requestPrimaryAddress(request))}
                variant="light"
                compact
              />
            </View>
            <PrimaryButton
              title={
                request.status === REQUEST_STATUS.assigned
                  ? 'Iniciar recorrido'
                  : 'Finalizar servicio'
              }
              onPress={() => advance(request)}
              variant={request.status === REQUEST_STATUS.assigned ? 'blue' : 'green'}
            />
          </RequestCard>
        ))
      )}
    </Page>
  );
}

export function GoyXpressApplication({profile, onSignOut}) {
  const role = profile?.role;
  const [requests, setRequests] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState('');

  const refreshWorkspace = useCallback(async (silent = false) => {
    if (!profile) return;
    if (!silent) setLoadError('');
    try {
      const workspace = await loadWorkspace(profile);
      setRequests(workspace.requests);
      setInventory(workspace.inventory);
      setCouriers(workspace.couriers);
      setInvitations(workspace.invitations);
    } catch (error) {
      if (!silent) setLoadError(error.message);
    } finally {
      if (!silent) setIsReady(true);
    }
  }, [profile]);

  useEffect(() => {
    let active = true;
    let refreshTimer;
    refreshWorkspace();
    const unsubscribe = subscribeToWorkspace(() => {
      if (!active) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => refreshWorkspace(true), 350);
    });
    return () => {
      active = false;
      clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [refreshWorkspace]);

  const addRequest = useCallback(async request => {
    try {
      const created = await createServiceRequest(request);
      setRequests(previous => [created, ...previous]);
      return created;
    } catch (error) {
      Alert.alert('No se pudo registrar', error.message);
      throw error;
    }
  }, []);

  const updateRequest = useCallback(async (code, patch) => {
    try {
      const updated = await updateServiceRequest(code, patch);
      await refreshWorkspace(true);
      return updated;
    } catch (error) {
      Alert.alert('No se pudo actualizar', error.message);
      return null;
    }
  }, [refreshWorkspace]);

  const addInventoryItem = useCallback(async item => {
    try {
      const created = await createRemoteInventoryItem(item);
      setInventory(previous => [created, ...previous]);
      return created;
    } catch (error) {
      Alert.alert('No se pudo guardar', error.message);
      return null;
    }
  }, []);

  const adjustInventoryItem = useCallback(async (id, amount) => {
    try {
      const updated = await adjustRemoteInventoryItem(id, amount);
      setInventory(previous =>
        previous.map(item => (item.id === id ? updated : item)),
      );
      return updated;
    } catch (error) {
      Alert.alert('No se pudo actualizar', error.message);
      return null;
    }
  }, []);

  const createInvitation = useCallback(async (inviteRole, label) => {
    const created = await createRemoteInvitation(inviteRole, label);
    await refreshWorkspace(true);
    return created;
  }, [refreshWorkspace]);

  const revokeInvitation = useCallback(async invitationId => {
    Alert.alert(
      'Revocar invitación',
      'El enlace dejará de funcionar inmediatamente.',
      [
        {text: 'Cancelar', style: 'cancel'},
        {
          text: 'Revocar',
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeRemoteInvitation(invitationId);
              await refreshWorkspace(true);
            } catch (error) {
              Alert.alert('No se pudo revocar', error.message);
            }
          },
        },
      ],
    );
  }, [refreshWorkspace]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" backgroundColor={COLORS.navy} />
      <AppHeader profile={profile} onSignOut={onSignOut} />
      {!isReady ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={COLORS.blue} />
          <Text style={styles.loadingText}>Sincronizando GOY XPRESS…</Text>
        </View>
      ) : loadError ? (
        <View style={styles.loadingBox}>
          <Text style={styles.errorTitle}>No se pudo sincronizar</Text>
          <Text style={styles.loadingText}>{loadError}</Text>
          <PrimaryButton title="Reintentar" onPress={() => refreshWorkspace()} />
        </View>
      ) : role === 'admin' ? (
        <AdminPanel
          requests={requests}
          couriers={couriers}
          invitations={invitations}
          onUpdateRequest={updateRequest}
          onCreateInvitation={createInvitation}
          onRevokeInvitation={revokeInvitation}
        />
      ) : role === 'courier' ? (
        <CourierPanel
          requests={requests}
          profile={profile}
          onUpdateRequest={updateRequest}
        />
      ) : (
        <ClientPortal
          requests={requests}
          inventory={inventory}
          profile={profile}
          onSignOut={onSignOut}
          onAddRequest={addRequest}
          onAddInventoryItem={addInventoryItem}
          onAdjustInventoryItem={adjustInventoryItem}
        />
      )}
    </SafeAreaView>
  );
}

class AppErrorBoundary extends React.Component {
  state = {hasError: false};

  static getDerivedStateFromError() {
    return {hasError: true};
  }

  componentDidCatch(error, info) {
    console.error('GOY XPRESS encontró un error de interfaz', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.errorScreen}>
          <StatusBar style="light" backgroundColor={COLORS.navy} />
          <Text style={styles.errorBrand}>GOY XPRESS</Text>
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>No pudimos mostrar esta pantalla</Text>
            <Text style={styles.errorMessage}>
              Tus datos permanecen protegidos en el servidor. Presiona reintentar para
              volver a la aplicación.
            </Text>
            <PrimaryButton
              title="Reintentar"
              onPress={() => this.setState({hasError: false})}
              variant="green"
            />
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

export default function App(props) {
  return (
    <AppErrorBoundary>
      <GoyXpressApplication {...props} />
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: COLORS.background},
  flexOne: {flex: 1},
  pressed: {opacity: 0.72, transform: [{scale: 0.99}]},
  header: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
  },
  brandRow: {flexDirection: 'row', alignItems: 'center'},
  logo: {width: 48, height: 48, borderRadius: 11, backgroundColor: COLORS.white},
  brandCopy: {flex: 1, marginLeft: 10},
  brandTitle: {color: COLORS.white, fontSize: 19, fontWeight: '900', letterSpacing: 0.2},
  brandSubtitle: {color: '#C7D8E0', fontSize: 11, marginTop: 2},
  logoutButton: {
    borderWidth: 1,
    borderColor: '#507080',
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  logoutText: {color: COLORS.white, fontSize: 11, fontWeight: '900'},
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#234C5D',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  onlineDot: {width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.lime},
  onlineText: {color: COLORS.white, marginLeft: 5, fontSize: 11, fontWeight: '800'},
  roleTabs: {flexDirection: 'row', gap: 7, paddingTop: 10, paddingBottom: 10},
  roleTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#31596A',
  },
  roleTabActive: {backgroundColor: COLORS.white, borderColor: COLORS.white},
  roleTabText: {fontSize: 11, fontWeight: '800', color: '#C8D9E0'},
  roleTabTextActive: {color: COLORS.navy},
  page: {padding: 16, paddingBottom: 32},
  eyebrow: {color: COLORS.green, fontSize: 11, fontWeight: '900', letterSpacing: 1.2},
  screenTitle: {color: COLORS.navy, fontSize: 27, fontWeight: '900', marginTop: 3},
  screenSubtitle: {color: COLORS.muted, lineHeight: 20, marginTop: 5, marginBottom: 18},
  sectionTitle: {color: COLORS.navy, fontSize: 18, fontWeight: '900', marginBottom: 12},
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  sectionHeaderTop: {flexDirection: 'row', alignItems: 'flex-start'},
  linkText: {color: COLORS.blue, fontWeight: '900', marginBottom: 12},
  blockSpacer: {height: 14},
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 15,
    marginBottom: 13,
    shadowColor: '#0B2F40',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 1,
  },
  cardTitle: {color: COLORS.navy, fontSize: 17, fontWeight: '900', marginBottom: 11},
  statsGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20},
  statCard: {
    width: '48%',
    minHeight: 86,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 13,
    overflow: 'hidden',
  },
  statAccent: {position: 'absolute', left: 0, top: 0, bottom: 0, width: 4},
  statValue: {color: COLORS.navy, fontSize: 22, fontWeight: '900'},
  statLabel: {color: COLORS.muted, fontSize: 11, marginTop: 5},
  serviceGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18},
  serviceTile: {width: '48%', minHeight: 138, borderRadius: 17, padding: 15},
  serviceIcon: {color: COLORS.white, fontSize: 29, fontWeight: '300'},
  serviceTileTitle: {color: COLORS.white, fontSize: 16, fontWeight: '900', marginTop: 8},
  serviceTileSubtitle: {color: '#EAF5F8', fontSize: 11, marginTop: 5, lineHeight: 15},
  serviceRow: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 14,
    marginBottom: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceRowIcon: {
    width: 48,
    height: 48,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceRowIconText: {fontSize: 24, color: COLORS.navy, fontWeight: '800'},
  serviceRowCopy: {flex: 1, marginHorizontal: 12},
  serviceRowTitle: {fontSize: 16, fontWeight: '900', color: COLORS.navy},
  serviceRowDescription: {fontSize: 12, color: COLORS.muted, lineHeight: 17, marginTop: 3},
  serviceRowPrice: {fontSize: 12, color: COLORS.green, fontWeight: '900', marginTop: 5},
  chevron: {fontSize: 30, color: '#9AA9B1'},
  button: {
    minHeight: 49,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
    marginTop: 8,
  },
  buttonCompact: {minHeight: 42},
  buttonBlue: {backgroundColor: COLORS.blue},
  buttonGreen: {backgroundColor: COLORS.green},
  buttonNavy: {backgroundColor: COLORS.navy},
  buttonLight: {backgroundColor: '#EAF1F4', borderWidth: 1, borderColor: COLORS.line},
  buttonDanger: {backgroundColor: COLORS.red},
  buttonDisabled: {opacity: 0.45},
  buttonText: {color: COLORS.white, fontSize: 14, fontWeight: '900', textAlign: 'center'},
  buttonTextDark: {color: COLORS.navy},
  fieldLabel: {color: COLORS.navy, fontSize: 12, fontWeight: '900', marginTop: 10, marginBottom: 6},
  required: {color: COLORS.red},
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#CBD8DE',
    borderRadius: 11,
    backgroundColor: '#FBFDFE',
    paddingHorizontal: 12,
    color: COLORS.ink,
    fontSize: 14,
  },
  inputMultiline: {minHeight: 82, paddingTop: 12, textAlignVertical: 'top'},
  fieldHelper: {color: COLORS.muted, fontSize: 10, marginTop: 4},
  pickerShell: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#CBD8DE',
    borderRadius: 11,
    backgroundColor: '#FBFDFE',
    overflow: 'hidden',
  },
  choiceRow: {flexDirection: 'row', gap: 8},
  choice: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  choiceActive: {backgroundColor: COLORS.navy, borderColor: COLORS.navy},
  choiceText: {color: COLORS.muted, fontSize: 12, fontWeight: '800', textAlign: 'center'},
  choiceTextActive: {color: COLORS.white},
  formCard: {marginTop: 14},
  formColumns: {flexDirection: 'row', gap: 9},
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.line,
    marginTop: 15,
    paddingVertical: 12,
  },
  switchTitle: {fontWeight: '900', color: COLORS.navy},
  switchDescription: {color: COLORS.muted, fontSize: 11, marginTop: 2},
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    paddingVertical: 10,
  },
  summaryLabelBox: {flex: 1},
  summaryLabel: {color: COLORS.muted, fontSize: 12},
  summaryLabelStrong: {color: COLORS.navy, fontWeight: '900'},
  summaryNote: {fontSize: 10, color: COLORS.muted, marginTop: 2},
  summaryValue: {color: COLORS.ink, fontSize: 13, fontWeight: '800', textAlign: 'right', maxWidth: '50%'},
  summaryValueStrong: {color: COLORS.green, fontSize: 20, fontWeight: '900'},
  priceCard: {borderColor: '#B9DDEB', backgroundColor: '#F7FCFE'},
  backButton: {alignSelf: 'flex-start', paddingVertical: 5, paddingRight: 12, marginBottom: 4},
  backButtonText: {color: COLORS.blue, fontWeight: '900', fontSize: 15},
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: {width: 6, height: 6, borderRadius: 3, marginRight: 5},
  statusText: {fontSize: 10, fontWeight: '900'},
  requestHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  requestTitleBox: {flex: 1},
  requestCode: {fontSize: 15, color: COLORS.navy, fontWeight: '900'},
  requestKind: {fontSize: 11, color: COLORS.blue, fontWeight: '800', marginTop: 2},
  requestDivider: {height: 1, backgroundColor: COLORS.line, marginVertical: 11},
  requestCustomer: {fontSize: 14, fontWeight: '800', color: COLORS.ink},
  requestAddress: {fontSize: 12, color: COLORS.muted, lineHeight: 17, marginTop: 4},
  requestAmounts: {flexDirection: 'row', marginTop: 12},
  amountRight: {marginLeft: 28},
  miniLabel: {fontSize: 10, color: COLORS.muted},
  moneyText: {fontSize: 16, color: COLORS.green, fontWeight: '900', marginTop: 2},
  requestMeta: {fontSize: 11, color: COLORS.navy, marginTop: 9, fontWeight: '800'},
  requestDate: {fontSize: 10, color: '#92A0A8', marginTop: 7},
  settledText: {fontSize: 11, color: COLORS.green, fontWeight: '900', marginTop: 8},
  pendingSettlementText: {fontSize: 11, color: '#967010', fontWeight: '900', marginTop: 8},
  emptyCard: {alignItems: 'center', paddingVertical: 28},
  emptyIcon: {fontSize: 34, color: '#AAB8BF'},
  emptyTitle: {color: COLORS.navy, fontWeight: '900', fontSize: 17, marginTop: 8},
  emptyMessage: {color: COLORS.muted, textAlign: 'center', lineHeight: 19, marginTop: 6, marginBottom: 7},
  infoCard: {backgroundColor: COLORS.navy, borderColor: COLORS.navy},
  infoTitle: {color: COLORS.white, fontSize: 16, fontWeight: '900'},
  infoText: {color: '#CEDDE3', lineHeight: 18, marginTop: 5, fontSize: 12},
  tariffBanner: {backgroundColor: COLORS.green, borderColor: COLORS.green},
  tariffBannerTitle: {color: '#DFF3E1', fontSize: 12, fontWeight: '900'},
  tariffBannerPrice: {color: COLORS.white, fontSize: 34, fontWeight: '900', marginTop: 3},
  tariffBannerText: {color: COLORS.white, lineHeight: 19, marginTop: 5},
  planCard: {backgroundColor: COLORS.navy, borderColor: COLORS.navy},
  planEyebrow: {color: COLORS.lime, fontSize: 11, letterSpacing: 0.7, fontWeight: '900'},
  planTitle: {color: COLORS.white, fontSize: 23, fontWeight: '900', marginTop: 7},
  planText: {color: '#CFDEE4', lineHeight: 19, marginTop: 7},
  bottomNav: {
    minHeight: 66,
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingHorizontal: 4,
    paddingBottom: Platform.OS === 'ios' ? 8 : 3,
  },
  bottomNavItem: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 5},
  bottomNavIcon: {fontSize: 19, color: '#92A0A8', fontWeight: '800'},
  bottomNavIconActive: {color: COLORS.blue},
  bottomNavLabel: {fontSize: 9, color: '#82919A', marginTop: 2},
  bottomNavLabelActive: {color: COLORS.navy, fontWeight: '900'},
  roundAdd: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundAddText: {fontSize: 27, color: COLORS.white, fontWeight: '400'},
  inventoryCard: {flexDirection: 'row', alignItems: 'center'},
  inventoryCopy: {flex: 1},
  inventoryName: {fontWeight: '900', color: COLORS.navy, fontSize: 15},
  inventorySku: {fontSize: 11, color: COLORS.muted, marginTop: 3},
  inventoryPrice: {fontSize: 12, color: COLORS.green, fontWeight: '800', marginTop: 5},
  quantityBox: {flexDirection: 'row', alignItems: 'center', gap: 9},
  quantityButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#EAF1F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonText: {color: COLORS.navy, fontSize: 20, fontWeight: '900'},
  quantityValue: {minWidth: 24, textAlign: 'center', color: COLORS.navy, fontWeight: '900'},
  profileIcon: {fontSize: 31, color: COLORS.blue, marginBottom: 7},
  profileIdentityCard: {flexDirection: 'row', alignItems: 'center'},
  profileAvatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    marginRight: 14,
    backgroundColor: '#EAF0F3',
  },
  profileText: {color: COLORS.ink, fontSize: 14, fontWeight: '800'},
  profileHint: {color: COLORS.muted, fontSize: 11, marginTop: 5},
  checkRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 10},
  checkMark: {color: COLORS.green, fontWeight: '900', marginRight: 10},
  checkText: {color: COLORS.ink, flex: 1},
  versionText: {textAlign: 'center', color: '#91A0A9', fontSize: 10, marginTop: 15},
  assignmentBox: {marginTop: 13},
  assignmentTitle: {fontSize: 12, color: COLORS.navy, fontWeight: '900', marginBottom: 3},
  assignmentButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 10,
    marginTop: 7,
  },
  assignmentName: {color: COLORS.ink, fontWeight: '800'},
  assignmentAction: {color: COLORS.blue, fontWeight: '900'},
  inviteResultCard: {borderColor: COLORS.green, backgroundColor: COLORS.greenSoft},
  inviteLink: {
    color: COLORS.navy,
    fontSize: 12,
    lineHeight: 18,
    backgroundColor: COLORS.white,
    borderRadius: 9,
    padding: 10,
  },
  actionStack: {marginTop: 8},
  courierHeading: {flexDirection: 'row', alignItems: 'flex-start'},
  completedBadge: {backgroundColor: COLORS.greenSoft, padding: 10, borderRadius: 12, alignItems: 'center'},
  completedValue: {color: COLORS.green, fontSize: 20, fontWeight: '900'},
  completedLabel: {color: COLORS.green, fontSize: 9, fontWeight: '800'},
  courierChoices: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  courierChoice: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 20,
  },
  courierChoiceActive: {backgroundColor: COLORS.navy, borderColor: COLORS.navy},
  courierChoiceText: {color: COLORS.muted, fontSize: 12, fontWeight: '800'},
  courierChoiceTextActive: {color: COLORS.white},
  jobDetail: {fontSize: 12, color: COLORS.ink, marginTop: 7},
  jobActions: {flexDirection: 'row', gap: 8, marginTop: 7},
  loadingBox: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  loadingText: {color: COLORS.muted, marginTop: 12},
  errorScreen: {flex: 1, backgroundColor: COLORS.navy, padding: 20, justifyContent: 'center'},
  errorBrand: {color: COLORS.white, fontSize: 25, fontWeight: '900', textAlign: 'center'},
  errorCard: {backgroundColor: COLORS.white, borderRadius: 18, padding: 20, marginTop: 20},
  errorTitle: {color: COLORS.navy, fontSize: 21, fontWeight: '900', textAlign: 'center'},
  errorMessage: {color: COLORS.muted, lineHeight: 20, textAlign: 'center', marginTop: 10},
});
