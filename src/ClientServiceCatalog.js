import React,{useState}from'react';
import{Image,Modal,Pressable,ScrollView,StyleSheet,Text,View}from'react-native';

const C={navy:'#071C2A',cyan:'#00A9E8',green:'#38A844',white:'#fff',ink:'#132B36',muted:'#687D88',line:'#DCE8ED',bg:'#F4F8FA'};
const ASSET_BASE='https://goy-xpress-app.kyrshopecu.workers.dev/assets';
const SERVICES=[
 {title:'Mensajería y Envíos',image:{uri:`${ASSET_BASE}/01_mensajeria_envios.png`}},
 {title:'Trámites Generales',image:{uri:`${ASSET_BASE}/02_tramites_generales.png`}},
 {title:'Cambio de Dinero para tu Negocio',image:{uri:`${ASSET_BASE}/03_cambio_dinero_negocio.png`}},
 {title:'Apoyo Legal y Judicial',image:{uri:`${ASSET_BASE}/04_apoyo_legal_judicial.png`}},
 {title:'Trámites Vehiculares',image:{uri:`${ASSET_BASE}/05_tramites_vehiculares.png`}},
 {title:'Apostilla de Documentos',image:{uri:`${ASSET_BASE}/06_apostilla_documentos.png`}},
 {title:'Mensajería Ejecutiva',image:{uri:`${ASSET_BASE}/07_mensajeria_ejecutiva.png`}},
 {title:'Servicios Adicionales',image:{uri:`${ASSET_BASE}/08_servicios_adicionales.png`}},
];

export default function ClientServiceCatalog(){
 const[open,setOpen]=useState(false);
 return <>
  <Pressable accessibilityRole="button" accessibilityLabel="Ver catálogo de servicios" onPress={()=>setOpen(true)} style={({pressed})=>[s.fab,pressed&&{opacity:.84}]}><Text style={s.icon}>▦</Text><Text style={s.fabText}>Servicios</Text></Pressable>
  <Modal visible={open} animationType="slide" transparent onRequestClose={()=>setOpen(false)}><View style={s.backdrop}><View style={s.sheet}>
   <View style={s.head}><View style={{flex:1}}><Text style={s.kicker}>GOY XPRESS</Text><Text style={s.title}>Nuestros servicios</Text><Text style={s.note}>Conoce visualmente cada servicio disponible en Quito.</Text></View><Pressable onPress={()=>setOpen(false)} style={s.close}><Text style={s.closeText}>×</Text></Pressable></View>
   <ScrollView contentContainerStyle={s.grid}>{SERVICES.map(x=><View key={x.title} style={s.card}><Image source={x.image} style={s.photo} resizeMode="cover"/><Text style={s.cardTitle}>{x.title}</Text></View>)}</ScrollView>
  </View></View></Modal>
 </>;
}
const s=StyleSheet.create({fab:{position:'absolute',left:16,bottom:92,zIndex:998,backgroundColor:C.green,borderRadius:18,paddingHorizontal:14,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:7,shadowColor:'#000',shadowOpacity:.22,shadowRadius:10,elevation:8},icon:{color:C.white,fontSize:18,fontWeight:'900'},fabText:{color:C.white,fontWeight:'900'},backdrop:{flex:1,backgroundColor:'#041820AA',justifyContent:'flex-end'},sheet:{height:'90%',backgroundColor:C.bg,borderTopLeftRadius:26,borderTopRightRadius:26,padding:16},head:{flexDirection:'row',gap:12,alignItems:'flex-start'},kicker:{color:C.cyan,fontSize:10,fontWeight:'900',letterSpacing:1},title:{color:C.ink,fontSize:24,fontWeight:'900',marginTop:3},note:{color:C.muted,fontSize:12,lineHeight:18,marginTop:4},close:{width:42,height:42,borderRadius:14,backgroundColor:C.white,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:C.line},closeText:{fontSize:28,color:C.navy,lineHeight:30},grid:{paddingVertical:14,paddingBottom:35,flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'},card:{width:'48%',backgroundColor:C.white,borderRadius:16,overflow:'hidden',borderWidth:1,borderColor:C.line,marginBottom:12},photo:{width:'100%',aspectRatio:3/4,backgroundColor:'#E7EFF2'},cardTitle:{color:C.navy,fontWeight:'900',fontSize:12,lineHeight:16,padding:10}});