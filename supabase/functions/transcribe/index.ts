// transcribe — speech-to-text for voice-captured tasks.
// Input: multipart/form-data with `file` (audio). Output: { text }.
// The audio is streamed to the STT provider and never stored.
// Provider is configurable: STT_PROVIDER (default "openai"), STT_MODEL (default "gpt-4o-transcribe").
import { getCaller, HttpError, json, requireEnv, serve } from '../_shared/http.ts';

const MAX_BYTES = 25 * 1024 * 1024; // OpenAI limit

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const { db } = await getCaller(req);

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, 'Missing audio file');
  if (file.size > MAX_BYTES) throw new HttpError(413, 'Recording is too long');

  // Team names help the model spell people correctly (Arabic + English).
  const { data: team } = await db.from('profiles').select('full_name, full_name_ar');
  const names = (team ?? []).flatMap((p) => [p.full_name, p.full_name_ar]).filter(Boolean).join(', ');

  const provider = Deno.env.get('STT_PROVIDER') ?? 'openai';
  if (provider !== 'openai') throw new HttpError(500, `Unsupported STT_PROVIDER: ${provider}`);

  const body = new FormData();
  body.append('file', file, file.name || 'audio.m4a');
  body.append('model', Deno.env.get('STT_MODEL') ?? 'gpt-4o-transcribe');
  body.append(
    'prompt',
    `A manager in Saudi Arabia is giving a task, in Saudi Arabic or English (often mixed). Team: ${names}.`,
  );

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
  return json({ text });
});
