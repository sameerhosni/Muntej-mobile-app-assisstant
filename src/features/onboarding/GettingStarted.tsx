// Home's setup card while something is missing; both go to Saree3's setup chat (screen 63) at the same question.
//   admin   "One step left: bring your team · 2 of 3" with Continue with Saree3 / Later (back next app open)
//   member  "Let's finish getting you started" with Continue / Later, offered once: Later keeps the defaults
// Someone brand new (never finished, never paused) goes straight into the chat, once per app open.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { AppText, Button, ProgressBar } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { Munti } from '@/features/munti/Munti';
import { track } from '@/lib/analytics';
import { formatNumber } from '@/features/home/value';
import { markOnboarding } from './api';
import { useSetup } from './setup';
import { SETUP_CHAT_NS } from './setupChatStrings';

let autoOpened = false;
// "Later" on the admin card: hidden until the app opens again
let laterThisOpen = false;
const CHAT = '/63-setup-chat' as Href;

export function GettingStarted() {
  const setup = useSetup();
  if (!setup.ready || !setup.row) return null;
  return setup.member ? <MemberCard setup={setup} /> : <AdminCard setup={setup} />;
}

type Setup = ReturnType<typeof useSetup>;

/** straight into the chat the first time (not finished, not paused), once per app open */
function useAutoOpen(open: boolean, r: NonNullable<Setup['row']>) {
  useEffect(() => {
    if (open && !r.finished_at && !r.dismissed && !autoOpened) {
      autoOpened = true;
      router.push(CHAT);
    }
  }, [open, r]);
}

function AdminCard({ setup }: { setup: Setup }) {
  const { t } = useScreenT(SETUP_CHAT_NS);
  const { lang } = useDirection();
  const qc = useQueryClient();
  const [hidden, setHidden] = useState(laterThisOpen);
  const r = setup.row!;
  const missing = setup.chat.items.filter((i) => !i.done);
  useAutoOpen(missing.length > 0, r);

  if (!missing.length || hidden) return null;
  const label = (k: string) => t(k === 'profile' ? 's_company' : k === 'team' ? 's_team' : 's_task');
  const go = async () => {
    track('setup_card_resume', { role: 'admin', left: missing.length });
    if (r.dismissed) await markOnboarding(qc, { dismissed: false }).catch(() => {});
    router.push(CHAT);
  };

  return (
    <Card
      title={missing.length === 1 ? t('cardTitle', { step: label(missing[0].key) }) : t('cardSteps', { steps: missing.map((i) => label(i.key)).join('، ') })}
      sub={t('cardSub', { n: formatNumber(setup.chat.done, lang) })}
      progress={setup.chat.done / setup.chat.total}
      onGo={go}
      onLater={() => {
        laterThisOpen = true;
        setHidden(true);
      }}
    />
  );
}

function MemberCard({ setup }: { setup: Setup }) {
  const { t } = useScreenT(SETUP_CHAT_NS);
  const qc = useQueryClient();
  const r = setup.row!;
  const open = !r.finished_at;
  useAutoOpen(open, r);
  if (!open) return null;
  const go = async () => {
    track('setup_card_resume', { role: 'member' });
    if (r.dismissed) await markOnboarding(qc, { dismissed: false }).catch(() => {});
    router.push(CHAT);
  };
  // offered once: "Later" keeps the defaults (reached on both, no fingerprint) and the card goes away
  const later = () => {
    track('setup_card_later', { role: 'member' });
    markOnboarding(qc, { finished: true }).catch(() => {});
  };
  return <Card title={t('m_cardTitle')} sub={t('m_cardSub')} onGo={go} onLater={later} />;
}

function Card({ title, sub, progress, onGo, onLater }: { title: string; sub: string; progress?: number; onGo: () => void; onLater: () => void }) {
  const { t } = useScreenT(SETUP_CHAT_NS);
  return (
    <View style={{ gap: spacing.md, padding: spacing.lg, borderRadius: radius.tile, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.borderBlue }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Munti size="sm" mood="wave" />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight="extrabold">{title}</AppText>
          <AppText variant="caption" color="textMuted">
            {sub}
          </AppText>
        </View>
      </View>
      {progress !== undefined && <ProgressBar value={progress} />}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label={t('resume')} size="md" onPress={onGo} style={{ flex: 1.4 }} />
        <Button label={t('later')} size="md" variant="outline" onPress={onLater} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
