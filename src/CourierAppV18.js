import React,{useEffect,useRef,useState}from'react';
import{Alert,Image,Linking,Modal,Platform,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,View}from'react-native';
import AsyncStorage from'@react-native-async-storage/async-storage';
import{Asset}from'expo-asset';
import * as FileSystem from'expo-file-system';
import * as ImagePicker from'expo-image-picker';
import Share from'react-native-share';
import{StatusBar}from'expo-status-bar';
import{API_BASE,getCourierJob,getCourierJobs,getMe,sendCurrentLocation,setWaitDecision,startLocationTracking,updateCourierWait}from'./goyApiV5';
import{playGoyEventSound}from'./goyBrandSound';
import{installGoyNotificationReceivedListener,installGoyNotificationResponseListener,registerGoyPushNotifications}from'./goyPushNotifications';

const SESSION='goy_courier_session_v13',SEEN_ASSIGNMENTS='goy_courier_seen_assignments_v1';
const SUPPORT='593997729964';
const C={navy:'#071C2A',navy2:'#0B2F40',cyan:'#00A9E8',green:'#38A844',amber:'#F5B940',red:'#C64A4A',bg:'#F3F7F9',white:'#fff',ink:'#132B36',muted:'#687D88',line:'#DCE8ED',soft:'#EDF9FD',softGreen:'#EFFAF2'};
const digits=v=>String(v||'').replace(/\D/g,'');
const money=v=>`$${Number(v||0).toFixed(2)}`;
const text=value=>String(value||'').trim();
const firstText=(...values)=>values.map(text).find(Boolean)||'';
const whatsappNumber=value=>{const p=digits(value);if(!p)return'';if(p.startsWith('593'))return p;if(p.startsWith('0')&&p.length>=10)return`593${p.slice(1)}`;if(p.startsWith('9')&&p.length===9)return`593${p}`;return p};

async function openWhatsApp(phone,message,label='WhatsApp'){
  const number=whatsappNumber(phone);
  if(!number)return Alert.alert(label,'No hay un número de WhatsApp registrado.');
  try{await Linking.openURL(`https://wa.me/${number}?text=${encodeURIComponent(message)}`)}catch{Alert.alert(label,'No se pudo abrir WhatsApp. Verifica que esté instalado o disponible en el teléfono.')}
}
async function brandedLogoFileUri(){
  const asset=Asset.fromModule(require('../assets/goy-logo.jpg'));
  await asset.downloadAsync();
  const source=asset.localUri||asset.uri;
  if(!source)throw new Error('No se pudo preparar el logotipo GOY XPRESS.');
  const dir=`${FileSystem.cacheDirectory}goy-whatsapp/`;
  const dirInfo=await FileSystem.getInfoAsync(dir);
  if(!dirInfo.exists)await FileSystem.makeDirectoryAsync(dir,{intermediates:true});
  const target=`${dir}goy-xpress-logo.jpg`;
  await FileSystem.copyAsync({from:source,to:target});
  const saved=await FileSystem.getInfoAsync(target);
  if(!saved.exists||!saved.size)throw new Error('No se pudo crear el JPG del logotipo.');
  return target;
}
async function installedWhatsappTargets(){
  const fallback=[Share.Social.WHATSAPP];
  if(Platform.OS!=='android'||typeof Share.isPackageInstalled!=='function')return fallback;
  const candidates=[['com.whatsapp',Share.Social.WHATSAPP],['com.whatsapp.w4b',Share.Social.WHATSAPPBUSINESS]],targets=[];
  for(const [pkg,social] of candidates){
    try{const status=await Share.isPackageInstalled(pkg);if(status?.isInstalled&&social)targets.push(social)}catch{}
  }
  return targets.length?targets:fallback;
}
async function shareBrandedWhatsApp(phone,message,label='WhatsApp'){
  const number=whatsappNumber(phone);
  if(!number)return Alert.alert(label,'No hay un número de WhatsApp registrado.');
  try{
    const url=await brandedLogoFileUri();
    const media={title:'GOY XPRESS',message,url,type:'image/jpeg',filename:'goy-xpress-logo.jpg',useInternalStorage:true};
    const targets=await installedWhatsappTargets();
    if(targets.length===1){
      const result=await Share.shareSingle({...media,social:targets[0]});
      if(result?.success===false)throw new Error(result?.message||'WhatsApp rechazó la imagen.');
      return;
    }
    const result=await Share.open({...media,failOnCancel:false});
    if(result?.success===false&&!result?.dismissedAction)throw new Error(result?.message||'No se pudo compartir el logotipo.');
  }catch(error){
    try{
      const url=await brandedLogoFileUri();
      const result=await Share.open({title:'GOY XPRESS',message,url,type:'image/jpeg',filename:'goy-xpress-logo.jpg',failOnCancel:false,useInternalStorage:true});
      if(result?.success!==false||result?.dismissedAction)return;
    }catch{}
    Alert.alert(
      'No se pudo adjuntar el logo',
      'Para conservar la imagen no abrirá un mensaje de solo texto. Verifica que WhatsApp esté instalado y vuelve a intentar.',
    );
  }
}
function recipientData(req){const raw=req?.recipient;return{name:(typeof raw==='string'?raw:raw?.name)||req?.recipientName||req?.receiverName||'Destinatario',phone:req?.recipientPhone||req?.recipientWhatsapp||req?.recipientWhatsApp||raw?.phone||raw?.whatsapp||req?.destinationPhone||req?.receiverPhone||req?.contactPhone||''}}
function routeLocations(req){
  const pickup=firstText(req?.originAddress,req?.pickupAddress,req?.pickup?.address,req?.origin?.address,req?.fromAddress);
  const delivery=firstText(req?.destinationAddress,req?.deliveryAddress,req?.destination?.address,req?.recipient?.address,req?.toAddress);
  const procedure=firstText(req?.procedureAddress,req?.serviceAddress,req?.locationAddress,req?.serviceLocation);
  const firstStop=Array.isArray(req?.stops)?firstText(req.stops[0]?.address):'';
  return{pickup,target:delivery||procedure||firstStop,targetLabel:delivery?'Punto de entrega':procedure?'Lugar del trámite':firstStop?'Primera parada':'Punto de entrega',targetKind:delivery?'delivery':procedure?'procedure':firstStop?'stop':'delivery'};
}
function depositBankList(req){
  const out=[];
  const add=value=>{const v=text(typeof value==='string'?value:value?.name||value?.bank||value?.destination);if(v&&!out.includes(v))out.push(v)};
  if(Array.isArray(req?.depositBanks))req.depositBanks.forEach(add);
  if(Array.isArray(req?.banks))req.banks.forEach(add);
  const legacy=firstText(req?.depositDestination,req?.bank,req?.depositBank,req?.bankName);
  if(legacy)legacy.split(/[\n;]+/).map(text).filter(Boolean).forEach(add);
  return out;
}
function destinationMapUrl(address){return address?`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`:''}
function validMapLink(value){return /^https?:\/\/(?:[^/]+\.)?(?:google\.[^/]+|maps\.app\.goo\.gl|goo\.gl)\//i.test(String(value||'').trim())}
async function openLocation(address,label,mapLink=''){
  const exact=validMapLink(mapLink)?String(mapLink).trim():'';
  const target=exact||destinationMapUrl(address);
  if(!target)return Alert.alert(label,'Esta operación no tiene una ubicación registrada. Comunícate con soporte antes de continuar.');
  try{await Linking.openURL(target)}catch{Alert.alert(label,'No se pudo abrir la navegación. Verifica que Google Maps o un navegador estén disponibles.')}
}

const validPhoto=v=>/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(v||''));
function photoItems(req){const e=req?.evidence||{},a=e.additional||{},out=[];const add=(label,value)=>{const src=typeof value==='string'?value:value?.photo;if(validPhoto(src))out.push({label,src})};add('Paquete al solicitar',e.packagePhoto);add('Retiro',e.pickupPhoto);(a.pickup||[]).forEach((x,i)=>add(`Retiro adicional ${i+1}`,x));(a.service||[]).forEach((x,i)=>add(`Servicio ${i+1}`,x));add('Entrega',e.deliveryPhoto);(a.delivery||[]).forEach((x,i)=>add(`Entrega adicional ${i+1}`,x));add('Depósito',e.depositPhoto||req?.wallet?.depositPhoto);(a.deposit||[]).forEach((x,i)=>add(`Depósito adicional ${i+1}`,x));return out}
function EvidenceGallery({req}){
  const photos=photoItems(req),[selected,setSelected]=useState(null);
  if(!photos.length)return null;
  return <Card><View style={s.sectionHead}><View style={s.sectionIcon}><Text style={s.sectionIconText}>F</Text></View><View style={s.flex}><Text style={s.kicker}>EVIDENCIAS</Text><Text style={s.h2}>Fotos registradas</Text></View></View><Text style={s.note}>Las evidencias se muestran en formato amplio. Toca una foto para verla a pantalla completa.</Text>{photos.map((p,i)=><Pressable key={`${p.label}-${i}`} onPress={()=>setSelected(p)} style={({pressed})=>[s.evidenceItem,pressed&&{opacity:.9}]}><Image source={{uri:p.src}} style={s.evidencePhoto} resizeMode="contain"/><View style={s.evidenceFooter}><Text style={s.evidenceLabel}>{p.label}</Text><Text style={s.evidenceOpen}>VER GRANDE</Text></View></Pressable>)}<Modal visible={Boolean(selected)} transparent={false} animationType="fade" onRequestClose={()=>setSelected(null)}><SafeAreaView style={s.viewer}><StatusBar style="light" backgroundColor={C.navy}/><View style={s.viewerTop}><View style={s.flex}><Text style={s.viewerKicker}>EVIDENCIA GOY XPRESS</Text><Text style={s.viewerTitle}>{selected?.label||'Fotografía'}</Text></View><Pressable onPress={()=>setSelected(null)} style={s.viewerClose}><Text style={s.viewerCloseText}>×</Text></Pressable></View>{selected?<Image source={{uri:selected.src}} style={s.viewerImage} resizeMode="contain"/>:null}<Text style={s.viewerHint}>Toca × para volver a la operación.</Text></SafeAreaView></Modal></Card>
}

async function api(path,{method='GET',token,body,timeoutMs=30000}={}){
  const controller=typeof AbortController!=='undefined'?new AbortController():null;
  const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
  let response;
  try{response=await fetch(`${API_BASE}${path}`,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:controller?.signal})}
  catch(error){if(error?.name==='AbortError')throw new Error('La operación tardó demasiado. Verifica tu internet e intenta nuevamente.');throw new Error('No se pudo conectar con GOY XPRESS. Verifica tu internet e intenta nuevamente.')}
  finally{if(timer)clearTimeout(timer)}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.error||'No se pudo completar la operación.');error.status=response.status;error.pendingApproval=Boolean(data.pendingApproval);throw error}
  return data;
}
async function photo(){
  const permission=await ImagePicker.requestCameraPermissionsAsync();
  if(!permission.granted)throw new Error('Se necesita permiso de cámara.');
  const result=await ImagePicker.launchCameraAsync({mediaTypes:['images'],allowsEditing:false,quality:.65,base64:true});
  if(result.canceled||!result.assets?.[0])return null;
  const asset=result.assets[0],out=`data:${asset.mimeType||'image/jpeg'};base64,${asset.base64||''}`;
  if(!asset.base64)throw new Error('No se pudo procesar la foto.');
  if(out.length>1750000)throw new Error('La fotografía quedó demasiado pesada. Intenta nuevamente acercándote un poco al documento o paquete.');
  return out;
}
async function evidence(token,code,action,amount=0){const p=await photo();if(!p)return null;const updated=await api(`/requests/${encodeURIComponent(code)}/${action}`,{method:'POST',token,body:action==='deposit-evidence'?{photo:p,amount}:{photo:p}});if(action==='delivery')playGoyEventSound();return updated}
async function extraPhoto(token,code,type){const p=await photo();if(!p)return null;const d=await api('/courier-additional-evidence',{method:'POST',token,body:{code,type,photo:p}});return d.request||null}
async function clientInfo(token,code){const d=await api(`/courier-client-info?code=${encodeURIComponent(code)}`,{token});return d.client||{}}

function Btn({title,onPress,green=false,danger=false,outline=false,disabled=false}){return <Pressable disabled={disabled} onPress={onPress} style={({pressed})=>[s.btn,green&&s.green,danger&&s.danger,outline&&s.outline,disabled&&s.disabled,pressed&&{opacity:.82}]}><Text style={[s.btnText,outline&&s.outlineText]}>{title}</Text></Pressable>}
function Card({children,style}){return <View style={[s.card,style]}>{children}</View>}
function Status({value}){const v=String(value||'Pendiente'),done=v==='Entrega finalizada',route=['Recogido','En camino'].includes(v),bad=v==='Cancelado';return <View style={[s.badge,{backgroundColor:done?'#EAF8ED':route?'#EAF8FE':bad?'#FDEEEE':'#FFF7E3'}]}><Text style={[s.badgeText,{color:done?C.green:route?C.cyan:bad?C.red:'#9A6800'}]}>{v}</Text></View>}
function Step({n,title,active,done}){return <View style={s.step}><View style={[s.stepDot,active&&s.stepActive,done&&s.stepDone]}><Text style={s.stepDotText}>{done?'✓':n}</Text></View><Text style={[s.stepText,(active||done)&&s.stepTextOn]}>{title}</Text></View>}
function SectionHead({letter,kicker,title}){return <View style={s.sectionHead}><View style={s.sectionIcon}><Text style={s.sectionIconText}>{letter}</Text></View><View style={s.flex}><Text style={s.kicker}>{kicker}</Text><Text style={s.h2}>{title}</Text></View></View>}

function LocationBlock({title,address,buttonTitle,current=false,onPress}){return <View style={[s.locationBlock,current&&s.locationCurrent]}><View style={s.between}><View style={s.flex}><Text style={[s.locationTitle,current&&s.locationTitleCurrent]}>{title}</Text><Text style={s.locationAddress}>{address||'Ubicación no registrada'}</Text></View>{current?<View style={s.currentPill}><Text style={s.currentPillText}>AHORA</Text></View>:null}</View><Btn title={buttonTitle} green={current} outline={!current} disabled={!address} onPress={onPress}/></View>}
function RouteCard({req,stage}){
  const loc=routeLocations(req),stops=Array.isArray(req?.stops)?req.stops.filter(stop=>text(stop?.address)):[];
  const pickupMap=firstText(req?.originMapUrl,req?.pickupMapUrl);
  const targetMap=firstText(req?.destinationMapUrl,req?.deliveryMapUrl);
  const current=stage===0?(loc.pickup||loc.target):(loc.target||loc.pickup);
  const currentMap=stage===0&&loc.pickup?pickupMap:targetMap||pickupMap;
  const currentTitle=stage===0&&loc.pickup?'Ir al punto de retiro':loc.targetKind==='procedure'?'Ir al lugar del trámite':loc.targetKind==='stop'?'Ir a la primera parada':'Ir al punto de entrega';
  return <Card style={s.routeCard}><SectionHead letter="R" kicker="RUTA DEL SERVICIO" title={stops.length?'Ruta con varias paradas':'Ubicaciones de la operación'}/><Text style={s.note}>{stops.length?'Revisa cada dirección, el tipo de servicio y la tarea indicada antes de iniciar.':'Cada botón abre únicamente el destino indicado. Si el cliente pegó una ubicación de Google Maps, se usa ese punto exacto.'}</Text>{loc.pickup?<LocationBlock title="PUNTO DE RETIRO" address={loc.pickup} current={stage===0} buttonTitle={pickupMap?'Abrir ubicación exacta de retiro':'Abrir retiro en Maps'} onPress={()=>openLocation(loc.pickup,'Punto de retiro',pickupMap)}/>:null}{stops.length?stops.map((stop,index)=><View key={`${stop.order||index+1}-${stop.address}`} style={s.stopRoute}><Text style={s.stopRouteTitle}>PARADA {stop.order||index+1} · {stop.serviceType||'Servicio'}</Text><Text style={s.jobAddress}>{stop.address}</Text>{stop.description?<Text style={s.note}>Tarea: {stop.description}</Text>:null}<Btn title={`Abrir parada ${stop.order||index+1} en Maps`} outline onPress={()=>openLocation(stop.address,`Parada ${stop.order||index+1}`)}/></View>):<LocationBlock title={loc.targetLabel.toUpperCase()} address={loc.target} current={stage>0||!loc.pickup} buttonTitle={targetMap?'Abrir ubicación exacta de entrega':loc.targetKind==='procedure'?'Abrir trámite en Maps':'Abrir entrega en Maps'} onPress={()=>openLocation(loc.target,loc.targetLabel,targetMap)}/>} {!stops.length&&current?<View style={s.nextRoute}><Text style={s.nextRouteLabel}>SIGUIENTE DESTINO</Text><Text style={s.nextRouteAddress}>{current}</Text><Btn title={`NAVEGAR AHORA · ${currentTitle}`} green onPress={()=>openLocation(current,currentTitle,currentMap)}/></View>:!stops.length?<View style={s.routeWarning}><Text style={s.routeWarningText}>Esta orden no tiene una ubicación utilizable. Contacta a soporte antes de salir.</Text></View>:null}{!stops.length&&loc.pickup&&loc.target&&req?.route?.mapUrl?<Btn title="Ver ruta completa retiro → entrega" outline onPress={()=>Linking.openURL(req.route.mapUrl).catch(()=>Alert.alert('Ruta','No se pudo abrir la ruta completa.'))}/>:null}</Card>
}

function ClientCard({token,req,stage,done}){const[data,setData]=useState(null);useEffect(()=>{let alive=true;clientInfo(token,req.code).then(v=>alive&&setData(v)).catch(()=>alive&&setData({name:req.customer,phone:req.phone}));return()=>{alive=false}},[token,req.code]);const phone=data?.phone||req.phone,name=data?.businessName||data?.name||req.customer||'Cliente',pickupAddress=routeLocations(req).pickup;const pickup=`Hola ${name}, somos GOY XPRESS.\n\nNuestro mensajero ya está en camino para retirar tu pedido.\nNúmero de seguimiento: ${req.code}.${pickupAddress?`\nPunto de retiro: ${pickupAddress}.`:''}\n\nGracias por confiar en GOY XPRESS.`;const general=`Hola ${name}, soy el operador logístico de GOY XPRESS asignado a la orden ${req.code}.`;return <Card><SectionHead letter="C" kicker="CONTACTO" title="Cliente / remitente"/><Text style={s.contactName}>{name}</Text><Text style={s.line}>RUC / Cédula: <Text style={s.bold}>{data?.documentId||'No registrado'}</Text></Text><Text style={s.line}>Dirección registrada: <Text style={s.bold}>{data?.address||'No registrada'}</Text></Text>{stage===0&&!done?<View style={s.noticeBox}><Text style={s.noticeTitle}>Aviso de retiro</Text><Text style={s.note}>Confirma al cliente que vas en camino antes de salir.</Text><Btn title="Avisar por WhatsApp · vamos a retirar" green onPress={()=>shareBrandedWhatsApp(phone,pickup,'Cliente')}/></View>:null}<View style={s.row}><View style={s.flex}><Btn title="Llamar" green onPress={()=>digits(phone)?Linking.openURL(`tel:${digits(phone)}`):Alert.alert('Cliente','No hay teléfono registrado.')}/></View><View style={s.flex}><Btn title="WhatsApp" outline onPress={()=>shareBrandedWhatsApp(phone,general,'Cliente')}/></View></View></Card>}

function PackageInfoCard({req}){if(req.kind!=='package'&&!req.vehicleRequired)return null;const photo=req?.evidence?.packagePhoto;return <Card><SectionHead letter="P" kicker="PAQUETE" title={req.vehicleRequired?'Servicio de auto · cotización':'Retiro y/o entrega de paquetes'}/><Text style={s.line}>Medidas: <Text style={s.bold}>{Number(req.depthCm||0)} × {Number(req.widthCm||0)} × {Number(req.heightCm||0)} cm</Text></Text><Text style={s.line}>Peso: <Text style={s.bold}>{Number(req.weightKg||0)} kg</Text></Text><Text style={s.line}>Valor declarado: <Text style={s.bold}>{money(req.productValue||0)}</Text></Text><Text style={s.note}>Política: no delicado · máximo $1.000 · 10 min de espera incluidos.</Text>{photo&&validPhoto(photo)?<Image source={{uri:photo}} style={s.packagePhoto} resizeMode="contain"/>:null}</Card>}

function DepositInfoCard({req}){
  if(req.kind!=='deposit')return null;
  const method=String(req.depositMethod||'').toLowerCase(),banks=depositBankList(req);
  const checks=Math.max(0,Math.floor(Number(req.checkCount??req.depositPricing?.checkCount??0)));
  const cash=Math.max(0,Number(req.cashAmount??req.depositPricing?.cashAmount??0));
  const details=firstText(req.depositDetails,req.details,req.instructions,req.operationDetail);
  const reference=firstText(req.internalReference,req.reference);
  const isCash=method==='cash'||(!method&&cash>0);
  return <Card style={s.depositCard}>
    <SectionHead letter="$" kicker="DATOS DEL DEPÓSITO" title={isCash?'Depósito en efectivo':'Depósito de cheques'}/>
    <View style={s.depositHighlight}>
      <Text style={s.depositLabel}>{isCash?'VALOR A DEPOSITAR':'NÚMERO DE CHEQUES'}</Text>
      <Text style={s.depositValue}>{isCash?money(cash):String(checks)}</Text>
    </View>
    <Text style={s.depositSectionTitle}>{banks.length>1?'BANCOS / DESTINOS':'BANCO / DESTINO'}</Text>
    {banks.length?banks.map((bank,index)=><View key={`${bank}-${index}`} style={s.depositBankRow}><View style={s.depositBankNumber}><Text style={s.depositBankNumberText}>{index+1}</Text></View><Text style={s.depositBankText}>{bank}</Text></View>):<View style={s.routeWarning}><Text style={s.routeWarningText}>No se registró banco o institución. Confirma con administración antes de realizar el depósito.</Text></View>}
    {!isCash?<Text style={s.line}>Cantidad total de cheques: <Text style={s.bold}>{checks||'No registrada'}</Text></Text>:null}
    {reference?<Text style={s.line}>Referencia: <Text style={s.bold}>{reference}</Text></Text>:null}
    {details?<View style={s.noticeBox}><Text style={s.noticeTitle}>Indicaciones para el depósito</Text><Text style={s.note}>{details}</Text></View>:null}
    <Text style={s.note}>Verifica banco, cantidad de cheques o valor en efectivo antes de realizar la gestión. Conserva la evidencia correspondiente.</Text>
  </Card>
}

function ServiceDetailCard({req}){
  const kind=String(req.kind||'').toLowerCase();
  const serviceName=firstText(req.serviceLabel,kind==='shipment'?(req.deliveryMode==='express'?'Envío Express':'Entrega programada'):kind==='procedure'?'Trámite ejecutivo':kind==='deposit'?'Depósito':kind==='package'?'Retiro y/o entrega de paquetes':kind==='diverse'?'Servicio diverso':'Servicio');
  const serviceDetail=firstText(req.serviceDetail,req.courierDetail,req.serviceInstructions);
  const adminNotes=firstText(req.adminNotes,req.operationNotes);
  const reference=firstText(req.internalReference,req.reference);
  const diverseDetail=firstText(req.diverseDetail,req.details,req.operationDetail);
  const procedureDetail=firstText(req.procedureDetail,req.procedureDescription);
  const hasShipment=kind==='shipment';
  const hasProcedure=kind==='procedure';
  const hasDiverse=kind==='diverse';
  const show=Boolean(serviceDetail||adminNotes||reference||hasShipment||hasProcedure||hasDiverse);
  if(!show)return null;
  const deliveryMode=req.deliveryMode==='express'?'Express':'Programada';
  const payer=req.deliveryPayer==='sender'?'Cliente / remitente':'Destinatario';
  return <Card style={s.serviceDetailCard}>
    <SectionHead letter="i" kicker="DETALLE DEL SERVICIO" title={serviceName}/>
    {serviceDetail?<View style={s.serviceDetailMain}><Text style={s.serviceDetailTitle}>INSTRUCCIONES DEL ADMINISTRADOR</Text><Text style={s.serviceDetailText}>{serviceDetail}</Text></View>:null}
    {hasShipment?<>
      <Text style={s.line}>Modalidad: <Text style={s.bold}>{deliveryMode}</Text></Text>
      <Text style={s.line}>Valor declarado del producto: <Text style={s.bold}>{money(req.productValue||0)}</Text></Text>
      <Text style={s.line}>Cobro contra entrega: <Text style={s.bold}>{req.cashOnDelivery?'Sí':'No'}</Text></Text>
      <Text style={s.line}>Quién paga la entrega: <Text style={s.bold}>{payer}</Text></Text>
    </>:null}
    {hasProcedure?<>
      {req.procedureMode==='scheduled'?<View style={s.scheduleBox}>
        <Text style={s.scheduleTitle}>TRÁMITE PROGRAMADO</Text>
        <Text style={s.line}>Programación: <Text style={s.bold}>{req.scheduleType==='delivery'?'Entrega programada':'Retiro programado'}</Text></Text>
        <Text style={s.line}>Fecha: <Text style={s.bold}>{req.scheduledDate||'No registrada'}</Text></Text>
        <Text style={s.line}>Hora: <Text style={s.bold}>{req.scheduledTime||'No registrada'}</Text></Text>
      </View>:null}
      <Text style={s.line}>Tiempo estimado: <Text style={s.bold}>{Math.max(0,Number(req.waitMinutes||0))||'No registrado'}{Number(req.waitMinutes||0)>0?' min':''}</Text></Text>
      {procedureDetail?<View style={s.noticeBox}><Text style={s.noticeTitle}>Tarea a realizar</Text><Text style={s.note}>{procedureDetail}</Text></View>:null}
    </>:null}
    {hasDiverse&&diverseDetail?<View style={s.noticeBox}><Text style={s.noticeTitle}>{req.customService?'Detalle del servicio personalizado':'Servicio solicitado'}</Text><Text style={s.note}>{diverseDetail}</Text></View>:null}
    {kind!=='deposit'&&reference?<Text style={s.line}>Referencia interna: <Text style={s.bold}>{reference}</Text></Text>:null}
    {adminNotes?<View style={s.adminNotesBox}><Text style={s.adminNotesTitle}>NOTAS PARA OPERACIÓN</Text><Text style={s.adminNotesText}>{adminNotes}</Text></View>:null}
  </Card>
}

function RecipientCard({req,stage,done}){const loc=routeLocations(req);if(Array.isArray(req?.stops)&&req.stops.length)return null;if(req.kind&&!['shipment','package'].includes(req.kind)&&!loc.target)return null;const recipient=recipientData(req),phone=recipient.phone,sender=req.customer||'Cliente GOY XPRESS';const arrival=`Hola ${recipient.name}, somos GOY XPRESS.\n\nEstamos por llegar al lugar indicado para realizar tu entrega.\nEnvío de: ${sender}.\nNúmero de seguimiento: ${req.code}.${loc.target?`\nDirección: ${loc.target}.`:''}\n\nPor favor, mantente pendiente del mensajero. Gracias por confiar en GOY XPRESS.`;const general=`Hola ${recipient.name}, somos GOY XPRESS. Te contactamos por la operación ${req.code}, enviada por ${sender}.`;return <Card><SectionHead letter="D" kicker="CONTACTO" title={loc.targetKind==='procedure'?'Contacto del servicio':'Destinatario'}/><Text style={s.contactName}>{recipient.name}</Text><Text style={s.line}>WhatsApp: <Text style={s.bold}>{phone||'No registrado'}</Text></Text>{loc.target?<Text style={s.line}>{loc.targetLabel}: <Text style={s.bold}>{loc.target}</Text></Text>:null}{stage===2&&!done&&loc.targetKind==='delivery'?<View style={s.noticeBox}><Text style={s.noticeTitle}>Aviso de llegada</Text><Text style={s.note}>Avísale al destinatario que GOY XPRESS está por llegar.</Text><Btn title="Avisar por WhatsApp · estamos por llegar" green onPress={()=>phone?shareBrandedWhatsApp(phone,arrival,'Destinatario'):Alert.alert('Destinatario','Esta orden no tiene WhatsApp del destinatario.')}/></View>:null}<View style={s.row}><View style={s.flex}><Btn title="Llamar" green onPress={()=>digits(phone)?Linking.openURL(`tel:${digits(phone)}`):Alert.alert('Contacto','No hay teléfono registrado.')}/></View><View style={s.flex}><Btn title="WhatsApp" outline onPress={()=>phone?shareBrandedWhatsApp(phone,general,'Contacto'):Alert.alert('Contacto','No hay WhatsApp registrado.')}/></View></View></Card>}

function AutoWait({token,req,onUpdated,onLeave}){const key=`goy_arrival_${req.code}`;const free=Number(req.wait?.freeMinutes||10);const[arrival,setArrival]=useState(null),[sec,setSec]=useState(Number(req.wait?.elapsedMinutes||0)*60),[pending,setPending]=useState(false),[decision,setDecision]=useState('');const tick=useRef(null);
  useEffect(()=>{AsyncStorage.getItem(key).then(raw=>{if(raw){const at=Number(raw);setArrival(at);const elapsed=Math.max(Number(req.wait?.elapsedMinutes||0)*60,Math.floor((Date.now()-at)/1000));setSec(Math.min(elapsed,free*60));}}).catch(()=>{})},[key]);
  useEffect(()=>()=>tick.current&&clearInterval(tick.current),[]);
  useEffect(()=>{if(!arrival||pending||decision==='next')return;tick.current=setInterval(()=>setSec(v=>v+1),1000);return()=>{clearInterval(tick.current);tick.current=null}},[arrival,pending,decision]);
  const min=Math.floor(sec/60);
  useEffect(()=>{if(!arrival)return;if(min>0&&min<=free)updateCourierWait(token,req.code,min).then(onUpdated).catch(()=>{});if(min>=free&&decision!=='continue'){setSec(free*60);setPending(true);updateCourierWait(token,req.code,free).then(onUpdated).catch(()=>{});}},[min,arrival,free,decision,token,req.code]);
  useEffect(()=>{if(!pending)return;const poll=setInterval(async()=>{try{const fresh=await getCourierJob(token,req.code);onUpdated(fresh);const notes=String(fresh.adminNotes||'');if(notes.includes('WAIT_CONTINUE')){setPending(false);setDecision('continue');await setWaitDecision(token,req.code,'continue').then(onUpdated).catch(()=>{});}else if(notes.includes('WAIT_NEXT_DELIVERY')){setPending(false);setDecision('next');await setWaitDecision(token,req.code,'withdraw').then(onUpdated).catch(()=>{});Alert.alert('Administración','Pasa a la siguiente entrega.',[{text:'Ver operaciones',onPress:onLeave}]);}}catch{}},4000);return()=>clearInterval(poll)},[pending,token,req.code,onUpdated,onLeave]);
  useEffect(()=>{if(decision==='continue'&&min>free)updateCourierWait(token,req.code,min).then(onUpdated).catch(()=>{})},[min,decision,free,token,req.code]);
  const arrive=async()=>{const at=Date.now();await AsyncStorage.setItem(key,String(at));setArrival(at);setSec(0);Alert.alert('Llegada registrada',`El tiempo de espera comenzó automáticamente. Tienes ${free} minutos antes de solicitar decisión a administración.`)};
  if(!arrival)return <Card style={s.arrivalCard}><SectionHead letter="T" kicker="LLEGADA" title="¿Ya llegaste al destino?"/><Text style={s.note}>Al confirmar, el contador de espera empieza automáticamente.</Text><Btn title="YA LLEGUÉ · iniciar espera" green onPress={arrive}/></Card>;
  return <Card style={pending?s.waitAlert:null}><Text style={s.kicker}>ESPERA AUTOMÁTICA</Text><Text style={s.h2}>{pending?'Esperando decisión de administración':'Tiempo en el destino'}</Text><Text style={s.timer}>{String(Math.floor(sec/60)).padStart(2,'0')}:{String(sec%60).padStart(2,'0')}</Text>{pending?<><Text style={s.notice}>Llegaste al límite sin recargo. El contador quedó pausado hasta que administración decida.</Text><Text style={s.note}>La decisión se actualizará automáticamente en esta pantalla.</Text></>:decision==='continue'?<Text style={s.noticeGreen}>✓ Administración autorizó continuar esperando. El tiempo adicional ya se registra.</Text>:<Text style={s.note}>El contador está activo automáticamente desde tu llegada.</Text>}</Card>}

function JobCard({job,onOpen}){const done=['Entrega finalizada','Cancelado'].includes(job.status),loc=routeLocations(job),activeAddress=job.status==='Pendiente'||job.status==='Cotizado'||job.status==='Aceptado'||job.status==='Asignado'?(loc.pickup||loc.target):(loc.target||loc.pickup);return <Pressable onPress={()=>onOpen(job)} style={({pressed})=>[s.card,s.jobCard,pressed&&{opacity:.86}]}><View style={s.between}><View style={s.flex}><Text style={s.code}>{job.code}</Text><Text style={s.h2}>{job.customer||'Cliente'}</Text></View><Status value={job.status}/></View><Text style={s.note}>{job.serviceLabel||job.kind||'Servicio'}</Text>{activeAddress?<View style={s.jobAddressBox}><Text style={s.jobAddressLabel}>SIGUIENTE UBICACIÓN</Text><Text style={s.jobAddress}>{activeAddress}</Text></View>:<Text style={s.locationMissing}>Ubicación pendiente de registrar</Text>}<Text style={s.open}>{done?'VER DETALLE':'ABRIR OPERACIÓN →'}</Text></Pressable>}

function ActionCard({token,req,stage,done,busy,tracking,onWork,onTrack}){
  if(done)return <Card style={s.done}><Text style={s.doneText}>✓ Operación {req.status}</Text></Card>;
  if(stage===0)return <Card><SectionHead letter="1" kicker="ACCIÓN ACTUAL" title="Confirmar retiro"/><Text style={s.note}>Toma una foto clara del paquete o documento. Ya no se recorta obligatoriamente a 16:9.</Text><Btn title={busy?'Procesando…':'Confirmar retiro con foto'} green disabled={busy} onPress={()=>onWork(()=>evidence(token,req.code,'pickup'))}/><Btn title="Agregar otra foto de retiro" outline disabled={busy} onPress={()=>onWork(()=>extraPhoto(token,req.code,'pickup'))}/></Card>;
  if(stage===1)return <Card><SectionHead letter="2" kicker="ACCIÓN ACTUAL" title="Iniciar ruta"/><Text style={s.note}>Después del retiro, abre la ubicación de entrega y activa la ruta.</Text><Btn title={busy?'Procesando…':'Iniciar ruta'} green disabled={busy} onPress={()=>onWork(()=>sendCurrentLocation(token,req.code))}/><Btn title={tracking?'Detener seguimiento GPS':'Activar seguimiento GPS'} danger={tracking} outline={!tracking} onPress={onTrack}/><Btn title="Agregar foto del servicio" outline disabled={busy} onPress={()=>onWork(()=>extraPhoto(token,req.code,'service'))}/></Card>;
  return <Card><SectionHead letter="3" kicker="ACCIÓN ACTUAL" title="Completar entrega"/><Text style={s.note}>Toma una foto amplia y nítida como evidencia principal antes de cerrar la operación.</Text><Btn title={busy?'Procesando…':'Finalizar entrega con foto'} green disabled={busy} onPress={()=>onWork(()=>evidence(token,req.code,'delivery'))}/><Btn title="Agregar otra foto de entrega" outline disabled={busy} onPress={()=>onWork(()=>extraPhoto(token,req.code,'delivery'))}/>{Number(req.totalToCollect||0)>0?<><Btn title="Registrar depósito con foto" outline disabled={busy} onPress={()=>onWork(()=>evidence(token,req.code,'deposit-evidence',req.totalToCollect))}/><Btn title="Agregar otra foto del depósito" outline disabled={busy} onPress={()=>onWork(()=>extraPhoto(token,req.code,'deposit'))}/></>:null}</Card>
}

function Detail({token,job,onBack,onUpdated}){const[req,setReq]=useState(job),[busy,setBusy]=useState(false),[tracking,setTracking]=useState(false),[novelty,setNovelty]=useState(''),stop=useRef(null);useEffect(()=>()=>stop.current?.(),[]);const apply=v=>{if(v){setReq(v);onUpdated(v)}return v};const work=async fn=>{if(busy)return null;setBusy(true);try{return apply(await fn())}catch(e){Alert.alert('Operación',e.message);return null}finally{setBusy(false)}};const stage=req.status==='Entrega finalizada'?3:req.status==='En camino'?2:req.status==='Recogido'?1:0,done=['Entrega finalizada','Cancelado'].includes(req.status);const track=async()=>{if(tracking){stop.current?.();stop.current=null;setTracking(false);return}try{stop.current=await startLocationTracking(token,req.code,apply,e=>Alert.alert('GPS',e.message));setTracking(true)}catch(e){Alert.alert('GPS',e.message)}};
  return <View><View style={s.detailHead}><Pressable onPress={onBack} style={s.back}><Text style={s.backText}>‹</Text></Pressable><View style={s.flex}><Text style={s.kicker}>OPERACIÓN ACTIVA</Text><Text style={s.title}>{req.code}</Text><Status value={req.status}/></View></View>
  <View style={s.steps}><Step n="1" title="Retiro" active={stage===0} done={stage>0}/><Step n="2" title="Ruta" active={stage===1} done={stage>1}/><Step n="3" title="Entrega" active={stage===2} done={stage>2}/></View>
  <RouteCard req={req} stage={stage}/>
  <ServiceDetailCard req={req}/>
  <PackageInfoCard req={req}/>
  <DepositInfoCard req={req}/>
  {Number(req.totalToCollect||0)>0?<Card style={s.collectCard}><Text style={s.small}>VALOR A RECAUDAR</Text><Text style={s.collect}>{money(req.totalToCollect)}</Text><Text style={s.note}>Verifica el valor antes de finalizar la entrega.</Text></Card>:null}
  <ActionCard token={token} req={req} stage={stage} done={done} busy={busy} tracking={tracking} onWork={work} onTrack={track}/>
  {!done&&stage===2?<AutoWait token={token} req={req} onUpdated={apply} onLeave={onBack}/>:null}
  <ClientCard token={token} req={req} stage={stage} done={done}/>
  <RecipientCard req={req} stage={stage} done={done}/>
  <EvidenceGallery req={req}/>
  <Card><SectionHead letter="N" kicker="HISTORIAL" title="Novedades de la orden"/>{(req.novelties||[]).length?(req.novelties||[]).map(item=><View key={item.id||item.at} style={s.noticeBox}><Text style={s.noticeTitle}>{item.authorLabel||'Mensajero GOY XPRESS'}</Text><Text style={s.note}>{item.message}</Text><Text style={s.small}>{item.at?new Date(item.at).toLocaleString('es-EC'):'Ahora'}</Text></View>):<Text style={s.note}>No hay novedades registradas.</Text>}<TextInput value={novelty} onChangeText={setNovelty} multiline maxLength={1200} placeholder="Escribe una novedad: falta documento, institución cerrada, reprogramación..." style={[s.input,{minHeight:92,textAlignVertical:'top'}]}/><Btn title={busy?'Guardando…':'Registrar novedad'} green disabled={busy||!novelty.trim()} onPress={()=>work(async()=>{const updated=await api(`/requests/${encodeURIComponent(req.code)}/novelty`,{method:'POST',token,body:{message:novelty.trim()}});setNovelty('');return updated})}/></Card>
  <Card><SectionHead letter="S" kicker="SOPORTE" title="¿Tienes una novedad?"/><Text style={s.note}>Soporte puede ayudarte con direcciones, datos faltantes o novedades de la operación.</Text><Btn title="Escribir a soporte GOY XPRESS" green onPress={()=>openWhatsApp(SUPPORT,`GOY XPRESS - Novedad\nOrden: ${req.code}\nCliente: ${req.customer||'-'}\nDetalle:`,'Soporte')}/></Card>
  </View>}

export default function CourierAppV18({sessionToken='',onLoggedOut}){
  const[token,setToken]=useState(sessionToken),[profile,setProfile]=useState(null),[jobs,setJobs]=useState([]),[selected,setSelected]=useState(null),[loading,setLoading]=useState(true),[connectionError,setConnectionError]=useState('');
  const load=async currentToken=>{if(!currentToken)return;setConnectionError('');try{const[me,list]=await Promise.all([getMe(currentToken),getCourierJobs(currentToken).catch(error=>{if(error.pendingApproval)return[];throw error})]);setProfile(me);const activeCodes=(list||[]).filter(item=>!['Entrega finalizada','Cancelado'].includes(String(item.status||''))).map(item=>String(item.code||item.id||'')).filter(Boolean);try{const raw=await AsyncStorage.getItem(SEEN_ASSIGNMENTS),seen=new Set(raw?JSON.parse(raw):[]),fresh=activeCodes.filter(code=>!seen.has(code));if(fresh.length)playGoyEventSound();activeCodes.forEach(code=>seen.add(code));await AsyncStorage.setItem(SEEN_ASSIGNMENTS,JSON.stringify([...seen].slice(-300)))}catch{}setJobs(list);return true}catch(error){setConnectionError(error.message||'No se pudo conectar con GOY XPRESS.');throw error}};
  useEffect(()=>{let alive=true;(async()=>{try{const raw=sessionToken?'':await AsyncStorage.getItem(SESSION);const currentToken=sessionToken||(raw?JSON.parse(raw)?.token:'');if(!alive)return;setToken(currentToken||'');if(currentToken)await load(currentToken)}catch(error){if(alive)Alert.alert('GOY XPRESS',error.message)}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[sessionToken]);
  useEffect(()=>{if(token)registerGoyPushNotifications(token,'courier').catch(()=>{})},[token]);
  useEffect(()=>{if(!token)return;const sync=()=>load(token).catch(()=>{}),removeReceived=installGoyNotificationReceivedListener(sync),removeResponse=installGoyNotificationResponseListener(sync);return()=>{removeReceived();removeResponse()}},[token]);
  useEffect(()=>{if(!token||!profile?.approved)return;const id=setInterval(()=>load(token).catch(()=>{}),15000);return()=>clearInterval(id)},[token,profile?.approved]);
  const update=value=>{setJobs(items=>items.map(item=>item.code===value.code?value:item));setSelected(value)};
  const logout=async()=>{await AsyncStorage.removeItem(SESSION);setToken('');setProfile(null);setJobs([]);setSelected(null);onLoggedOut?.()};
  if(loading)return <SafeAreaView style={s.loading}><Image source={require('../assets/goy-logo.jpg')} style={s.logo}/><Text style={s.loadingText}>GOY XPRESS</Text></SafeAreaView>;
  return <SafeAreaView style={s.safe}><StatusBar style="light" backgroundColor={C.navy}/><ScrollView contentContainerStyle={s.page}>{selected?<Detail token={token} job={selected} onBack={()=>setSelected(null)} onUpdated={update}/>:<><View style={s.header}><Image source={require('../assets/goy-logo.jpg')} style={s.headerLogo}/><View style={s.flex}><Text style={s.headerKicker}>MENSAJERO · OPERACIONES</Text><Text style={s.headerTitle}>GOY XPRESS</Text><Text style={s.headerSub}>{profile?.name||'Mensajero'}</Text></View><Pressable onPress={()=>load(token)} style={s.refresh}><Text style={s.refreshText}>↻</Text></Pressable></View>{connectionError?<Card><Text style={s.h2}>No se pudo actualizar la conexión</Text><Text style={s.note}>{connectionError}</Text><Text style={s.note}>Tu estado de aprobación no cambiará por un fallo de internet. Puedes reintentar sin cerrar sesión.</Text><Btn title="Reintentar conexión" green onPress={()=>load(token).catch(error=>Alert.alert('GOY XPRESS',error.message))}/></Card>:profile&&!profile.approved?<Card><Text style={s.h2}>Cuenta pendiente de aprobación</Text><Text style={s.note}>Administración debe habilitar tu cuenta.</Text><Btn title="Actualizar" green onPress={()=>load(token).catch(error=>Alert.alert('GOY XPRESS',error.message))}/></Card>:profile?.approved?<><View style={s.hero}><Text style={s.heroKicker}>PANEL DE OPERACIONES</Text><Text style={s.heroTitle}>{jobs.length} operación(es) asignada(s)</Text><Text style={s.heroText}>Ubicaciones separadas, pasos claros y evidencias en formato amplio.</Text></View>{jobs.length?jobs.map(job=><JobCard key={job.code||job.id} job={job} onOpen={setSelected}/>):<Card><Text style={s.h2}>Sin operaciones pendientes</Text><Text style={s.note}>Cuando administración te asigne una nueva operación aparecerá aquí.</Text></Card>}<Btn title="Soporte GOY XPRESS" green onPress={()=>openWhatsApp(SUPPORT,'Hola soporte GOY XPRESS, necesito ayuda desde la app de mensajero.','Soporte')}/></>:<Card><Text style={s.h2}>Conectando con GOY XPRESS</Text><Text style={s.note}>Estamos verificando tu cuenta y operaciones.</Text></Card>}<Btn title="Cerrar sesión" outline onPress={logout}/></>}</ScrollView></SafeAreaView>
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},page:{padding:15,paddingBottom:52},loading:{flex:1,backgroundColor:C.navy,alignItems:'center',justifyContent:'center'},logo:{width:88,height:88,borderRadius:22},loadingText:{color:C.white,fontSize:24,fontWeight:'900',marginTop:10},
  header:{backgroundColor:C.navy,borderRadius:22,padding:14,flexDirection:'row',alignItems:'center',marginBottom:13,shadowColor:C.navy,shadowOpacity:.16,shadowRadius:12,elevation:4},headerLogo:{width:54,height:54,borderRadius:15,marginRight:11},headerKicker:{color:'#8CE6FF',fontSize:9,fontWeight:'900',letterSpacing:.7},headerTitle:{color:C.white,fontWeight:'900',fontSize:21},headerSub:{color:'#BCD8E2',fontSize:12,fontWeight:'700',marginTop:2},refresh:{width:42,height:42,borderRadius:14,backgroundColor:'#FFFFFF15',alignItems:'center',justifyContent:'center'},refreshText:{color:C.white,fontSize:22,fontWeight:'900'},
  hero:{backgroundColor:C.navy2,borderRadius:22,padding:20,marginBottom:13},heroKicker:{color:'#8CE6FF',fontSize:9,fontWeight:'900',letterSpacing:1},heroTitle:{color:C.white,fontSize:25,fontWeight:'900',marginTop:5},heroText:{color:'#C6DCE5',fontSize:13,lineHeight:19,marginTop:7},
  packagePhoto:{width:'100%',height:220,borderRadius:14,backgroundColor:'#EDF3F5',marginTop:12},serviceDetailCard:{borderColor:'#C9E9F4'},scheduleBox:{backgroundColor:'#F1FBF3',borderWidth:1,borderColor:'#CBE8D1',borderRadius:14,padding:12,marginTop:12,marginBottom:4},scheduleTitle:{color:C.green,fontSize:10,fontWeight:'900',letterSpacing:.8,marginBottom:4},serviceDetailMain:{backgroundColor:C.soft,borderRadius:14,padding:12,marginTop:12,borderWidth:1,borderColor:'#BFE7F5'},serviceDetailTitle:{color:C.cyan,fontSize:9,fontWeight:'900',letterSpacing:.8},serviceDetailText:{color:C.ink,fontSize:14,fontWeight:'800',lineHeight:20,marginTop:5},adminNotesBox:{backgroundColor:'#FFF8E7',borderRadius:14,padding:12,marginTop:12,borderWidth:1,borderColor:'#F0D89A'},adminNotesTitle:{color:'#8A6200',fontSize:9,fontWeight:'900',letterSpacing:.8},adminNotesText:{color:'#6A520B',fontSize:13,fontWeight:'800',lineHeight:19,marginTop:5},depositCard:{borderColor:'#C9E9F4',backgroundColor:'#FCFEFF'},depositHighlight:{backgroundColor:C.navy,borderRadius:16,padding:14,marginTop:12},depositLabel:{color:'#8CE6FF',fontSize:9,fontWeight:'900',letterSpacing:1},depositValue:{color:C.white,fontSize:27,fontWeight:'900',marginTop:3},depositSectionTitle:{color:C.cyan,fontWeight:'900',fontSize:10,letterSpacing:.7,marginTop:15,marginBottom:2},depositBankRow:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#F7FAFB',borderWidth:1,borderColor:C.line,borderRadius:14,padding:11,marginTop:8},depositBankNumber:{width:27,height:27,borderRadius:14,backgroundColor:C.green,alignItems:'center',justifyContent:'center'},depositBankNumberText:{color:C.white,fontWeight:'900',fontSize:11},depositBankText:{flex:1,color:C.ink,fontWeight:'900',fontSize:14,lineHeight:19},stopRoute:{borderWidth:1,borderColor:C.line,borderRadius:15,padding:12,marginTop:10,backgroundColor:'#FAFCFD'},stopRouteTitle:{color:C.cyan,fontWeight:'900',fontSize:10,letterSpacing:.5},
  card:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:20,padding:16,marginBottom:12,shadowColor:C.navy,shadowOpacity:.06,shadowRadius:9,elevation:2},jobCard:{padding:17},arrivalCard:{borderColor:'#9ADCB1',backgroundColor:'#FBFFFC'},waitAlert:{borderColor:'#F1C56D',backgroundColor:'#FFF9EA'},done:{backgroundColor:'#EFFAF2',borderColor:'#B9E4C3'},doneText:{color:C.green,fontWeight:'900',fontSize:16},routeCard:{padding:17,borderColor:'#C9E9F4'},collectCard:{backgroundColor:'#FFF9F7',borderColor:'#F2D9D0'},
  sectionHead:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:2},sectionIcon:{width:34,height:34,borderRadius:11,backgroundColor:C.navy,alignItems:'center',justifyContent:'center'},sectionIconText:{color:'#8CE6FF',fontWeight:'900',fontSize:13},kicker:{color:C.cyan,fontWeight:'900',fontSize:9,letterSpacing:1},title:{color:C.ink,fontSize:22,fontWeight:'900'},h2:{color:C.ink,fontSize:18,fontWeight:'900',marginTop:3},contactName:{color:C.navy,fontSize:17,fontWeight:'900',marginTop:12},note:{color:C.muted,fontSize:12,lineHeight:18,marginTop:6},line:{color:C.muted,fontSize:12,lineHeight:19,marginTop:5},bold:{fontWeight:'900',color:C.ink},
  input:{borderWidth:1,borderColor:C.line,borderRadius:14,padding:12,marginTop:10,backgroundColor:C.white,color:C.ink,fontSize:14},
  btn:{backgroundColor:C.cyan,borderRadius:14,paddingHorizontal:14,paddingVertical:13,minHeight:50,justifyContent:'center',alignItems:'center',marginTop:9},btnText:{color:C.white,fontWeight:'900',textAlign:'center',fontSize:13},green:{backgroundColor:C.green},danger:{backgroundColor:C.red},outline:{backgroundColor:C.white,borderWidth:1,borderColor:'#BCD4DE'},outlineText:{color:C.navy},disabled:{opacity:.43},row:{flexDirection:'row',gap:8},flex:{flex:1},between:{flexDirection:'row',justifyContent:'space-between',gap:10},
  code:{color:C.cyan,fontWeight:'900',fontSize:12},badge:{borderRadius:999,paddingHorizontal:9,paddingVertical:6,alignSelf:'flex-start'},badgeText:{fontWeight:'900',fontSize:9},open:{color:C.cyan,fontWeight:'900',fontSize:11,textAlign:'right',marginTop:14},detailHead:{flexDirection:'row',gap:12,alignItems:'center',marginBottom:12},back:{width:44,height:44,borderRadius:14,backgroundColor:C.white,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center'},backText:{fontSize:34,color:C.navy,lineHeight:37},
  steps:{flexDirection:'row',backgroundColor:C.white,borderRadius:18,padding:12,marginBottom:12,borderWidth:1,borderColor:C.line},step:{flex:1,alignItems:'center'},stepDot:{width:31,height:31,borderRadius:16,backgroundColor:'#DDE7EB',alignItems:'center',justifyContent:'center'},stepActive:{backgroundColor:C.cyan},stepDone:{backgroundColor:C.green},stepDotText:{color:C.white,fontWeight:'900'},stepText:{fontSize:9,color:C.muted,fontWeight:'800',marginTop:5},stepTextOn:{color:C.navy},
  locationBlock:{marginTop:12,backgroundColor:'#F7FAFB',borderWidth:1,borderColor:C.line,borderRadius:16,padding:13},locationCurrent:{backgroundColor:'#F2FBF4',borderColor:'#AADDB7'},locationTitle:{color:C.cyan,fontWeight:'900',fontSize:10,letterSpacing:.8},locationTitleCurrent:{color:C.green},locationAddress:{color:C.ink,fontWeight:'800',fontSize:14,lineHeight:20,marginTop:5},currentPill:{backgroundColor:C.green,borderRadius:999,paddingHorizontal:8,paddingVertical:5,alignSelf:'flex-start'},currentPillText:{color:C.white,fontWeight:'900',fontSize:8},nextRoute:{backgroundColor:C.navy,borderRadius:17,padding:14,marginTop:14},nextRouteLabel:{color:'#8CE6FF',fontSize:9,fontWeight:'900',letterSpacing:1},nextRouteAddress:{color:C.white,fontSize:16,fontWeight:'900',lineHeight:22,marginTop:5},routeWarning:{backgroundColor:'#FFF1EE',borderRadius:14,padding:12,marginTop:12},routeWarningText:{color:'#8F3D32',fontSize:12,fontWeight:'800',lineHeight:18},locationMissing:{color:C.red,fontSize:11,fontWeight:'800',marginTop:10},
  jobAddressBox:{backgroundColor:C.soft,borderRadius:13,padding:11,marginTop:11},jobAddressLabel:{color:C.cyan,fontSize:8,fontWeight:'900',letterSpacing:.8},jobAddress:{color:C.navy,fontSize:13,fontWeight:'800',lineHeight:19,marginTop:4},
  collectBox:{backgroundColor:'#FFF4F1',borderRadius:14,padding:12,marginTop:12},small:{color:C.muted,fontSize:9,fontWeight:'900'},collect:{color:C.red,fontSize:26,fontWeight:'900',marginTop:2},noticeBox:{backgroundColor:C.softGreen,borderRadius:14,padding:12,marginTop:12,borderWidth:1,borderColor:'#B9E4C3'},noticeTitle:{color:C.green,fontWeight:'900',fontSize:13},timer:{fontSize:44,fontWeight:'900',color:C.navy,textAlign:'center',marginVertical:12},notice:{backgroundColor:'#FFF1CC',borderRadius:12,padding:11,color:'#795100',fontWeight:'800',lineHeight:18},noticeGreen:{backgroundColor:'#EAF8ED',borderRadius:12,padding:11,color:'#237B35',fontWeight:'800',lineHeight:18},
  evidenceItem:{marginTop:14,borderRadius:17,overflow:'hidden',backgroundColor:'#E7EFF2',borderWidth:1,borderColor:C.line},evidencePhoto:{width:'100%',height:310,backgroundColor:'#10232C'},evidenceFooter:{backgroundColor:C.white,paddingHorizontal:12,paddingVertical:10,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},evidenceLabel:{color:C.navy,fontSize:12,fontWeight:'900'},evidenceOpen:{color:C.cyan,fontSize:9,fontWeight:'900'},
  viewer:{flex:1,backgroundColor:'#031018'},viewerTop:{flexDirection:'row',alignItems:'center',padding:16,backgroundColor:C.navy},viewerKicker:{color:'#8CE6FF',fontSize:9,fontWeight:'900',letterSpacing:1},viewerTitle:{color:C.white,fontSize:18,fontWeight:'900',marginTop:3},viewerClose:{width:44,height:44,borderRadius:22,backgroundColor:'#FFFFFF18',alignItems:'center',justifyContent:'center'},viewerCloseText:{color:C.white,fontSize:30,lineHeight:32},viewerImage:{flex:1,width:'100%'},viewerHint:{color:'#BCD8E2',textAlign:'center',fontSize:11,padding:14}
});
