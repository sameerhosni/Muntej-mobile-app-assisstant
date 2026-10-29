// Sending one person their invitation: WhatsApp (approved template muntej_join with a one-time join link; Meta allows
// no codes in it) when they have a mobile, email otherwise (or too). Each send is an invites row (sent → opened →
// joined). Used by the invite function (a manager taps Invite) and onboarding-nudges (the daily resend).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { inviteByEmail, type InviteExtra } from './invite.ts';
import { INVITE_TEMPLATE, waConfigured, waTemplateWith } from './wa.ts';
import { newToken, sha256 } from './phone-session.ts';

export type InvitePerson = {
  id: string;
  full_name: string;
  full_name_ar: string | null;
  email: string | null;
  phone: string | null;
  user_id: string | null;
  locale: string | null;
  account_id: string;
};
export type InviteResult = { id: string; whatsapp?: string; email?: string };

export async function sendInvite(
  admin: SupabaseClient,
  p: InvitePerson,
  invitedBy: string,
  info: InviteExtra,
  channel: 'auto' | 'whatsapp' | 'email' = 'auto',
): Promise<InviteResult> {
  const r: InviteResult = { id: p.id };
  if (p.user_id) return { ...r, whatsapp: 'has_login', email: 'has_login' };
  if (p.phone && (channel === 'auto' || channel === 'whatsapp')) {
    if (!waConfigured()) r.whatsapp = 'not_configured';
    else {
      const token = newToken();
      const ar = p.locale !== 'en';
      const first = ((ar && p.full_name_ar) || p.full_name).split(' ')[0];
      const ok = await waTemplateWith(
        p.phone,
        INVITE_TEMPLATE(),
        ar ? 'ar' : 'en',
        [first, info.inviter_name ?? (ar ? 'مديرك' : 'Your manager'), info.account_name ?? (ar ? 'شركتك' : 'your company')],
        [{ sub_type: 'url', index: 0, param: token }],
      );
      await admin.from('invites').insert({
        account_id: p.account_id,
        profile_id: p.id,
        invited_by: invitedBy,
        channel: 'whatsapp',
        phone: p.phone,
        token_hash: await sha256(token),
        status: ok ? 'sent' : 'failed',
        error: ok ? null : 'whatsapp send failed (template not approved yet?)',
      });
      r.whatsapp = ok ? 'sent' : 'failed';
    }
  }
  if (p.email && (channel === 'email' || (channel === 'auto' && r.whatsapp !== 'sent'))) {
    const e = await inviteByEmail(p.email, p.full_name, info);
    await admin.from('invites').insert({
      account_id: p.account_id,
      profile_id: p.id,
      invited_by: invitedBy,
      channel: 'email',
      status: e === 'failed' ? 'failed' : 'sent',
      error: e === 'failed' ? 'email failed' : null,
    });
    r.email = e;
  }
  return r;
}
