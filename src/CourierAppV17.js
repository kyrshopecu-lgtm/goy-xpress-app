import React,{useEffect,useRef,useState}from'react';
import{Alert,Image,Linking,Modal,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,View}from'react-native';
import AsyncStorage from'@react-native-async-storage/async-storage';
import * as ImagePicker from'expo-image-picker';
import{StatusBar}from'expo-status-bar';
import{API_BASE,getCourierJob,getCourierJobs,getMe,sendCurrentLocation,setWaitDecision,startLocationTracking,updateCourierWait}from'./goyApiV5';

const SESSION='goy_courier_session_v13';
const SUPPORT='593997729964';
const C={navy:'#071C2A',navy2:'#0B2F40',cyan:'#00A9E8',green:'#38A844',amber:'#F5B940',red:'#C64A4A',bg:'#F3F7F9',white:'#fff',ink:'#132B36',muted:'#687D88',line:'#DCE8ED',soft:'#EDF9FD'};
const digits=v=>String(v||'').replace(/\D/g,'');
const clean=v=>String(v||'').trim();
const money=v=>`$${Number(v||0).toFixed(2)}`;
const whatsappNumber=value=>{const p=digits(value);if(!p)return'';if(p.startsWith('593'))return p;if(p.startsWith('0')&&p.length>=10)return`593${p.slice(1)}`;if(p.startsWith('9')&&p.length===9)return`593${p}`;return p};

async function openWhatsApp(phone,message,label='WhatsApp'){
  const number=whatsappNumber(phone);
  if(!number)return Alert.alert(label,'No hay un número de WhatsApp registrado.');
  try{await Linking.openURL(`https://wa.me/${number}?text=${encodeURIComponent(message)}`)}
  catch{Alert.alert(label,'No se pudo abrir WhatsApp. Verifica que esté instalado o disponible en el teléfono.')}
}

function mapQuery(address){
  const value=clean(address);
  if(!value)return'';
  return /quito|ecuador/i.test(value)?value:`${value}, Quito, Ecuador`;
}
const mapSearchUrl=address=>{const q=mapQuery(address);return q?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`:''};
const mapDirectionsUrl=(origin,destination)=>origin&&destination?`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(mapQuery(origin))}&destination=${encodeURIComponent(mapQuery(destination))}&travelmode=driving`:'';
async function openMap(url,label='Ubicación'){
  if(!url)return Alert.alert(label,'No hay una dirección registrada para esta operación.');
  try{await Linking.openURL(url)}catch{Alert.alert(label,'No se pudo abrir Google Maps. Verifica tu conexión e intenta nuevamente.')}
}

function recipientData(req){
  const raw=req?.recipient;
  return{
    name:(typeof raw==='string'?raw:raw?.name)||req?.recipientName||req?.receiverName||'Destinatario',
    phone:req?.recipientPhone||req?.recipientWhatsapp||req?.recipientWhatsApp||raw?.phone||raw?.whatsapp||req?.destinationPhone||req?.receiverPhone||req?.contactPhone||''
  };
}

const validPhoto=v=>/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(v||''));
function photoItems(req){
  const e=req?.evidence||{},a=e.additional||{},out=[];
  const add=(label,value)=>{const src=typeof value==='string'?value:value?.photo;if(validPhoto(src))out.push({label,src})};
  add('Retiro',e.pickupPhoto);
  (a.pickup||[]).forEach((x,i)=>add(`Retiro adicional ${i+1}`,x));
  (a.service||[]).forEach((x,i)=>add(`Servicio ${i+1}`,x));
  add('Entrega',e.deliveryPhoto);
  (a.delivery||[]).forEach((x,i)=>add(`Entrega adicional ${i+1}`,x));
  add('Depósito',e.depositPhoto||req?.wallet?.depositPhoto);
  (a.deposit||[]).forEach((x,i)=>add(`Depósito adicional ${i+1}`,x));
  return out;
}

function EvidenceGallery({req}){
  const photos=photoItems(req),[preview,setPreview]=useState(null);
  if(!photos.length)return null;
  return <>
    <Card>
      <Text style={s.kicker}>EVIDENCIAS FOTOGRÁFICAS</Text>
      <Text style={s.h2}>Fotos registradas</Text>
      <Text style={s.note}>Las evidencias ahora se muestran en formato amplio. Toca cualquier foto para verla a pantalla completa.</Text>
      {photos.map((p,i)=><View key={`${p.label}-${i}`} style={s.evidenceItem}>
        <Pressable onPress={()=>setPreview(p)} style={({pressed})=>[s.photoPress,pressed&&{opacity:.9}]}>
          <Image source={{uri:p.src}} style={s.evidencePhoto} resizeMode="contain"/>
          <View style={s.photoZoom}><Text style={s.photoZoomText}>⛶ AMPLIAR</Text></View>
        </Pressable>
        <Text style={s.evidenceLabel}>{p.label}</Text>
      </View>)}
    </Card>
    <Modal visible={Boolean(preview)} animationType="fade" transparent={false} onRequestClose={()=>setPreview(null)}>
      <SafeAreaView style={s.previewSafe}>
        <View style={s.previewTop}>
          <Text style={s.previewTitle}>{preview?.label||'Evidencia'}</Text>
          <Pressable onPress={()=>setPreview(null)} style={s.previewClose}><Text style={s.previewCloseText}>✕</Text></Pressable>
        </View>
        {preview?<Image source={{uri:preview.src}} style={s.previewImage} resizeMode="contain"/>:null}
        <Text style={s.previewHint}>Foto completa · toca ✕ para regresar</Text>
      </SafeAreaView>
    </Modal>
  </>;
}

async function api(path,{method='GET',token,body,timeoutMs=30000}={}){
  const controller=typeof AbortController!=='undefined'?new AbortController():null;
  const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
  let response;
  try{
    response=await fetch(`${API_BASE}${path}`,{
      method,
      headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},
      body:body===undefined?undefined:JSON.stringify(body),
      signal:controller?.signal
    });
  }catch(error){
    if(error?.name==='AbortError')throw new Error('La operación tardó demasiado. Verifica tu internet e intenta nuevamente.');
    throw new Error('No se pudo conectar con GOY XPRESS. Verifica tu internet e intenta nuevamente.');
  }finally{if(timer)clearTimeout(timer)}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.error||'No se pudo completar la operación.');error.status=response.status;error.pendingApproval=Boolean(data.pendingApproval);throw error}
  return data;
}

async function photo(){
  const p=await ImagePicker.requestCameraPermissionsAsync();
  if(!p.granted)throw new Error('Se necesita permiso de cámara.');
  const r=await ImagePicker.launchCameraAsync({mediaTypes:['images'],allowsEditing:true,aspect:[4,3],quality:.68,base64:true});
  if(r.canceled||!r.assets?.[0])return null;
  const a=r.assets[0],out=`data:${a.mimeType||'image/jpeg'};base64,${a.base64||''}`;
  if(!a.base64)throw new Error('No se pudo procesar la foto.');
  if(out.length>1750000)throw new Error('La fotografía quedó demasiado pesada. Intenta nuevamente con un encuadre 4:3.');
  return out;
}
async function evidence(token,code,action,amount=0){const p=await photo();if(!p)return null;return api(`/requests/${encodeURIComponent(code)}/${action}`,{method:'POST',token,body:action==='deposit-evidence'?{photo:p,amount}:{photo:p}})}
async function extraPhoto(token,code,type){const p=await photo();if(!p)return null;const d=await api('/courier-additional-evidence',{method:'POST',token,body:{code,type,photo:p}});return d.request||null}
async function clientInfo(token,code){const d=await api(`/courier-client-info?code=${encodeURIComponent(code)}`,{token});return d.client||{}}

function Btn({title,onPress,green=false,danger=false,outline=false,disabled=false}){
  return <Pressable disabled={disabled} onPress={onPress} style={({pressed})=>[s.btn,green&&s.green,danger&&s.danger,outline&&s.outline,disabled&&s.disabled,pressed&&{opacity:.82}]}>
    <Text style={[s.btnText,outline&&s.outlineText]}>{title}</Text>
  </Pressable>;
}
function Card({children,style}){return <View style={[s.card,style]}>{children}</View>}
function Status({value}){const v=String(value||'Pendiente'),done=v==='Entrega finalizada',route=['Recogido','En camino'].includes(v),bad=v==='Cancelado';return <View style={[s.badge,{backgroundColor:done?'#EAF8ED':route?'#EAF8FE':bad?'#FDEEEE':'#FFF7E3'}]}><Text style={[s.badgeText,{color:done?C.green:route?C.cyan:bad?C.red:'#9A6800'}]}>{v}</Text></View>}
function Step({n,title,active,done}){return <View style={s.step}><View style={[s.stepDot,active&&s.stepActive,done&&s.stepDone]}><Text style={s.stepDotText}>{done?'✓':n}</Text></View><Text style={[s.stepText,(active||done)&&s.stepTextOn]}>{title}</Text></View>}

function LocationBox({icon,label,address,onOpen}){
  if(!clean(address))return null;
  return <View style={s.locationBox}>
    <View style={s.locationHead}><Text style={s.locationIcon}>{icon}</Text><View style={s.flex}><Text style={s.locationLabel}>{label}</Text><Text style={s.locationAddress}>{address}</Text></View></View>
    <Btn title={`🗺 Ver ubicación de ${label.toLowerCase()}`} outline onPress={onOpen}/>
  </View>;
}

function RouteCard({req,stage}){
  const pickup=clean(req.originAddress),delivery=clean(req.destinationAddress),procedure=clean(req.procedureAddress);
  const procedureOnly=procedure&&!pickup&&!delivery;
  const route=req.route?.mapUrl||(pickup&&delivery?mapDirectionsUrl(pickup,delivery):'');
  const activeAddress=stage===0?(pickup||procedure||delivery):(delivery||procedure||pickup);
  const activeLabel=stage===0?(pickup?'retiro':procedure?'trámite':'destino'):(delivery?'entrega':procedure?'trámite':'retiro');
  return <Card style={s.routeCard}>
    <View style={s.routeTitleRow}><View style={s.routeMark}><Text style={s.routeMarkText}>⌖</Text></View><View style={s.flex}><Text style={s.kicker}>UBICACIONES DE LA OPERACIÓN</Text><Text style={s.h2}>Ruta clara y separada</Text></View></View>
    <Text style={s.note}>Usa el botón correspondiente para no confundir el punto de retiro con el punto de entrega.</Text>
    {pickup?<LocationBox icon="📦" label="Retiro" address={pickup} onOpen={()=>openMap(mapSearchUrl(pickup),'Retiro')}/>:null}
    {delivery?<LocationBox icon="📍" label="Entrega" address={delivery} onOpen={()=>openMap(mapSearchUrl(delivery),'Entrega')}/>:null}
    {procedure&&!procedureOnly&&procedure!==pickup&&procedure!==delivery?<LocationBox icon="🏢" label="Trámite" address={procedure} onOpen={()=>openMap(mapSearchUrl(procedure),'Trámite')}/>:null}
    {procedureOnly?<LocationBox icon="🏢" label="Trámite" address={procedure} onOpen={()=>openMap(mapSearchUrl(procedure),'Trámite')}/>:null}
    {activeAddress?<View style={s.activeNavBox}><Text style={s.activeNavTitle}>SIGUIENTE DESTINO</Text><Text style={s.activeNavText}>Ahora corresponde ir al punto de {activeLabel}.</Text><Btn title={`🧭 Navegar ahora · ${activeLabel}`} green onPress={()=>openMap(mapSearchUrl(activeAddress),activeLabel)}/></View>:null}
    {pickup&&delivery&&route?<Btn title="↗ Ruta completa retiro → entrega" onPress={()=>openMap(route,'Ruta completa')}/>:null}
  </Card>;
}

function ClientCard({token,req,stage,done}){
  const[data,setData]=useState(null);
  useEffect(()=>{let alive=true;clientInfo(token,req.code).then(v=>alive&&setData(v)).catch(()=>alive&&setData({name:req.customer,phone:req.phone}));return()=>{alive=false}},[token,req.code]);
  const phone=data?.phone||req.phone;
  const name=data?.businessName||data?.name||req.customer||'Cliente';
  const pickup=`Hola ${name}, somos GOY XPRESS.\n\nNuestro mensajero ya está en camino para retirar tu pedido.\nNúmero de seguimiento: ${req.code}.${req.originAddress?`\nPunto de retiro: ${req.originAddress}.`:''}\n\nGracias por confiar en GOY XPRESS.`;
  const general=`Hola ${name}, soy el operador logístico de GOY XPRESS asignado a la orden ${req.code}.`;
  return <Card>
    <Text style={s.kicker}>CLIENTE / REMITENTE</Text>
    <Text style={s.h2}>{name}</Text>
    <Text style={s.line}>RUC / Cédula: <Text style={s.bold}>{data?.documentId||'No registrado'}</Text></Text>
    <Text style={s.line}>Dirección facturación: <Text style={s.bold}>{data?.address||'No registrada'}</Text></Text>
    {stage===0&&!done?<View style={s.noticeBox}><Text style={s.noticeTitle}>Aviso de retiro</Text><Text style={s.note}>Envía al cliente el número de seguimiento y confirma que vamos en camino a retirar el pedido.</Text><Btn title="💬 Avisar: vamos a retirar" green onPress={()=>openWhatsApp(phone,pickup,'Cliente')}/></View>:null}
    <View style={s.row}><View style={s.flex}><Btn title="📞 Llamar" green onPress={()=>digits(phone)?Linking.openURL(`tel:${digits(phone)}`):Alert.alert('Cliente','No hay teléfono registrado.')}/></View><View style={s.flex}><Btn title="WhatsApp" outline onPress={()=>openWhatsApp(phone,general,'Cliente')}/></View></View>
  </Card>;
}

function RecipientCard({req,stage,done}){
  if(req.kind&&req.kind!=='shipment'&&!req.destinationAddress)return null;
  const recipient=recipientData(req),phone=recipient.phone,sender=req.customer||'Cliente GOY XPRESS';
  const arrival=`Hola ${recipient.name}, somos GOY XPRESS.\n\nEstamos por llegar al lugar indicado para realizar tu entrega.\nEnvío de: ${sender}.\nNúmero de seguimiento: ${req.code}.${req.destinationAddress?`\nDirección de entrega: ${req.destinationAddress}.`:''}\n\nPor favor, mantente pendiente del mensajero. Gracias por confiar en GOY XPRESS.`;
  const general=`Hola ${recipient.name}, somos GOY XPRESS. Te contactamos por la entrega ${req.code}, enviada por ${sender}.`;
  return <Card>
    <Text style={s.kicker}>DESTINATARIO</Text>
    <Text style={s.h2}>{recipient.name}</Text>
    <Text style={s.line}>WhatsApp: <Text style={s.bold}>{phone||'No registrado'}</Text></Text>
    {req.destinationAddress?<Text style={s.line}>Dirección de entrega: <Text style={s.bold}>{req.destinationAddress}</Text></Text>:null}
    {stage===2&&!done?<View style={s.noticeBox}><Text style={s.noticeTitle}>Aviso de llegada</Text><Text style={s.note}>Avísale al destinatario que GOY XPRESS está por llegar e incluye el cliente/remitente y el número de seguimiento.</Text><Btn title="💬 Avisar: estamos por llegar" green onPress={()=>phone?openWhatsApp(phone,arrival,'Destinatario'):Alert.alert('Destinatario','Esta orden no tiene WhatsApp del destinatario. Registra ese número al crear la próxima orden.')}/></View>:null}
    <View style={s.row}><View style={s.flex}><Btn title="📞 Llamar" green onPress={()=>digits(phone)?Linking.openURL(`tel:${digits(phone)}`):Alert.alert('Destinatario','No hay teléfono registrado.')}/></View><View style={s.flex}><Btn title="WhatsApp" outline onPress={()=>phone?openWhatsApp(phone,general,'Destinatario'):Alert.alert('Destinatario','No hay WhatsApp registrado.')}/></View></View>
  </Card>;
}

function AutoWait({token,req,onUpdated,onLeave}){
  const key=`goy_arrival_${req.code}`;
  const free=Number(req.wait?.freeMinutes||10);
  const[arrival,setArrival]=useState(null),[sec,setSec]=useState(Number(req.wait?.elapsedMinutes||0)*60),[pending,setPending]=useState(false),[decision,setDecision]=useState('');
  const tick=useRef(null);
  useEffect(()=>{AsyncStorage.getItem(key).then(raw=>{if(raw){const at=Number(raw);setArrival(at);const elapsed=Math.max(Number(req.wait?.elapsedMinutes||0)*60,Math.floor((Date.now()-at)/1000));setSec(Math.min(elapsed,free*60));}}).catch(()=>{})},[key]);
  useEffect(()=>()=>tick.current&&clearInterval(tick.current),[]);
  useEffect(()=>{if(!arrival||pending||decision==='next')return;tick.current=setInterval(()=>setSec(v=>v+1),1000);return()=>{clearInterval(tick.current);tick.current=null}},[arrival,pending,decision]);
  const min=Math.floor(sec/60);
  useEffect(()=>{if(!arrival)return;if(min>0&&min<=free)updateCourierWait(token,req.code,min).then(onUpdated).catch(()=>{});if(min>=free&&decision!=='continue'){setSec(free*60);setPending(true);updateCourierWait(token,req.code,free).then(onUpdated).catch(()=>{});}},[min,arrival,free,decision,token,req.code]);
  useEffect(()=>{if(!pending)return;const poll=setInterval(async()=>{try{const fresh=await getCourierJob(token,req.code);onUpdated(fresh);const notes=String(fresh.adminNotes||'');if(notes.includes('WAIT_CONTINUE')){setPending(false);setDecision('continue');await setWaitDecision(token,req.code,'continue').then(onUpdated).catch(()=>{});}else if(notes.includes('WAIT_NEXT_DELIVERY')){setPending(false);setDecision('next');await setWaitDecision(token,req.code,'withdraw').then(onUpdated).catch(()=>{});Alert.alert('Administración','Pasa a la siguiente entrega.',[{text:'Ver operaciones',onPress:onLeave}]);}}catch{}},4000);return()=>clearInterval(poll)},[pending,token,req.code,onUpdated,onLeave]);
  useEffect(()=>{if(decision==='continue'&&min>free)updateCourierWait(token,req.code,min).then(onUpdated).catch(()=>{})},[min,decision,free,token,req.code]);
  const arrive=async()=>{const at=Date.now();await AsyncStorage.setItem(key,String(at));setArrival(at);setSec(0);Alert.alert('Llegada registrada',`El tiempo de espera comenzó automáticamente. Tienes ${free} minutos antes de solicitar decisión a administración.`)};
  if(!arrival)return <Card style={s.arrivalCard}><Text style={s.kicker}>LLEGADA AL DESTINO</Text><Text style={s.h2}>¿Ya llegaste al punto de entrega?</Text><Text style={s.note}>Al confirmar, el contador de espera empieza automáticamente. No tienes que iniciarlo manualmente.</Text><Btn title="📍 YA LLEGUÉ · iniciar espera" green onPress={arrive}/></Card>;
  return <Card style={pending?s.waitAlert:null}><Text style={s.kicker}>ESPERA AUTOMÁTICA</Text><Text style={s.h2}>{pending?'Esperando decisión de administración':'Tiempo en el punto de entrega'}</Text><Text style={s.timer}>{String(Math.floor(sec/60)).padStart(2,'0')}:{String(sec%60).padStart(2,'0')}</Text>{pending?<><Text style={s.notice}>⏸ Llegaste al límite sin recargo. El contador quedó pausado para facturación hasta que administración decida.</Text><Text style={s.note}>La web de administración mostrará: “Continuar esperando” o “Siguiente entrega”. Esta pantalla se actualizará automáticamente.</Text></>:decision==='continue'?<Text style={s.noticeGreen}>✓ Administración autorizó continuar esperando. El tiempo adicional ya se registra.</Text>:<Text style={s.note}>El contador está activo automáticamente desde tu llegada.</Text>}</Card>;
}

function JobCard({job,onOpen}){
  const done=['Entrega finalizada','Cancelado'].includes(job.status);
  return <Pressable onPress={()=>onOpen(job)} style={({pressed})=>[s.card,s.jobCard,pressed&&{opacity:.86}]}>
    <View style={s.between}><View style={s.flex}><Text style={s.code}>{job.code}</Text><Text style={s.h2}>{job.customer||'Cliente'}</Text></View><Status value={job.status}/></View>
    <Text style={s.servicePill}>{job.serviceLabel||job.kind||'Servicio'}</Text>
    {job.originAddress?<Text style={s.address}>📦 Retiro: <Text style={s.bold}>{job.originAddress}</Text></Text>:null}
    {job.destinationAddress?<Text style={s.address}>📍 Entrega: <Text style={s.bold}>{job.destinationAddress}</Text></Text>:null}
    {!job.originAddress&&!job.destinationAddress&&job.procedureAddress?<Text style={s.address}>🏢 Trámite: <Text style={s.bold}>{job.procedureAddress}</Text></Text>:null}
    <Text style={s.open}>{done?'VER DETALLE':'ABRIR OPERACIÓN →'}</Text>
  </Pressable>;
}

function Detail({token,job,onBack,onUpdated}){
  const[req,setReq]=useState(job),[busy,setBusy]=useState(false),[tracking,setTracking]=useState(false),stop=useRef(null);
  useEffect(()=>()=>stop.current?.(),[]);
  const apply=v=>{if(v){setReq(v);onUpdated(v)}return v};
  const work=async fn=>{if(busy)return null;setBusy(true);try{return apply(await fn())}catch(e){Alert.alert('Operación',e.message);return null}finally{setBusy(false)}};
  const workflowStatus=req.courierStage||req.status;
  const stage=workflowStatus==='Entrega finalizada'||req.status==='Entrega finalizada'?3:workflowStatus==='En camino'||req.status==='En camino'?2:workflowStatus==='Recogido'||req.status==='Recogido'?1:0;
  const done=['Entrega finalizada','Cancelado'].includes(req.status);
  const track=async()=>{if(tracking){stop.current?.();stop.current=null;setTracking(false);return}try{stop.current=await startLocationTracking(token,req.code,apply,e=>Alert.alert('GPS',e.message));setTracking(true)}catch(e){Alert.alert('GPS',e.message)}};

  return <View>
    <View style={s.detailHead}><Pressable onPress={onBack} style={s.back}><Text style={s.backText}>‹</Text></Pressable><View style={s.flex}><Text style={s.kicker}>OPERACIÓN ACTIVA</Text><Text style={s.title}>{req.code}</Text><Status value={req.status}/></View></View>
    <View style={s.steps}><Step n="1" title="Retiro" active={stage===0} done={stage>0}/><Step n="2" title="Ruta" active={stage===1} done={stage>1}/><Step n="3" title="Entrega" active={stage===2} done={stage>2}/></View>

    <RouteCard req={req} stage={stage}/>

    {Number(req.totalToCollect||0)>0?<Card style={s.collectCard}><Text style={s.small}>VALOR A RECAUDAR</Text><Text style={s.collect}>{money(req.totalToCollect)}</Text><Text style={s.note}>Confirma el valor antes de cerrar la entrega.</Text></Card>:null}

    {!done&&stage===0?<Card style={s.actionCard}><Text style={s.kicker}>PASO 1 · RETIRO</Text><Text style={s.h2}>Recoger paquete</Text><Text style={s.note}>Verifica el punto de retiro arriba y toma una foto amplia 4:3 para confirmar que recibiste el paquete.</Text><Btn title={busy?'Procesando…':'📷 Confirmar retiro con foto'} green disabled={busy} onPress={()=>work(()=>evidence(token,req.code,'pickup'))}/><Btn title="＋ Foto adicional de retiro" outline disabled={busy} onPress={()=>work(()=>extraPhoto(token,req.code,'pickup'))}/></Card>:null}

    {!done&&stage===1?<Card style={s.actionCard}><Text style={s.kicker}>PASO 2 · RUTA</Text><Text style={s.h2}>Iniciar traslado</Text><Text style={s.note}>Confirma la ubicación de entrega arriba. Luego inicia la ruta y, si necesitas, activa el seguimiento GPS.</Text><Btn title={busy?'Procesando…':'🚀 Iniciar ruta'} green disabled={busy} onPress={()=>work(()=>sendCurrentLocation(token,req.code))}/><Btn title={tracking?'⏹ Detener GPS':'📡 Activar seguimiento GPS'} danger={tracking} outline={!tracking} onPress={track}/><Btn title="📷 Foto adicional del servicio" outline disabled={busy} onPress={()=>work(()=>extraPhoto(token,req.code,'service'))}/></Card>:null}

    {!done&&stage===2?<><AutoWait token={token} req={req} onUpdated={apply} onLeave={onBack}/><Card style={s.actionCard}><Text style={s.kicker}>PASO 3 · ENTREGA</Text><Text style={s.h2}>Completar entrega</Text><Text style={s.note}>Cuando entregues, toma una foto amplia y nítida. Podrás revisarla en tamaño grande dentro de Evidencias.</Text><Btn title={busy?'Procesando…':'✅ Finalizar entrega con foto'} green disabled={busy} onPress={()=>work(()=>evidence(token,req.code,'delivery'))}/><Btn title="＋ Foto adicional de entrega" outline disabled={busy} onPress={()=>work(()=>extraPhoto(token,req.code,'delivery'))}/>{Number(req.totalToCollect||0)>0?<><Btn title="🏦 Registrar depósito con foto" outline disabled={busy} onPress={()=>work(()=>evidence(token,req.code,'deposit-evidence',req.totalToCollect))}/><Btn title="＋ Otra foto del depósito" outline disabled={busy} onPress={()=>work(()=>extraPhoto(token,req.code,'deposit'))}/></>:null}</Card></>:null}

    <ClientCard token={token} req={req} stage={stage} done={done}/>
    <RecipientCard req={req} stage={stage} done={done}/>
    <EvidenceGallery req={req}/>

    {done?<Card style={s.done}><Text style={s.doneText}>✓ Operación {req.status}</Text></Card>:null}
    <Card><Text style={s.kicker}>SOPORTE GOY XPRESS</Text><Text style={s.h2}>¿Tienes una novedad?</Text><Text style={s.note}>Contacta únicamente a soporte si necesitas ayuda con esta operación.</Text><Btn title="💬 Escribir a soporte" green onPress={()=>openWhatsApp(SUPPORT,`GOY XPRESS - Novedad\nOrden: ${req.code}\nCliente: ${req.customer||'-'}\nDetalle:`,'Soporte')}/></Card>
  </View>;
}

export default function CourierAppV17({sessionToken='',onLoggedOut}){
  const[token,setToken]=useState(sessionToken),[profile,setProfile]=useState(null),[jobs,setJobs]=useState([]),[selected,setSelected]=useState(null),[loading,setLoading]=useState(true);
  const load=async currentToken=>{
    if(!currentToken)return;
    const[me,list]=await Promise.all([getMe(currentToken),getCourierJobs(currentToken).catch(error=>{if(error.pendingApproval)return[];throw error})]);
    setProfile(me);
    setJobs(list);
  };
  useEffect(()=>{let alive=true;(async()=>{try{const raw=sessionToken?'':await AsyncStorage.getItem(SESSION);const currentToken=sessionToken||(raw?JSON.parse(raw)?.token:'');if(!alive)return;setToken(currentToken||'');if(currentToken)await load(currentToken)}catch(error){if(alive)Alert.alert('GOY XPRESS',error.message)}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[sessionToken]);
  useEffect(()=>{if(!token||!profile?.approved)return;const id=setInterval(()=>load(token).catch(()=>{}),15000);return()=>clearInterval(id)},[token,profile?.approved]);
  const update=value=>{setJobs(items=>items.map(item=>item.code===value.code?value:item));setSelected(value)};
  const logout=async()=>{await AsyncStorage.removeItem(SESSION);setToken('');setProfile(null);setJobs([]);setSelected(null);onLoggedOut?.()};

  if(loading)return <SafeAreaView style={s.loading}><Image source={require('../assets/goy-logo.jpg')} style={s.logo}/><Text style={s.loadingText}>GOY XPRESS</Text></SafeAreaView>;

  return <SafeAreaView style={s.safe}><StatusBar style="light" backgroundColor={C.navy}/><ScrollView contentContainerStyle={s.page}>
    {selected?<Detail token={token} job={selected} onBack={()=>setSelected(null)} onUpdated={update}/>:<>
      <View style={s.header}><Image source={require('../assets/goy-logo.jpg')} style={s.headerLogo}/><View style={s.flex}><Text style={s.headerKicker}>OPERADOR LOGÍSTICO</Text><Text style={s.headerTitle}>GOY XPRESS</Text><Text style={s.headerSub}>{profile?.name||'Mensajero'}</Text></View><Pressable onPress={()=>load(token)} style={s.refresh}><Text style={s.refreshText}>↻</Text></Pressable></View>
      {!profile?.approved?<Card><Text style={s.h2}>Cuenta pendiente de aprobación</Text><Text style={s.note}>Administración debe habilitar tu cuenta.</Text><Btn title="Actualizar" green onPress={()=>load(token)}/></Card>:<>
        <View style={s.hero}><Text style={s.heroKicker}>TU JORNADA</Text><Text style={s.heroTitle}>{jobs.length} operación(es) asignada(s)</Text><Text style={s.heroText}>Cada operación muestra retiro, destino y evidencias de forma separada para trabajar más rápido y sin confusiones.</Text></View>
        {jobs.length?jobs.map(job=><JobCard key={job.code||job.id} job={job} onOpen={setSelected}/>):<Card><Text style={s.h2}>Sin operaciones pendientes</Text><Text style={s.note}>Cuando administración te asigne una nueva entrega aparecerá aquí.</Text></Card>}
        <Btn title="💬 Soporte GOY XPRESS" green onPress={()=>openWhatsApp(SUPPORT,'Hola soporte GOY XPRESS, necesito ayuda desde la app de mensajero.','Soporte')}/>
      </>}
      <Btn title="Cerrar sesión" outline onPress={logout}/>
    </>}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},page:{padding:15,paddingBottom:54},
  loading:{flex:1,backgroundColor:C.navy,alignItems:'center',justifyContent:'center'},logo:{width:88,height:88,borderRadius:22},loadingText:{color:C.white,fontSize:24,fontWeight:'900',marginTop:10},
  header:{backgroundColor:C.navy,borderRadius:22,padding:13,flexDirection:'row',alignItems:'center',marginBottom:13,shadowColor:C.navy,shadowOpacity:.12,shadowRadius:12,elevation:4},headerLogo:{width:54,height:54,borderRadius:15,marginRight:11},headerKicker:{color:'#8CE6FF',fontSize:9,fontWeight:'900'},headerTitle:{color:C.white,fontWeight:'900',fontSize:20},headerSub:{color:'#BCD8E2',fontSize:11,fontWeight:'700'},refresh:{width:40,height:40,borderRadius:13,backgroundColor:'#FFFFFF15',alignItems:'center',justifyContent:'center'},refreshText:{color:C.white,fontSize:21,fontWeight:'900'},
  hero:{backgroundColor:C.navy2,borderRadius:22,padding:19,marginBottom:13},heroKicker:{color:'#8CE6FF',fontSize:9,fontWeight:'900',letterSpacing:1},heroTitle:{color:C.white,fontSize:24,fontWeight:'900',marginTop:5},heroText:{color:'#C6DCE5',fontSize:13,lineHeight:19,marginTop:7},
  card:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:20,padding:16,marginBottom:12,shadowColor:C.navy,shadowOpacity:.06,shadowRadius:9,elevation:2},jobCard:{padding:17},actionCard:{borderColor:'#B8E5F5'},routeCard:{borderColor:'#B9DDEA'},arrivalCard:{borderColor:'#9ADCB1',backgroundColor:'#FBFFFC'},waitAlert:{borderColor:'#F1C56D',backgroundColor:'#FFF9EA'},collectCard:{backgroundColor:'#FFF7F4',borderColor:'#F2C6B9'},done:{backgroundColor:'#EFFAF2',borderColor:'#B9E4C3'},doneText:{color:C.green,fontWeight:'900',fontSize:16},
  kicker:{color:C.cyan,fontWeight:'900',fontSize:9,letterSpacing:1},title:{color:C.ink,fontSize:22,fontWeight:'900'},h2:{color:C.ink,fontSize:18,fontWeight:'900',marginTop:5},note:{color:C.muted,fontSize:12,lineHeight:18,marginTop:6},line:{color:C.muted,fontSize:12,lineHeight:19,marginTop:5},bold:{fontWeight:'900',color:C.ink},address:{color:C.muted,fontSize:12,lineHeight:18,marginTop:8},
  btn:{backgroundColor:C.cyan,borderRadius:14,paddingHorizontal:14,paddingVertical:13,minHeight:48,justifyContent:'center',alignItems:'center',marginTop:9},btnText:{color:C.white,fontWeight:'900',textAlign:'center',fontSize:13},green:{backgroundColor:C.green},danger:{backgroundColor:C.red},outline:{backgroundColor:C.white,borderWidth:1,borderColor:C.line},outlineText:{color:C.navy},disabled:{opacity:.48},
  row:{flexDirection:'row',gap:8},flex:{flex:1},between:{flexDirection:'row',justifyContent:'space-between',gap:10},code:{color:C.cyan,fontWeight:'900',fontSize:12},servicePill:{alignSelf:'flex-start',backgroundColor:C.soft,color:C.navy,fontWeight:'900',fontSize:10,paddingHorizontal:10,paddingVertical:6,borderRadius:999,marginTop:8},badge:{borderRadius:999,paddingHorizontal:9,paddingVertical:6,alignSelf:'flex-start'},badgeText:{fontWeight:'900',fontSize:9},open:{color:C.cyan,fontWeight:'900',fontSize:11,textAlign:'right',marginTop:13},
  detailHead:{flexDirection:'row',gap:12,alignItems:'center',marginBottom:12},back:{width:43,height:43,borderRadius:14,backgroundColor:C.white,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center'},backText:{fontSize:34,color:C.navy,lineHeight:37},
  steps:{flexDirection:'row',backgroundColor:C.white,borderRadius:18,padding:12,marginBottom:12,borderWidth:1,borderColor:C.line},step:{flex:1,alignItems:'center'},stepDot:{width:30,height:30,borderRadius:15,backgroundColor:'#DDE7EB',alignItems:'center',justifyContent:'center'},stepActive:{backgroundColor:C.cyan},stepDone:{backgroundColor:C.green},stepDotText:{color:C.white,fontWeight:'900'},stepText:{fontSize:9,color:C.muted,fontWeight:'800',marginTop:5},stepTextOn:{color:C.navy},
  routeTitleRow:{flexDirection:'row',alignItems:'center',gap:11},routeMark:{width:42,height:42,borderRadius:13,backgroundColor:C.soft,alignItems:'center',justifyContent:'center'},routeMarkText:{color:C.cyan,fontSize:24,fontWeight:'900'},locationBox:{backgroundColor:'#F8FBFC',borderWidth:1,borderColor:C.line,borderRadius:16,padding:13,marginTop:12},locationHead:{flexDirection:'row',alignItems:'flex-start',gap:10},locationIcon:{fontSize:22},locationLabel:{color:C.cyan,fontWeight:'900',fontSize:10,textTransform:'uppercase',letterSpacing:.8},locationAddress:{color:C.ink,fontSize:15,fontWeight:'800',lineHeight:21,marginTop:3},activeNavBox:{backgroundColor:'#EFFAF2',borderWidth:1,borderColor:'#B9E4C3',borderRadius:16,padding:13,marginTop:12},activeNavTitle:{color:C.green,fontWeight:'900',fontSize:9,letterSpacing:1},activeNavText:{color:C.ink,fontSize:13,fontWeight:'800',marginTop:4},
  collect:{color:C.red,fontSize:27,fontWeight:'900',marginTop:2},small:{color:C.muted,fontSize:9,fontWeight:'900'},collectBox:{backgroundColor:'#FFF4F1',borderRadius:14,padding:12,marginTop:12},noticeBox:{backgroundColor:'#EFFAF2',borderRadius:14,padding:12,marginTop:12,borderWidth:1,borderColor:'#B9E4C3'},noticeTitle:{color:C.green,fontWeight:'900',fontSize:13},timer:{fontSize:44,fontWeight:'900',color:C.navy,textAlign:'center',marginVertical:12},notice:{backgroundColor:'#FFF1CC',borderRadius:12,padding:11,color:'#795100',fontWeight:'800',lineHeight:18},noticeGreen:{backgroundColor:'#EAF8ED',borderRadius:12,padding:11,color:'#237B35',fontWeight:'800',lineHeight:18},
  evidenceItem:{marginTop:15},photoPress:{position:'relative',borderRadius:17,overflow:'hidden',backgroundColor:'#E7EFF2',borderWidth:1,borderColor:C.line},evidencePhoto:{width:'100%',height:280,backgroundColor:'#E7EFF2'},evidenceLabel:{color:C.navy,fontSize:12,fontWeight:'900',marginTop:7},photoZoom:{position:'absolute',right:10,bottom:10,backgroundColor:'#071C2AD9',borderRadius:999,paddingHorizontal:10,paddingVertical:6},photoZoomText:{color:C.white,fontSize:9,fontWeight:'900',letterSpacing:.6},
  previewSafe:{flex:1,backgroundColor:'#02080C'},previewTop:{height:64,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#FFFFFF1C'},previewTitle:{color:C.white,fontSize:17,fontWeight:'900'},previewClose:{width:44,height:44,borderRadius:14,backgroundColor:'#FFFFFF18',alignItems:'center',justifyContent:'center'},previewCloseText:{color:C.white,fontSize:22,fontWeight:'900'},previewImage:{flex:1,width:'100%',backgroundColor:'#02080C'},previewHint:{color:'#B9C9D0',fontSize:11,textAlign:'center',padding:14}
});
