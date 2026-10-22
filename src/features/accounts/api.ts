// Accounts (supabase/migrations/20261022150000_accounts.sql): which accounts this login can open, switching between
// them (one profile per account; the super admin gets a hidden seat), and clearing every cached screen after a switch.
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type MyAccount = { id: string; name: string; name_ar: string | null; status: string; people: number; member: boolean; active: boolean };

const rpc = supabase.rpc.bind(supabase) as unknown as <T>(fn: string, args?: object) => Promise<{ data: T | null; error: { message: string } | null }>;

export const ACCOUNTS_KEY = ['myAccounts'] as const;

export function useMyAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: async (): Promise<MyAccount[]> => {
      const { data, error } = await rpc<MyAccount[]>('my_accounts');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

/** work in another account: everything on screen belongs to the old one, so the whole cache is dropped */
export async function switchAccount(qc: QueryClient, accountId: string) {
  const { error } = await rpc('switch_account', { p_account: accountId });
  if (error) throw new Error(error.message);
  qc.clear();
}

export const accountName = (a: Pick<MyAccount, 'name' | 'name_ar'> | undefined, lang: string) => (a ? (lang === 'ar' && a.name_ar) || a.name : '');
