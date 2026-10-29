// Home's setup card while something is missing.
//   admin  "One step left: bring your team · 2 of 3" with Continue with Saree3 / Later → the setup chat (screen 63)
//          at the same question. A brand-new admin goes straight into the chat, once per app open.
//   member "Setting up your account 3/6" strip → Saree3's setup guide (screen 47) until release 2 moves them to a chat too
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Sparkles } from 'lucide-react-native';
import { AppText, Button, ProgressBar } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { Munti } from '@/features/munti/Munti';
import { track } from '@/lib/analytics';
import { formatNumber } from '@/features/home/value';
import { markOnboarding } from './api';
import { useSetup } from './setup';
import { ONBOARDING_NS } from './strings';
import { SETUP_CHAT_NS } from './setupChatStrings';

let autoOpened = false;
// "Later" on the admin card: hidden until the app opens again
let laterThisOpen = false;

export function GettingStarted() {
  const setup = useSetup();
  if (!setup.ready || !setup.row) return null;
  return setup.member ? <MemberStrip setup={setup} /> : <AdminCard setup={setup} />;
}

type Setup = ReturnType<typeof useSetup>;
const CHAT = '/63-setup-chat' as Href;

function AdminCard({ setup }: { setup: Setup }) {
  const { t } = useScreenT(SETUP_CHAT_NS);
  const { lang } = useDirection();
  const qc = useQueryClient();
  const [hidden, setHidden] = useState(laterThisOpen);
  const r = setup.row!;
  const missing = setup.chat.items.filter((i) => !i.done);

  // a brand-new admin (never finished, never paused): straight into the chat, once per app open
  useEffect(() => {
    if (missing.length && !r.finished_at && !r.dismissed && !autoOpened) {
      autoOpened = true;
      router.push(CHAT);
    }
  }, [missing.length, r]);

  if (!missing.length || hidden) return null;
  const label = (k: string) => t(k === 'profile' ? 's_company' : k === 'team' ? 's_team' : 's_task');
  const go = async () => {
    track('setup_card_resume', { left: missing.length });
    if (r.dismissed) await markOnboarding(qc, { dismissed: false }).catch(() => {});
    router.push(CHAT);
  };

  return (
    <View style={{ gap: spacing.md, padding: spacing.lg, borderRadius: radius.tile, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.borderBlue }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Munti size="sm" mood="wave" />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight="extrabold">
            {missing.length === 1 ? t('cardTitle', { step: label(missing[0].key) }) : t('cardSteps', { steps: missing.map((i) => label(i.key)).join('، ') })}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {t('cardSub', { n: formatNumber(setup.chat.done, lang) })}
          </AppText>
        </View>
      </View>
      <ProgressBar value={setup.chat.done / setup.chat.total} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label={t('resume')} size="md" onPress={go} style={{ flex: 1.4 }} />
        <Button
          label={t('later')}
          size="md"
          variant="outline"
          onPress={() => {
            laterThisOpen = true;
            setHidden(true);
          }}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

function MemberStrip({ setup }: { setup: Setup }) {
  const { t } = useScreenT(ONBOARDING_NS);
  const { isRTL } = useDirection();
  const qc = useQueryClient();
  const r = setup.row!;
  const missing = setup.done < setup.total;

  // not finished and not paused: straight into Saree3's setup guide, once per app open
  useEffect(() => {
    if (missing && !r.finished_at && !r.dismissed && !autoOpened) {
      autoOpened = true;
      router.push('/47-welcome');
    }
  }, [missing, r]);

  if (!missing) return null;

  const go = async () => {
    if (r.dismissed) await markOnboarding(qc, { dismissed: false }).catch(() => {});
    router.push('/47-welcome');
  };

  return (
    <Pressable
      onPress={go}
      accessibilityRole="button"
      accessibilityLabel={`${t('stripTitle')}. ${t('stripSub', { done: setup.done, total: setup.total })}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: sizes.touch + 16,
        padding: spacing.lg,
        borderRadius: radius.tile,
        backgroundColor: colors.surface,
        borderWidth: 1.5,
        borderColor: colors.primary,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Sparkles color={colors.primary} size={20} strokeWidth={2.2} />
      <View style={{ flex: 1, gap: 6 }}>
        <AppText weight="bold">{t('stripTitle')}</AppText>
        <ProgressBar value={setup.done / setup.total} />
        <AppText variant="caption" color="textMuted">
          {t('stripSub', { done: setup.done, total: setup.total })}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <AppText variant="small" weight="bold" color="primary">
          {t('stripGo')}
        </AppText>
        <ChevronRight color={colors.primary} size={16} strokeWidth={2.2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
      </View>
    </Pressable>
  );
}
