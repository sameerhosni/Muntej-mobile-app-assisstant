import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const MFA_FACTORS_KEY = ['mfa-factors'] as const;

/** The signed-in user's verified authenticator-app factor, or null when two-step verification is off. */
export function useTotpFactor() {
  return useQuery({
    queryKey: MFA_FACTORS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return data.totp.find((f) => f.status === 'verified') ?? null;
    },
  });
}
