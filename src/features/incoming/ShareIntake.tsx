// "Share to Muntej": text shared from any app (Android share sheet; expo-share-intent) opens Incoming with the
// text in the paste box, ready for "Find tasks". Waits until the person is signed in. Renders nothing.
import { useEffect } from 'react';
import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';

export function ShareIntake({ signedIn }: { signedIn: boolean }) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (!signedIn || !hasShareIntent) return;
    const text = (shareIntent.text ?? shareIntent.webUrl ?? '').trim();
    if (text) router.push({ pathname: '/42-incoming', params: { text: text.slice(0, 12_000) } });
    resetShareIntent();
  }, [signedIn, hasShareIntent, shareIntent, resetShareIntent]);

  return null;
}
