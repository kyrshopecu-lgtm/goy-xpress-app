import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Alert, Linking, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {
  registerPickupEvidence,
  registerDeliveryEvidence,
  registerDepositEvidence,
  sendCurrentLocation,
  startLocationTracking,
  updateCourierWait,
  setWaitDecision,
  respondToQuote,
} from './logisticsApi';

const {calculateDepositPrice, calculateCourierWait} = require('./logisticsRules');
const {createCode, REQUEST_KIND, REQUEST_STATUS, nonNegativeNumber} = require('./domain');

const ADMIN_WHATSAPP = '593997729964';
const C = {navy:'#071F2D',navy2:'#0B2F40',blue:'#00A9E8',cyanSoft:'#E9F9FE',green:'#38A844',greenSoft:'#EAF8ED',red:'#C64A4A',bg:'#F1F6F8',line:'#DCE8ED',white:'#fff',ink:'#152934',muted:'#6B7E88',amber:'#F5B940'};

function Button({title,onPress,kind='blue',disabled=false}){
  return <Pressable disabled={disabled} onPress={onPress} style={({pressed})=>[s.button,kind==='green'&&s.green,kind==='navy'&&s.navyButton,kind==='light'&&s.light,kind==='danger'&&s.danger,disabled&&s.disabled,pressed&&s.pressed]}><Text style={[s.buttonText,kind==='light'&&s.buttonTextDark]}>{title}</Text></Pressable>;
}
function Field({label,multiline,...props}){return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput {...props} multiline={multiline} placeholderTextColor="#8EA0A9" style={[s.input,multiline&&s.multiline]}/></View>;}
function money(v){return `$${Number(v||0).toFixed(2)}`;}
function Header({eyebrow,title,icon}){return <View style={s.header}><View style={s.headerCopy}><Text style={s.eyebrow}>{eyebrow}</Text><Text style={s.title}>{title}</Text></View><View style={s.iconBubble}><Text style={s.icon}>{icon}</Text></View></View>}

function notifyAdminWhatsApp(message) {
  const url = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(message)}`;
  return Linking.openURL(url).catch(() => Alert.alert('WhatsApp', 'No se pudo abrir WhatsApp para enviar el aviso.'));
}

export function DepositServiceForm({customer='',phone='',onCreate,onCancel}){
  const [method,setMethod]=useState('checks');
  const [checkCount,setCheckCount]=useState('1');
  const [cashAmount,setCashAmount]=useState('0');
  const [bank,setBank]=useState('');
  const [details,setDetails]=useState('');
  const pricing=useMemo(()=>calculateDepositPrice({method,checkCount,cashAmount}),[method,checkCount,cashAmount]);
  const submit=()=>{
    if(!pricing.valid){Alert.alert('Depósito no permitido',pricing.error);return;}
    if(!bank.trim()){Alert.alert('Falta el banco','Indica el banco o institución donde se realizará el depósito.');return;}
    onCreate?.({code:createCode(REQUEST_KIND.deposit),kind:REQUEST_KIND.deposit,customer,phone,depositMethod:method,checkCount:method==='checks'?Math.max(0,Math.floor(nonNegativeNumber(checkCount))):0,cashAmount:method==='cash'?nonNegativeNumber(cashAmount):0,bank:bank.trim(),details:details.trim(),serviceCost:pricing.total,totalToCollect:0,status:REQUEST_STATUS.pending,settled:true,createdAt:new Date().toISOString()});
  };
  return <View style={s.card}>
    <Header eyebrow="SERVICIO FINANCIERO" title="Depósito bancario" icon="$"/>
    <View style={s.infoBanner}><Text style={s.infoStrong}>Tarifa clara</Text><Text style={s.infoText}>$3.50 hasta 3 cheques · $0.50 por cheque adicional · efectivo máximo $1.000</Text></View>
    <View style={s.row}><Button title="Cheques" kind={method==='checks'?'green':'light'} onPress={()=>setMethod('checks')}/><Button title="Efectivo" kind={method==='cash'?'green':'light'} onPress={()=>setMethod('cash')}/></View>
    {method==='checks'?<Field label="Cantidad de cheques" value={checkCount} onChangeText={setCheckCount} keyboardType="number-pad"/>:<Field label="Valor en efectivo" value={cashAmount} onChangeText={setCashAmount} keyboardType="decimal-pad"/>}
    <Field label="Banco / institución" value={bank} onChangeText={setBank}/><Field label="Indicaciones" value={details} onChangeText={setDetails} multiline/>
    <View style={s.totalBox}><Text style={s.totalLabel}>Tarifa estimada</Text><Text style={s.total}>{pricing.valid?money(pricing.total):pricing.error}</Text></View>
    <Button title="Crear depósito" kind="green" onPress={submit}/>{onCancel?<Button title="Volver" kind="light" onPress={onCancel}/>:null}
  </View>;
}

export function DiverseServiceForm({customer='',phone='',onCreate,onCancel}){
  const [description,setDescription]=useState('');
  const submit=()=>{
    if(description.trim().length<10){Alert.alert('Describe el servicio','Explica qué gestión necesitas para que GOY XPRESS pueda cotizarla.');return;}
    onCreate?.({code:createCode(REQUEST_KIND.diverse),kind:REQUEST_KIND.diverse,customer,phone,details:description.trim(),serviceCost:0,totalToCollect:0,status:REQUEST_STATUS.pending,quote:{status:'Pendiente de cotización'},createdAt:new Date().toISOString()});
  };
  return <View style={s.card}><Header eyebrow="SERVICIO PERSONALIZADO" title="Cuéntanos qué necesitas" icon="✦"/><Text style={s.note}>Describe la gestión. Administración enviará una cotización y el servicio solo comenzará después de tu aceptación.</Text><Field label="Detalle del servicio" value={description} onChangeText={setDescription} multiline/><Button title="Solicitar cotización" kind="green" onPress={submit}/>{onCancel?<Button title="Volver" kind="light" onPress={onCancel}/>:null}</View>;
}

export function QuoteDecision({request,secret,onUpdated}){
  if(request?.kind!=='diverse'||request?.quote?.status!=='Cotizado') return null;
  const respond=async response=>{try{const updated=await respondToQuote(request.code,secret,response);onUpdated?.(updated);}catch(e){Alert.alert('No se pudo responder',e.message);}};
  return <View style={s.card}><Header eyebrow="COTIZACIÓN" title="GOY XPRESS" icon="$"/><View style={s.quoteValue}><Text style={s.quoteAmount}>{money(request.quote.amount)}</Text><Text style={s.note}>{request.quote.note||'Cotización personalizada.'}</Text></View><View style={s.row}><Button title="Aceptar" kind="green" onPress={()=>respond('accepted')}/><Button title="Rechazar" kind="danger" onPress={()=>respond('rejected')}/></View></View>;
}

export function CourierWaitController({request,secret,onUpdated}){
  const [seconds,setSeconds]=useState(0);
  const [running,setRunning]=useState(false);
  useEffect(()=>{if(!running)return undefined;const id=setInterval(()=>setSeconds(x=>x+1),1000);return()=>clearInterval(id);},[running]);
  const minutes=Math.floor(seconds/60);
  const rule=calculateCourierWait(minutes);
  useEffect(()=>{if(!running||minutes===0)return;updateCourierWait(request.code,secret,minutes).then(onUpdated).catch(()=>undefined);},[minutes,running,request.code,secret,onUpdated]);
  const notifyAdmin=()=>notifyAdminWhatsApp(`GOY XPRESS - Novedad de espera\nSolicitud: ${request.code}\nSe cumplieron 10 minutos de espera. El mensajero requiere instrucción.`);
  const decide=async decision=>{try{const updated=await setWaitDecision(request.code,secret,decision);onUpdated?.(updated);if(decision==='withdraw')setRunning(false);}catch(e){Alert.alert('No se pudo registrar',e.message);}};
  return <View style={s.subcard}><View style={s.subcardHead}><Text style={s.subcardTitle}>Tiempo de espera</Text><View style={[s.liveDot,running&&s.liveDotActive]}/></View><Text style={s.timer}>{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</Text><Text style={s.note}>10 minutos incluidos. Después se agregan $0.10 por minuto.</Text><View style={s.waitCost}><Text style={s.waitLabel}>Recargo actual</Text><Text style={s.waitValue}>{money(rule.extraCost)}</Text></View>{!running?<Button title="Iniciar espera" kind="navy" onPress={()=>setRunning(true)}/>:<Button title="Pausar contador" kind="light" onPress={()=>setRunning(false)}/>} {rule.requiresDecision?<><Button title="Avisar novedad por WhatsApp" kind="green" onPress={notifyAdmin}/><View style={s.row}><Button title="Me retiro" kind="danger" onPress={()=>decide('withdraw')}/><Button title="Seguir esperando" kind="green" onPress={()=>decide('continue')}/></View></>:null}</View>;
}

export function CourierJobTools({request,secret,onUpdated}){
  const [tracking,setTracking]=useState(false);
  const stopTrackingRef=useRef(null);

  useEffect(()=>()=>{if(stopTrackingRef.current) stopTrackingRef.current();},[]);

  const run=async fn=>{try{const updated=await fn();if(updated)onUpdated?.(updated);return updated;}catch(e){Alert.alert('No se pudo completar',e.message);return null;}};

  const pickup=async()=>{
    const updated=await run(()=>registerPickupEvidence(request.code,secret));
    if(updated){await notifyAdminWhatsApp(`GOY XPRESS - Constancia de recogida\nSolicitud: ${request.code}\nEstado: Recogido\nLa fotografía de evidencia quedó registrada en el panel administrativo.`);}
  };

  const delivery=async()=>{
    const updated=await run(()=>registerDeliveryEvidence(request.code,secret));
    if(updated){if(stopTrackingRef.current){stopTrackingRef.current();stopTrackingRef.current=null;setTracking(false);}await notifyAdminWhatsApp(`GOY XPRESS - Entrega finalizada\nSolicitud: ${request.code}\nLa fotografía de entrega quedó registrada en el panel administrativo.`);}
  };

  const toggleTracking=async()=>{
    if(tracking){if(stopTrackingRef.current) stopTrackingRef.current();stopTrackingRef.current=null;setTracking(false);return;}
    try{
      const stop=await startLocationTracking(request.code,secret,value=>onUpdated?.(value),error=>console.warn('GPS GOY XPRESS',error?.message||error));
      stopTrackingRef.current=stop;setTracking(true);
    }catch(e){Alert.alert('No se pudo iniciar GPS',e.message);}
  };

  return <View style={s.card}>
    <Header eyebrow="OPERACIÓN ACTIVA" title="Ruta del mensajero" icon="➜"/>
    <Text style={s.note}>Sigue los pasos en orden. Evidencias y ubicación se sincronizan con administración.</Text>
    <View style={s.steps}>
      <View style={s.step}><View style={s.stepNumber}><Text style={s.stepNumberText}>1</Text></View><View style={s.stepCopy}><Text style={s.stepTitle}>Recoger</Text><Text style={s.stepText}>Confirma la recogida con fotografía.</Text></View></View><Button title="Recogido · tomar foto" kind="navy" onPress={pickup}/>
      <View style={s.stepDivider}/>
      <View style={s.step}><View style={s.stepNumber}><Text style={s.stepNumberText}>2</Text></View><View style={s.stepCopy}><Text style={s.stepTitle}>En camino</Text><Text style={s.stepText}>Activa GPS para seguimiento operativo.</Text></View></View><Button title="Enviar ubicación ahora" onPress={()=>run(()=>sendCurrentLocation(request.code,secret))}/><Button title={tracking?'Detener seguimiento GPS':'Iniciar seguimiento GPS'} kind={tracking?'danger':'green'} onPress={toggleTracking}/>{tracking?<View style={s.trackingPill}><View style={s.trackingDot}/><Text style={s.tracking}>GPS activo · actualización cada 30 s o 25 m</Text></View>:null}
      {request.kind==='deposit'?<Button title="Foto de cheques / depósito" kind="light" onPress={()=>run(()=>registerDepositEvidence(request.code,secret,request.cashAmount||0))}/>:null}
      <View style={s.stepDivider}/><CourierWaitController request={request} secret={secret} onUpdated={onUpdated}/>
      <View style={s.stepDivider}/>
      <View style={s.step}><View style={[s.stepNumber,{backgroundColor:C.green}]}><Text style={s.stepNumberText}>3</Text></View><View style={s.stepCopy}><Text style={s.stepTitle}>Finalizar</Text><Text style={s.stepText}>Registra la evidencia de entrega.</Text></View></View><Button title="Entrega finalizada · tomar foto" kind="green" onPress={delivery}/>{Number(request.totalToCollect||0)>0?<Button title="Foto de depósito de valores recaudados" kind="light" onPress={()=>run(()=>registerDepositEvidence(request.code,secret,request.totalToCollect))}/>:null}
    </View>
  </View>;
}

const s=StyleSheet.create({
  pressed:{opacity:.82,transform:[{scale:.985}]},card:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:22,padding:16,marginVertical:8,shadowColor:C.navy,shadowOpacity:.06,shadowRadius:10,shadowOffset:{width:0,height:4},elevation:2},subcard:{backgroundColor:'#F8FBFC',borderWidth:1,borderColor:C.line,borderRadius:16,padding:13,marginTop:10},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8},headerCopy:{flex:1},eyebrow:{color:C.blue,fontSize:10,fontWeight:'900',letterSpacing:1},title:{fontSize:19,fontWeight:'900',color:C.ink,marginTop:3},iconBubble:{width:43,height:43,borderRadius:14,backgroundColor:C.cyanSoft,alignItems:'center',justifyContent:'center'},icon:{color:C.blue,fontSize:21,fontWeight:'900'},note:{color:C.muted,lineHeight:18,marginBottom:8,fontSize:12},field:{marginTop:10},label:{fontWeight:'800',fontSize:12,color:C.ink,marginBottom:5},input:{borderWidth:1,borderColor:'#CCDCE3',borderRadius:12,paddingHorizontal:12,paddingVertical:11,color:C.ink,minHeight:46,backgroundColor:'#FBFDFE'},multiline:{minHeight:78,textAlignVertical:'top'},button:{backgroundColor:C.blue,borderRadius:12,padding:12,alignItems:'center',justifyContent:'center',marginTop:9,flex:1,minHeight:46},green:{backgroundColor:C.green},navyButton:{backgroundColor:C.navy2},danger:{backgroundColor:C.red},light:{backgroundColor:'#EEF5F7',borderWidth:1,borderColor:C.line},disabled:{opacity:.5},buttonText:{color:C.white,fontWeight:'900',textAlign:'center',fontSize:13},buttonTextDark:{color:C.navy2},row:{flexDirection:'row',gap:8},infoBanner:{backgroundColor:C.greenSoft,borderRadius:14,padding:12,marginBottom:6},infoStrong:{color:C.green,fontWeight:'900',fontSize:12},infoText:{color:'#58765D',fontSize:11,lineHeight:16,marginTop:3},totalBox:{backgroundColor:C.cyanSoft,borderRadius:14,padding:12,marginTop:12},totalLabel:{fontSize:10,color:C.muted,fontWeight:'800'},total:{fontWeight:'900',fontSize:24,color:C.navy2,marginTop:2},quoteValue:{backgroundColor:'#F8FBFC',borderRadius:14,padding:14,marginVertical:8},quoteAmount:{fontSize:29,fontWeight:'900',color:C.green},subcardHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},subcardTitle:{color:C.ink,fontWeight:'900',fontSize:14},liveDot:{width:9,height:9,borderRadius:5,backgroundColor:'#C6D2D8'},liveDotActive:{backgroundColor:C.green},timer:{fontSize:37,fontWeight:'900',color:C.navy2,textAlign:'center',marginVertical:8,letterSpacing:1},waitCost:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',backgroundColor:C.white,borderRadius:11,padding:10},waitLabel:{color:C.muted,fontSize:10,fontWeight:'800'},waitValue:{color:C.green,fontSize:16,fontWeight:'900'},steps:{marginTop:5},step:{flexDirection:'row',alignItems:'center',marginTop:5},stepNumber:{width:34,height:34,borderRadius:12,backgroundColor:C.navy2,alignItems:'center',justifyContent:'center',marginRight:10},stepNumberText:{color:C.white,fontWeight:'900'},stepCopy:{flex:1},stepTitle:{color:C.ink,fontWeight:'900',fontSize:14},stepText:{color:C.muted,fontSize:10,marginTop:2},stepDivider:{height:1,backgroundColor:C.line,marginVertical:13},trackingPill:{flexDirection:'row',alignItems:'center',backgroundColor:C.greenSoft,borderRadius:12,padding:10,marginTop:8},trackingDot:{width:8,height:8,borderRadius:4,backgroundColor:C.green,marginRight:7},tracking:{color:C.green,fontWeight:'800',fontSize:11,flex:1},
});
