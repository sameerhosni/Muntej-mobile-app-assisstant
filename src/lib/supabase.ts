import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import type { Database } from './api/database.types';

// Public values only (see .env). Secrets live in Supabase Edge Function env, never in the app.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.');
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // web: pick up the session from an emailed sign-in link (#access_token=…); native uses the 6-digit code
    detectSessionInUrl: Platform.OS === 'web',
  },
});

/** Where emailed sign-in links should land (web only; on the phone the user types the code). */
export function emailRedirectTo(): string | undefined {
  return Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
}

// Refresh tokens only while the app is in the foreground (native).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
