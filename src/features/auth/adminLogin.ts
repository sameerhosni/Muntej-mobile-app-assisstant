// Super admin sign-in (owner, 2 Nov): typing the username instead of an email asks for the password, then a code
// sent to the super admin's email. All checks happen in the admin-login function.
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export const ADMIN_USERNAME = 'supermuntej';

export const isAdminUsername = (v: string) => v.trim().toLowerCase() === ADMIN_USERNAME;

async function call<T>(body: Record<string, string>): Promise<{ data?: T; status?: number }> {
  const { data, error } = await supabase.functions.invoke<T>('admin-login', { body });
  if (!error && data) return { data };
  return { status: error instanceof FunctionsHttpError ? (error.context as Response).status : 500 };
}

/** password check → the code goes out; returns where it was sent (masked email) */
export const startAdminLogin = (username: string, password: string) =>
  call<{ sent: boolean; to: string }>({ action: 'start', username, password });

/** the emailed code → signed in (true) */
export async function verifyAdminLogin(username: string, code: string) {
  const { data, status } = await call<{ token_hash: string }>({ action: 'verify', username, code });
  if (!data?.token_hash) return { ok: false, status };
  const { error } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
  return { ok: !error, status };
}
