// localize-text — Muntej's own words in a language it has no written copy of (Hindi). Input: { lang, texts: string[] }.
// Output: { texts: string[] }, same order. Called by the app for what it reads from the database (alerts, decisions, chat…)
// and by scripts/i18n/hi.mjs (x-cron-secret) for the app's strings. See _shared/localize.ts.
import { getCaller, HttpError, json, serve } from '../_shared/http.ts';
import { localizeTexts, needsLocalizing } from '../_shared/localize.ts';
import { adminClient } from '../_shared/push.ts';

const MAX_FOR_A_PERSON = 60;
const MAX_FOR_THE_SCRIPT = 200;
const MAX_LENGTH = 4000;

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const secret = Deno.env.get('CRON_SECRET');
  const trusted = !!secret && req.headers.get('x-cron-secret') === secret;
  if (!trusted) await getCaller(req);
  const { lang, texts } = (await req.json().catch(() => ({}))) as { lang?: string; texts?: unknown };
  if (!needsLocalizing(lang)) throw new HttpError(400, 'Language not supported');
  if (!Array.isArray(texts) || texts.some((t) => typeof t !== 'string')) throw new HttpError(400, 'texts needed');
  if (texts.length > (trusted ? MAX_FOR_THE_SCRIPT : MAX_FOR_A_PERSON)) throw new HttpError(400, 'Too many texts');
  const list = texts as string[];
  // something too long to be Muntej's own line comes back as it is
  const missed = new Set<string>();
  const out = await localizeTexts(adminClient(), lang, list.map((t) => (t.length > MAX_LENGTH ? '' : t)), missed);
  return json({ texts: out.map((t, i) => t || list[i]), failed: list.flatMap((t, i) => (missed.has(t) ? [i] : [])) });
});
