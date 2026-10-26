// Fingerprint / face sign-in (owner, 26 Oct: "login with mobile number and generated passkey"). Turned on in Security:
// the server makes a random key for this phone (phone-auth device_enroll, only its hash is kept there), and the phone
// keeps it in secure storage that opens only with the fingerprint / face. Signing in later: biometrics → the key →
// phone-auth device_signin → a session. The two native modules arrived in build 1.3: older builds hide all of this.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

const KEY = 'muntej_device_key';
const USER = 'muntej_device_user';

export const biometricBuild = Platform.OS !== 'web' && !!requireOptionalNativeModule('ExpoLocalAuthentication') && !!requireOptionalNativeModule('ExpoSecureStore');

const LA = () => require('expo-local-authentication') as typeof import('expo-local-authentication');
const SS = () => require('expo-secure-store') as typeof import('expo-secure-store');

/** the phone has a fingerprint / face set up */
export async function biometricReady() {
  if (!biometricBuild) return false;
  try {
    return (await LA().hasHardwareAsync()) && (await LA().isEnrolledAsync());
  } catch {
    return false;
  }
}

/** this phone already signs in with the fingerprint (for someone) */
export async function deviceUser(): Promise<string | null> {
  if (!biometricBuild) return null;
  try {
    return await SS().getItemAsync(USER);
  } catch {
    return null;
  }
}

/** turn it on (signed in): ask for the fingerprint once, then keep the key behind it */
export async function enableBiometric(prompt: string) {
  const ok = await LA().authenticateAsync({ promptMessage: prompt });
  if (!ok.success) return false;
  const { data, error } = await supabase.functions.invoke<{ key: string; user_id: string }>('phone-auth', {
    body: { action: 'device_enroll', device: `${Platform.OS} ${Platform.Version}` },
  });
  if (error || !data?.key) throw new Error('enroll');
  await SS().setItemAsync(KEY, data.key, { requireAuthentication: true, authenticationPrompt: prompt });
  await SS().setItemAsync(USER, data.user_id);
  track('biometric_enabled');
  return true;
}

export async function disableBiometric() {
  try {
    await SS().deleteItemAsync(KEY);
    await SS().deleteItemAsync(USER);
  } catch {
    // nothing stored
  }
}

/** sign in with the fingerprint; false when cancelled */
export async function signInWithBiometric(prompt: string) {
  const user = await deviceUser();
  if (!user) return false;
  let key: string | null = null;
  try {
    key = await SS().getItemAsync(KEY, { requireAuthentication: true, authenticationPrompt: prompt });
  } catch {
    return false;
  }
  if (!key) return false;
  const { data, error } = await supabase.functions.invoke<{ token_hash: string }>('phone-auth', { body: { action: 'device_signin', user_id: user, key } });
  if (error || !data?.token_hash) {
    // the key was removed on the server: forget it here too
    await disableBiometric();
    throw new Error('device');
  }
  const { error: e2 } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
  if (e2) throw new Error('session');
  track('signed_in_biometric');
  return true;
}
