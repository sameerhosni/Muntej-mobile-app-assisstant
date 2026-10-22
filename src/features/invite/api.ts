// Bringing people in: invite codes (MNT-XXXXXX, one account, 7 days), joining with a code, emailing an invitation to
// someone added on the Team screen, and the ready-to-send WhatsApp / email messages.
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/** where people download the app until muntej.app hosts the download page (same link as website/index.html) */
export const DOWNLOAD_URL = 'https://expo.dev/accounts/nizamys-team/projects/nizamy-muntej/builds/3dcac193-c0b9-476a-9fde-c8f49eb3c186';

export type InviteCode = { code: string; expires_at: string; uses: number; account_name: string };
export type RedeemResult = { account_id?: string; account_name?: string; joined?: boolean; error?: 'invalid' | 'too_many' };

const rpc = supabase.rpc as unknown as (fn: string, args?: object) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

export const showCode = (code: string) => `MNT-${code}`;

/** the caller's active code (made on first use; the same one is reused while it has 2+ days left) */
export function useInviteCode(enabled: boolean) {
  return useQuery({
    queryKey: ['inviteCode'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await rpc.call(supabase, 'create_invite_code');
      if (error) throw new Error(error.message);
      return data as InviteCode;
    },
  });
}

/** cancel the current code; a fresh one is made right away */
export async function renewInviteCode(qc: QueryClient, code: string) {
  const { error } = await rpc.call(supabase, 'revoke_invite_code', { p_code: code });
  if (error) throw new Error(error.message);
  await qc.invalidateQueries({ queryKey: ['inviteCode'] });
}

/** join an account with a code (also tells whoever shared it); refreshes everything on success */
export async function redeemCode(qc: QueryClient | null, code: string): Promise<RedeemResult> {
  const { data, error } = await supabase.functions.invoke<RedeemResult>('invite', { body: { redeem: { code } } });
  if (error) throw error;
  if (qc && data && !data.error) await qc.invalidateQueries();
  return data ?? { error: 'invalid' };
}

/** someone just added on the Team screen: email them an invitation (no-op if they already have a login) */
export async function emailInvite(personId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ result: string }>('invite', { body: { email: { person_id: personId } } });
  if (error) throw error;
  return data?.result ?? 'failed';
}

/** the message people get on WhatsApp / email / any app (Saudi Arabic or English) */
export function inviteMessage(t: (k: string, o?: Record<string, unknown>) => string, c: InviteCode, inviter: string, name?: string) {
  return t('message', { name: name ? ` ${name}` : '', inviter, company: c.account_name, code: showCode(c.code), link: DOWNLOAD_URL });
}

export const whatsappUrl = (text: string, phone?: string) => `https://wa.me/${phone ? saudiPhone(phone) : ''}?text=${encodeURIComponent(text)}`;

/** 05xxxxxxxx / 5xxxxxxxx / +9665xxxxxxxx → 9665xxxxxxxx (wa.me wants the number without + or leading zeros) */
export function saudiPhone(raw: string) {
  const d = raw.replace(/\D/g, '').replace(/^00/, '');
  if (d.startsWith('966')) return d;
  if (d.startsWith('05')) return `966${d.slice(1)}`;
  if (d.startsWith('5') && d.length === 9) return `966${d}`;
  return d;
}

/** pick your own team code (6–12 letters / digits, lasts 30 days); throws CODE_FORMAT / CODE_TAKEN */
export async function chooseInviteCode(qc: QueryClient, code: string) {
  const { data, error } = await rpc.call(supabase, 'set_invite_code', { p_code: code });
  if (error) throw new Error(/CODE_(FORMAT|TAKEN)/.exec(error.message)?.[0] ?? error.message);
  qc.setQueryData(['inviteCode'], data as InviteCode);
}

/** "noura.alharbi@company.sa" → "Noura Alharbi" (a starting name; they can change it) */
export const nameFromEmail = (email: string) =>
  email
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\d+/g, '')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || email.split('@')[0];
