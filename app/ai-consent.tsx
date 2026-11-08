// Screen · AI permission (no mockup; Apple 5.1.1(i) / 5.1.2(i), 8 Nov). Asked once after sign-in (app/index.tsx) and
// opened again from "AI is off" cards: what is sent, who receives it (OpenAI), Allow / Not now. Either answer is saved
// (set_ai_consent → every seat of this login) and can be changed in Settings → AI assistant.
import { useState } from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { homeRouteFor } from '@/features/screens/registry';
import { track } from '@/lib/analytics';
import { AI_NS } from '@/features/ai-consent/strings';
import { useAiConsent } from '@/features/ai-consent/api';
import { AiDisclosure } from '@/features/ai-consent/AiDisclosure';

export default function AiConsentScreen() {
  const { t } = useScreenT(AI_NS);
  const me = useMyProfile();
  const ai = useAiConsent();
  const [busy, setBusy] = useState<'allow' | 'no' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answer = async (allow: boolean) => {
    setBusy(allow ? 'allow' : 'no');
    setError(null);
    try {
      await ai.set(allow);
      track(allow ? 'ai_allowed' : 'ai_declined');
      if (router.canGoBack()) router.back();
      else router.replace(homeRouteFor(me.data?.role) as Href);
    } catch {
      setError(t('failed'));
      setBusy(null);
    }
  };

  return (
    <Screen bottomInset={40}>
      <View style={{ alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
          <ShieldCheck color={colors.primary} size={32} strokeWidth={2} />
        </View>
        <AppText variant="titleLg" align="center">
          {t('title')}
        </AppText>
        <AppText color="textSoft" align="center">
          {t('intro')}
        </AppText>
      </View>
      <Card>
        <AiDisclosure />
      </Card>
      <Card style={{ gap: spacing.sm }}>
        <AppText variant="cardTitle">{t('choiceTitle')}</AppText>
        <AppText color="textSoft">{t('choice')}</AppText>
      </Card>
      {!!error && <AppText color="red">{error}</AppText>}
      <Button label={t('allow')} size="lg" loading={busy === 'allow'} disabled={!!busy} onPress={() => answer(true)} />
      <Button label={t('notNow')} variant="outline" size="lg" loading={busy === 'no'} disabled={!!busy} onPress={() => answer(false)} />
    </Screen>
  );
}
