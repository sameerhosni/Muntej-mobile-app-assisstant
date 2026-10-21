// connect — linking a person's own tools to Muntej (OAuth 2.0 with PKCE). The tokens stay on the server, encrypted.
//   POST { action: 'providers' }                      → which tools can be connected on this server (credentials set)
//   POST { action: 'token', provider, token }         → connect with a personal API token (ClickUp …), first read now
//   POST { action: 'start', provider, redirect }      → the tool's sign-in page URL (the app opens it in the browser)
//   GET  /connect/callback?code&state                 → the tool sends the person back here; we save the connection
//                                                       and send them on to `redirect` (?connected=… or ?error=…)
//   POST { action: 'disconnect', provider }           → forget the connection and its tokens
//   POST { action: 'sync', provider }                 → check that tool right now (otherwise every 10 min)
import { getCaller, HttpError, json, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';
import { ALL_PROVIDERS, CALLBACK_URL, challengeOf, PROVIDERS, randomToken, seal, syncConnection, type ProviderId } from '../_shared/connections.ts';

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
        { onConflict: 'profile_id,provider' },
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
  const body = (await req.json().catch(() => ({}))) as { action?: string; provider?: ProviderId; redirect?: string };
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
        })),
      );

    // connect with the person's own personal API token (no admin setup): checked against the tool, then kept encrypted
    case 'token': {
      const provider = body.provider ? PROVIDERS[body.provider] : undefined;
      if (!provider?.personalToken) throw new HttpError(400, 'This tool needs sign-in instead');
      const token = String((body as { token?: string }).token ?? '').trim();
      if (token.length < 10 || token.length > 500) throw new HttpError(400, 'That doesn’t look like a token');
      let account: { label: string; cursor?: Record<string, unknown> };
      try {
        account = await provider.personalToken.verify(token);
      } catch {
        throw new HttpError(400, 'That token didn’t work. Copy it again and paste it here');
      }
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
          { onConflict: 'profile_id,provider' },
        )
        .select('*')
        .single();
      if (error) throw error;
      await admin.from('connection_secrets').upsert({ connection_id: conn.id, data: await seal({ access_token: token }), updated_at: new Date().toISOString() });
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

    case 'disconnect': {
      const { error } = await admin.from('connections').delete().eq('profile_id', profileId).eq('provider', body.provider ?? '');
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
      const { data: conn } = await admin.from('connections').select('*').eq('profile_id', profileId).eq('provider', body.provider ?? '').maybeSingle();
      if (!conn) throw new HttpError(404, 'Not connected');
      return json(await syncConnection(admin, conn));
    }

    default:
      throw new HttpError(400, 'Unknown action');
  }
});
