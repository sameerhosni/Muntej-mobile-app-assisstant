// AI permission (migration 20261108120000_ai_consent.sql): profiles.ai_consent null = not asked, true = allowed,
// false = "Not now". The server refuses AI work without it (403 'ai_consent_required'); the app asks once after sign-in
// (app/index.tsx → /ai-consent), shows a switch in Settings and "AI is off" where the assistant would read something.
// Until `ship --live` only testers are asked (the 'ai_consent' feature row is visible to them only).
import { Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk, useMyProfile } from '@/lib/api';
import { useFeatures } from '@/features/launch/launch';

export const AI_CONSENT_REQUIRED = 'ai_consent_required';
export const PRIVACY_URL = 'https://nizamy-muntej.expo.app/privacy.html';

// the new columns and rpc aren't in the generated types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

export function useAiConsent() {
  const me = useMyProfile();
  const features = useFeatures();
  const qc = useQueryClient();
  // AI is on by default (owner, 10 Nov: "AI should be allowed by default … no need to ask for permissions except the
  // user stopped it"); only the iPhone app asks once first, because Apple requires it (5.1.2, the 8 Nov rejection)
  const ios = Platform.OS === 'ios';
  const asked = ios && !!features.data?.some((f) => f.key === 'ai_consent');
  const consent = (me.data as { ai_consent?: boolean | null } | undefined)?.ai_consent ?? null;
  return {
    /** still finding out (profile or feature list loading) */
    loading: me.isLoading || features.isLoading,
    /** this person is asked (on iPhone: live for everyone, or a tester while it is in testing) */
    asked,
    /** asked, and hasn't answered yet: show the screen */
    needsAnswer: asked && consent === null,
    /** may the assistant read things for them: yes unless they turned it off (on iPhone, once they allowed it) */
    aiOn: consent !== false && (!asked || consent === true),
    async set(allow: boolean) {
      const { error } = await untyped.rpc('set_ai_consent', { p: allow });
      if (error) throw new Error(error.message);
      await qc.invalidateQueries({ queryKey: qk.me });
    },
  };
}
