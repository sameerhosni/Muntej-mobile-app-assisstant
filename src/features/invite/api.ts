// Bringing people in by email: the invitation email for someone just added (Team screen, Invite screen), and the
// ready-to-send WhatsApp / any-app message that goes with it. No codes: the email decides the team.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/** where people download the app until muntej.app hosts the download page (same link as website/index.html) */
export const DOWNLOAD_URL = 'https://expo.dev/accounts/nizamys-team/projects/nizamy-muntej/builds/3dcac193-c0b9-476a-9fde-c8f49eb3c186';

export type InviteResult = { id: string; whatsapp?: string; email?: string; app?: 'told' | 'already' };

export type InviteState = { profile_id: string; channel: 'whatsapp' | 'email' | 'app' | 'link'; status: 'sent' | 'opened' | 'joined' | 'failed'; sent_at: string };

/** how each person in this company was told: their latest invite */
export function useInviteStates() {
  return useQuery({
    queryKey: ['invites', 'team'],
    queryFn: async (): Promise<Map<string, InviteState>> => {
      const { data, error } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: InviteState[] | null; error: { message: string } | null }>)('team_invite_states');
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((i) => [i.profile_id, i]));
    },
    staleTime: 60_000,
  });
}

/** someone we can't reach: a one-time join link for their manager to share */
export async function joinLink(personId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url: string }>('invite', { body: { link: { person_id: personId } } });
  if (error || !data?.url) throw error ?? new Error('No link');
  return data.url;
}

/** invite people with no login yet: WhatsApp (one-time join link) when they have a mobile, email otherwise / too */
export async function sendInvites(personIds: string[], channel: 'auto' | 'whatsapp' | 'email' = 'auto'): Promise<InviteResult[]> {
  const { data, error } = await supabase.functions.invoke<{ results: InviteResult[] }>('invite', { body: { send: { person_ids: personIds, channel } } });
  if (error) throw error;
  return data?.results ?? [];
}

/** the WhatsApp / any-app message for someone invited by email: download, then sign in with that email */
export function emailInviteMessage(t: (k: string, o?: Record<string, unknown>) => string, o: { company: string; inviter: string; email: string }) {
  return t('messageEmail', { ...o, link: DOWNLOAD_URL });
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

/** "noura.alharbi@company.sa" → "Noura Alharbi" (a starting name; they can change it) */
export const nameFromEmail = (email: string) =>
  email
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\d+/g, '')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || email.split('@')[0];
