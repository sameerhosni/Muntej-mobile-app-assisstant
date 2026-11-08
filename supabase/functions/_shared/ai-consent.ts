// AI permission (Apple 5.1.1(i) / 5.1.2(i), 8 Nov): nothing of a person's goes to OpenAI until they allowed it in the
// app (profiles.ai_consent, migration 20261108120000_ai_consent.sql). Every OpenAI path asks here first:
//   requireAi(profileId)  in functions a signed-in person calls → 403 'ai_consent_required' (the app shows the screen)
//   aiAllowed(profileId)  in jobs with nobody signed in (mail reading, WhatsApp, proof check, translation) → skip
import { HttpError } from './http.ts';
import { adminClient } from './push.ts';

export const AI_CONSENT_REQUIRED = 'ai_consent_required';

/** may Muntej send this person's data to the AI? Unknown person or no answer yet = no. Never cached: a function
 *  instance lives across requests, and the answer can change at any moment in Settings. */
export async function aiAllowed(profileId: string | null | undefined, admin = adminClient()): Promise<boolean> {
  if (!profileId) return false;
  const { data, error } = await admin.rpc('ai_allowed', { p_profile: profileId });
  if (error) throw new HttpError(500, `AI permission check failed: ${error.message}`);
  return data === true;
}

/** for functions the app calls: stop here unless this person allowed AI */
export async function requireAi(profileId: string): Promise<void> {
  if (!(await aiAllowed(profileId))) throw new HttpError(403, AI_CONSENT_REQUIRED);
}
