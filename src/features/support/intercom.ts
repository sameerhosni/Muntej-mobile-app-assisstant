// Support chat with the Muntej team: Intercom's Messenger, opened from Saree3 (his menu), Settings and My profile;
// Intercom's own bubble stays hidden. Native app: @intercom/intercom-react-native (only in builds made with the
// Intercom keys: older builds simply don't offer it, so over-the-air updates never crash them). Web: Intercom's JS
// Messenger. The person is signed in to Intercom with a server-made identity hash (supabase/functions/support-identity).
import { useEffect, useState } from 'react';
import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

type Identity = { userId: string; email: string | null; name: string; role: string; company: { id: string; name: string } | null; hash: string | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const APP_ID = (Constants.expoConfig?.extra as { intercomAppId?: string } | undefined)?.intercomAppId ?? 'lrn5nc6m';

/** the native SDK (builds since 25 Oct include it; an older build throws on use and we say so) */
function native(): Any | null {
  if (Platform.OS === 'web') return null;
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

/** support chat is offered everywhere; a build without Intercom says so when opened */
export const supportAvailable = () => true;
/** whether this build registered Intercom's native module (for the error line) */
const registered = () => !!(TurboModuleRegistry.get('IntercomModule') ?? NativeModules.IntercomModule);

let signedIn = false;

/** sign the person in to Intercom (once per app run) */
export async function loginSupport() {
  if (signedIn || !supportAvailable()) return;
  const { data } = await supabase.functions.invoke<Identity>('support-identity', { body: {} }).catch(() => ({ data: null }));
  const company = data?.company ? { id: data.company.id, name: data.company.name } : undefined;
  const sdk = native();
  if (sdk) {
    const Intercom = sdk.default;
    // Intercom shows an empty screen until someone is signed in: as the person when we know them, else as a visitor
    if (data) {
      if (data.hash) await Intercom.setUserHash(data.hash);
      if (await Intercom.isUserLoggedIn().catch(() => false)) await Intercom.logout().catch(() => {});
      await Intercom.loginUserWithUserAttributes(data.email ? { userId: data.userId, email: data.email } : { userId: data.userId });
      await Intercom.updateUser({ name: data.name, ...(company ? { companies: [company] } : {}), customAttributes: { role: data.role } }).catch(() => {});
    } else {
      await Intercom.loginUnidentifiedUser();
    }
    await Intercom.setLauncherVisibility(sdk.Visibility.GONE).catch(() => {});
  } else if (data) {
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

/** open the conversation with the Muntej team; on failure, the reason (Saree3 shows it) */
export async function openSupport(): Promise<string | null> {
  try {
    const sdk = native();
    if (!sdk && Platform.OS !== 'web') throw new Error('Intercom is not in this app build');
    await loginSupport();
    if (sdk) await sdk.default.present();
    else webIntercom()?.('show');
    return null;
  } catch (e) {
    return `${(e as Error).message || String(e)} (native: ${registered() ? 'yes' : 'no'})`;
  }
}

/** on sign-out */
export async function logoutSupport() {
  if (!signedIn) return;
  signedIn = false;
  const sdk = native();
  if (sdk) await sdk.default.logout();
  else webIntercom()?.('shutdown');
}

/** unread replies from the team (badges). Never allowed to break a screen: any Intercom error just means 0. */
export function useUnreadSupport() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let sub: { remove?: () => void } | undefined;
    try {
      const sdk = native();
      if (sdk && signedIn) {
        sdk.default.getUnreadConversationCount().then(setN, () => {});
        const ev = sdk.IntercomEvents?.IntercomUnreadCountDidChange;
        if (ev) sub = sdk.default.addEventListener(ev, (e: { count?: number }) => setN(e?.count ?? 0));
      } else if (Platform.OS === 'web') {
        webIntercom()?.('onUnreadCountChange', (c: number) => setN(c));
      }
    } catch {
      // no badge rather than a crash
    }
    return () => {
      try {
        sub?.remove?.();
      } catch {
        // ignore
      }
    };
  }, []);
  return n;
}
