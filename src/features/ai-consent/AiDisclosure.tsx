// What goes to the AI and to whom: the same words on the permission screen and in Settings (Apple 5.1.2(i): disclose
// what is sent, say who receives it). Also the "AI is off" card shown where the assistant would read something.
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Bot, PenLine } from 'lucide-react-native';
import { AppText, Button, Card, Toggle } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { track } from '@/lib/analytics';
import { Spotlight } from '@/features/launch/Spotlight';
import { AI_NS } from './strings';
import { PRIVACY_URL, useAiConsent } from './api';

const WHAT = ['what1', 'what2', 'what3', 'what4', 'what5', 'what6'] as const;

export function AiDisclosure() {
  const { t } = useScreenT(AI_NS);
  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="cardTitle">{t('whatTitle')}</AppText>
      {WHAT.map((k) => (
        <View key={k} style={{ flexDirection: 'row', gap: spacing.sm }}>
          <AppText color="primary">•</AppText>
          <AppText style={{ flex: 1 }}>{t(k)}</AppText>
        </View>
      ))}
      <AppText variant="cardTitle">{t('whoTitle')}</AppText>
      <AppText>{t('who')}</AppText>
      <AppText color="primary" weight="bold" onPress={() => Linking.openURL(PRIVACY_URL)} accessibilityRole="link">
        {t('privacy')}
      </AppText>
    </View>
  );
}

/** Settings → AI assistant (OpenAI): the switch, what it means now, and the full list on request */
export function AiSettingCard() {
  const { t } = useScreenT(AI_NS);
  const ai = useAiConsent();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flip = async (allow: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await ai.set(allow);
      track(allow ? 'ai_allowed' : 'ai_declined', { from: 'settings' });
    } catch {
      setError(t('failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Spotlight id="settings.ai">
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <Bot color={ai.aiOn ? colors.primary : colors.textMuted} size={26} strokeWidth={2} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="cardTitle">{t('settingTitle')}</AppText>
            <AppText variant="caption" color="textMuted">
              {t(ai.aiOn ? 'settingOn' : 'settingOff')}
            </AppText>
          </View>
          <Toggle value={ai.aiOn} disabled={busy} onValueChange={flip} accessibilityLabel={t('settingTitle')} />
        </View>
        {!!error && (
          <AppText variant="small" color="red">
            {error}
          </AppText>
        )}
        {open ? <AiDisclosure /> : <Button label={t('settingDetails')} variant="ghost" onPress={() => setOpen(true)} />}
      </Card>
    </Spotlight>
  );
}

/** in place of something the assistant would read, for someone who chose "Not now" */
export function AiOffCard({ manual = true }: { manual?: boolean }) {
  const { t } = useScreenT(AI_NS);
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Bot color={colors.textMuted} size={22} strokeWidth={2} />
        <AppText variant="cardTitle">{t('offTitle')}</AppText>
      </View>
      <AppText color="textSoft">{t('offBody')}</AppText>
      <Button label={t('offAllow')} onPress={() => router.push('/ai-consent' as Href)} />
      {manual && (
        <Button
          label={t('offManual')}
          variant="outline"
          icon={<PenLine color={colors.primary} size={18} strokeWidth={2} />}
          onPress={() => router.push('/new-task' as Href)}
        />
      )}
    </Card>
  );
}
