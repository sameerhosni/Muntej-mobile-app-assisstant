// Screen 57 · Talk to the Muntej team — no mockup. Intercom's web Messenger inside the app: a web view of the hosted
// support page (support-web/index.html) opened with a one-time link that signs the person in to Intercom
// (supabase/functions/support-identity). Replaces Intercom's Android SDK, whose window opened empty (26 Oct).
// Links to other sites open in the browser.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { ChevronLeft } from 'lucide-react-native';
import { AppText, Button, IconButton } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { supportLink } from '@/features/support/intercom';
import { SUPPORT_NS } from '@/features/support/strings';

/** pages the chat may show inside the app (the support page and Intercom itself) */
const INSIDE = /^https:\/\/([a-z0-9-]+\.)*(expo\.app|intercom\.io|intercomcdn\.com|intercom\.com|intercomassets\.com)(\/|$)/i;

export default function SupportScreen() {
  const { t } = useScreenT(SUPPORT_NS);
  const { isRTL } = useDirection();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // opened from a reply notification: its alert names the conversation (dedupe_key support:<conversation>:…)
  const { alert } = useLocalSearchParams<{ alert?: string }>();
  // opened from a notification there may be nothing behind it: back goes Home
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as Href));

  const load = useCallback(() => {
    setFailed(false);
    setUrl(null);
    (async () => {
      let conversation: string | null = null;
      if (alert) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any).from('alerts').select('dedupe_key').eq('id', alert).maybeSingle();
        conversation = (data?.dedupe_key as string | undefined)?.split(':')[1] || null;
      }
      return supportLink(conversation);
    })().then(setUrl, () => setFailed(true));
  }, [alert]);
  useEffect(load, [load]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.screen, paddingVertical: spacing.sm }}>
        <IconButton label={t('back')} onPress={back}>
          <ChevronLeft color={colors.text} size={22} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </IconButton>
        <AppText variant="section" numberOfLines={1} style={{ flex: 1 }}>
          {t('talk')}
        </AppText>
      </View>
      {failed ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.screen }}>
          <AppText color="textMuted" style={{ textAlign: 'center' }}>
            {t('failed')}
          </AppText>
          <Button label={t('retry')} onPress={load} />
        </View>
      ) : !url ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <WebView
          source={{ uri: url }}
          style={{ flex: 1, backgroundColor: colors.bg }}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={(r) => {
            if (INSIDE.test(r.url) || r.url.startsWith('about:') || r.url.startsWith('blob:') || r.url.startsWith('data:')) return true;
            Linking.openURL(r.url).catch(() => {});
            return false;
          }}
          onError={() => setFailed(true)}
        />
      )}
    </SafeAreaView>
  );
}
