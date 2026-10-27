// A session opened with the fingerprint / face counts as two-step verified (owner, 27 Oct: "no need for this [the
// authenticator code], simply with fingerprint only"): the fingerprint on this phone is itself the second step, on top
// of the device key the phone holds. Only THAT session is exempt, matched by its session id, so signing in by email on
// the same phone still asks for the authenticator code.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';

const KEY = 'muntej_bio_session';
let signingIn = false;

/** called right before the fingerprint sign-in turns its token into a session */
export function expectBioSession() {
  signingIn = true;
}

function sessionId(session: Session): string | null {
  try {
    const part = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4))) as { session_id?: string };
    return json.session_id ?? null;
  } catch {
    return null;
  }
}

/** was this session opened with the fingerprint on this phone? (the first one after expectBioSession is remembered) */
export async function isBioSession(session: Session): Promise<boolean> {
  const sid = sessionId(session);
  if (!sid) return false;
  if (signingIn) {
    signingIn = false;
    await AsyncStorage.setItem(KEY, sid).catch(() => {});
    return true;
  }
  return (await AsyncStorage.getItem(KEY).catch(() => null)) === sid;
}
