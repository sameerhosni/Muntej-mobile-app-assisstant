// "Connect your system and we get your org" (owner, 26 Oct): a one-time, read-only look at the company directory —
// people, titles, departments, phones and who reports to whom — made into a team draft (team_drafts) to review and
// confirm in the app (screen 62). Nothing is kept: no tokens are stored, nothing is written back.
//   microsoft_directory  Microsoft 365 / Entra: Graph /users with their manager (needs User.Read.All: the client's IT
//                        admin approves once, for the whole company). Env MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT.
//   google_directory     Google Workspace: Admin SDK Directory users (relations.manager when the company filled it).
//                        Needs a Workspace admin. Env GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
// Both go through the connect function's start / callback (same redirect address already registered with each).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { tokenRequest, type Tokens } from './connections.ts';
import { matchPeople, saudiPhone } from './team-reader.ts';
import { phCapture } from './posthog.ts';

export const DIRECTORY_PROVIDERS = ['microsoft_directory', 'google_directory'] as const;
export type DirectoryProvider = (typeof DIRECTORY_PROVIDERS)[number];
export const isDirectory = (p: string): p is DirectoryProvider => (DIRECTORY_PROVIDERS as readonly string[]).includes(p);

const msTenant = () => Deno.env.get('MS_TENANT') ?? 'organizations';
const MS_SCOPES = 'openid profile User.Read User.Read.All';
const G_SCOPES = 'openid email https://www.googleapis.com/auth/admin.directory.user.readonly';

export function directoryConfigured(p: DirectoryProvider) {
  return p === 'microsoft_directory'
    ? !!Deno.env.get('MS_CLIENT_ID') && !!Deno.env.get('MS_CLIENT_SECRET')
    : !!Deno.env.get('GOOGLE_CLIENT_ID') && !!Deno.env.get('GOOGLE_CLIENT_SECRET');
}

export function directoryAuthorizeUrl(p: DirectoryProvider, o: { state: string; redirectUri: string; challenge: string }) {
  if (p === 'microsoft_directory')
    return `https://login.microsoftonline.com/${msTenant()}/oauth2/v2.0/authorize?${new URLSearchParams({
      client_id: Deno.env.get('MS_CLIENT_ID') ?? '',
      response_type: 'code',
      redirect_uri: o.redirectUri,
      scope: MS_SCOPES,
      state: o.state,
      code_challenge: o.challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    })}`;
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
    response_type: 'code',
    redirect_uri: o.redirectUri,
    scope: G_SCOPES,
    state: o.state,
    code_challenge: o.challenge,
    code_challenge_method: 'S256',
    access_type: 'online',
    prompt: 'consent select_account',
  })}`;
}

function exchange(p: DirectoryProvider, o: { code: string; redirectUri: string; verifier: string }): Promise<Tokens> {
  return p === 'microsoft_directory'
    ? tokenRequest(`https://login.microsoftonline.com/${msTenant()}/oauth2/v2.0/token`, {
        client_id: Deno.env.get('MS_CLIENT_ID') ?? '',
        client_secret: Deno.env.get('MS_CLIENT_SECRET') ?? '',
        grant_type: 'authorization_code',
        code: o.code,
        redirect_uri: o.redirectUri,
        code_verifier: o.verifier,
        scope: MS_SCOPES,
      })
    : tokenRequest('https://oauth2.googleapis.com/token', {
        client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
        grant_type: 'authorization_code',
        code: o.code,
        redirect_uri: o.redirectUri,
        code_verifier: o.verifier,
      });
}

type Row = { ref: string; full_name: string; title: string | null; email: string | null; phone: string | null; department: string | null; manager_ref: string | null };

async function microsoftPeople(t: Tokens): Promise<Row[]> {
  const out: Row[] = [];
  let url: string | null =
    'https://graph.microsoft.com/v1.0/users?$select=id,displayName,jobTitle,mail,userPrincipalName,mobilePhone,businessPhones,department,accountEnabled,userType&$expand=manager($select=id)&$top=999';
  while (url && out.length < 2000) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${t.access_token}` } });
    if (!res.ok) throw new Error(res.status === 403 ? 'needs_admin' : `Microsoft ${res.status}`);
    const page = (await res.json()) as {
      value: {
        id: string;
        displayName: string;
        jobTitle: string | null;
        mail: string | null;
        userPrincipalName: string | null;
        mobilePhone: string | null;
        businessPhones?: string[];
        department: string | null;
        accountEnabled?: boolean;
        userType?: string;
        manager?: { id?: string } | null;
      }[];
      '@odata.nextLink'?: string;
    };
    for (const u of page.value) {
      // people only: no guests, disabled accounts or shared mailboxes without a name
      if (u.accountEnabled === false || u.userType === 'Guest' || !u.displayName) continue;
      out.push({
        ref: u.id,
        full_name: u.displayName,
        title: u.jobTitle,
        email: (u.mail ?? u.userPrincipalName ?? '').toLowerCase() || null,
        phone: u.mobilePhone ?? u.businessPhones?.[0] ?? null,
        department: u.department,
        manager_ref: u.manager?.id ?? null,
      });
    }
    url = page['@odata.nextLink'] ?? null;
  }
  return out;
}

async function googlePeople(t: Tokens): Promise<Row[]> {
  const out: Row[] = [];
  let token: string | undefined;
  do {
    const res = await fetch(
      `https://admin.googleapis.com/admin/directory/v1/users?${new URLSearchParams({ customer: 'my_customer', maxResults: '500', projection: 'full', ...(token ? { pageToken: token } : {}) })}`,
      { headers: { Authorization: `Bearer ${t.access_token}` } },
    );
    if (!res.ok) throw new Error(res.status === 403 ? 'needs_admin' : `Google ${res.status}`);
    const page = (await res.json()) as {
      users?: {
        id: string;
        primaryEmail: string;
        name?: { fullName?: string };
        suspended?: boolean;
        organizations?: { title?: string; department?: string; primary?: boolean }[];
        phones?: { value?: string; type?: string }[];
        relations?: { type?: string; value?: string }[];
      }[];
      nextPageToken?: string;
    };
    for (const u of page.users ?? []) {
      if (u.suspended) continue;
      const org = u.organizations?.find((o) => o.primary) ?? u.organizations?.[0];
      out.push({
        ref: u.primaryEmail.toLowerCase(),
        full_name: u.name?.fullName ?? u.primaryEmail,
        title: org?.title ?? null,
        email: u.primaryEmail.toLowerCase(),
        phone: u.phones?.find((p) => p.type === 'mobile')?.value ?? u.phones?.[0]?.value ?? null,
        department: org?.department ?? null,
        manager_ref: u.relations?.find((r) => r.type === 'manager')?.value?.toLowerCase() ?? null,
      });
    }
    token = page.nextPageToken;
  } while (token && out.length < 2000);
  return out;
}

/** the callback: read the directory once and make the draft; returns its id */
export async function directoryDraft(admin: SupabaseClient, p: DirectoryProvider, profileId: string, o: { code: string; redirectUri: string; verifier: string }) {
  const tokens = await exchange(p, o);
  const rows = p === 'microsoft_directory' ? await microsoftPeople(tokens) : await googlePeople(tokens);
  const { data: me } = await admin.from('profiles').select('account_id').eq('id', profileId).single();
  const { data: existing } = await admin.from('profiles').select('id, full_name, full_name_ar, email, phone').eq('account_id', me!.account_id).neq('status', 'deleted');
  const people = matchPeople(
    rows.map((r) => ({
      ref: r.ref,
      full_name: r.full_name,
      full_name_ar: /[؀-ۿ]/.test(r.full_name) ? r.full_name : null,
      title: r.title,
      email: r.email,
      phone: saudiPhone(r.phone),
      department: r.department,
      manager_ref: r.manager_ref,
      manager_name: null,
      confidence: 1,
      unsure: [],
    })),
    existing ?? [],
  );
  const { data: draft, error } = await admin
    .from('team_drafts')
    .insert({ account_id: me!.account_id, created_by: profileId, source: p === 'microsoft_directory' ? 'microsoft' : 'google', people })
    .select('id')
    .single();
  if (error) throw error;
  await phCapture([{ distinctId: profileId, event: 'team_import_read', properties: { source: p, people: people.length } }]);
  return draft.id as string;
}
