import React, {useEffect, useMemo, useState} from 'react';
import {
  Alert,
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
  PRICING,
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
const C = {navy:'#0B2F40',blue:'#00A9E8',green:'#38A844',red:'#C64A4A',bg:'#F3F7F9',white:'#fff',ink:'#17242D',muted:'#687984',line:'#DCE6EB'};

const money = value => `$${Number(value || 0).toFixed(2)}`;
function Field({label,multiline,...props}) {return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput {...props} multiline={multiline} style={[s.input,multiline&&s.multiline]}/></View>}
function Button({title,onPress,kind='blue',disabled=false}) {return <Pressable disabled={disabled} onPress={onPress} style={[s.button,kind==='green'&&s.green,kind==='danger'&&s.danger,disabled&&s.disabled]}><Text style={s.buttonText}>{title}</Text></Pressable>}
function Card({children}) {return <View style={s.card}>{children}</View>}

async function saveCredential(entry) {
  const raw = await AsyncStorage.getItem(STORE);
  const list = raw ? JSON.parse(raw) : [];
  const next = [entry, ...list.filter(x => x.code !== entry.code)].slice(0, 100);
  await AsyncStorage.setItem(STORE, JSON.stringify(next));
  return next;
}

async function notifyAdmin(request, secret) {
  const text = [
    'GOY XPRESS - NUEVA SOLICITUD v3.3',
    `Código: ${request.code}`,
    `Servicio: ${request.kind}`,
    `Cliente: ${request.customer || '-'}`,
    `Valor: ${money(request.serviceCost)}`,
    '',
    'Acceso privado para mensajero asignado:',
    secret,
    '',
    'No compartir este acceso fuera del equipo asignado.',
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
  return <Card><Text style={s.title}>Entrega programada / Express</Text><View style={s.row}><Button title="Programada" kind={mode==='scheduled'?'green':'blue'} onPress={()=>setMode('scheduled')}/><Button title="Express" kind={mode==='express'?'green':'blue'} onPress={()=>setMode('express')}/></View><Field label="Punto de retiro" value={origin} onChangeText={setOrigin}/><Field label="Destinatario" value={recipient} onChangeText={setRecipient}/><Field label="Dirección de entrega" value={destination} onChangeText={setDestination} multiline/><Field label="Distancia km" value={distance} onChangeText={setDistance} keyboardType="decimal-pad"/><Field label="Valor producto" value={productValue} onChangeText={setProductValue} keyboardType="decimal-pad"/><Text style={s.label}>Quién paga envío</Text><View style={s.row}><Button title="Destinatario" kind={payer==='recipient'?'green':'blue'} onPress={()=>setPayer('recipient')}/><Button title="Remitente" kind={payer==='sender'?'green':'blue'} onPress={()=>setPayer('sender')}/></View><View style={s.switchRow}><Text style={s.label}>Cobro contra entrega</Text><Switch value={cod} onValueChange={setCod}/></View><Field label="Indicaciones" value={notes} onChangeText={setNotes} multiline/><View style={s.switchRow}><Text style={s.label}>Guardar como predeterminado recurrente</Text><Switch value={savePreset} onValueChange={setSavePreset}/></View><Text style={s.total}>Servicio: {money(pricing.total)} · Cobrar: {money(collect)}</Text><Button title="Crear entrega" kind="green" onPress={submit}/><Button title="Volver" onPress={onCancel}/></Card>;
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
  return <Card><Text style={s.title}>Trámite / mensajería ejecutiva</Text><Text style={s.note}>$6.50 hasta 40 min + $0.10 por minuto adicional.</Text><View style={s.picker}><Picker selectedValue={type} onValueChange={setType}><Picker.Item label="Ingreso de documentos" value="Ingreso de documentos"/><Picker.Item label="Retiro de documentos" value="Retiro de documentos"/><Picker.Item label="Pago de servicios" value="Pago de servicios"/><Picker.Item label="Gestión institucional" value="Gestión institucional"/></Picker></View><Field label="Institución" value={institution} onChangeText={setInstitution}/><Field label="Dirección" value={address} onChangeText={setAddress} multiline/><Field label="Tiempo estimado min" value={minutes} onChangeText={setMinutes} keyboardType="number-pad"/><Field label="Valor a manejar" value={amount} onChangeText={setAmount} keyboardType="decimal-pad"/><Field label="Instrucciones" value={details} onChangeText={setDetails} multiline/><View style={s.switchRow}><Text style={s.label}>Guardar como predeterminado recurrente</Text><Switch value={savePreset} onValueChange={setSavePreset}/></View><Text style={s.total}>Tarifa estimada: {money(pricing.total)}</Text><Button title="Crear trámite" kind="green" onPress={submit}/><Button title="Volver" onPress={onCancel}/></Card>;
}

function ClientPortal() {
  const [customer,setCustomer]=useState('');
  const [phone,setPhone]=useState('');
  const [screen,setScreen]=useState('home');
  const [records,setRecords]=useState([]);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{AsyncStorage.getItem(STORE).then(raw=>{if(raw)try{setRecords(JSON.parse(raw));}catch{}})},[]);
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
  return <ScrollView contentContainerStyle={s.page}><Text style={s.eyebrow}>CLIENTE</Text><Text style={s.heading}>Solicita y controla tu logística</Text><Field label="Nombre / emprendimiento" value={customer} onChangeText={setCustomer}/><Field label="WhatsApp" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/><View style={s.grid}><Button title="Entrega programada / Express" onPress={()=>setScreen('shipment')}/><Button title="Trámite ejecutivo" kind="green" onPress={()=>setScreen('procedure')}/><Button title="Depósito" onPress={()=>setScreen('deposit')}/><Button title="Servicios diversos" kind="green" onPress={()=>setScreen('diverse')}/></View>{busy?<Text style={s.note}>Registrando solicitud…</Text>:null}<Text style={s.subtitle}>Solicitudes de este teléfono</Text>{records.length===0?<Card><Text style={s.note}>Aún no hay solicitudes.</Text></Card>:records.map(r=><Card key={r.code}><Text style={s.code}>{r.code}</Text><Text style={s.note}>{r.kind} · {r.request?.status||'Pendiente'} · {money(r.request?.serviceCost)}</Text>{r.kind==='diverse'&&!["Aceptado","Cancelado"].includes(r.request?.status)?<View style={s.row}><Button title="Aceptar cotización" kind="green" onPress={()=>answerQuote(r,'accepted')}/><Button title="Rechazar" kind="danger" onPress={()=>answerQuote(r,'rejected')}/></View>:null}</Card>)}</ScrollView>;
}

function CourierPortal() {
  const [code,setCode]=useState('');
  const [secret,setSecret]=useState('');
  const [kind,setKind]=useState('shipment');
  const [active,setActive]=useState(false);
  const [request,setRequest]=useState(null);
  if(active){const req=request||{code,kind,totalToCollect:0,serviceCost:0};return <ScrollView contentContainerStyle={s.page}><Text style={s.eyebrow}>MENSAJERO</Text><Text style={s.heading}>{code}</Text><CourierJobTools request={req} secret={secret} onUpdated={setRequest}/><Button title="Cambiar solicitud" onPress={()=>{setActive(false);setRequest(null)}}/></ScrollView>}
  return <ScrollView contentContainerStyle={s.page}><Text style={s.eyebrow}>MENSAJERO</Text><Text style={s.heading}>Acceso a solicitud asignada</Text><Text style={s.note}>Usa el código y acceso privado enviados por el administrador.</Text><Field label="Código de solicitud" value={code} onChangeText={setCode} autoCapitalize="characters"/><Field label="Acceso privado" value={secret} onChangeText={setSecret} secureTextEntry/><Text style={s.label}>Tipo de servicio</Text><View style={s.picker}><Picker selectedValue={kind} onValueChange={setKind}><Picker.Item label="Entrega" value="shipment"/><Picker.Item label="Trámite" value="procedure"/><Picker.Item label="Depósito" value="deposit"/><Picker.Item label="Servicio diverso" value="diverse"/></Picker></View><Button title="Abrir operación" kind="green" onPress={()=>{if(!code.trim()||!secret.trim()){Alert.alert('Faltan datos','Ingresa código y acceso privado.');return;}setActive(true)}}/></ScrollView>;
}

export default function UnifiedLogisticsApp(){
  const [role,setRole]=useState('client');
  return <SafeAreaView style={s.safe}><StatusBar style="light" backgroundColor={C.navy}/><View style={s.header}><View><Text style={s.brand}>GOY XPRESS</Text><Text style={s.headerSub}>Operación logística v3.3</Text></View><View style={s.roleRow}><Pressable onPress={()=>setRole('client')} style={[s.role,role==='client'&&s.roleActive]}><Text style={s.roleText}>Cliente</Text></Pressable><Pressable onPress={()=>setRole('courier')} style={[s.role,role==='courier'&&s.roleActive]}><Text style={s.roleText}>Mensajero</Text></Pressable></View></View>{role==='client'?<ClientPortal/>:<CourierPortal/>}</SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:C.bg},header:{backgroundColor:C.navy,padding:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{color:C.white,fontWeight:'900',fontSize:20},headerSub:{color:'#BFD4DE',fontSize:11,marginTop:2},roleRow:{flexDirection:'row',gap:6},role:{paddingHorizontal:10,paddingVertical:8,borderRadius:10,backgroundColor:'#244B5C'},roleActive:{backgroundColor:C.green},roleText:{color:C.white,fontSize:12,fontWeight:'800'},page:{padding:16,paddingBottom:50},eyebrow:{color:C.blue,fontWeight:'900',fontSize:12,letterSpacing:.8},heading:{fontSize:25,fontWeight:'900',color:C.ink,marginTop:4,marginBottom:10},subtitle:{fontSize:18,fontWeight:'900',color:C.ink,marginTop:22,marginBottom:8},card:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:16,padding:15,marginVertical:7},title:{fontSize:18,fontWeight:'900',color:C.ink,marginBottom:6},note:{color:C.muted,lineHeight:18,marginVertical:5},field:{marginTop:10},label:{fontSize:12,color:C.ink,fontWeight:'800',marginBottom:5},input:{borderWidth:1,borderColor:C.line,borderRadius:10,padding:11,backgroundColor:C.white,color:C.ink},multiline:{minHeight:78,textAlignVertical:'top'},button:{backgroundColor:C.blue,borderRadius:11,padding:12,alignItems:'center',marginTop:9,flex:1},green:{backgroundColor:C.green},danger:{backgroundColor:C.red},disabled:{opacity:.5},buttonText:{color:C.white,fontWeight:'900',textAlign:'center'},row:{flexDirection:'row',gap:8},grid:{marginTop:8},switchRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:12},picker:{borderWidth:1,borderColor:C.line,borderRadius:10,backgroundColor:C.white,overflow:'hidden'},total:{fontSize:16,fontWeight:'900',color:C.navy,marginTop:12},code:{fontWeight:'900',fontSize:16,color:C.navy}});
