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
const C = {navy:'#0B2F40',blue:'#00A9E8',green:'#38A844',red:'#C64A4A',bg:'#F3F7F9',line:'#DCE6EB',white:'#fff',ink:'#17242D',muted:'#687984'};

function Button({title,onPress,kind='blue',disabled=false}){
  return <Pressable disabled={disabled} onPress={onPress} style={[s.button,kind==='green'&&s.green,kind==='danger'&&s.danger,disabled&&s.disabled]}><Text style={s.buttonText}>{title}</Text></Pressable>;
}
function Field({label,...props}){return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput {...props} style={s.input}/></View>;}
function money(v){return `$${Number(v||0).toFixed(2)}`;}

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
    onCreate?.({
      code:createCode(REQUEST_KIND.deposit),kind:REQUEST_KIND.deposit,customer,phone,depositMethod:method,
      checkCount:method==='checks'?Math.max(0,Math.floor(nonNegativeNumber(checkCount))):0,
      cashAmount:method==='cash'?nonNegativeNumber(cashAmount):0,bank:bank.trim(),details:details.trim(),
      serviceCost:pricing.total,totalToCollect:0,status:REQUEST_STATUS.pending,settled:true,createdAt:new Date().toISOString(),
    });
  };
  return <View style={s.card}><Text style={s.title}>Depósito bancario</Text><Text style={s.note}>$3.50 hasta 3 cheques · $0.50 por cheque adicional · efectivo máximo $1.000</Text><View style={s.row}><Button title="Cheques" kind={method==='checks'?'green':'blue'} onPress={()=>setMethod('checks')}/><Button title="Efectivo" kind={method==='cash'?'green':'blue'} onPress={()=>setMethod('cash')}/></View>{method==='checks'?<Field label="Cantidad de cheques" value={checkCount} onChangeText={setCheckCount} keyboardType="number-pad"/>:<Field label="Valor en efectivo" value={cashAmount} onChangeText={setCashAmount} keyboardType="decimal-pad"/>}<Field label="Banco / institución" value={bank} onChangeText={setBank}/><Field label="Indicaciones" value={details} onChangeText={setDetails}/><Text style={s.total}>Tarifa: {pricing.valid?money(pricing.total):pricing.error}</Text><Button title="Crear depósito" kind="green" onPress={submit}/>{onCancel?<Button title="Cancelar" onPress={onCancel}/>:null}</View>;
}

export function DiverseServiceForm({customer='',phone='',onCreate,onCancel}){
  const [description,setDescription]=useState('');
  const submit=()=>{
    if(description.trim().length<10){Alert.alert('Describe el servicio','Explica qué gestión necesitas para que GOY XPRESS pueda cotizarla.');return;}
    onCreate?.({code:createCode(REQUEST_KIND.diverse),kind:REQUEST_KIND.diverse,customer,phone,details:description.trim(),serviceCost:0,totalToCollect:0,status:REQUEST_STATUS.pending,quote:{status:'Pendiente de cotización'},createdAt:new Date().toISOString()});
  };
  return <View style={s.card}><Text style={s.title}>Servicios diversos</Text><Text style={s.note}>Describe la gestión. El administrador enviará una cotización personalizada y el servicio solo se realizará después de tu aceptación.</Text><Field label="Detalle del servicio" value={description} onChangeText={setDescription} multiline/><Button title="Solicitar cotización" kind="green" onPress={submit}/>{onCancel?<Button title="Cancelar" onPress={onCancel}/>:null}</View>;
}

export function QuoteDecision({request,secret,onUpdated}){
  if(request?.kind!=='diverse'||request?.quote?.status!=='Cotizado') return null;
  const respond=async response=>{try{const updated=await respondToQuote(request.code,secret,response);onUpdated?.(updated);}catch(e){Alert.alert('No se pudo responder',e.message);}};
  return <View style={s.card}><Text style={s.title}>Cotización GOY XPRESS</Text><Text style={s.total}>{money(request.quote.amount)}</Text><Text style={s.note}>{request.quote.note||'Cotización personalizada.'}</Text><View style={s.row}><Button title="Aceptar" kind="green" onPress={()=>respond('accepted')}/><Button title="Rechazar" kind="danger" onPress={()=>respond('rejected')}/></View></View>;
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
  return <View style={s.card}><Text style={s.title}>Tiempo de espera</Text><Text style={s.timer}>{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</Text><Text style={s.note}>10 minutos incluidos. Después se agregan $0.10 por minuto.</Text><Text style={s.total}>Recargo actual: {money(rule.extraCost)}</Text>{!running?<Button title="Iniciar espera" onPress={()=>setRunning(true)}/>:<Button title="Pausar contador" onPress={()=>setRunning(false)}/>} {rule.requiresDecision?<><Button title="Avisar novedad por WhatsApp" kind="green" onPress={notifyAdmin}/><View style={s.row}><Button title="Me retiro" kind="danger" onPress={()=>decide('withdraw')}/><Button title="Continuar esperando" kind="green" onPress={()=>decide('continue')}/></View></>:null}</View>;
}

export function CourierJobTools({request,secret,onUpdated}){
  const [tracking,setTracking]=useState(false);
  const stopTrackingRef=useRef(null);

  useEffect(()=>()=>{
    if(stopTrackingRef.current) stopTrackingRef.current();
  },[]);

  const run=async fn=>{try{const updated=await fn();if(updated)onUpdated?.(updated);return updated;}catch(e){Alert.alert('No se pudo completar',e.message);return null;}};

  const pickup=async()=>{
    const updated=await run(()=>registerPickupEvidence(request.code,secret));
    if(updated){
      await notifyAdminWhatsApp(`GOY XPRESS - Constancia de recogida\nSolicitud: ${request.code}\nEstado: Recogido\nLa fotografía de evidencia quedó registrada en el panel administrativo.`);
    }
  };

  const delivery=async()=>{
    const updated=await run(()=>registerDeliveryEvidence(request.code,secret));
    if(updated){
      if(stopTrackingRef.current){stopTrackingRef.current();stopTrackingRef.current=null;setTracking(false);}
      await notifyAdminWhatsApp(`GOY XPRESS - Entrega finalizada\nSolicitud: ${request.code}\nLa fotografía de entrega quedó registrada en el panel administrativo.`);
    }
  };

  const toggleTracking=async()=>{
    if(tracking){
      if(stopTrackingRef.current) stopTrackingRef.current();
      stopTrackingRef.current=null;
      setTracking(false);
      return;
    }
    try{
      const stop=await startLocationTracking(
        request.code,
        secret,
        value=>onUpdated?.(value),
        error=>console.warn('GPS GOY XPRESS',error?.message||error),
      );
      stopTrackingRef.current=stop;
      setTracking(true);
    }catch(e){Alert.alert('No se pudo iniciar GPS',e.message);}
  };

  return <View style={s.card}><Text style={s.title}>Operación del mensajero</Text><Text style={s.note}>Las evidencias y la ubicación quedan disponibles únicamente para administración.</Text><Button title="1. Recogido · tomar foto" onPress={pickup}/><Button title="Enviar ubicación ahora" kind="green" onPress={()=>run(()=>sendCurrentLocation(request.code,secret))}/><Button title={tracking?'Detener seguimiento GPS':'2. En camino · iniciar seguimiento GPS'} kind={tracking?'danger':'green'} onPress={toggleTracking}/>{tracking?<Text style={s.tracking}>● Seguimiento GPS activo cada 30 s o 25 m mientras esta operación permanezca abierta.</Text>:null}{request.kind==='deposit'?<Button title="Tomar foto de cheques / depósito" onPress={()=>run(()=>registerDepositEvidence(request.code,secret,request.cashAmount||0))}/>:null}<CourierWaitController request={request} secret={secret} onUpdated={onUpdated}/><Button title="3. Entrega finalizada · tomar foto" kind="green" onPress={delivery}/>{Number(request.totalToCollect||0)>0?<Button title="Foto de depósito de valores recaudados" onPress={()=>run(()=>registerDepositEvidence(request.code,secret,request.totalToCollect))}/>:null}</View>;
}

const s=StyleSheet.create({card:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:16,padding:16,marginVertical:8},title:{fontSize:18,fontWeight:'900',color:C.ink,marginBottom:6},note:{color:C.muted,lineHeight:19,marginBottom:8},field:{marginTop:10},label:{fontWeight:'800',fontSize:12,color:C.ink,marginBottom:5},input:{borderWidth:1,borderColor:C.line,borderRadius:10,padding:11,color:C.ink,minHeight:44},button:{backgroundColor:C.blue,borderRadius:11,padding:12,alignItems:'center',marginTop:9,flex:1},green:{backgroundColor:C.green},danger:{backgroundColor:C.red},disabled:{opacity:.5},buttonText:{color:C.white,fontWeight:'900',textAlign:'center'},row:{flexDirection:'row',gap:8},total:{fontWeight:'900',fontSize:16,color:C.navy,marginTop:10},timer:{fontSize:34,fontWeight:'900',color:C.navy,textAlign:'center',marginVertical:8},tracking:{color:C.green,fontWeight:'800',fontSize:12,marginTop:8,lineHeight:17}});
