import React,{useEffect,useRef,useState}from'react';
import{Alert,Animated,Image,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,View}from'react-native';
import AsyncStorage from'@react-native-async-storage/async-storage';
import{StatusBar}from'expo-status-bar';
import ClientAppV12 from'./ClientAppV12';
import{login,pickClientLogo,registerClient}from'./goyApiV5';

const KEY='goy_client_session_v12';
const C={navy:'#071C2A',navy2:'#0B2F40',cyan:'#00A9E8',green:'#38A844',white:'#fff',muted:'#BFD8E2',line:'#2A5365',input:'#F8FCFD'};

function Logo({size=92}){const f=useRef(new Animated.Value(0)).current;useEffect(()=>{const loop=Animated.loop(Animated.sequence([Animated.timing(f,{toValue:1,duration:1700,useNativeDriver:true}),Animated.timing(f,{toValue:0,duration:1700,useNativeDriver:true})]));loop.start();return()=>loop.stop()},[f]);const y=f.interpolate({inputRange:[0,1],outputRange:[0,-5]});return <Animated.View style={[s.logoShell,{transform:[{translateY:y}]}]}><View style={s.logoGlow}/><Image source={require('../assets/goy-logo.jpg')} style={{width:size,height:size,borderRadius:24}}/></Animated.View>}
function Field({label,multiline=false,...props}){return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput {...props} multiline={multiline} placeholderTextColor="#78909B" style={[s.input,multiline&&s.multi]}/></View>}
function Button({title,onPress,disabled=false,outline=false}){return <Pressable disabled={disabled} onPress={onPress} style={({pressed})=>[s.btn,outline&&s.outline,disabled&&s.disabled,pressed&&{opacity:.82}]}><Text style={[s.btnText,outline&&s.outlineText]}>{title}</Text></Pressable>}

function Auth({onAuthenticated}){
  const[mode,setMode]=useState('login'),[busy,setBusy]=useState(false),[logo,setLogo]=useState('');
  const[f,setF]=useState({name:'',businessName:'',phone:'',documentId:'',address:'',email:'',password:''});
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const chooseLogo=async()=>{try{const v=await pickClientLogo();if(v)setLogo(v)}catch(e){Alert.alert('Logo',e.message)}};
  const submit=async()=>{
    if(!f.email.trim()||!f.password)return Alert.alert('Faltan datos','Ingresa correo y contraseña.');
    if(mode==='register'&&(!f.name.trim()||!f.phone.trim()||!f.address.trim()))return Alert.alert('Faltan datos','Completa nombre, WhatsApp y dirección.');
    setBusy(true);
    try{
      if(mode==='register'){
        await registerClient({...f,logo,email:f.email.trim(),phone:f.phone.trim(),address:f.address.trim()});
        Alert.alert('Registro enviado','Tu cuenta fue registrada correctamente. El administrador de GOY XPRESS debe aprobarla antes de que puedas ingresar.');
        setMode('login');
        return;
      }
      const r=await login('client',f.email.trim(),f.password);
      await AsyncStorage.setItem(KEY,JSON.stringify({token:r.token}));
      onAuthenticated(r.token);
    }catch(e){Alert.alert(mode==='register'?'Registro':'Ingreso',e.message||'No se pudo completar la operación.')}finally{setBusy(false)}
  };
  return <SafeAreaView style={s.safe}><StatusBar style="light" backgroundColor={C.navy}/><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled"><View style={s.orbitA}/><View style={s.orbitB}/><Logo/><Text style={s.kicker}>CLIENTE GOY XPRESS</Text><Text style={s.title}>GOY XPRESS</Text><Text style={s.subtitle}>Registra tu cuenta y espera la aprobación del administrador.</Text><View style={s.panel}><View style={s.segment}><Pressable onPress={()=>setMode('login')} style={[s.seg,mode==='login'&&s.segOn]}><Text style={[s.segText,mode==='login'&&s.segTextOn]}>Ingresar</Text></Pressable><Pressable onPress={()=>setMode('register')} style={[s.seg,mode==='register'&&s.segOn]}><Text style={[s.segText,mode==='register'&&s.segTextOn]}>Registrarme</Text></Pressable></View>{mode==='register'?<><View style={s.logoRow}>{logo?<Image source={{uri:logo}} style={s.avatar}/>:<View style={s.avatarEmpty}><Text style={s.avatarTxt}>GX</Text></View>}<View style={{flex:1}}><Text style={s.panelTitle}>Logo de tu negocio</Text><Button title={logo?'Cambiar logo':'Subir logo'} outline onPress={chooseLogo}/></View></View><Field label="Nombre de contacto" value={f.name} onChangeText={v=>set('name',v)} placeholder="Nombre completo"/><Field label="Empresa / emprendimiento" value={f.businessName} onChangeText={v=>set('businessName',v)} placeholder="Nombre comercial"/><Field label="WhatsApp" keyboardType="phone-pad" value={f.phone} onChangeText={v=>set('phone',v)} placeholder="0991234567"/><Field label="Cédula / RUC" value={f.documentId} onChangeText={v=>set('documentId',v)} placeholder="Identificación"/><Field label="Dirección" multiline value={f.address} onChangeText={v=>set('address',v)} placeholder="Dirección habitual en Quito"/></>:null}<Field label="Correo" keyboardType="email-address" autoCapitalize="none" value={f.email} onChangeText={v=>set('email',v)} placeholder="correo@ejemplo.com"/><Field label="Contraseña" secureTextEntry autoCapitalize="none" value={f.password} onChangeText={v=>set('password',v)} placeholder="Mínimo 8 caracteres, letras y números"/><Button title={busy?'Procesando…':mode==='register'?'Enviar registro para aprobación':'Ingresar'} disabled={busy} onPress={submit}/><View style={s.approval}><View style={s.dot}/><Text style={s.approvalText}>Solo las cuentas aprobadas por administración pueden utilizar la aplicación.</Text></View></View></ScrollView></SafeAreaView>
}

export default function ClientAppV13(){
  const[session,setSession]=useState(null),[checking,setChecking]=useState(true);
  useEffect(()=>{let mounted=true;(async()=>{const raw=await AsyncStorage.getItem(KEY).catch(()=>null);if(mounted)setSession(raw?JSON.parse(raw)?.token||null:null);if(mounted)setChecking(false)})();const original=AsyncStorage.removeItem.bind(AsyncStorage);AsyncStorage.removeItem=async key=>{const result=await original(key);if(key===KEY&&mounted)setSession(null);return result};return()=>{mounted=false;AsyncStorage.removeItem=original}},[]);
  if(checking)return <SafeAreaView style={s.loading}><StatusBar style="light" backgroundColor={C.navy}/><Logo size={84}/><Text style={s.loadingText}>GOY XPRESS</Text></SafeAreaView>;
  if(!session)return <Auth onAuthenticated={setSession}/>;
  return <ClientAppV12/>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:C.navy},page:{minHeight:'100%',backgroundColor:C.navy,paddingHorizontal:17,paddingTop:26,paddingBottom:40,alignItems:'center',overflow:'hidden'},loading:{flex:1,backgroundColor:C.navy,alignItems:'center',justifyContent:'center'},loadingText:{color:C.white,fontSize:24,fontWeight:'900',marginTop:10},orbitA:{position:'absolute',width:260,height:260,borderRadius:999,borderWidth:1,borderColor:'#54D7FF35',right:-90,top:40},orbitB:{position:'absolute',width:170,height:170,borderRadius:999,borderWidth:1,borderColor:'#54D7FF42',left:-80,top:220},logoShell:{width:116,height:116,alignItems:'center',justifyContent:'center',marginTop:5},logoGlow:{position:'absolute',width:110,height:110,borderRadius:55,backgroundColor:'#22C4F52A'},kicker:{color:'#8CE6FF',fontSize:10,fontWeight:'900',letterSpacing:1.3,marginTop:7},title:{color:C.white,fontSize:31,fontWeight:'900',marginTop:5},subtitle:{color:C.muted,fontSize:13,fontWeight:'700',textAlign:'center',lineHeight:19,marginTop:5,maxWidth:320},panel:{width:'100%',backgroundColor:C.navy2,borderRadius:24,padding:16,borderWidth:1,borderColor:C.line,marginTop:20,shadowColor:'#000',shadowOpacity:.25,shadowRadius:12,elevation:6},segment:{flexDirection:'row',backgroundColor:'#061923',padding:4,borderRadius:14,marginBottom:5},seg:{flex:1,padding:10,alignItems:'center',borderRadius:11},segOn:{backgroundColor:'#17465A'},segText:{color:'#89AAB8',fontWeight:'900'},segTextOn:{color:C.white},field:{marginTop:11,width:'100%'},label:{color:'#DDF3FA',fontWeight:'800',fontSize:12,marginBottom:6},input:{backgroundColor:C.input,borderRadius:13,paddingHorizontal:13,paddingVertical:12,color:'#132B36',borderWidth:1,borderColor:'#D9E7EC',minHeight:48},multi:{minHeight:78,textAlignVertical:'top'},btn:{backgroundColor:C.green,borderRadius:13,minHeight:47,alignItems:'center',justifyContent:'center',paddingHorizontal:13,marginTop:10},btnText:{color:C.white,fontWeight:'900',textAlign:'center'},outline:{backgroundColor:'transparent',borderWidth:1,borderColor:'#7EC8DE'},outlineText:{color:'#A9E7F7'},disabled:{opacity:.55},logoRow:{flexDirection:'row',alignItems:'center',gap:12,marginVertical:7},avatar:{width:64,height:64,borderRadius:17,borderWidth:1,borderColor:'#FFFFFF55'},avatarEmpty:{width:64,height:64,borderRadius:17,backgroundColor:'#17465A',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#FFFFFF33'},avatarTxt:{color:C.white,fontWeight:'900',fontSize:20},panelTitle:{color:C.white,fontWeight:'900'},approval:{flexDirection:'row',alignItems:'flex-start',marginTop:15,backgroundColor:'#061923',borderRadius:13,padding:11},dot:{width:8,height:8,borderRadius:4,backgroundColor:C.green,marginTop:4,marginRight:8},approvalText:{color:'#BFD8E2',fontSize:11,lineHeight:16,flex:1,fontWeight:'700'}});
