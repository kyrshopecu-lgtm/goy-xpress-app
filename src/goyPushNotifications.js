import {Platform} from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import {API_BASE} from './goyApiV5';

const CHANNEL_ID='goy-orders';
const SOUND_FILE='goy_xpress_event.mp3';
const VIBRATION_PATTERN=[0,180,90,180,90,260];

Notifications.setNotificationHandler({
  handleNotification:async()=>({
    shouldShowAlert:true,
    shouldShowBanner:true,
    shouldShowList:true,
    shouldPlaySound:false,
    shouldSetBadge:false,
  }),
});

async function configureChannel(){
  if(Platform.OS!=='android')return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID,{
    name:'Pedidos GOY XPRESS',
    description:'Asignaciones y confirmaciones de entrega de GOY XPRESS.',
    importance:Notifications.AndroidImportance.MAX,
    vibrationPattern:VIBRATION_PATTERN,
    enableVibrate:true,
    sound:SOUND_FILE,
    lockscreenVisibility:Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd:false,
  });
}

function projectId(){
  return process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    || Constants?.easConfig?.projectId
    || Constants?.expoConfig?.extra?.eas?.projectId
    || Constants?.expoConfig?.extra?.easProjectId
    || null;
}

async function sendTokenToServer(sessionToken,role,pushToken){
  const response=await fetch(`${API_BASE}/device/push-token`,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      Authorization:`Bearer ${sessionToken}`,
    },
    body:JSON.stringify({
      token:pushToken,
      platform:Platform.OS,
      role,
    }),
  });
  if(!response.ok){
    const body=await response.json().catch(()=>({}));
    throw new Error(body.error||'No se pudo registrar el dispositivo para notificaciones.');
  }
}

export async function registerGoyPushNotifications(sessionToken,role){
  if(!sessionToken)return{ok:false,reason:'no_session'};
  try{
    await configureChannel();
    if(!Device.isDevice)return{ok:false,reason:'physical_device_required'};

    const current=await Notifications.getPermissionsAsync();
    let status=current.status;
    if(status!=='granted'){
      const requested=await Notifications.requestPermissionsAsync();
      status=requested.status;
    }
    if(status!=='granted')return{ok:false,reason:'permission_denied'};

    const easProjectId=projectId();
    let result;
    try{
      result=easProjectId
        ? await Notifications.getExpoPushTokenAsync({projectId:easProjectId})
        : await Notifications.getExpoPushTokenAsync();
    }catch(error){
      console.warn('GOY XPRESS push token unavailable',error?.message||error);
      return{ok:false,reason:'push_project_not_configured'};
    }

    const token=String(result?.data||'').trim();
    if(!token)return{ok:false,reason:'empty_push_token'};
    await sendTokenToServer(sessionToken,role,token);
    return{ok:true,token};
  }catch(error){
    console.warn('GOY XPRESS push registration',error?.message||error);
    return{ok:false,reason:error?.message||'registration_failed'};
  }
}

export function installGoyNotificationResponseListener(onOpen){
  const subscription=Notifications.addNotificationResponseReceivedListener(response=>{
    const data=response?.notification?.request?.content?.data||{};
    onOpen?.(data);
  });
  return()=>subscription.remove();
}

export {CHANNEL_ID,SOUND_FILE,VIBRATION_PATTERN};
