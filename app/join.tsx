// Screen · Join (no mockup): the WhatsApp invite's link (muntej://join?t=…, from support-web/join.html). Trades the
// one-time token for a sign-in (phone-auth redeem → magic-link token → session) and opens Home. Works signed out;
// signed in already, it just goes Home.
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText, Button } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { supabase } from '@/lib/supabase';
import { Munti } from '@/features/munti/Munti';
import { track } from '@/lib/analytics';

export default function JoinScreen() {
  const { t } = useTranslation();
  const { t: token } = useLocalSearchParams<{ t?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (s.session) return router.replace('/' as Href);
      if (!token) return router.replace('/sign-in' as Href);
      const { data, error: e } = await supabase.functions.invoke<{ token_hash: string }>('phone-auth', { body: { action: 'redeem', token } });
      if (e || !data?.token_hash) {
        let msg = t('auth.joinFailed');
        try {
          const body = await (e as { context?: Response })?.context?.json();
          if (body?.error) msg = body.error;
        } catch {
          // keep the general message
        }
        return setError(msg);
      }
      const { error: e2 } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
      if (e2) return setError(t('auth.joinFailed'));
      track('joined_from_invite');
      router.replace('/' as Href);
    })();
  }, [token, t]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.screen, backgroundColor: colors.bg }}>
      <Munti size="lg" mood={error ? 'oops' : 'wave'} />
      {error ? (
        <>
          <AppText align="center" color="textSoft">
            {error}
          </AppText>
          <Button label={t('auth.usePhone')} onPress={() => router.replace('/phone' as Href)} />
        </>
      ) : (
        <>
          <AppText weight="bold" align="center">
            {t('auth.joining')}
          </AppText>
          <ActivityIndicator color={colors.primary} />
        </>
      )}
    </View>
  );
}
