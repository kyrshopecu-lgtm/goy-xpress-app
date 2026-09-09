import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Alert, Linking, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {
  registerPickupEvidence,
  registerDeliveryEvidence,
  registerDepositEvidence,
  registerAdditionalEvidence,
  sendCurrentLocation,
  startLocationTracking,
  updateCourierWait,
  fetchRequestStatus,
  respondToQuote,
} from './logisticsApi';

const {calculateDepositPrice, calculateCourierWait} = require('./logisticsRules');
const {createCode, REQUEST_KIND, REQUEST_STATUS, nonNegativeNumber} = require('./domain');

const ADMIN_WHATSAPP = '593997729964';
const C = {navy:'#071F2D',navy2:'#0B2F40',blue:'#00A9E8',cyanSoft:'#E9F9FE',green:'#38A844',greenSoft:'#EAF8ED',red:'#C64A4A',bg:'#F1F6F8',line:'#DCE8ED',white:'#fff',ink:'#152934',muted:'#6B7E88',amber:'#F5B940'};

function Button({title,onPress,kind='blue',disabled=false}){
  return <Pressable disabled={disabled} onPress={onPress} style={({pressed})=>[s.button,kind==='green'&&s.green,kind==='navy'&&s.navyButton,kind==='light'&&s.light,kind==='danger'&&s.danger,kind==='amber'&&s.amber,disabled&&s.disabled,pressed&&s.pressed]}><Text style={[s.buttonText,kind==='light'&&s.buttonTextDark]}>{title}</Text></Pressable>;
}
function Field({label,multiline,...props}){return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput {...props} multiline={multiline} placeholderTextColor="#8EA0A9" style={[s.input,multiline&&s.multiline]}/></View>;}
function money(v){return `$${Number(v||0).toFixed(2)}`;}
function Header({eyebrow,title,icon}){return <View style={s.header}><View style={s.headerCopy}><Text style={s.eyebrow}>{eyebrow}</Text><Text style={s.title}>{title}</Text></View><View style={s.iconBubble}><Text style={s.icon}>{icon}</Text></View></View>}

function notifyAdminWhatsApp(message) {
  const url = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(message)}`;
  return Linking.openURL(url).catch(() => undefined);
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
  const freeMinutes=Number(request?.wait?.freeMinutes||10);
  const initialSeconds=Math.max(0,Number(request?.wait?.elapsedMinutes||0)*60);
  const [seconds,setSeconds]=useState(initialSeconds);
  const [running,setRunning]=useState(false);
  const [arrived,setArrived]=useState(Boolean(request?.wait?.arrivedAt)||initialSeconds>0);
  const [pendingAdmin,setPendingAdmin]=useState(Boolean(request?.wait?.requiresAdminDecision));
  const [decision,setDecision]=useState(request?.wait?.decision||null);
  const alertedRef=useRef(Boolean(request?.wait?.alertedAt));

  useEffect(()=>{
    const serverSeconds=Math.max(0,Number(request?.wait?.elapsedMinutes||0)*60);
    if(serverSeconds>seconds)setSeconds(serverSeconds);
    if(request?.wait?.decision)setDecision(request.wait.decision);
    if(request?.wait?.requiresAdminDecision)setPendingAdmin(true);
  },[request?.wait?.elapsedMinutes,request?.wait?.decision,request?.wait?.requiresAdminDecision]);

  useEffect(()=>{
    if(!running)return undefined;
    const id=setInterval(()=>setSeconds(x=>x+1),1000);
    return()=>clearInterval(id);
  },[running]);

  const minutes=Math.floor(seconds/60);
  const rule=calculateCourierWait(minutes);

  useEffect(()=>{
    if(!running||minutes===0)return;
    if(minutes>=freeMinutes&&decision!=='continue'){
      setRunning(false);
      setPendingAdmin(true);
    }
    updateCourierWait(request.code,secret,Math.min(minutes,decision==='continue'?minutes:freeMinutes))
      .then(updated=>onUpdated?.(updated?.request||updated))
      .catch(()=>undefined);
  },[minutes,running,request.code,secret,onUpdated,freeMinutes,decision]);

  useEffect(()=>{
    if(!pendingAdmin)return undefined;
    let alive=true;
    const poll=async()=>{
      try{
        const result=await fetchRequestStatus(request.code,secret);
        const fresh=result?.request;
        if(!alive||!fresh)return;
        onUpdated?.(fresh);
        const adminDecision=String(fresh.adminNotes||'');
        if(adminDecision.includes('WAIT_CONTINUE')){
          setDecision('continue');
          setPendingAdmin(false);
          setRunning(true);
        } else if(adminDecision.includes('WAIT_NEXT_DELIVERY')){
          setDecision('next_delivery');
          setPendingAdmin(false);
          setRunning(false);
        }
      }catch{}
    };
    poll();
    const id=setInterval(poll,8000);
    return()=>{alive=false;clearInterval(id);};
  },[pendingAdmin,request.code,secret,onUpdated]);

  useEffect(()=>{
    if(!pendingAdmin||alertedRef.current)return;
    alertedRef.current=true;
    notifyAdminWhatsApp(`GOY XPRESS - TIEMPO DE ESPERA\nSolicitud: ${request.code}\nSe alcanzaron ${freeMinutes} minutos sin recargo.\nRevisar el panel administrador y decidir: CONTINUAR ESPERANDO o PASAR A LA SIGUIENTE ENTREGA.`);
  },[pendingAdmin,request.code,freeMinutes]);

  const arrive=async()=>{
    try{
      const location=await sendCurrentLocation(request.code,secret);
      onUpdated?.(location?.request||location);
    }catch{}
    setArrived(true);
    setDecision(null);
    setPendingAdmin(false);
    setSeconds(0);
    setRunning(true);
    updateCourierWait(request.code,secret,0).then(updated=>onUpdated?.(updated?.request||updated)).catch(()=>undefined);
  };

  const remaining=Math.max(0,freeMinutes*60-seconds);
  const mm=String(Math.floor(seconds/60)).padStart(2,'0');
  const ss=String(seconds%60).padStart(2,'0');
  const rmm=String(Math.floor(remaining/60)).padStart(2,'0');
  const rss=String(remaining%60).padStart(2,'0');

  return <View style={[s.subcard,pendingAdmin&&s.subcardAlert]}>
    <View style={s.subcardHead}><View><Text style={s.stepLabel}>PASO 3</Text><Text style={s.subcardTitle}>Llegada y tiempo de espera</Text></View><View style={[s.liveDot,running&&s.liveDotActive,pendingAdmin&&s.liveDotAlert]}/></View>
    {!arrived?<><Text style={s.note}>Cuando estés físicamente en el punto de entrega, toca el botón. El contador empezará de inmediato.</Text><Button title="✓ Llegué al punto de entrega" kind="green" onPress={arrive}/></>:
      <><Text style={s.timer}>{mm}:{ss}</Text><Text style={s.timerCaption}>{decision==='continue'?'Espera adicional autorizada':pendingAdmin?'Esperando decisión del administrador':`Tiempo restante sin recargo: ${rmm}:${rss}`}</Text>
      {pendingAdmin?<View style={s.adminDecisionBox}><Text style={s.adminDecisionTitle}>Administración debe decidir</Text><Text style={s.adminDecisionText}>El tiempo llegó al límite de {freeMinutes} minutos. No se sumará ningún valor adicional hasta que administración autorice continuar.</Text></View>:null}
      {decision==='next_delivery'?<View style={s.nextBox}><Text style={s.nextTitle}>Pasar a la siguiente entrega</Text><Text style={s.nextText}>Administración indicó continuar con la siguiente ruta. No sigas esperando en este punto.</Text></View>:null}
      {decision==='continue'?<View style={s.continueBox}><Text style={s.continueTitle}>Continuar esperando</Text><Text style={s.continueText}>Administración autorizó la espera adicional. El tiempo continúa registrándose.</Text></View>:null}
      {!pendingAdmin&&decision!=='next_delivery'?<Button title={running?'Contador activo automáticamente':'Reanudar espera'} kind={running?'light':'navy'} disabled={running} onPress={()=>setRunning(true)}/>:null}</>}
  </View>;
}

export function CourierJobTools({request,secret,onUpdated}){
  const [tracking,setTracking]=useState(false);
  const stopTrackingRef=useRef(null);
  useEffect(()=>()=>{if(stopTrackingRef.current) stopTrackingRef.current();},[]);

  const run=async fn=>{try{const updated=await fn();if(updated?.request)onUpdated?.(updated.request);else if(updated)onUpdated?.(updated);return updated;}catch(e){Alert.alert('No se pudo completar',e.message);return null;}};
  const extraPhoto=type=>run(()=>registerAdditionalEvidence(request.code,secret,type));
  const pickup=async()=>{const updated=await run(()=>registerPickupEvidence(request.code,secret));if(updated)await notifyAdminWhatsApp(`GOY XPRESS - Constancia de recogida\nSolicitud: ${request.code}\nEstado: Recogido.`);};
  const delivery=async()=>{const updated=await run(()=>registerDeliveryEvidence(request.code,secret));if(updated){if(stopTrackingRef.current){stopTrackingRef.current();stopTrackingRef.current=null;setTracking(false);}await notifyAdminWhatsApp(`GOY XPRESS - Entrega finalizada\nSolicitud: ${request.code}.`);}};
  const toggleTracking=async()=>{
    if(tracking){if(stopTrackingRef.current) stopTrackingRef.current();stopTrackingRef.current=null;setTracking(false);return;}
    try{const stop=await startLocationTracking(request.code,secret,value=>onUpdated?.(value?.request||value),error=>console.warn('GPS GOY XPRESS',error?.message||error));stopTrackingRef.current=stop;setTracking(true);}catch(e){Alert.alert('No se pudo iniciar GPS',e.message);}
  };

  return <View style={s.card}>
    <Header eyebrow="OPERACIÓN ACTIVA" title="Entrega paso a paso" icon="➜"/>
    <View style={s.operationSummary}><View style={s.summaryIcon}><Text style={s.summaryIconText}>1·2·3·4</Text></View><View style={s.flexOne}><Text style={s.summaryTitle}>Una acción por etapa</Text><Text style={s.summaryText}>La pantalla te indica qué hacer ahora y evita saltarte pasos importantes.</Text></View></View>
    <View style={s.steps}>
      <View style={s.step}><View style={s.stepNumber}><Text style={s.stepNumberText}>1</Text></View><View style={s.stepCopy}><Text style={s.stepTitle}>Recoger pedido</Text><Text style={s.stepText}>Toma la foto cuando recibas el paquete o documentos.</Text></View></View>
      <Button title="📷 Confirmar recogida" kind="navy" onPress={pickup}/><Button title="＋ Otra foto de retiro" kind="light" onPress={()=>extraPhoto('pickup')}/>
      <View style={s.stepDivider}/>
      <View style={s.step}><View style={s.stepNumber}><Text style={s.stepNumberText}>2</Text></View><View style={s.stepCopy}><Text style={s.stepTitle}>Ir al destino</Text><Text style={s.stepText}>Activa GPS para que administración pueda seguir la ruta.</Text></View></View>
      <View style={s.row}><Button title="📍 Ubicación" onPress={()=>run(()=>sendCurrentLocation(request.code,secret))}/><Button title={tracking?'Detener GPS':'Iniciar GPS'} kind={tracking?'danger':'green'} onPress={toggleTracking}/></View>
      {tracking?<View style={s.trackingPill}><View style={s.trackingDot}/><Text style={s.tracking}>GPS activo · se actualiza automáticamente</Text></View>:null}
      <Button title="＋ Foto durante la ruta" kind="light" onPress={()=>extraPhoto('service')}/>
      {request.kind==='deposit'?<><Button title="📷 Foto de cheques / depósito" kind="light" onPress={()=>run(()=>registerDepositEvidence(request.code,secret,request.cashAmount||0))}/><Button title="＋ Otra foto del depósito" kind="light" onPress={()=>extraPhoto('deposit')}/></>:null}
      <View style={s.stepDivider}/>
      <CourierWaitController request={request} secret={secret} onUpdated={onUpdated}/>
      <View style={s.stepDivider}/>
      <View style={s.step}><View style={[s.stepNumber,{backgroundColor:C.green}]}><Text style={s.stepNumberText}>4</Text></View><View style={s.stepCopy}><Text style={s.stepTitle}>Entregar y finalizar</Text><Text style={s.stepText}>Toma la fotografía final como constancia de entrega.</Text></View></View>
      <Button title="✓ Entrega finalizada · tomar foto" kind="green" onPress={delivery}/><Button title="＋ Otra foto de entrega" kind="light" onPress={()=>extraPhoto('delivery')}/>
      {Number(request.totalToCollect||0)>0?<><Button title="Foto de depósito de valores recaudados" kind="light" onPress={()=>run(()=>registerDepositEvidence(request.code,secret,request.totalToCollect))}/><Button title="＋ Otra foto del depósito" kind="light" onPress={()=>extraPhoto('deposit')}/></>:null}
    </View>
  </View>;
}

const s=StyleSheet.create({
  flexOne:{flex:1},pressed:{opacity:.82,transform:[{scale:.985}]},card:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:22,padding:16,marginVertical:8,shadowColor:C.navy,shadowOpacity:.06,shadowRadius:10,shadowOffset:{width:0,height:4},elevation:2},subcard:{backgroundColor:'#F8FBFC',borderWidth:1,borderColor:C.line,borderRadius:18,padding:14,marginTop:10},subcardAlert:{borderColor:'#F1C45B',backgroundColor:'#FFF9EC'},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8},headerCopy:{flex:1},eyebrow:{color:C.blue,fontSize:10,fontWeight:'900',letterSpacing:1},title:{fontSize:19,fontWeight:'900',color:C.ink,marginTop:3},iconBubble:{width:43,height:43,borderRadius:14,backgroundColor:C.cyanSoft,alignItems:'center',justifyContent:'center'},icon:{color:C.blue,fontSize:21,fontWeight:'900'},note:{color:C.muted,lineHeight:18,marginBottom:8,fontSize:12},field:{marginTop:10},label:{fontWeight:'800',fontSize:12,color:C.ink,marginBottom:5},input:{borderWidth:1,borderColor:'#CCDCE3',borderRadius:12,paddingHorizontal:12,paddingVertical:11,color:C.ink,minHeight:46,backgroundColor:'#FBFDFE'},multiline:{minHeight:78,textAlignVertical:'top'},button:{backgroundColor:C.blue,borderRadius:13,padding:12,alignItems:'center',justifyContent:'center',marginTop:9,flex:1,minHeight:48},green:{backgroundColor:C.green},navyButton:{backgroundColor:C.navy2},danger:{backgroundColor:C.red},amber:{backgroundColor:C.amber},light:{backgroundColor:'#EEF5F7',borderWidth:1,borderColor:C.line},disabled:{opacity:.55},buttonText:{color:C.white,fontWeight:'900',textAlign:'center',fontSize:13},buttonTextDark:{color:C.navy2},row:{flexDirection:'row',gap:8},infoBanner:{backgroundColor:C.greenSoft,borderRadius:14,padding:12,marginBottom:6},infoStrong:{color:C.green,fontWeight:'900',fontSize:12},infoText:{color:'#58765D',fontSize:11,lineHeight:16,marginTop:3},totalBox:{backgroundColor:C.cyanSoft,borderRadius:14,padding:12,marginTop:12},totalLabel:{fontSize:10,color:C.muted,fontWeight:'800'},total:{fontWeight:'900',fontSize:24,color:C.navy2,marginTop:2},quoteValue:{backgroundColor:'#F8FBFC',borderRadius:14,padding:14,marginVertical:8},quoteAmount:{fontSize:29,fontWeight:'900',color:C.green},subcardHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},subcardTitle:{color:C.ink,fontWeight:'900',fontSize:15},stepLabel:{color:C.blue,fontSize:9,fontWeight:'900',letterSpacing:1},liveDot:{width:10,height:10,borderRadius:5,backgroundColor:'#C6D2D8'},liveDotActive:{backgroundColor:C.green},liveDotAlert:{backgroundColor:C.amber},timer:{fontSize:42,fontWeight:'900',color:C.navy2,textAlign:'center',marginTop:10,letterSpacing:1},timerCaption:{textAlign:'center',color:C.muted,fontSize:11,fontWeight:'800',marginBottom:8},adminDecisionBox:{backgroundColor:'#FFF1C9',borderRadius:13,padding:12,marginTop:8},adminDecisionTitle:{color:'#8A5A00',fontWeight:'900',fontSize:13},adminDecisionText:{color:'#7A642E',fontSize:11,lineHeight:16,marginTop:4},nextBox:{backgroundColor:'#FDECEC',borderRadius:13,padding:12,marginTop:8},nextTitle:{color:C.red,fontWeight:'900',fontSize:13},nextText:{color:'#7D4A4A',fontSize:11,lineHeight:16,marginTop:4},continueBox:{backgroundColor:C.greenSoft,borderRadius:13,padding:12,marginTop:8},continueTitle:{color:C.green,fontWeight:'900',fontSize:13},continueText:{color:'#58765D',fontSize:11,lineHeight:16,marginTop:4},operationSummary:{flexDirection:'row',alignItems:'center',backgroundColor:C.cyanSoft,borderRadius:15,padding:12,marginBottom:12},summaryIcon:{width:48,height:48,borderRadius:14,backgroundColor:C.navy2,alignItems:'center',justifyContent:'center',marginRight:10},summaryIconText:{color:C.white,fontWeight:'900',fontSize:10},summaryTitle:{color:C.navy2,fontWeight:'900',fontSize:13},summaryText:{color:C.muted,fontSize:10,lineHeight:15,marginTop:2},steps:{marginTop:5},step:{flexDirection:'row',alignItems:'center',marginTop:5},stepNumber:{width:36,height:36,borderRadius:12,backgroundColor:C.navy2,alignItems:'center',justifyContent:'center',marginRight:10},stepNumberText:{color:C.white,fontWeight:'900'},stepCopy:{flex:1},stepTitle:{color:C.ink,fontWeight:'900',fontSize:15},stepText:{color:C.muted,fontSize:10,marginTop:2,lineHeight:15},stepDivider:{height:1,backgroundColor:C.line,marginVertical:15},trackingPill:{flexDirection:'row',alignItems:'center',backgroundColor:C.greenSoft,borderRadius:12,padding:10,marginTop:8},trackingDot:{width:8,height:8,borderRadius:4,backgroundColor:C.green,marginRight:7},tracking:{color:C.green,fontWeight:'800',fontSize:11,flex:1},
});