// Support chat with the Muntej team: Intercom's Messenger, opened from Saree3 (his menu), Settings and My profile;
// Intercom's own bubble stays hidden. Native app: @intercom/intercom-react-native (only in builds made with the
// Intercom keys: older builds simply don't offer it, so over-the-air updates never crash them). Web: Intercom's JS
// Messenger. The person is signed in to Intercom with a server-made identity hash (supabase/functions/support-identity).
import { useEffect, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

type Identity = { userId: string; email: string | null; name: string; role: string; company: { id: string; name: string } | null; hash: string | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const APP_ID = (Constants.expoConfig?.extra as { intercomAppId?: string } | undefined)?.intercomAppId ?? 'lrn5nc6m';

/** the native SDK, only when this build includes it */
function native(): Any | null {
  if (Platform.OS === 'web' || !NativeModules.IntercomModule) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@intercom/intercom-react-native');
  } catch {
    return null;
  }
}

/** web: load Intercom's Messenger once, hidden launcher */
function webIntercom(): Any | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as Any;
  if (!w.Intercom) {
    const ic: Any = (...args: unknown[]) => ic.c(args);
    ic.q = [];
    ic.c = (args: unknown[]) => ic.q.push(args);
    w.Intercom = ic;
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://widget.intercom.io/widget/${APP_ID}`;
    document.head.appendChild(s);
  }
  return w.Intercom;
}

/** support chat is available here (web, or a native build with Intercom) */
export const supportAvailable = () => Platform.OS === 'web' || !!native();

let signedIn = false;

/** sign the person in to Intercom (once per app run) */
export async function loginSupport() {
  if (signedIn || !supportAvailable()) return;
  const { data, error } = await supabase.functions.invoke<Identity>('support-identity', { body: {} });
  if (error || !data) return;
  const company = data.company ? { id: data.company.id, name: data.company.name } : undefined;
  const sdk = native();
  if (sdk) {
    const Intercom = sdk.default;
    if (data.hash) await Intercom.setUserHash(data.hash);
    await Intercom.loginUserWithUserAttributes({ userId: data.userId, email: data.email ?? undefined });
    await Intercom.updateUser({ name: data.name, companies: company ? [company] : undefined, customAttributes: { role: data.role } });
    await Intercom.setLauncherVisibility(sdk.Visibility.GONE);
  } else {
    webIntercom()?.('boot', {
      app_id: APP_ID,
      user_id: data.userId,
      email: data.email ?? undefined,
      name: data.name,
      user_hash: data.hash ?? undefined,
      company: company ? { company_id: company.id, name: company.name } : undefined,
      role: data.role,
      hide_default_launcher: true,
    });
  }
  signedIn = true;
}

/** open the conversation with the Muntej team */
export async function openSupport() {
  await loginSupport();
  const sdk = native();
  if (sdk) await sdk.default.present();
  else webIntercom()?.('show');
}

/** on sign-out */
export async function logoutSupport() {
  if (!signedIn) return;
  signedIn = false;
  const sdk = native();
  if (sdk) await sdk.default.logout();
  else webIntercom()?.('shutdown');
}

/** unread replies from the team (Saree3's badge) */
export function useUnreadSupport() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const sdk = native();
    if (sdk) {
      sdk.default.getUnreadConversationCount().then(setN, () => {});
      const sub = sdk.default.addEventListener(sdk.IntercomEvents.IntercomUnreadCountDidChange, (e: { count?: number }) => setN(e?.count ?? 0));
      return () => sub?.remove?.();
    }
    const web = webIntercom();
    web?.('onUnreadCountChange', (c: number) => setN(c));
    return undefined;
  }, []);
  return n;
}
