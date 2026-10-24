// connect — linking a person's own tools to Muntej (OAuth 2.0 with PKCE). The tokens stay on the server, encrypted.
//   POST { action: 'providers' }                      → which tools can be connected on this server (credentials set)
//   POST { action: 'token', provider, token }         → connect with a personal API token (ClickUp …), first read now
//   POST { action: 'start', provider, redirect }      → the tool's sign-in page URL (the app opens it in the browser)
//   GET  /connect/callback?code&state                 → the tool sends the person back here; we save the connection
//                                                       and send them on to `redirect` (?connected=… or ?error=…)
//   POST { action: 'disconnect', provider }           → forget the connection and its tokens
//   POST { action: 'sync', provider }                 → check that tool right now, both ways (otherwise every 10 min)
//   POST { action: 'targets', provider }              → lists / projects tasks can be sent to
//   POST { action: 'settings', provider, import_on?, export_on?, export_target? } → the two switches + where tasks go
import { getCaller, HttpError, json, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';
import {
  ALL_PROVIDERS,
  CALLBACK_URL,
  challengeOf,
  open,
  PROVIDERS,
  randomToken,
  seal,
  syncConnection,
  type ProviderId,
} from '../_shared/connections.ts';

const STATE_TTL_MS = 10 * 60_000;
/** only back into the app (deep link / Expo Go / the local web preview): never an open redirect */
const allowedRedirect = (r: string) => /^(muntej|exp|exps):\/\//.test(r) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(r);
const withParams = (url: string, params: Record<string, string>) => `${url}${url.includes('?') ? '&' : '?'}${new URLSearchParams(params)}`;
const NAME: Record<ProviderId, string> = {
  microsoft: 'Microsoft 365',
  google: 'Google',
  slack: 'Slack',
  jira: 'Jira',
  clickup: 'ClickUp',
  trello: 'Trello',
  notion: 'Notion',
  azure_devops: 'Azure DevOps',
};

// email tools: a person can sign in with up to 3 email accounts (work, personal, Outlook…)
const EMAIL_TOOLS: ProviderId[] = ['google', 'microsoft'];
const MAX_EMAIL_ACCOUNTS = 3;

async function callback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const admin = adminClient();
  const state = url.searchParams.get('state') ?? '';
  const { data: st } = await admin.from('oauth_states').select('*').eq('state', state).maybeSingle();
  if (!st) return new Response('This sign-in link expired. Go back to Muntej and tap Connect again.', { status: 400 });
  await admin.from('oauth_states').delete().eq('state', state);
  const back = (params: Record<string, string>) => Response.redirect(withParams(st.redirect as string, params), 302);
  const provider = PROVIDERS[st.provider as ProviderId];
  if (!provider) return back({ error: 'not_available' });
  if (Date.now() - Date.parse(st.created_at as string) > STATE_TTL_MS) return back({ error: 'expired' });
  const code = url.searchParams.get('code');
  if (!code) return back({ error: url.searchParams.get('error') ?? 'cancelled' });

  try {
    const tokens = await provider.exchange({ code, redirectUri: CALLBACK_URL, verifier: st.verifier as string });
    const account = await provider.account(tokens);
    // email accounts: up to MAX_EMAIL_ACCOUNTS per person (signing in again with the same one just refreshes it)
    if (EMAIL_TOOLS.includes(st.provider as ProviderId)) {
      const { data: mine } = await admin
        .from('connections')
        .select('provider, account_label')
        .eq('profile_id', st.profile_id)
        .in('provider', EMAIL_TOOLS);
      const again = (mine ?? []).some((c) => c.provider === st.provider && c.account_label === account.label);
      if (!again && (mine ?? []).length >= MAX_EMAIL_ACCOUNTS) return back({ error: 'limit' });
    }
    const { data: conn, error } = await admin
      .from('connections')
      .upsert(
        {
          profile_id: st.profile_id,
          provider: st.provider,
          status: 'connected',
          account_label: account.label,
          last_error: null,
          cursor: account.cursor ?? {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id,provider,account_label' },
      )
      .select('id')
      .single();
    if (error) throw error;
    await admin.from('connection_secrets').upsert({ connection_id: conn.id, data: await seal(tokens), updated_at: new Date().toISOString() });
    await admin.from('activity_log').insert({
      actor_type: 'user',
      actor_id: st.profile_id,
      subject_id: st.profile_id,
      action: 'source_connected',
      summary: `Connected ${NAME[st.provider as ProviderId]} (${account.label})`,
      summary_ar: `ربط ${NAME[st.provider as ProviderId]} (${account.label})`,
      undoable: false,
    });
    return back({ connected: st.provider as string });
  } catch (e) {
    console.error('oauth callback failed', st.provider, (e as Error).message);
    return back({ error: 'failed' });
  }
}

serve(async (req) => {
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/callback')) return callback(req);
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const body = (await req.json().catch(() => ({}))) as { action?: string; provider?: ProviderId; redirect?: string; id?: string };
  const { profileId } = await getCaller(req);
  const admin = adminClient();

  switch (body.action) {
    case 'providers':
      return json(
        ALL_PROVIDERS.map((id) => ({
          id,
          available: !!PROVIDERS[id],
          configured: !!PROVIDERS[id]?.configured(),
          token: !!PROVIDERS[id]?.personalToken,
          tokenFields: PROVIDERS[id]?.personalToken?.fields ?? [],
          twoWay: !!PROVIDERS[id]?.tasks,
        })),
      );

    // where Muntej may put tasks in this tool (lists / projects in the person's own account)
    case 'targets': {
      const provider = body.provider ? PROVIDERS[body.provider] : undefined;
      if (!provider?.tasks) throw new HttpError(400, 'This tool only brings tasks in');
      const { data: conn } = await admin
        .from('connections')
        .select('id, cursor')
        .eq('profile_id', profileId)
        .eq('provider', body.provider ?? '')
        .limit(1)
        .maybeSingle();
      if (!conn) throw new HttpError(404, 'Not connected');
      const { data: secret } = await admin.from('connection_secrets').select('data').eq('connection_id', conn.id).single();
      if (!secret) throw new HttpError(409, 'Sign in again');
      return json(await provider.tasks.targets(await open(secret.data as string), (conn.cursor ?? {}) as Record<string, unknown>));
    }

    // the two switches (bring in / send out) and where tasks go
    case 'settings': {
      const b = body as { import_on?: boolean; export_on?: boolean; export_target?: { id: string; name: string } | null };
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof b.import_on === 'boolean') patch.import_on = b.import_on;
      if (b.export_target !== undefined)
        patch.export_target = b.export_target
          ? { id: String(b.export_target.id), name: String(b.export_target.name).slice(0, 200), since: new Date().toISOString() }
          : null;
      if (typeof b.export_on === 'boolean') {
        patch.export_on = b.export_on;
        // turning it on: only tasks from now on go out (never the whole backlog)
        if (b.export_on && b.export_target === undefined) {
          const { data: cur } = await admin
            .from('connections')
            .select('export_target')
            .eq('profile_id', profileId)
            .eq('provider', body.provider ?? '')
            .limit(1)
            .maybeSingle();
          const tgt = cur?.export_target as { id: string; name: string } | null;
          if (!tgt) throw new HttpError(400, 'Pick where tasks should go first');
          patch.export_target = { ...tgt, since: new Date().toISOString() };
        }
      }
      // how often Saree3 reads this tool (minutes; 0 = only when you tap "Read now")
      const every = (body as { read_every_min?: unknown }).read_every_min;
      if (typeof every === 'number' && [0, 10, 30, 60, 180, 1440].includes(every)) patch.read_every_min = every;
      // one account's switches (Google: gmail / calendar / meet), merged into what it has
      const f = (body as { features?: Record<string, unknown> }).features;
      if (f && body.id) {
        const { data: cur } = await admin.from('connections').select('features').eq('id', body.id).eq('profile_id', profileId).maybeSingle();
        const next = { ...((cur?.features as Record<string, boolean>) ?? {}) };
        for (const [k, v] of Object.entries(f)) if (['gmail', 'calendar', 'meet', 'chat'].includes(k) && typeof v === 'boolean') next[k] = v;
        patch.features = next;
      }
      let q = admin
        .from('connections')
        .update(patch)
        .eq('profile_id', profileId)
        .eq('provider', body.provider ?? '');
      if (body.id) q = q.eq('id', body.id);
      const { data, error } = await q.select('*');
      if (error) throw error;
      if (!data?.length) throw new HttpError(404, 'Not connected');
      return json(data[0]);
    }

    // connect with the person's own personal API token (no admin setup): checked against the tool, then kept encrypted
    case 'token': {
      const provider = body.provider ? PROVIDERS[body.provider] : undefined;
      if (!provider?.personalToken) throw new HttpError(400, 'This tool needs sign-in instead');
      // the tool's fields (token, plus e.g. Jira site + email, Trello API key)
      const given = ((body as { creds?: Record<string, string> }).creds ?? { token: (body as { token?: string }).token ?? '' }) as Record<
        string,
        string
      >;
      const creds: Record<string, string> = {};
      for (const f of provider.personalToken.fields) {
        const v = String(given[f] ?? '').trim();
        if (!v || v.length > 500) throw new HttpError(400, `Please fill in: ${f}`);
        creds[f] = v;
      }
      if (creds.token.length < 10) throw new HttpError(400, 'That doesn’t look like a token');
      let account: { label: string; cursor?: Record<string, unknown> };
      try {
        account = await provider.personalToken.verify(creds);
      } catch {
        throw new HttpError(400, 'That didn’t work. Check the details and paste the token again');
      }
      const { token, ...extra } = creds;
      const { data: conn, error } = await admin
        .from('connections')
        .upsert(
          {
            profile_id: profileId,
            provider: body.provider,
            status: 'connected',
            account_label: account.label,
            last_error: null,
            cursor: account.cursor ?? {},
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'profile_id,provider,account_label' },
        )
        .select('*')
        .single();
      if (error) throw error;
      await admin
        .from('connection_secrets')
        .upsert({ connection_id: conn.id, data: await seal({ access_token: token, extra }), updated_at: new Date().toISOString() });
      await admin.from('activity_log').insert({
        actor_type: 'user',
        actor_id: profileId,
        subject_id: profileId,
        action: 'source_connected',
        summary: `Connected ${NAME[body.provider as ProviderId]} (${account.label})`,
        summary_ar: `ربط ${NAME[body.provider as ProviderId]} (${account.label})`,
        undoable: false,
      });
      // first read right away, so the person sees their tasks arrive
      const first = await syncConnection(admin, conn);
      return json({ ok: true, label: account.label, ...first });
    }

    case 'start': {
      const provider = body.provider ? PROVIDERS[body.provider] : undefined;
      if (!provider) throw new HttpError(400, 'This tool is coming soon');
      if (!provider.configured()) throw new HttpError(409, 'Your admin needs to finish this tool’s setup first');
      const redirect = String(body.redirect ?? '');
      if (!allowedRedirect(redirect)) throw new HttpError(400, 'Bad return address');
      const state = randomToken();
      const verifier = randomToken(48);
      const { error } = await admin.from('oauth_states').insert({ state, profile_id: profileId, provider: body.provider, redirect, verifier });
      if (error) throw error;
      return json({ url: provider.authorizeUrl({ state, redirectUri: CALLBACK_URL, challenge: await challengeOf(verifier) }) });
    }

    // WhatsApp (Muntej's own number): is it set up on this server, which number, and the caller's own number
    case 'whatsapp': {
      const ready = !!Deno.env.get('WHATSAPP_TOKEN') && !!Deno.env.get('WHATSAPP_PHONE_ID') && !!Deno.env.get('WHATSAPP_APP_SECRET');
      const { data: me } = await admin.from('profiles').select('phone').eq('id', profileId).maybeSingle();
      return json({ ready, number: Deno.env.get('WHATSAPP_NUMBER') ?? '966115209855', mine: (me?.phone as string | null) ?? null });
    }

    case 'disconnect': {
      // one account (id) or every account of that tool
      let del = admin
        .from('connections')
        .delete()
        .eq('profile_id', profileId)
        .eq('provider', body.provider ?? '');
      if (body.id) del = del.eq('id', body.id);
      const { error } = await del;
      if (error) throw error;
      await admin.from('activity_log').insert({
        actor_type: 'user',
        actor_id: profileId,
        subject_id: profileId,
        action: 'source_disconnected',
        summary: `Disconnected ${NAME[body.provider as ProviderId] ?? body.provider}`,
        summary_ar: `فصل ${NAME[body.provider as ProviderId] ?? body.provider}`,
        undoable: false,
      });
      return json({ ok: true });
    }

    case 'sync': {
      // one account (id) or every account of that tool, results added up
      let q = admin
        .from('connections')
        .select('*')
        .eq('profile_id', profileId)
        .eq('provider', body.provider ?? '');
      if (body.id) q = q.eq('id', body.id);
      const { data: conns } = await q;
      if (!conns?.length) throw new HttpError(404, 'Not connected');
      const total = { read: 0, tasks: 0, sent: 0, closedHere: 0, closedThere: 0, updated: 0 } as Record<string, number> & { error?: string };
      for (const c of conns) {
        const r = await syncConnection(admin, c);
        for (const k of ['read', 'tasks', 'sent', 'closedHere', 'closedThere', 'updated']) total[k] += (r as unknown as Record<string, number>)[k] ?? 0;
        if (r.error) total.error = r.error;
      }
      return json(total);
    }

    default:
      throw new HttpError(400, 'Unknown action');
  }
});
