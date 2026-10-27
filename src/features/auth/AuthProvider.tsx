import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { isBioSession } from './bioSession';

type AuthState = {
  session: Session | null;
  /** false until the stored session (and its 2FA level) has been read */
  ready: boolean;
  /** signed in with the email code, but an authenticator code is still required (2FA turned on) */
  needsMfa: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, ready: false, needsMfa: false });

/** aal1 → aal2 pending means the user has a verified authenticator factor but hasn't entered its code yet.
 *  A fingerprint sign-in already is the second step, so its session never asks (bioSession.ts). */
async function mfaPending(session: Session | null) {
  if (!session) return false;
  if (await isBioSession(session)) return false;
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, ready: false, needsMfa: false });
  const queryClient = useQueryClient();

  useEffect(() => {
    let alive = true;
    const apply = async (session: Session | null) => {
      const needsMfa = await mfaPending(session);
      if (alive) setState({ session, ready: true, needsMfa });
    };
    // whose data is in the cache right now
    let cachedFor: string | null | undefined;
    supabase.auth.getSession().then(({ data }) => {
      cachedFor = data.session?.user.id ?? null;
      apply(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // never show one user's cached data to the next — but only when the person really changes: supabase-js also
      // says SIGNED_IN each time the app / tab comes back into view, which used to wipe and refetch everything
      const who = session?.user.id ?? null;
      if ((event === 'SIGNED_OUT' || event === 'SIGNED_IN') && who !== cachedFor) queryClient.clear();
      cachedFor = who;
      // supabase-js warns against awaiting its own calls inside this callback → defer
      setTimeout(() => apply(session), 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
