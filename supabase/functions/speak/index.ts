// speak — text-to-speech for the 1-minute audio brief ("Listen in a minute").
// Input: POST { text, lang }. Output: audio/mpeg. Nothing is stored; the app keeps the file only while it plays.
// Provider: OpenAI (TTS_MODEL, default "gpt-4o-mini-tts"; TTS_VOICE, default "nova"). Arabic is read in a warm
// Saudi dialect.
import { corsHeaders, getCaller, HttpError, requireEnv, serve } from '../_shared/http.ts';

const MAX_CHARS = 1500;

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  await getCaller(req);
  const { text, lang } = (await req.json().catch(() => ({}))) as { text?: string; lang?: string };
  const say = String(text ?? '')
    .trim()
    .slice(0, MAX_CHARS);
  if (!say) throw new HttpError(400, 'Nothing to read');
  const ar = String(lang ?? '').startsWith('ar');

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('TTS_MODEL') ?? 'gpt-4o-mini-tts',
      voice: Deno.env.get('TTS_VOICE') ?? 'nova',
      input: say,
      response_format: 'mp3',
      instructions: ar
        ? 'Read in natural Saudi Arabic (Najdi) dialect, warm and upbeat, like a friendly colleague giving a quick weekly update. Clear, not too fast.'
        : 'Warm and upbeat, like a friendly colleague giving a quick weekly update. Clear, not too fast.',
    }),
  });
  if (!res.ok) {
    console.error('TTS error', res.status, await res.text());
    throw new HttpError(502, 'Could not read the brief aloud');
  }
  return new Response(res.body, { headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg' } });
});
