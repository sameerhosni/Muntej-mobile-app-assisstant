// Screen · Sign in with WhatsApp — no mockup; v2 light style per design/TOKENS.md. Owner, 28 Oct: "the WhatsApp OTP
// journey is not good and I couldn't easily copy the OTP". Nothing to type or copy now: one tap opens WhatsApp with
// "دخول منتج #KEY" ready to send to Muntej's number; WhatsApp proves who sent it; this screen waits (polling
// phone-auth wa_poll) and signs the person in as soon as the message arrives. The number is the one on their
// WhatsApp, matched to the mobile their manager added.
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText, Button, TimedProgress } from '@/components/ui';
import { sizes, spacing } from '@/theme/tokens';
import { supabase } from '@/lib/supabase';
import { AuthShell } from '@/features/auth/AuthShell';
import { Munti } from '@/features/munti/Munti';
import { track } from '@/lib/analytics';

export default function WhatsAppSignInScreen() {
  const { t } = useTranslation();
  const [nonce, setNonce] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  // waiting for the WhatsApp message: ask every 2 s (and right away when the person comes back to the app)
  const poll = async (key: string) => {
    const { data, error: e } = await supabase.functions.invoke<{ waiting?: boolean; token_hash?: string }>('phone-auth', { body: { action: 'wa_poll', token: key } });
    if (e) {
      stop();
      setNonce(null);
      return setError(t('auth.waExpired'));
    }
    if (!data?.token_hash) return;
    stop();
    const { error: e2 } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
    if (e2) return setError(t('auth.genericError'));
    track('signed_in_whatsapp');
    router.replace('/' as Href);
  };
  useEffect(() => {
    if (!nonce) return;
    const sub = AppState.addEventListener('change', (s) => s === 'active' && poll(nonce));
    return () => sub.remove();
  }, [nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setError(null);
    setBusy(true);
    const { data, error: e } = await supabase.functions.invoke<{ nonce: string; number: string }>('phone-auth', { body: { action: 'wa_start' } });
    setBusy(false);
    if (e || !data?.nonce) return setError(t('auth.genericError'));
    setNonce(data.nonce);
    track('whatsapp_sign_in_started');
    stop();
    timer.current = setInterval(() => poll(data.nonce), 2000);
    await Linking.openURL(`https://wa.me/${data.number}?text=${encodeURIComponent(`${t('auth.waMessage')} #${data.nonce}`)}`).catch(() => setError(t('auth.noWhatsApp')));
  };

  return (
    <AuthShell title={t('auth.waTitle')} hint={t('auth.waHint')}>
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <Munti size="md" mood={nonce ? 'think' : 'wave'} />
        {!!nonce && (
          <AppText align="center" color="textSoft">
            {t('auth.waWaiting')}
          </AppText>
        )}
      </View>
      {!!nonce && <TimedProgress active expectedMs={30_000} stages={[t('auth.waStep1'), t('auth.waStep2')]} />}
      <Button label={nonce ? t('auth.waAgain') : t('auth.waButton')} variant={nonce ? 'outline' : 'primary'} onPress={start} loading={busy} />
      {!!error && (
        <AppText variant="small" color="red">
          {error}
        </AppText>
      )}
      <Pressable onPress={() => router.replace('/sign-in' as Href)} accessibilityRole="button" style={{ minHeight: sizes.touch, justifyContent: 'center', paddingHorizontal: spacing.xs }}>
        <AppText variant="small" color="primary" weight="bold">
          {t('auth.useEmail')}
        </AppText>
      </Pressable>
    </AuthShell>
  );
}
