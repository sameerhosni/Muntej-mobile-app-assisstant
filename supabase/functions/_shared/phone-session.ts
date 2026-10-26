// Sign-in without an email code: an invite link, mobile + invite PIN, or a WhatsApp code (phone-auth function).
// The person gets a real Supabase session the same way quick-login does: a magic-link token made on the server and
// turned into a session by the app (verifyOtp token_hash). People with no email get an internal sign-in address
// <mobile>@phone.muntej.app; handle_new_user links their invited profile by phone (or by email when they have one).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const PHONE_DOMAIN = 'phone.muntej.app';

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** a long random token for links (base64url, 32 bytes) */
export function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** a 6-digit code / PIN */
export function newPin() {
  return String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
}

/** Saudi mobile in the stored format (9665XXXXXXXX) */
export function normPhone(p: string | null | undefined): string | null {
  const d = (p ?? '').replace(/[٠-٩]/g, (x) => String(x.charCodeAt(0) - 0x660)).replace(/\D/g, '').replace(/^00/, '');
  if (!d) return null;
  if (/^9665\d{8}$/.test(d)) return d;
  if (/^05\d{8}$/.test(d)) return `966${d.slice(1)}`;
  if (/^5\d{8}$/.test(d)) return `966${d}`;
  return d.length >= 8 ? d : null;
}

/** too many tries for this key in the last `minutes`? (and count this one) */
export async function tooMany(admin: SupabaseClient, key: string, max: number, minutes: number) {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { count } = await admin.from('auth_attempts').select('key', { count: 'exact', head: true }).eq('key', key).gte('at', since);
  await admin.from('auth_attempts').insert({ key });
  return (count ?? 0) >= max;
}

/** the magic-link token hash that signs this person in (creates their sign-in user the first time) */
export async function sessionFor(admin: SupabaseClient, person: { id: string; user_id: string | null; email: string | null; phone: string | null }) {
  let email: string | null = null;
  if (person.user_id) {
    const { data } = await admin.auth.admin.getUserById(person.user_id);
    email = data?.user?.email ?? null;
  }
  email ??= person.email?.toLowerCase() ?? (person.phone ? `${person.phone}@${PHONE_DOMAIN}` : null);
  if (!email) throw new Error('No way to sign this person in');
  let link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) {
    // first sign-in: make the sign-in user (confirmed); handle_new_user links the invited profile by email or phone
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      ...(person.phone ? { phone: person.phone, phone_confirm: true } : {}),
    });
    if (created.error && !/already/i.test(created.error.message)) throw new Error(created.error.message);
    link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  }
  const hash = link.data?.properties?.hashed_token;
  if (link.error || !hash) throw new Error('Could not sign in');
  return hash;
}
