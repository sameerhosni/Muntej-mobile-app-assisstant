// Shared helpers for Muntej Edge Functions (Deno).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new HttpError(500, `Server is missing ${name}`);
  return v;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Caller = {
  /** Supabase client acting as the signed-in user (RLS applies). */
  db: SupabaseClient;
  userId: string;
  profileId: string;
};

/** Verifies the caller's JWT and returns a user-scoped client plus their profile id. */
export async function getCaller(req: Request): Promise<Caller> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) throw new HttpError(401, 'Not signed in');

  const publicKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!publicKey) throw new HttpError(500, 'Server is missing SUPABASE_ANON_KEY');
  const db = createClient(requireEnv('SUPABASE_URL'), publicKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: userData, error } = await db.auth.getUser(auth.slice(7));
  if (error || !userData.user) throw new HttpError(401, 'Not signed in');

  // one login can be in several accounts: the profile of the account they're working in now (account_sessions)
  const { data: profileId } = await db.rpc('current_profile_id');
  if (!profileId) throw new HttpError(403, 'You are not invited to Muntej yet. Ask your admin to add you.');

  return { db, userId: userData.user.id, profileId: profileId as string };
}

/** Wraps a handler with CORS preflight + error → JSON mapping. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      // no secrets in messages here; the detail makes field debugging possible
      const detail = e instanceof Error ? e.message.slice(0, 200) : String(e);
      return json({ error: `Something went wrong (${detail})` }, 500);
    }
  });
}
