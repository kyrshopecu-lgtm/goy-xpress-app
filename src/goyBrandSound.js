import {Vibration} from 'react-native';
import {Audio} from 'expo-av';

const SOUND=require('../assets/goy_xpress_event.mp3');
const DEFAULT_PATTERN=[0,180,90,180,90,260];

export async function playGoyEventSound({vibrate=true,pattern=DEFAULT_PATTERN}={}){
  if(vibrate){
    try{Vibration.cancel();Vibration.vibrate(pattern,false);}catch{}
  }
  try{
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS:true,
      shouldDuckAndroid:true,
      playThroughEarpieceAndroid:false,
      staysActiveInBackground:false,
    });
    const {sound}=await Audio.Sound.createAsync(SOUND,{shouldPlay:true,volume:1.0});
    sound.setOnPlaybackStatusUpdate(status=>{
      if(status?.didJustFinish)sound.unloadAsync().catch(()=>{});
    });
    return sound;
  }catch(error){
    console.warn('GOY XPRESS sound unavailable',error?.message||error);
    return null;
  }
}

export function vibrateGoy(pattern=DEFAULT_PATTERN){
  try{Vibration.cancel();Vibration.vibrate(pattern,false);}catch{}
}
