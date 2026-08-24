
import React, {useEffect, useMemo, useState} from 'react';
import {
  SafeAreaView, View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Image, Alert, Linking, Pressable
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Picker } from '@react-native-picker/picker';

const COLORS = {
  navy: '#0D2F41',
  navy2: '#163D52',
  blue: '#04A9E9',
  lime: '#B7D62B',
  green: '#2AA84A',
  bg: '#F3F7FA',
  text: '#17222B',
  muted: '#6E7A84',
  white: '#FFFFFF',
  line: '#DDE6EB',
  danger: '#B94141',
};

const ADMIN_WHATSAPP = '593997729964'; // CAMBIAR por el WhatsApp real del administrador

const DELIVERY_RATES = {
  norte: 3.00,
  centro: 3.00,
  sur: 3.00,
  valles: 4.00,
  especial: 5.00,
};

const COURIERS = ['Carlos M.', 'Luis R.', 'Andrea P.'];

function money(v){ return `$${Number(v || 0).toFixed(2)}`; }
function uid(prefix){ return `${prefix}-${Date.now().toString().slice(-7)}`; }

async function notifyAdminWhatsApp(request) {
  const lines = [
    '🚨 *NUEVA SOLICITUD GOY XPRESS*',
    '',
    `Tipo: ${request.kind === 'shipment' ? 'ENVÍO' : 'TRÁMITE'}`,
    `Código: ${request.code}`,
    `Cliente: ${request.customer || '-'}`,
    `Destino/Lugar: ${request.address || request.place || '-'}`,
    `Valor servicio: ${money(request.serviceCost)}`,
    request.totalToCollect != null ? `Valor a cobrar: ${money(request.totalToCollect)}` : '',
    '',
    'Abrir panel administrador para asignar mensajero.'
  ].filter(Boolean).join('\n');

  const url = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(lines)}`;
  try {
    await Linking.openURL(url);
  } catch (error) {
    Alert.alert('WhatsApp', 'La solicitud fue guardada, pero no se pudo abrir WhatsApp.');
  }
}

function Header() {
  return (
    <View style={styles.header}>
      <Image source={require('./assets/goy-logo.jpg')} style={styles.logo}/>
      <View style={{flex:1}}>
        <Text style={styles.headerTitle}>GOY XPRESS</Text>
        <Text style={styles.headerSub}>Mensajería · Trámites · Logística</Text>
      </View>
    </View>
  );
}

function RoleNav({role, setRole}) {
  const roles = [['client','Cliente'], ['admin','Administrador'], ['courier','Mensajero']];
  return (
    <View style={styles.roleNav}>
      {roles.map(([value, label]) => (
        <Pressable key={value} accessibilityRole="button" onPress={() => setRole(value)}
          android_ripple={{color:'#D7EDF6'}}
          style={({pressed}) => [styles.roleTab, role === value && styles.roleTabActive, pressed && styles.pressed]}>
          <Text style={[styles.roleTabText, role === value && styles.roleTabTextActive]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Card({children, style}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function Btn({title, onPress, variant='primary'}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      android_ripple={{color:'rgba(255,255,255,0.25)'}}
      style={({pressed}) => [styles.btn, variant === 'green' ? styles.btnGreen :
        variant === 'secondary' ? styles.btnSecondary : styles.btnPrimary, pressed && styles.pressed]}
    >
      <Text style={[styles.btnText, variant === 'secondary' && {color:COLORS.navy}]}>{title}</Text>
    </Pressable>
  );
}

function ClientHome({requests, addRequest}) {
  const [tab, setTab] = useState('home');

  if (tab === 'shipment') return <ShipmentForm onBack={()=>setTab('home')} addRequest={addRequest}/>;
  if (tab === 'procedure') return <ProcedureForm onBack={()=>setTab('home')} addRequest={addRequest}/>;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.h1}>Hola, emprendedor</Text>
      <Text style={styles.subtitle}>Registra tus envíos y trámites desde un solo lugar.</Text>

      <View style={styles.twoCols}>
        <Pressable accessibilityRole="button" style={({pressed})=>[styles.actionTile,{backgroundColor:COLORS.blue},pressed&&styles.pressed]} onPress={()=>setTab('shipment')}>
          <Text style={styles.actionPlus}>＋</Text>
          <Text style={styles.actionTitle}>Nuevo envío</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={({pressed})=>[styles.actionTile,{backgroundColor:COLORS.green},pressed&&styles.pressed]} onPress={()=>setTab('procedure')}>
          <Text style={styles.actionPlus}>✓</Text>
          <Text style={styles.actionTitle}>Nuevo trámite</Text>
        </Pressable>
      </View>

      <Card>
        <Text style={styles.cardTitle}>Últimas solicitudes</Text>
        {requests.length === 0 ? <Text style={styles.muted}>Aún no tienes solicitudes.</Text> :
          requests.slice(0,6).map(r => (
            <View key={r.code} style={styles.listRow}>
              <View style={{flex:1}}>
                <Text style={styles.bold}>{r.code}</Text>
                <Text style={styles.muted}>{r.kind === 'shipment' ? 'Envío' : 'Trámite'} · {r.status}</Text>
              </View>
              <Text style={styles.amount}>{money(r.serviceCost)}</Text>
            </View>
          ))
        }
      </Card>
    </ScrollView>
  );
}

function ShipmentForm({onBack, addRequest}) {
  const [customer, setCustomer] = useState('');
  const [recipient, setRecipient] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [zone, setZone] = useState('norte');
  const [purchase, setPurchase] = useState('0');
  const [payer, setPayer] = useState('recipient');
  const [cod, setCod] = useState(true);

  const serviceCost = DELIVERY_RATES[zone];
  const productValue = Number(purchase || 0);
  const totalToCollect = cod ? (payer === 'recipient' ? productValue + serviceCost : productValue) : 0;

  const submit = async () => {
    if (!customer || !recipient || !phone || !address) {
      return Alert.alert('Faltan datos', 'Completa cliente, destinatario, teléfono y dirección.');
    }
    const request = {
      code: uid('GOY'),
      kind:'shipment',
      customer, recipient, phone, address, zone,
      purchase: productValue,
      payer, cod,
      serviceCost,
      totalToCollect,
      status:'Pendiente de asignación',
      courier:null,
      createdAt:new Date().toISOString()
    };
    await addRequest(request);
    Alert.alert('Envío registrado', `${request.code}\nTotal a cobrar: ${money(totalToCollect)}`);
    await notifyAdminWhatsApp(request);
    onBack();
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <TouchableOpacity onPress={onBack}><Text style={styles.back}>← Volver</Text></TouchableOpacity>
      <Text style={styles.h1}>Nuevo envío</Text>
      <Card>
        <Field label="Cliente / emprendimiento" value={customer} onChangeText={setCustomer}/>
        <Field label="Destinatario" value={recipient} onChangeText={setRecipient}/>
        <Field label="WhatsApp destinatario" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/>
        <Field label="Dirección completa" value={address} onChangeText={setAddress} multiline/>

        <Text style={styles.label}>Zona</Text>
        <View style={styles.pickerBox}>
          <Picker selectedValue={zone} onValueChange={setZone}>
            <Picker.Item label="Quito Norte" value="norte"/>
            <Picker.Item label="Quito Centro" value="centro"/>
            <Picker.Item label="Quito Sur" value="sur"/>
            <Picker.Item label="Valles" value="valles"/>
            <Picker.Item label="Zona especial" value="especial"/>
          </Picker>
        </View>

        <Field label="Valor de la compra ($)" value={purchase} onChangeText={setPurchase} keyboardType="decimal-pad"/>

        <Text style={styles.label}>¿Quién paga el envío?</Text>
        <View style={styles.pickerBox}>
          <Picker selectedValue={payer} onValueChange={setPayer}>
            <Picker.Item label="Lo paga el comprador" value="recipient"/>
            <Picker.Item label="Lo asume el emprendimiento" value="sender"/>
          </Picker>
        </View>

        <Text style={styles.label}>Forma de pago</Text>
        <View style={styles.pickerBox}>
          <Picker selectedValue={cod ? 'cod' : 'paid'} onValueChange={(v)=>setCod(v==='cod')}>
            <Picker.Item label="Cobro contra entrega" value="cod"/>
            <Picker.Item label="Pedido ya pagado" value="paid"/>
          </Picker>
        </View>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Resumen</Text>
        <SummaryRow label="Valor producto" value={money(productValue)}/>
        <SummaryRow label="Costo envío" value={money(serviceCost)}/>
        <SummaryRow label="Total a cobrar" value={money(totalToCollect)} strong/>
      </Card>
      <Btn title="Crear envío y avisar por WhatsApp" onPress={submit}/>
    </ScrollView>
  );
}

function ProcedureForm({onBack, addRequest}) {
  const [type, setType] = useState('Depósito bancario');
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [place, setPlace] = useState('');
  const [details, setDetails] = useState('');
  const [minutes, setMinutes] = useState('40');
  const [amount, setAmount] = useState('0');

  const mins = Math.max(1, Number(minutes || 40));
  const extra = Math.max(0, mins - 40);
  const serviceCost = 6.50 + extra * 0.10;

  const submit = async () => {
    if (!customer || !phone || !place) {
      return Alert.alert('Faltan datos', 'Completa cliente, teléfono y lugar del trámite.');
    }
    const request = {
      code: uid('TRM'),
      kind:'procedure',
      type, customer, phone, place,
      address: place,
      details, minutes: mins,
      amount:Number(amount || 0),
      serviceCost,
      status:'Pendiente de asignación',
      courier:null,
      createdAt:new Date().toISOString()
    };
    await addRequest(request);
    Alert.alert('Trámite registrado', `${request.code}\nValor del servicio: ${money(serviceCost)}`);
    await notifyAdminWhatsApp(request);
    onBack();
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <TouchableOpacity onPress={onBack}><Text style={styles.back}>← Volver</Text></TouchableOpacity>
      <Text style={styles.h1}>Nuevo trámite</Text>
      <Card>
        <Text style={styles.label}>Tipo de trámite</Text>
        <View style={styles.pickerBox}>
          <Picker selectedValue={type} onValueChange={setType}>
            <Picker.Item label="Depósito bancario" value="Depósito bancario"/>
            <Picker.Item label="Ingreso de documentos" value="Ingreso de documentos"/>
            <Picker.Item label="Retiro de documentos" value="Retiro de documentos"/>
            <Picker.Item label="Entrega de documentos" value="Entrega de documentos"/>
            <Picker.Item label="Pago / diligencia" value="Pago / diligencia"/>
            <Picker.Item label="Otro" value="Otro"/>
          </Picker>
        </View>

        <Field label="Cliente / empresa" value={customer} onChangeText={setCustomer}/>
        <Field label="WhatsApp" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/>
        <Field label="Institución / lugar" value={place} onChangeText={setPlace} multiline/>
        <Field label="Instrucciones" value={details} onChangeText={setDetails} multiline/>
        <Field label="Tiempo estimado (minutos)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad"/>
        <Field label="Valor a depositar / pagar (opcional)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad"/>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Cálculo</Text>
        <SummaryRow label="Tarifa base (40 min)" value="$6.50"/>
        <SummaryRow label="Minutos adicionales" value={`${extra} min`}/>
        <SummaryRow label="Recargo" value={money(extra * 0.10)}/>
        <SummaryRow label="Total servicio" value={money(serviceCost)} strong/>
      </Card>
      <Btn title="Crear trámite y avisar por WhatsApp" onPress={submit} variant="green"/>
    </ScrollView>
  );
}

function AdminPanel({requests, updateRequest}) {
  const pending = requests.filter(r=>r.status === 'Pendiente de asignación');

  const assign = async (request, courier) => {
    await updateRequest(request.code, {courier, status:'Asignado'});
    Alert.alert('Asignado', `${request.code} asignado a ${courier}.`);
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.h1}>Panel administrador</Text>
      <Text style={styles.subtitle}>Solicitudes pendientes y asignación de mensajeros.</Text>

      <View style={styles.stats}>
        <Stat label="Nuevas" value={pending.length}/>
        <Stat label="En curso" value={requests.filter(r=>['Asignado','En ruta'].includes(r.status)).length}/>
        <Stat label="Finalizadas" value={requests.filter(r=>r.status==='Finalizado').length}/>
      </View>

      {pending.length === 0 ? <Card><Text style={styles.muted}>No hay solicitudes pendientes.</Text></Card> :
        pending.map(r=>(
          <Card key={r.code}>
            <View style={styles.listRow}>
              <View style={{flex:1}}>
                <Text style={styles.bold}>{r.code}</Text>
                <Text style={styles.muted}>{r.kind==='shipment' ? 'ENVÍO' : 'TRÁMITE'} · {r.customer}</Text>
                <Text style={styles.small}>{r.address || r.place}</Text>
              </View>
              <Text style={styles.amount}>{money(r.serviceCost)}</Text>
            </View>
            <Text style={styles.label}>Asignar mensajero</Text>
            {COURIERS.map(c=>(
              <TouchableOpacity key={c} style={styles.courierBtn} onPress={()=>assign(r,c)}>
                <Text style={styles.courierText}>{c}</Text>
                <Text style={styles.assignText}>Asignar →</Text>
              </TouchableOpacity>
            ))}
          </Card>
        ))
      }
    </ScrollView>
  );
}

function CourierPanel({requests, updateRequest}) {
  const [courierName, setCourierName] = useState(COURIERS[0]);
  const jobs = requests.filter(r=>r.courier===courierName && r.status!=='Finalizado');

  const advance = async (r) => {
    const next = r.status === 'Asignado' ? 'En ruta' : 'Finalizado';
    await updateRequest(r.code,{status:next});
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.h1}>Panel mensajero</Text>
      <Text style={styles.label}>Mensajero activo</Text>
      <View style={styles.pickerBox}>
        <Picker selectedValue={courierName} onValueChange={setCourierName}>
          {COURIERS.map(c=><Picker.Item key={c} label={c} value={c}/>)}
        </Picker>
      </View>

      <Text style={[styles.cardTitle,{marginTop:18}]}>Asignaciones</Text>
      {jobs.length === 0 ? <Card><Text style={styles.muted}>No tienes tareas activas.</Text></Card> :
        jobs.map(r=>(
          <Card key={r.code}>
            <Text style={styles.bold}>{r.code}</Text>
            <Text style={styles.muted}>{r.kind==='shipment'?'Envío':'Trámite'} · {r.status}</Text>
            <Text style={styles.small}>{r.address || r.place}</Text>
            {r.kind==='shipment' && <Text style={styles.amount}>Cobrar: {money(r.totalToCollect)}</Text>}
            <Btn
              title={r.status==='Asignado'?'Iniciar':'Finalizar'}
              onPress={()=>advance(r)}
              variant={r.status==='Asignado'?'primary':'green'}
            />
          </Card>
        ))
      }
    </ScrollView>
  );
}

function Field({label, multiline, ...props}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        style={[styles.input, multiline && {minHeight:75,textAlignVertical:'top'}]}
        placeholderTextColor="#9AA5AE"
      />
    </View>
  );
}

function SummaryRow({label,value,strong}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={strong?styles.bold:styles.muted}>{label}</Text>
      <Text style={strong?styles.summaryStrong:styles.bold}>{value}</Text>
    </View>
  );
}

function Stat({label,value}) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.muted}>{label}</Text></View>;
}

export default function App() {
  const [role, setRole] = useState('client');
  const [requests, setRequests] = useState([]);

  useEffect(()=>{
    AsyncStorage.getItem('goy_requests').then(v=>{
      if(v) setRequests(JSON.parse(v));
    });
  },[]);

  const persist = async (next) => {
    setRequests(next);
    await AsyncStorage.setItem('goy_requests', JSON.stringify(next));
  };

  const addRequest = async (r) => persist([r,...requests]);
  const updateRequest = async (code, patch) => {
    const next = requests.map(r=>r.code===code?{...r,...patch}:r);
    await persist(next);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light"/>
      <Header/>
      <RoleNav role={role} setRole={setRole}/>
      {role==='client' && <ClientHome requests={requests} addRequest={addRequest}/>}
      {role==='admin' && <AdminPanel requests={requests} updateRequest={updateRequest}/>}
      {role==='courier' && <CourierPanel requests={requests} updateRequest={updateRequest}/>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:COLORS.bg},
  header:{backgroundColor:COLORS.navy,flexDirection:'row',alignItems:'center',padding:10,gap:10},
  logo:{width:58,height:58,borderRadius:10},
  headerTitle:{color:COLORS.white,fontWeight:'900',fontSize:18},
  headerSub:{color:'#C9D7DF',fontSize:11},
  roleNav:{flexDirection:'row',backgroundColor:COLORS.white,borderBottomWidth:1,borderBottomColor:COLORS.line,paddingHorizontal:8,paddingVertical:7},
  roleTab:{flex:1,minHeight:42,alignItems:'center',justifyContent:'center',borderRadius:10,overflow:'hidden'},
  roleTabActive:{backgroundColor:COLORS.navy},
  roleTabText:{fontSize:12,fontWeight:'800',color:COLORS.navy},
  roleTabTextActive:{color:COLORS.white},
  pressed:{opacity:0.72},
  page:{padding:16,paddingBottom:40},
  h1:{fontSize:26,fontWeight:'900',color:COLORS.navy,marginBottom:4},
  subtitle:{color:COLORS.muted,marginBottom:16},
  card:{backgroundColor:COLORS.white,borderRadius:16,padding:16,marginBottom:14,borderWidth:1,borderColor:COLORS.line},
  cardTitle:{fontSize:17,fontWeight:'800',color:COLORS.navy,marginBottom:12},
  twoCols:{flexDirection:'row',gap:12,marginBottom:16},
  actionTile:{flex:1,borderRadius:16,padding:18,minHeight:125,justifyContent:'center'},
  actionPlus:{color:COLORS.white,fontSize:34,fontWeight:'700'},
  actionTitle:{color:COLORS.white,fontSize:17,fontWeight:'800',marginTop:8},
  label:{fontSize:12,fontWeight:'800',color:COLORS.navy,marginTop:10,marginBottom:5},
  input:{borderWidth:1,borderColor:COLORS.line,borderRadius:10,padding:12,backgroundColor:'#FBFDFE',color:COLORS.text},
  pickerBox:{borderWidth:1,borderColor:COLORS.line,borderRadius:10,overflow:'hidden',backgroundColor:'#FBFDFE'},
  btn:{padding:14,borderRadius:11,alignItems:'center',marginTop:8},
  btnPrimary:{backgroundColor:COLORS.blue},
  btnGreen:{backgroundColor:COLORS.green},
  btnSecondary:{backgroundColor:'#E8F0F4'},
  btnText:{color:COLORS.white,fontWeight:'900'},
  back:{color:COLORS.blue,fontWeight:'800',marginBottom:12},
  listRow:{flexDirection:'row',alignItems:'center',paddingVertical:10,borderBottomWidth:1,borderBottomColor:COLORS.line},
  bold:{fontWeight:'800',color:COLORS.text},
  muted:{color:COLORS.muted,fontSize:12},
  small:{color:COLORS.text,fontSize:12,marginTop:5},
  amount:{fontWeight:'900',color:COLORS.green},
  summaryRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:9,borderBottomWidth:1,borderBottomColor:COLORS.line},
  summaryStrong:{fontSize:18,fontWeight:'900',color:COLORS.green},
  stats:{flexDirection:'row',gap:10,marginBottom:16},
  stat:{flex:1,backgroundColor:COLORS.white,padding:14,borderRadius:14,borderWidth:1,borderColor:COLORS.line},
  statValue:{fontSize:24,fontWeight:'900',color:COLORS.navy},
  courierBtn:{flexDirection:'row',justifyContent:'space-between',padding:12,borderWidth:1,borderColor:COLORS.line,borderRadius:10,marginTop:7},
  courierText:{fontWeight:'700',color:COLORS.text},
  assignText:{fontWeight:'900',color:COLORS.blue},
});
