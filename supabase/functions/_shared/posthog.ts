// PostHog from the server: what happens away from the app (WhatsApp turns, reports sent, alerts pushed), counted on
// the same person (distinct id = profile id) as the app's events. Names and counts only, never content.
// Env: POSTHOG_KEY (the project's public key; defaults to Muntej's), POSTHOG_HOST (default US cloud).
const KEY = () => Deno.env.get('POSTHOG_KEY') ?? 'phc_qhy99hF49RqU5ZD5fSMVEokUzLpayhmKCjYbCQn8wVhS';
const HOST = () => Deno.env.get('POSTHOG_HOST') ?? 'https://us.i.posthog.com';

export type PhEvent = { distinctId: string; event: string; properties?: Record<string, unknown> };

/** send events in one call; never throws (analytics must not break the work) */
export async function phCapture(events: PhEvent[]) {
  if (!events.length) return;
  try {
    await fetch(`${HOST()}/batch/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: KEY(),
        batch: events.map((e) => ({
          event: e.event,
          distinct_id: e.distinctId,
          properties: { source: 'server', ...(e.properties ?? {}) },
          timestamp: new Date().toISOString(),
        })),
      }),
    });
  } catch (e) {
    console.error('posthog', String(e));
  }
}
