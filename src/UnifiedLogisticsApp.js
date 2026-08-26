import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Picker} from '@react-native-picker/picker';
import {StatusBar} from 'expo-status-bar';

import {
  DepositServiceForm,
  DiverseServiceForm,
  CourierJobTools,
} from './LogisticsV33Screens';
import {createLogisticsRequest, respondToQuote} from './logisticsApi';

const {
  REQUEST_KIND,
  REQUEST_STATUS,
  calculateCollectTotal,
  calculateDeliveryPrice,
  calculateExecutivePrice,
  createCode,
  nonNegativeNumber,
} = require('./domain');

const ADMIN_WHATSAPP = '593997729964';
const STORE = 'goy_v33_requests';
const PRESET_SHIPMENT = 'goy_v33_preset_shipment';
const PRESET_PROCEDURE = 'goy_v33_preset_procedure';
const C = {
  navy:'#071F2D',
  navy2:'#0B2F40',
  cyan:'#00A9E8',
  cyanSoft:'#E9F9FE',
  green:'#38A844',
  greenSoft:'#EAF8ED',
  lime:'#B6D532',
  amber:'#F5B940',
  red:'#C64A4A',
  bg:'#F1F6F8',
  white:'#FFFFFF',
  ink:'#152934',
  muted:'#6B7E88',
  line:'#DCE8ED',
};

const money = value => `$${Number(value || 0).toFixed(2)}`;
const statusLabel = value => ({pending:'Pendiente',quoted:'Cotizado',accepted:'Aceptado',assigned:'Asignado',pickedUp:'Recogido',onRoute:'En camino',finished:'Finalizado',cancelled:'Cancelado'}[value] || value || 'Pendiente');
const serviceLabel = kind => ({shipment:'Entrega',procedure:'Trámite',deposit:'Depósito',diverse:'Servicio diverso'}[kind] || 'Servicio');

function Field({label,multiline,...props}) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput {...props} multiline={multiline} placeholderTextColor="#8EA0A9" style={[s.input,multiline&&s.multiline]}/></View>;
}
function Button({title,onPress,kind='blue',disabled=false,compact=false}) {
  return <Pressable disabled={disabled} onPress={onPress} style={({pressed})=>[
    s.button,
    kind==='green'&&s.green,
    kind==='navy'&&s.navyButton,
    kind==='light'&&s.lightButton,
    kind==='danger'&&s.danger,
    compact&&s.buttonCompact,
    disabled&&s.disabled,
    pressed&&s.pressed,
  ]}><Text style={[s.buttonText,kind==='light'&&s.buttonTextDark]}>{title}</Text></Pressable>;
}
function Card({children,style}) {return <View style={[s.card,style]}>{children}</View>;}

function Logo3D({compact=false}) {
  const float = useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    const loop=Animated.loop(Animated.sequence([
      Animated.timing(float,{toValue:1,duration:1800,useNativeDriver:true}),
      Animated.timing(float,{toValue:0,duration:1800,useNativeDriver:true}),
    ]));
    loop.start();
    return()=>loop.stop();
  },[float]);
  const translateY=float.interpolate({inputRange:[0,1],outputRange:[0,-5]});
  const rotate=float.interpolate({inputRange:[0,1],outputRange:['-1deg','1deg']});
  return <Animated.View style={[compact?s.logoShellCompact:s.logoShell,{transform:[{translateY},{rotate}]}]}>
    <View style={s.logoGlow}/>
    <Image source={require('../assets/goy-logo.jpg')} style={compact?s.logoCompact:s.logo}/>
  </Animated.View>;
}

function StatusBadge({status}) {
  const normalized=statusLabel(status);
  const done=normalized==='Finalizado';
  const route=normalized==='En camino'||normalized==='Recogido';
  const color=done?C.green:route?C.cyan:normalized==='Cancelado'?C.red:C.amber;
  return <View style={[s.statusBadge,{backgroundColor:`${color}18`}]}><View style={[s.statusDot,{backgroundColor:color}]}/><Text style={[s.statusText,{color}]}>{normalized}</Text></View>;
}

function ServiceAction({icon,title,subtitle,onPress,tone='cyan'}) {
  const bg=tone==='green'?C.green:tone==='navy'?C.navy2:tone==='lime'?'#6E861B':C.cyan;
  return <Pressable onPress={onPress} style={({pressed})=>[s.serviceAction,{backgroundColor:bg},pressed&&s.pressed]}>
    <View style={s.serviceIconBubble}><Text style={s.serviceIcon}>{icon}</Text></View>
    <Text style={s.serviceTitle}>{title}</Text>
    <Text style={s.serviceSub}>{subtitle}</Text>
    <Text style={s.serviceArrow}>›</Text>
  </Pressable>;
}

async function saveCredential(entry) {
  const raw = await AsyncStorage.getItem(STORE);
  const list = raw ? JSON.parse(raw) : [];
  const next = [entry, ...list.filter(x => x.code !== entry.code)].slice(0, 100);
  await AsyncStorage.setItem(STORE, JSON.stringify(next));
  return next;
}

async function notifyAdmin(request, secret) {
  const text = [
    'GOY XPRESS - NUEVA SOLICITUD',
    `Código: ${request.code}`,
    `Servicio: ${serviceLabel(request.kind)}`,
    `Cliente: ${request.customer || '-'}`,
    `Valor: ${money(request.serviceCost)}`,
    '',
    'Acceso privado para mensajero asignado:',
    secret,
  ].join('\n');
  try { await Linking.openURL(`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(text)}`); } catch {}
}

function ShipmentForm({customer,phone,onDone,onCancel}) {
  const [mode,setMode]=useState('scheduled');
  const [origin,setOrigin]=useState('');
  const [recipient,setRecipient]=useState('');
  const [destination,setDestination]=useState('');
  const [distance,setDistance]=useState('5');
  const [productValue,setProductValue]=useState('0');
  const [cod,setCod]=useState(true);
  const [payer,setPayer]=useState('recipient');
  const [notes,setNotes]=useState('');
  const [savePreset,setSavePreset]=useState(false);
  const pricing=useMemo(()=>calculateDeliveryPrice(mode,distance),[mode,distance]);
  const collect=useMemo(()=>calculateCollectTotal({productValue,deliveryCost:pricing.total,cashOnDelivery:cod,deliveryPayer:payer}),[productValue,pricing.total,cod,payer]);
  useEffect(()=>{AsyncStorage.getItem(PRESET_SHIPMENT).then(raw=>{if(!raw)return;try{const p=JSON.parse(raw);setMode(p.mode||'scheduled');setOrigin(p.origin||'');setDestination(p.destination||'');setDistance(String(p.distance||5));setNotes(p.notes||'');}catch{}})},[]);
  const submit=async()=>{
    if(!origin.trim()||!recipient.trim()||!destination.trim()){Alert.alert('Faltan datos','Completa origen, destinatario y dirección.');return;}
    if(!pricing.eligible){Alert.alert('Revisa la distancia',mode==='scheduled'?'La entrega programada aplica hasta 5 km.':'Ingresa una distancia válida.');return;}
    const request={code:createCode(REQUEST_KIND.shipment),kind:REQUEST_KIND.shipment,deliveryMode:mode,customer,phone,originAddress:origin.trim(),recipient:recipient.trim(),destinationAddress:destination.trim(),distanceKm:pricing.distanceKm,productValue:nonNegativeNumber(productValue),cashOnDelivery:cod,deliveryPayer:payer,notes:notes.trim(),baseServiceCost:pricing.total,serviceCost:pricing.total,totalToCollect:collect,status:REQUEST_STATUS.pending,createdAt:new Date().toISOString()};
    if(savePreset) await AsyncStorage.setItem(PRESET_SHIPMENT,JSON.stringify({mode,origin,destination,distance,notes}));
    onDone(request);
  };
  return <Card style={s.formCard}>
    <View style={s.formHead}><View><Text style={s.kicker}>NUEVA ENTREGA</Text><Text style={s.title}>Programada o Express</Text></View><Text style={s.formIcon}>↗</Text></View>
    <View style={s.segment}><Button title="Programada" kind={mode==='scheduled'?'green':'light'} onPress={()=>setMode('scheduled')}/><Button title="Express" kind={mode==='express'?'green':'light'} onPress={()=>setMode('express')}/></View>
    <Field label="Punto de retiro" value={origin} onChangeText={setOrigin}/><Field label="Destinatario" value={recipient} onChangeText={setRecipient}/><Field label="Dirección de entrega" value={destination} onChangeText={setDestination} multiline/><Field label="Distancia km" value={distance} onChangeText={setDistance} keyboardType="decimal-pad"/><Field label="Valor producto" value={productValue} onChangeText={setProductValue} keyboardType="decimal-pad"/>
    <Text style={s.label}>Quién paga el envío</Text><View style={s.segment}><Button title="Destinatario" kind={payer==='recipient'?'navy':'light'} onPress={()=>setPayer('recipient')}/><Button title="Remitente" kind={payer==='sender'?'navy':'light'} onPress={()=>setPayer('sender')}/></View>
    <View style={s.switchRow}><View><Text style={s.switchTitle}>Cobro contra entrega</Text><Text style={s.noteMini}>Sin comisión de cobranza</Text></View><Switch value={cod} onValueChange={setCod} trackColor={{false:'#C6D2D8',true:'#8FD399'}} thumbColor={cod?C.green:'#fff'}/></View>
    <Field label="Indicaciones" value={notes} onChangeText={setNotes} multiline/>
    <View style={s.switchRow}><Text style={s.switchTitle}>Guardar como predeterminado</Text><Switch value={savePreset} onValueChange={setSavePreset}/></View>
    <View style={s.totalBox}><Text style={s.totalLabel}>Valor del servicio</Text><Text style={s.totalValue}>{money(pricing.total)}</Text><Text style={s.totalHint}>Cobrar al destinatario: {money(collect)}</Text></View>
    <Button title="Crear entrega" kind="green" onPress={submit}/><Button title="Volver" kind="light" onPress={onCancel}/>
  </Card>;
}

function ProcedureForm({customer,phone,onDone,onCancel}) {
  const [type,setType]=useState('Ingreso de documentos');
  const [institution,setInstitution]=useState('');
  const [address,setAddress]=useState('');
  const [minutes,setMinutes]=useState('40');
  const [amount,setAmount]=useState('0');
  const [details,setDetails]=useState('');
  const [savePreset,setSavePreset]=useState(false);
  const pricing=useMemo(()=>calculateExecutivePrice(minutes),[minutes]);
  useEffect(()=>{AsyncStorage.getItem(PRESET_PROCEDURE).then(raw=>{if(!raw)return;try{const p=JSON.parse(raw);setType(p.type||type);setInstitution(p.institution||'');setAddress(p.address||'');setDetails(p.details||'');}catch{}})},[]);
  const submit=async()=>{
    if(!institution.trim()||!address.trim()){Alert.alert('Faltan datos','Completa institución y dirección.');return;}
    const request={code:createCode(REQUEST_KIND.procedure),kind:REQUEST_KIND.procedure,procedureType:type,customer,phone,institution:institution.trim(),destinationAddress:address.trim(),waitMinutes:pricing.requestedMinutes,amountToHandle:nonNegativeNumber(amount),details:details.trim(),baseServiceCost:pricing.total,serviceCost:pricing.total,totalToCollect:0,status:REQUEST_STATUS.pending,createdAt:new Date().toISOString()};
    if(savePreset) await AsyncStorage.setItem(PRESET_PROCEDURE,JSON.stringify({type,institution,address,details}));
    onDone(request);
  };
  return <Card style={s.formCard}>
    <View style={s.formHead}><View><Text style={s.kicker}>MENSAJERÍA EJECUTIVA</Text><Text style={s.title}>Trámite</Text></View><Text style={s.formIcon}>✓</Text></View>
    <View style={s.priceBanner}><Text style={s.priceBannerBig}>{money(pricing.total)}</Text><Text style={s.priceBannerText}>$6.50 hasta 40 min + $0.10 por minuto adicional</Text></View>
    <View style={s.picker}><Picker selectedValue={type} onValueChange={setType}><Picker.Item label="Ingreso de documentos" value="Ingreso de documentos"/><Picker.Item label="Retiro de documentos" value="Retiro de documentos"/><Picker.Item label="Pago de servicios" value="Pago de servicios"/><Picker.Item label="Gestión institucional" value="Gestión institucional"/></Picker></View>
    <Field label="Institución" value={institution} onChangeText={setInstitution}/><Field label="Dirección" value={address} onChangeText={setAddress} multiline/><Field label="Tiempo estimado min" value={minutes} onChangeText={setMinutes} keyboardType="number-pad"/><Field label="Valor a manejar" value={amount} onChangeText={setAmount} keyboardType="decimal-pad"/><Field label="Instrucciones" value={details} onChangeText={setDetails} multiline/>
    <View style={s.switchRow}><Text style={s.switchTitle}>Guardar como predeterminado</Text><Switch value={savePreset} onValueChange={setSavePreset}/></View>
    <Button title="Crear trámite" kind="green" onPress={submit}/><Button title="Volver" kind="light" onPress={onCancel}/>
  </Card>;
}

function RequestMiniCard({entry,onQuote}) {
  const request=entry.request||{};
  return <Card style={s.requestCard}>
    <View style={s.requestTop}><View style={s.flexOne}><Text style={s.code}>{entry.code}</Text><Text style={s.requestService}>{serviceLabel(entry.kind)}</Text></View><StatusBadge status={request.status}/></View>
    <View style={s.requestLine}/>
    <Text style={s.requestAddress}>{request.destinationAddress||request.bank||request.institution||'Sin dirección registrada'}</Text>
    <View style={s.requestBottom}><Text style={s.amount}>{money(request.serviceCost)}</Text><Text style={s.requestDate}>{new Date(entry.createdAt||Date.now()).toLocaleDateString('es-EC')}</Text></View>
    {entry.kind==='diverse'&&!["Aceptado","Cancelado"].includes(request.status)?<View style={s.segment}><Button title="Aceptar" kind="green" compact onPress={()=>onQuote(entry,'accepted')}/><Button title="Rechazar" kind="danger" compact onPress={()=>onQuote(entry,'rejected')}/></View>:null}
  </Card>;
}

function ClientPortal() {
  const [customer,setCustomer]=useState('');
  const [phone,setPhone]=useState('');
  const [screen,setScreen]=useState('home');
  const [records,setRecords]=useState([]);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{AsyncStorage.getItem(STORE).then(raw=>{if(raw)try{setRecords(JSON.parse(raw));}catch{}})},[]);
  const activeCount=records.filter(r=>!['Finalizado','Cancelado','finished','cancelled'].includes(r.request?.status)).length;
  const create=async request=>{
    if(!customer.trim()||String(phone).replace(/\D/g,'').length<9){Alert.alert('Datos del cliente','Ingresa nombre/negocio y WhatsApp válido.');return;}
    setBusy(true);
    try{
      const result=await createLogisticsRequest({...request,customer:customer.trim(),phone:phone.trim()});
      if(!result.accessSecret) throw new Error('El servidor no devolvió acceso privado.');
      const next=await saveCredential({code:request.code,secret:result.accessSecret,kind:request.kind,createdAt:new Date().toISOString(),request:result.request});
      setRecords(next);setScreen('home');
      Alert.alert('Solicitud registrada',`${request.code}\nValor: ${money(result.request?.serviceCost)}`);
      await notifyAdmin(result.request||request,result.accessSecret);
    }catch(e){Alert.alert('No se pudo registrar',e.message);}finally{setBusy(false);}
  };
  const answerQuote=async(entry,response)=>{try{const updated=await respondToQuote(entry.code,entry.secret,response);const next=records.map(x=>x.code===entry.code?{...x,request:updated}:x);setRecords(next);await AsyncStorage.setItem(STORE,JSON.stringify(next));Alert.alert('Cotización',response==='accepted'?'Cotización aceptada.':'Cotización rechazada.');}catch(e){Alert.alert('No se pudo responder',e.message);}};
  if(screen==='shipment') return <ScrollView contentContainerStyle={s.page}><ShipmentForm customer={customer} phone={phone} onDone={create} onCancel={()=>setScreen('home')}/></ScrollView>;
  if(screen==='procedure') return <ScrollView contentContainerStyle={s.page}><ProcedureForm customer={customer} phone={phone} onDone={create} onCancel={()=>setScreen('home')}/></ScrollView>;
  if(screen==='deposit') return <ScrollView contentContainerStyle={s.page}><DepositServiceForm customer={customer} phone={phone} onCreate={create} onCancel={()=>setScreen('home')}/></ScrollView>;
  if(screen==='diverse') return <ScrollView contentContainerStyle={s.page}><DiverseServiceForm customer={customer} phone={phone} onCreate={create} onCancel={()=>setScreen('home')}/></ScrollView>;
  return <ScrollView contentContainerStyle={s.page}>
    <View style={s.hero}>
      <View style={s.heroCopy}><Text style={s.heroKicker}>TU OPERACIÓN EN QUITO</Text><Text style={s.heroTitle}>Envía, controla y crece.</Text><Text style={s.heroText}>Solicita entregas y trámites desde una sola app.</Text></View><Logo3D/>
      <View style={s.orbitOne}/><View style={s.orbitTwo}/>
    </View>
    <View style={s.statRow}><Card style={s.statCard}><Text style={s.statValue}>{records.length}</Text><Text style={s.statLabel}>Solicitudes</Text></Card><Card style={s.statCard}><Text style={[s.statValue,{color:C.green}]}>{activeCount}</Text><Text style={s.statLabel}>En curso</Text></Card></View>
    <Card><Text style={s.kicker}>DATOS DEL CLIENTE</Text><Text style={s.title}>¿Quién solicita?</Text><Field label="Nombre / emprendimiento" value={customer} onChangeText={setCustomer}/><Field label="WhatsApp" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/></Card>
    <Text style={s.sectionTitle}>¿Qué necesitas hoy?</Text>
    <View style={s.serviceGrid}><ServiceAction icon="↗" title="Entrega" subtitle="Programada o Express" onPress={()=>setScreen('shipment')}/><ServiceAction icon="✓" title="Trámite" subtitle="Documentos y diligencias" tone="green" onPress={()=>setScreen('procedure')}/><ServiceAction icon="$" title="Depósito" subtitle="Cheques o efectivo" tone="navy" onPress={()=>setScreen('deposit')}/><ServiceAction icon="✦" title="Otro servicio" subtitle="Solicita una cotización" tone="lime" onPress={()=>setScreen('diverse')}/></View>
    {busy?<View style={s.busy}><View style={s.onlineDot}/><Text style={s.busyText}>Registrando solicitud…</Text></View>:null}
    <View style={s.sectionHead}><Text style={s.sectionTitle}>Últimas solicitudes</Text><Text style={s.sectionHint}>Seguimiento</Text></View>
    {records.length===0?<Card style={s.empty}><Text style={s.emptyIcon}>◎</Text><Text style={s.title}>Todo listo para comenzar</Text><Text style={s.note}>Tu primera solicitud aparecerá aquí con su estado.</Text></Card>:records.map(r=><RequestMiniCard key={r.code} entry={r} onQuote={answerQuote}/>) }
  </ScrollView>;
}

function CourierPortal() {
  const [code,setCode]=useState('');
  const [secret,setSecret]=useState('');
  const [kind,setKind]=useState('shipment');
  const [active,setActive]=useState(false);
  const [request,setRequest]=useState(null);
  if(active){const req=request||{code,kind,totalToCollect:0,serviceCost:0};return <ScrollView contentContainerStyle={s.page}>
    <View style={s.courierHero}><View><Text style={s.heroKicker}>MENSAJERO EN LÍNEA</Text><Text style={s.courierHeroTitle}>{code}</Text><Text style={s.heroText}>Actualiza la operación paso a paso.</Text></View><View style={s.onlineOrb}><View style={s.onlineDot}/><Text style={s.onlineOrbText}>Activo</Text></View></View>
    <CourierJobTools request={req} secret={secret} onUpdated={setRequest}/><Button title="Cambiar solicitud" kind="light" onPress={()=>{setActive(false);setRequest(null)}}/>
  </ScrollView>}
  return <ScrollView contentContainerStyle={s.page}>
    <View style={s.courierWelcome}><View style={s.courierWelcomeLogo}><Logo3D compact/></View><Text style={s.heroKicker}>CENTRO OPERATIVO MÓVIL</Text><Text style={s.heading}>Tu ruta, clara y bajo control.</Text><Text style={s.note}>Ingresa los datos enviados por administración para abrir la solicitud asignada.</Text></View>
    <Card style={s.accessCard}><Text style={s.kicker}>ACCESO SEGURO</Text><Text style={s.title}>Abrir asignación</Text><Field label="Código de solicitud" value={code} onChangeText={setCode} autoCapitalize="characters"/><Field label="Acceso privado" value={secret} onChangeText={setSecret} secureTextEntry/><Text style={s.label}>Tipo de servicio</Text><View style={s.picker}><Picker selectedValue={kind} onValueChange={setKind}><Picker.Item label="Entrega" value="shipment"/><Picker.Item label="Trámite" value="procedure"/><Picker.Item label="Depósito" value="deposit"/><Picker.Item label="Servicio diverso" value="diverse"/></Picker></View><Button title="Abrir operación" kind="green" onPress={()=>{if(!code.trim()||!secret.trim()){Alert.alert('Faltan datos','Ingresa código y acceso privado.');return;}setActive(true)}}/></Card>
    <View style={s.tipRow}><View style={s.tipIcon}><Text style={s.tipIconText}>GPS</Text></View><View style={s.flexOne}><Text style={s.tipTitle}>Seguimiento integrado</Text><Text style={s.noteMini}>La ubicación y evidencias quedan disponibles para administración.</Text></View></View>
  </ScrollView>;
}

export default function UnifiedLogisticsApp(){
  const [role,setRole]=useState('client');
  return <SafeAreaView style={s.safe}><StatusBar style="light" backgroundColor={C.navy}/>
    <View style={s.header}><View style={s.brandRow}><Logo3D compact/><View style={s.brandCopy}><Text style={s.brand}>GOY XPRESS</Text><Text style={s.headerSub}>{role==='client'?'Cliente conectado':'Mensajero conectado'}</Text></View></View><View style={s.roleRow}><Pressable onPress={()=>setRole('client')} style={({pressed})=>[s.role,role==='client'&&s.roleActive,pressed&&s.pressed]}><Text style={[s.roleText,role==='client'&&s.roleTextActive]}>Cliente</Text></Pressable><Pressable onPress={()=>setRole('courier')} style={({pressed})=>[s.role,role==='courier'&&s.roleActive,pressed&&s.pressed]}><Text style={[s.roleText,role==='courier'&&s.roleTextActive]}>Mensajero</Text></Pressable></View></View>
    {role==='client'?<ClientPortal/>:<CourierPortal/>}
  </SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},flexOne:{flex:1},pressed:{opacity:.82,transform:[{scale:.985}]},
  header:{backgroundColor:C.navy,paddingHorizontal:14,paddingVertical:11,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#174557'},
  brandRow:{flexDirection:'row',alignItems:'center'},brandCopy:{marginLeft:9},brand:{color:C.white,fontWeight:'900',fontSize:17,letterSpacing:.2},headerSub:{color:'#AFC9D4',fontSize:10,marginTop:1},
  logoShell:{width:116,height:116,alignItems:'center',justifyContent:'center'},logoShellCompact:{width:43,height:43,alignItems:'center',justifyContent:'center'},logoGlow:{position:'absolute',width:'90%',height:'90%',borderRadius:999,backgroundColor:'#1CBCEC33',shadowColor:C.cyan,shadowOpacity:.65,shadowRadius:18,elevation:8},logo:{width:92,height:92,borderRadius:25,borderWidth:2,borderColor:'#FFFFFF88'},logoCompact:{width:38,height:38,borderRadius:11,borderWidth:1,borderColor:'#FFFFFF66'},
  roleRow:{flexDirection:'row',gap:6,backgroundColor:'#113747',padding:3,borderRadius:13},role:{paddingHorizontal:10,paddingVertical:7,borderRadius:10},roleActive:{backgroundColor:C.white},roleText:{color:'#BFD4DE',fontSize:11,fontWeight:'800'},roleTextActive:{color:C.navy},
  page:{padding:15,paddingBottom:50},hero:{minHeight:190,backgroundColor:C.navy2,borderRadius:24,padding:18,marginBottom:14,overflow:'hidden',flexDirection:'row',alignItems:'center'},heroCopy:{flex:1,zIndex:3},heroKicker:{color:'#8DE5FF',fontSize:10,fontWeight:'900',letterSpacing:1.1},heroTitle:{color:C.white,fontSize:29,fontWeight:'900',lineHeight:31,marginTop:5},heroText:{color:'#C6DCE5',fontSize:12,lineHeight:17,marginTop:8,maxWidth:220},orbitOne:{position:'absolute',width:180,height:180,borderWidth:1,borderColor:'#58D5FF33',borderRadius:999,right:-45,top:5},orbitTwo:{position:'absolute',width:125,height:125,borderWidth:1,borderColor:'#58D5FF44',borderRadius:999,right:-12,top:32},
  courierWelcome:{alignItems:'center',paddingTop:5,paddingBottom:12},courierWelcomeLogo:{height:94,justifyContent:'center'},courierHero:{backgroundColor:C.navy2,borderRadius:22,padding:18,marginBottom:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},courierHeroTitle:{color:C.white,fontSize:24,fontWeight:'900',marginTop:5},onlineOrb:{backgroundColor:'#FFFFFF16',borderWidth:1,borderColor:'#FFFFFF2D',borderRadius:16,paddingHorizontal:12,paddingVertical:9,flexDirection:'row',alignItems:'center'},onlineOrbText:{color:C.white,fontWeight:'900',fontSize:11,marginLeft:6},onlineDot:{width:8,height:8,borderRadius:4,backgroundColor:C.green},
  statRow:{flexDirection:'row',gap:10},statCard:{flex:1,marginVertical:0,marginBottom:14,minHeight:82,justifyContent:'center'},statValue:{fontSize:25,fontWeight:'900',color:C.cyan},statLabel:{fontSize:11,color:C.muted,fontWeight:'700',marginTop:2},
  kicker:{color:C.cyan,fontWeight:'900',fontSize:10,letterSpacing:1},heading:{fontSize:27,fontWeight:'900',color:C.ink,lineHeight:30,marginTop:5,marginBottom:8,textAlign:'center'},sectionTitle:{fontSize:18,fontWeight:'900',color:C.ink,marginTop:8,marginBottom:9},sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},sectionHint:{color:C.cyan,fontSize:11,fontWeight:'900'},
  card:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:18,padding:15,marginVertical:7,shadowColor:C.navy,shadowOpacity:.06,shadowRadius:10,shadowOffset:{width:0,height:4},elevation:2},formCard:{borderRadius:22},title:{fontSize:19,fontWeight:'900',color:C.ink,marginTop:3,marginBottom:5},note:{color:C.muted,lineHeight:18,marginVertical:5,fontSize:12},noteMini:{color:C.muted,fontSize:10,lineHeight:14},
  field:{marginTop:10},label:{fontSize:12,color:C.ink,fontWeight:'800',marginBottom:5},input:{borderWidth:1,borderColor:'#CCDCE3',borderRadius:12,paddingHorizontal:12,paddingVertical:11,backgroundColor:'#FBFDFE',color:C.ink,minHeight:46},multiline:{minHeight:78,textAlignVertical:'top'},
  button:{backgroundColor:C.cyan,borderRadius:12,paddingHorizontal:12,paddingVertical:12,alignItems:'center',justifyContent:'center',marginTop:9,flex:1,minHeight:46},buttonCompact:{minHeight:40,paddingVertical:9},green:{backgroundColor:C.green},navyButton:{backgroundColor:C.navy2},danger:{backgroundColor:C.red},lightButton:{backgroundColor:'#EEF5F7',borderWidth:1,borderColor:C.line},disabled:{opacity:.5},buttonText:{color:C.white,fontWeight:'900',textAlign:'center',fontSize:13},buttonTextDark:{color:C.navy2},segment:{flexDirection:'row',gap:8},
  switchRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:12,paddingVertical:9,borderTopWidth:1,borderTopColor:C.line},switchTitle:{color:C.ink,fontSize:12,fontWeight:'900'},picker:{borderWidth:1,borderColor:C.line,borderRadius:12,backgroundColor:'#FBFDFE',overflow:'hidden',marginTop:9},
  formHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},formIcon:{fontSize:29,color:C.cyan,fontWeight:'900'},priceBanner:{backgroundColor:C.greenSoft,borderRadius:14,padding:13,marginVertical:10},priceBannerBig:{color:C.green,fontWeight:'900',fontSize:27},priceBannerText:{color:'#4B7651',fontSize:11,marginTop:2},totalBox:{backgroundColor:C.cyanSoft,borderRadius:14,padding:13,marginTop:13},totalLabel:{fontSize:10,color:C.muted,fontWeight:'800'},totalValue:{fontSize:26,color:C.navy2,fontWeight:'900',marginTop:2},totalHint:{fontSize:11,color:C.green,fontWeight:'800',marginTop:3},
  serviceGrid:{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:8},serviceAction:{width:'48%',minHeight:145,borderRadius:19,padding:14,overflow:'hidden'},serviceIconBubble:{width:39,height:39,borderRadius:13,backgroundColor:'#FFFFFF22',alignItems:'center',justifyContent:'center'},serviceIcon:{color:C.white,fontSize:22,fontWeight:'900'},serviceTitle:{color:C.white,fontSize:17,fontWeight:'900',marginTop:10},serviceSub:{color:'#DFF2F7',fontSize:10,lineHeight:14,marginTop:4,maxWidth:'85%'},serviceArrow:{position:'absolute',right:12,bottom:9,color:'#FFFFFF88',fontSize:29},
  busy:{flexDirection:'row',alignItems:'center',backgroundColor:C.white,borderRadius:12,padding:11,marginBottom:8},busyText:{marginLeft:8,color:C.navy2,fontWeight:'800',fontSize:11},
  requestCard:{padding:14},requestTop:{flexDirection:'row',alignItems:'center'},code:{fontWeight:'900',fontSize:14,color:C.navy2},requestService:{color:C.cyan,fontWeight:'800',fontSize:10,marginTop:2},statusBadge:{flexDirection:'row',alignItems:'center',paddingHorizontal:8,paddingVertical:6,borderRadius:12},statusDot:{width:6,height:6,borderRadius:3,marginRight:5},statusText:{fontSize:9,fontWeight:'900'},requestLine:{height:1,backgroundColor:C.line,marginVertical:10},requestAddress:{color:C.muted,fontSize:11,lineHeight:16},requestBottom:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:10},amount:{color:C.green,fontSize:16,fontWeight:'900'},requestDate:{color:'#92A3AB',fontSize:9},
  empty:{alignItems:'center',paddingVertical:25},emptyIcon:{fontSize:35,color:'#A8BBC3'},accessCard:{marginTop:5},tipRow:{flexDirection:'row',alignItems:'center',backgroundColor:C.white,borderRadius:16,padding:13,marginTop:9,borderWidth:1,borderColor:C.line},tipIcon:{width:44,height:44,borderRadius:13,backgroundColor:C.cyanSoft,alignItems:'center',justifyContent:'center',marginRight:10},tipIconText:{color:C.cyan,fontWeight:'900',fontSize:10},tipTitle:{color:C.ink,fontWeight:'900',fontSize:13},
});
