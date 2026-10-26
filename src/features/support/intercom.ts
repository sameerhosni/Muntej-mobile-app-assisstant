// Support chat with the Muntej team: Intercom's web Messenger. In the app it opens inside Muntej (screen 57, a web view
// of the hosted support page with a one-time sign-in link); on the web it's Intercom's JS Messenger right here.
// Intercom's Android SDK was removed on 26 Oct: its window opened empty and froze the app. The person is signed in to
// Intercom with a server-made identity (supabase/functions/support-identity).
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { router, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

type Identity = { userId: string; email: string | null; name: string; role: string; company: { id: string; name: string } | null; hash: string | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const APP_ID = (Constants.expoConfig?.extra as { intercomAppId?: string } | undefined)?.intercomAppId ?? 'lrn5nc6m';

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

/** support chat is offered everywhere */
export const supportAvailable = () => true;

let signedIn = false;

/** web: sign the person in to Intercom (once per page load) */
async function loginWeb() {
  if (signedIn) return;
  const { data } = await supabase.functions.invoke<Identity>('support-identity', { body: {} }).catch(() => ({ data: null }));
  if (!data) return;
  webIntercom()?.('boot', {
    app_id: APP_ID,
    user_id: data.userId,
    email: data.email ?? undefined,
    name: data.name,
    user_hash: data.hash ?? undefined,
    company: data.company ? { company_id: data.company.id, name: data.company.name } : undefined,
    role: data.role,
    hide_default_launcher: true,
  });
  signedIn = true;
}

/** the hosted support page with a one-time link that signs this person in (valid 15 minutes, used once); with a
 *  conversation id it opens that conversation (a reply notification) */
export async function supportLink(conversation?: string | null): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url: string }>('support-identity', { body: { action: 'link' } });
  if (error || !data?.url) throw new Error(error?.message ?? 'no link');
  return conversation ? `${data.url}&c=${encodeURIComponent(conversation)}` : data.url;
}

/** open the conversation with the Muntej team. Returns the reason when it can't open (Saree3 shows it). */
export async function openSupport(): Promise<string | null> {
  track('support_opened');
  try {
    if (Platform.OS === 'web') {
      await loginWeb();
      webIntercom()?.('showNewMessage');
      return null;
    }
    router.push('/57-support' as Href);
    return null;
  } catch (e) {
    return (e as Error).message || String(e);
  }
}

/** on sign-out */
export async function logoutSupport() {
  if (!signedIn) return;
  signedIn = false;
  webIntercom()?.('shutdown');
}

/** unread replies from the team (badges): known on the web only for now */
export function useUnreadSupport() {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') webIntercom()?.('onUnreadCountChange', (c: number) => setN(c));
  }, []);
  return n;
}
