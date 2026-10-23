// transcribe — speech-to-text for voice-captured tasks.
// Input: multipart/form-data with `file` (audio). Output: { text }.
// The audio is streamed to the STT provider and never stored.
// Provider is configurable: STT_PROVIDER (default "openai"), STT_MODEL (default "gpt-4o-transcribe").
import { getCaller, HttpError, json, requireEnv, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';

const MAX_BYTES = 25 * 1024 * 1024; // OpenAI limit

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const { db, userId } = await getCaller(req);

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, 'Missing audio file');
  if (file.size > MAX_BYTES) throw new HttpError(413, 'Recording is too long');

  // App language: Arabic UI → tell the model the speech is Arabic (big accuracy gain for Saudi dialect).
  const lang = String(form.get('lang') ?? '').slice(0, 2);

  // Spelling hints only: names of people and workspaces. Keep this a plain word list. Full sentences or task
  // titles here make the model hallucinate them when the audio is silent or noisy.
  // The names come from EVERY account this person belongs to (the one they're in now may only hold themselves, like the
  // super admin's own account), so "give it to Samir" is spelled right wherever their team is.
  const admin = adminClient();
  const { data: mine } = await admin.from('profiles').select('account_id').eq('user_id', userId).eq('hidden', false).neq('status', 'deleted');
  const accountIds = [...new Set((mine ?? []).map((p) => p.account_id as string))];
  const [{ data: team }, { data: workspaces }] = await Promise.all([
    accountIds.length
      ? admin.from('profiles').select('full_name, full_name_ar').in('account_id', accountIds).eq('hidden', false).neq('status', 'deleted').limit(200)
      : db.from('profiles').select('full_name, full_name_ar'),
    db.from('workspaces').select('name, name_ar'),
  ]);
  const vocab = [...(team ?? []).flatMap((p) => [p.full_name, p.full_name_ar]), ...(workspaces ?? []).flatMap((w) => [w.name, w.name_ar])]
    .filter(Boolean)
    .join(', ');

  const provider = Deno.env.get('STT_PROVIDER') ?? 'openai';
  if (provider !== 'openai') throw new HttpError(500, `Unsupported STT_PROVIDER: ${provider}`);

  const body = new FormData();
  body.append('file', file, file.name || 'audio.m4a');
  body.append('model', Deno.env.get('STT_MODEL') ?? 'gpt-4o-transcribe');
  if (lang === 'ar') body.append('language', 'ar');
  body.append('prompt', `Saudi dialect. Names: ${vocab}.`.slice(0, 800));

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}` },
    body,
  });
  if (!res.ok) {
    console.error('STT error', res.status, await res.text());
    throw new HttpError(502, 'Could not transcribe the recording');
  }
  const out = (await res.json()) as { text?: string };
  const text = (out.text ?? '').trim();
  if (!text) throw new HttpError(422, 'No speech detected');
  // On silence or noise the model tends to read the prompt back ("عبدالله القحطاني, نورة…"). A transcript made only of
  // hint names is that echo, not speech: reject it instead of turning it into a task.
  const words = (x: string) =>
    x
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1);
  const hint = new Set(words(`Saudi dialect Names ${vocab}`));
  const spoken = words(text);
  if (spoken.length && spoken.filter((w) => !hint.has(w)).length < 2 && spoken.length > 2) {
    throw new HttpError(422, 'No speech detected');
  }
  return json({ text });
});
