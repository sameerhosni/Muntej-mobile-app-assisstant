import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  /** false until the stored session has been read */
  ready: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, ready: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, ready: false });
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, ready: true }));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ session, ready: true });
      // never show one user's cached data to the next
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') queryClient.clear();
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
