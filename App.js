import React, {useEffect, useMemo, useState} from 'react';
import {Alert, Image, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {StatusBar} from 'expo-status-bar';

const VERSION = '2.0.0';
const STORAGE_KEY = 'goy_xpress_requests_v2';
const ADMIN_WHATSAPP = '593997729964';
const C = {navy:'#0D2F41',blue:'#04A9E9',green:'#2AA84A',lime:'#B7D62B',white:'#FFFFFF',bg:'#F3F7FA',ink:'#17222B',muted:'#667681',line:'#D8E3E9'};
const ZONES = [
  {value:'norte',label:'Quito Norte',price:3},{value:'centro',label:'Quito Centro',price:3},
  {value:'sur',label:'Quito Sur',price:3},{value:'valles',label:'Valles',price:4},{value:'especial',label:'Zona especial',price:5},
];
const PROCEDURES = ['Depósito bancario','Ingreso de documentos','Retiro de documentos','Entrega de documentos','Pago / diligencia','Otro'];
const COURIERS = ['Carlos M.','Luis R.','Andrea P.'];
const money = value => `$${Number(value || 0).toFixed(2)}`;
const makeCode = prefix => `${prefix}-${Date.now().toString().slice(-8)}`;
const number = value => Number(String(value || '0').replace(',','.')) || 0;

function Button({title,onPress,color=C.blue,outline=false,disabled=false}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
    android_ripple={{color:outline?'#DCECF3':'rgba(255,255,255,0.28)'}}
    style={({pressed})=>[s.button,{backgroundColor:outline?C.white:color,borderColor:color},pressed&&s.pressed,disabled&&s.disabled]}>
    <Text style={[s.buttonText,outline&&{color}]}>{title}</Text>
  </Pressable>;
}
function Chip({label,selected,onPress}) {
  return <Pressable accessibilityRole="button" onPress={onPress} android_ripple={{color:'#DCECF3'}}
    style={({pressed})=>[s.chip,selected&&s.chipSelected,pressed&&s.pressed]}>
    <Text style={[s.chipText,selected&&s.chipTextSelected]}>{label}</Text>
  </Pressable>;
}
function Field({label,multiline=false,...props}) {
  return <View style={s.fieldWrap}><Text style={s.label}>{label}</Text><TextInput {...props} multiline={multiline}
    placeholderTextColor="#8A98A3" style={[s.input,multiline&&s.multiline]}/></View>;
}
function Card({children}) { return <View style={s.card}>{children}</View>; }
function Header() {
  return <View style={s.header}><Image source={require('./assets/goy-logo.jpg')} style={s.logo}/><View style={{flex:1}}>
    <Text style={s.headerTitle}>GOY XPRESS</Text><Text style={s.headerSub}>Mensajería · Trámites · Logística</Text>
  </View><Text style={s.version}>v{VERSION}</Text></View>;
}
function RoleBar({role,setRole}) {
  return <View style={s.roleBar}>{[['client','Cliente'],['admin','Administrador'],['courier','Mensajero']].map(([value,label])=><Pressable
    key={value} accessibilityRole="button" onPress={()=>setRole(value)} style={({pressed})=>[s.roleButton,role===value&&s.roleButtonActive,pressed&&s.pressed]}>
    <Text style={[s.roleText,role===value&&s.roleTextActive]}>{label}</Text></Pressable>)}</View>;
}
function Back({onPress}) { return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[s.back,pressed&&s.pressed]}><Text style={s.backText}>← Volver al inicio</Text></Pressable>; }
function Empty({text}) { return <Card><Text style={s.muted}>{text}</Text></Card>; }
function Row({label,value,strong=false}) { return <View style={s.row}><Text style={strong?s.bold:s.muted}>{label}</Text><Text style={strong?s.total:s.bold}>{value}</Text></View>; }

function Home({requests,open}) {
  return <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
    <Text style={s.h1}>Solicita tu servicio</Text><Text style={s.subtitle}>Registra un envío o trámite y notifícalo directamente a GOY XPRESS.</Text>
    <Pressable accessibilityRole="button" onPress={()=>open('shipment')} style={({pressed})=>[s.bigAction,{backgroundColor:C.blue},pressed&&s.pressed]}>
      <Text style={s.bigIcon}>＋</Text><View style={{flex:1}}><Text style={s.bigTitle}>Nuevo envío</Text><Text style={s.bigSub}>Entrega y cobro contra entrega</Text></View><Text style={s.bigArrow}>›</Text>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={()=>open('procedure')} style={({pressed})=>[s.bigAction,{backgroundColor:C.green},pressed&&s.pressed]}>
      <Text style={s.bigIcon}>✓</Text><View style={{flex:1}}><Text style={s.bigTitle}>Nuevo trámite</Text><Text style={s.bigSub}>Depósitos y documentos</Text></View><Text style={s.bigArrow}>›</Text>
    </Pressable>
    <Button title="Comprobar que los botones funcionan" outline onPress={()=>Alert.alert('Aplicación activa','Los controles funcionan correctamente en la versión 2.0.0.')}/>
    <Text style={s.section}>Últimas solicitudes</Text>
    {requests.length===0?<Empty text="Todavía no existen solicitudes guardadas."/>:requests.slice(0,6).map(item=><Card key={item.id}><View style={s.listLine}><View style={{flex:1}}><Text style={s.bold}>{item.id}</Text><Text style={s.muted}>{item.kind==='shipment'?'Envío':'Trámite'} · {item.status}</Text></View><Text style={s.price}>{money(item.serviceCost)}</Text></View></Card>)}
  </ScrollView>;
}

function ShipmentForm({save,back}) {
  const [customer,setCustomer]=useState(''); const [recipient,setRecipient]=useState(''); const [phone,setPhone]=useState('');
  const [address,setAddress]=useState(''); const [zone,setZone]=useState('norte'); const [purchase,setPurchase]=useState('0');
  const [payer,setPayer]=useState('recipient'); const [payment,setPayment]=useState('cod');
  const selected=ZONES.find(item=>item.value===zone)||ZONES[0]; const product=number(purchase);
  const total=payment==='cod'?product+(payer==='recipient'?selected.price:0):0;
  const submit=()=>{ if(!customer.trim()||!recipient.trim()||!phone.trim()||!address.trim()){Alert.alert('Faltan datos','Completa cliente, destinatario, teléfono y dirección.');return;}
    save({id:makeCode('GOY'),kind:'shipment',customer:customer.trim(),recipient:recipient.trim(),phone:phone.trim(),address:address.trim(),zone,purchase:product,payer,payment,serviceCost:selected.price,totalToCollect:total,status:'Pendiente',courier:null,createdAt:new Date().toISOString()},back); };
  return <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled"><Back onPress={back}/><Text style={s.h1}>Nuevo envío</Text><Card>
    <Field label="Cliente o emprendimiento" value={customer} onChangeText={setCustomer}/><Field label="Destinatario" value={recipient} onChangeText={setRecipient}/>
    <Field label="WhatsApp del destinatario" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/><Field label="Dirección completa" value={address} onChangeText={setAddress} multiline/>
    <Text style={s.label}>Zona de entrega</Text><View style={s.chips}>{ZONES.map(item=><Chip key={item.value} label={`${item.label} ${money(item.price)}`} selected={zone===item.value} onPress={()=>setZone(item.value)}/>)}</View>
    <Field label="Valor de la compra ($)" value={purchase} onChangeText={setPurchase} keyboardType="decimal-pad"/>
    <Text style={s.label}>¿Quién paga el envío?</Text><View style={s.chips}><Chip label="Comprador" selected={payer==='recipient'} onPress={()=>setPayer('recipient')}/><Chip label="Emprendimiento" selected={payer==='sender'} onPress={()=>setPayer('sender')}/></View>
    <Text style={s.label}>Forma de pago</Text><View style={s.chips}><Chip label="Contra entrega" selected={payment==='cod'} onPress={()=>setPayment('cod')}/><Chip label="Ya pagado" selected={payment==='paid'} onPress={()=>setPayment('paid')}/></View>
  </Card><Card><Text style={s.sectionInCard}>Resumen</Text><Row label="Producto" value={money(product)}/><Row label="Servicio" value={money(selected.price)}/><Row label="Total a cobrar" value={money(total)} strong/></Card>
  <Button title="Guardar y notificar por WhatsApp" onPress={submit}/></ScrollView>;
}

function ProcedureForm({save,back}) {
  const [type,setType]=useState(PROCEDURES[0]); const [customer,setCustomer]=useState(''); const [phone,setPhone]=useState('');
  const [place,setPlace]=useState(''); const [details,setDetails]=useState(''); const [minutes,setMinutes]=useState('40');
  const mins=Math.max(1,number(minutes)||40); const extra=Math.max(0,mins-40); const cost=6.5+extra*0.1;
  const submit=()=>{if(!customer.trim()||!phone.trim()||!place.trim()){Alert.alert('Faltan datos','Completa cliente, teléfono y lugar del trámite.');return;}
    save({id:makeCode('TRM'),kind:'procedure',type,customer:customer.trim(),phone:phone.trim(),place:place.trim(),address:place.trim(),details:details.trim(),minutes:mins,serviceCost:cost,status:'Pendiente',courier:null,createdAt:new Date().toISOString()},back);};
  return <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled"><Back onPress={back}/><Text style={s.h1}>Nuevo trámite</Text><Card>
    <Text style={s.label}>Tipo de trámite</Text><View style={s.chips}>{PROCEDURES.map(item=><Chip key={item} label={item} selected={type===item} onPress={()=>setType(item)}/>)}</View>
    <Field label="Cliente o empresa" value={customer} onChangeText={setCustomer}/><Field label="WhatsApp" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/>
    <Field label="Institución o lugar" value={place} onChangeText={setPlace} multiline/><Field label="Instrucciones" value={details} onChangeText={setDetails} multiline/>
    <Field label="Tiempo estimado en minutos" value={minutes} onChangeText={setMinutes} keyboardType="number-pad"/>
  </Card><Card><Text style={s.sectionInCard}>Cálculo</Text><Row label="Base hasta 40 minutos" value="$6.50"/><Row label="Minutos adicionales" value={`${extra}`}/><Row label="Recargo" value={money(extra*0.1)}/><Row label="Total" value={money(cost)} strong/></Card>
  <Button title="Guardar y notificar por WhatsApp" color={C.green} onPress={submit}/></ScrollView>;
}

function Admin({requests,update}) {
  const pending=requests.filter(item=>item.status==='Pendiente');
  return <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled"><Text style={s.h1}>Administrador</Text><Text style={s.subtitle}>Asigna las solicitudes guardadas en este teléfono.</Text>
    {pending.length===0?<Empty text="No existen solicitudes pendientes."/>:pending.map(item=><Card key={item.id}><Text style={s.bold}>{item.id}</Text><Text style={s.muted}>{item.customer} · {item.address}</Text><Text style={s.price}>{money(item.serviceCost)}</Text><Text style={s.label}>Asignar mensajero</Text>
      {COURIERS.map(courier=><Button key={courier} title={`Asignar a ${courier}`} outline onPress={()=>{update(item.id,{courier,status:'Asignado'});Alert.alert('Solicitud asignada',`${item.id} fue asignada a ${courier}.`);}}/>)}
    </Card>)}</ScrollView>;
}
function Courier({requests,update}) {
  const [name,setName]=useState(COURIERS[0]); const jobs=requests.filter(item=>item.courier===name&&item.status!=='Finalizado');
  return <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled"><Text style={s.h1}>Mensajero</Text><Text style={s.label}>Selecciona el mensajero</Text><View style={s.chips}>{COURIERS.map(item=><Chip key={item} label={item} selected={name===item} onPress={()=>setName(item)}/>)}</View><Text style={s.section}>Tareas asignadas</Text>
    {jobs.length===0?<Empty text="No existen tareas activas para este mensajero."/>:jobs.map(item=><Card key={item.id}><Text style={s.bold}>{item.id}</Text><Text style={s.muted}>{item.address} · {item.status}</Text>{item.kind==='shipment'&&<Text style={s.price}>Cobrar: {money(item.totalToCollect)}</Text>}
      <Button title={item.status==='Asignado'?'Iniciar recorrido':'Finalizar tarea'} color={item.status==='Asignado'?C.blue:C.green} onPress={()=>update(item.id,{status:item.status==='Asignado'?'En ruta':'Finalizado'})}/>
    </Card>)}</ScrollView>;
}

function whatsappText(item) { return ['NUEVA SOLICITUD GOY XPRESS',`Código: ${item.id}`,`Tipo: ${item.kind==='shipment'?'ENVÍO':'TRÁMITE'}`,`Cliente: ${item.customer}`,`Lugar: ${item.address}`,`Servicio: ${money(item.serviceCost)}`,item.kind==='shipment'?`Total a cobrar: ${money(item.totalToCollect)}`:''].filter(Boolean).join('\n'); }

export default function App() {
  const [role,setRole]=useState('client'); const [screen,setScreen]=useState('home'); const [requests,setRequests]=useState([]); const [ready,setReady]=useState(false);
  useEffect(()=>{AsyncStorage.getItem(STORAGE_KEY).then(raw=>{if(raw)setRequests(JSON.parse(raw));}).catch(()=>{}).finally(()=>setReady(true));},[]);
  const persist=next=>{setRequests(next);AsyncStorage.setItem(STORAGE_KEY,JSON.stringify(next)).catch(()=>Alert.alert('Aviso','No se pudo guardar en el teléfono.'));};
  const save=(item,back)=>{persist([item,...requests]);Alert.alert('Solicitud creada',`${item.id}\nValor del servicio: ${money(item.serviceCost)}`,[
    {text:'Volver',onPress:back},{text:'Abrir WhatsApp',onPress:()=>Linking.openURL(`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(whatsappText(item))}`).catch(()=>Alert.alert('WhatsApp no disponible','La solicitud quedó guardada.'))},
  ]);};
  const update=(id,patch)=>persist(requests.map(item=>item.id===id?{...item,...patch}:item));
  const changeRole=next=>{setRole(next);setScreen('home');};
  const body=useMemo(()=>{if(!ready)return <View style={s.loading}><Text style={s.bold}>Cargando GOY XPRESS…</Text></View>;
    if(role==='admin')return <Admin requests={requests} update={update}/>; if(role==='courier')return <Courier requests={requests} update={update}/>;
    if(screen==='shipment')return <ShipmentForm save={save} back={()=>setScreen('home')}/>; if(screen==='procedure')return <ProcedureForm save={save} back={()=>setScreen('home')}/>;
    return <Home requests={requests} open={setScreen}/>;},[ready,role,screen,requests]);
  return <SafeAreaView style={s.safe}><StatusBar style="light" backgroundColor={C.navy}/><Header/><RoleBar role={role} setRole={changeRole}/>{body}</SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},loading:{flex:1,alignItems:'center',justifyContent:'center'},
  header:{backgroundColor:C.navy,minHeight:78,flexDirection:'row',alignItems:'center',paddingHorizontal:14,paddingVertical:10},logo:{width:54,height:54,borderRadius:10,marginRight:10},headerTitle:{color:C.white,fontSize:20,fontWeight:'900'},headerSub:{color:'#C7D7DF',fontSize:11,marginTop:2},version:{color:C.lime,fontSize:11,fontWeight:'900'},
  roleBar:{flexDirection:'row',backgroundColor:C.white,padding:7,borderBottomWidth:1,borderBottomColor:C.line},roleButton:{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',borderRadius:10},roleButtonActive:{backgroundColor:C.navy},roleText:{color:C.navy,fontWeight:'800',fontSize:12},roleTextActive:{color:C.white},
  page:{padding:16,paddingBottom:50},h1:{fontSize:26,fontWeight:'900',color:C.navy,marginBottom:5},subtitle:{color:C.muted,lineHeight:20,marginBottom:16},section:{fontSize:18,fontWeight:'900',color:C.navy,marginTop:22,marginBottom:10},sectionInCard:{fontSize:17,fontWeight:'900',color:C.navy,marginBottom:8},card:{backgroundColor:C.white,padding:15,borderRadius:15,borderWidth:1,borderColor:C.line,marginBottom:12},
  bigAction:{minHeight:92,borderRadius:16,padding:16,marginBottom:12,flexDirection:'row',alignItems:'center',overflow:'hidden'},bigIcon:{fontSize:34,color:C.white,fontWeight:'700',marginRight:13},bigTitle:{fontSize:19,color:C.white,fontWeight:'900'},bigSub:{fontSize:12,color:C.white,opacity:0.9,marginTop:3},bigArrow:{fontSize:35,color:C.white},
  button:{minHeight:50,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center',marginTop:9,overflow:'hidden',paddingHorizontal:12},buttonText:{color:C.white,fontSize:14,fontWeight:'900',textAlign:'center'},pressed:{opacity:0.65},disabled:{opacity:0.45},back:{alignSelf:'flex-start',minHeight:42,justifyContent:'center',marginBottom:6},backText:{color:C.blue,fontWeight:'900'},
  fieldWrap:{marginBottom:10},label:{fontSize:12,color:C.navy,fontWeight:'900',marginTop:8,marginBottom:6},input:{minHeight:50,borderWidth:1,borderColor:C.line,backgroundColor:'#FBFDFE',borderRadius:11,paddingHorizontal:12,color:C.ink,fontSize:15},multiline:{minHeight:82,paddingTop:12,textAlignVertical:'top'},
  chips:{flexDirection:'row',flexWrap:'wrap',marginHorizontal:-3,marginBottom:5},chip:{minHeight:43,justifyContent:'center',borderWidth:1,borderColor:C.line,backgroundColor:C.white,borderRadius:22,paddingHorizontal:13,margin:3,overflow:'hidden'},chipSelected:{backgroundColor:C.navy,borderColor:C.navy},chipText:{color:C.navy,fontSize:12,fontWeight:'800'},chipTextSelected:{color:C.white},
  row:{minHeight:42,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:C.line},listLine:{flexDirection:'row',alignItems:'center'},bold:{color:C.ink,fontWeight:'900'},muted:{color:C.muted,fontSize:12,lineHeight:18},price:{color:C.green,fontWeight:'900',marginTop:7},total:{color:C.green,fontSize:18,fontWeight:'900'},
});
