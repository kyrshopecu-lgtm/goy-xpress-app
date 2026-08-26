import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppState} from 'react-native';
import {createClient} from '@supabase/supabase-js';

export const SUPABASE_URL = String(
  process.env.EXPO_PUBLIC_SUPABASE_URL || '',
)
  .trim()
  .replace(/\/+$/, '');
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  '';
export const INVITE_BASE_URL =
  process.env.EXPO_PUBLIC_INVITE_BASE_URL || 'goyxpress://register';
export const ADMIN_LOGIN_DOMAIN =
  process.env.EXPO_PUBLIC_ADMIN_LOGIN_DOMAIN || 'admin.goyxpress.app';

export const isBackendConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) &&
  SUPABASE_PUBLISHABLE_KEY.length > 20;

export const supabase = isBackendConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

if (supabase && !globalThis.__goySupabaseRefreshListener) {
  globalThis.__goySupabaseRefreshListener = AppState.addEventListener(
    'change',
    state => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    },
  );
}

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      'La conexión segura aún no está configurada. Faltan las variables públicas de Supabase.',
    );
  }
  return supabase;
}
