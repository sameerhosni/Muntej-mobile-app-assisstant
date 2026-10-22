// Email invitations (Supabase Auth "invite", sent through the project's SMTP: sales@muntej.app). The invite email
// template (supabase/templates/invite.html) shows who invited them, to which company, a download button and the
// invite code from user metadata.
import { adminClient } from './push.ts';

export type InviteExtra = { inviter_name?: string | null; account_name?: string | null; invite_code?: string | null };

/**
 * Emails a Muntej invitation and creates their login, which handle_new_user links to every profile with that email.
 * An email that already has a login (someone joining a second account) gets no email: the new account simply shows
 * up in their Settings.
 */
export async function inviteByEmail(email: string, name: string | null, extra: InviteExtra = {}): Promise<'invited' | 'has_login' | 'failed'> {
  const data: Record<string, string> = {};
  if (name) data.full_name = name;
  for (const [k, v] of Object.entries(extra)) if (v) data[k] = v;
  const { error } = await adminClient().auth.admin.inviteUserByEmail(email, { data });
  if (!error) return 'invited';
  if (/already|registered|exists/i.test(error.message)) return 'has_login';
  console.error('invite failed', email, error.message);
  return 'failed';
}

/** who's inviting and from which company, for the email (the caller's profile + account) */
export async function inviterInfo(profileId: string): Promise<InviteExtra> {
  const admin = adminClient();
  const { data: me } = await admin.from('profiles').select('full_name, account_id').eq('id', profileId).maybeSingle();
  if (!me) return {};
  const { data: acc } = await admin.from('accounts').select('name').eq('id', me.account_id).maybeSingle();
  return { inviter_name: me.full_name as string, account_name: (acc?.name as string) ?? null };
}
