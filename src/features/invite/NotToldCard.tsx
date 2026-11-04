// Team: the people who don't know they were added (owner's employee, 4 Nov: "never found any notification to join").
// One tap invites everyone Muntej can reach; the rest have no mobile or email, so the card says so and shows them.
import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { BellOff } from 'lucide-react-native';
import { AppText, Button, Card } from '@/components/ui';
import type { ChipTone } from '@/components/ui/Chip';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { sendInvites, useInviteStates, type InviteState } from './api';

type Reachable = { user_id: string | null; phone: string | null; email: string | null };

/** what the Team screen says about someone still pending */
export function toldState(p: Reachable, invite: InviteState | undefined): { key: string; tone: ChipTone } {
  if (invite?.status === 'failed') return { key: 'failed', tone: 'red' };
  if (invite?.status === 'opened') return { key: 'opened', tone: 'amber' };
  if (invite?.channel === 'app') return { key: 'app', tone: 'primary' };
  if (invite?.channel === 'link') return { key: 'link', tone: 'primary' };
  if (invite) return { key: 'invited', tone: 'primary' };
  return p.user_id || p.phone || p.email ? { key: 'notTold', tone: 'amber' } : { key: 'cantReach', tone: 'red' };
}

const en = {
  title_one: '1 person doesn’t know they were added',
  title_other: '{{n}} people don’t know they were added',
  invite: 'Invite the {{n}} I can reach',
  cantReach: '{{n}} have no mobile or email. Open each one to share a join link.',
  show: 'Show them',
  sent: 'Sent ✓ I’ll tell you when they join.',
};
const ar: typeof en & Record<string, string> = {
  title_one: 'شخص ما يدري إنه انضاف',
  title_two: 'شخصين ما يدرون إنهم انضافوا',
  title_few: '{{n}} أشخاص ما يدرون إنهم انضافوا',
  title_many: '{{n}} شخص ما يدرون إنهم انضافوا',
  title_other: '{{n}} ما يدرون إنهم انضافوا',
  invite: 'ادعُ اللي أقدر أوصلهم ({{n}})',
  cantReach: 'عدد {{n}} بدون جوال أو إيميل. افتح كل واحد وشارك له رابط الدخول.',
  show: 'ورّني إياهم',
  sent: 'انرسلت ✓ وأقولك أول ما يدخلون.',
};
const NOT_TOLD_NS = registerStrings('notTold', { en, ar });

export function NotToldCard({ people, meId, onShow }: { people: (Reachable & { id: string; status: string; hidden?: boolean | null })[]; meId?: string; onShow: () => void }) {
  const { t } = useScreenT(NOT_TOLD_NS);
  const { lang } = useDirection();
  const qc = useQueryClient();
  const invites = useInviteStates();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!invites.data) return null;

  const waiting = people.filter((p) => {
    if (p.status !== 'pending' || p.hidden || p.id === meId) return false;
    const { key } = toldState(p, invites.data.get(p.id));
    return key === 'notTold' || key === 'cantReach' || key === 'failed';
  });
  if (!waiting.length && !note) return null;
  const reach = waiting.filter((p) => p.user_id || p.phone || p.email);
  const cant = waiting.length - reach.length;

  const inviteAll = async () => {
    setBusy(true);
    setNote(null);
    try {
      await sendInvites(reach.slice(0, 100).map((p) => p.id));
      setNote(t('sent'));
      await qc.invalidateQueries({ queryKey: ['invites'] });
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card tone="amber" padding={spacing.lg} style={{ gap: spacing.sm }}>
      {waiting.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <BellOff color={colors.amberText} size={18} />
          <AppText weight="bold" style={{ flex: 1 }}>
            {t('title', { count: waiting.length, n: formatNumber(waiting.length, lang) })}
          </AppText>
        </View>
      )}
      {cant > 0 && (
        <AppText variant="small" color="textSoft">
          {t('cantReach', { n: formatNumber(cant, lang) })}
        </AppText>
      )}
      {reach.length > 0 && <Button label={t('invite', { n: formatNumber(reach.length, lang) })} size="md" loading={busy} onPress={inviteAll} />}
      {cant > 0 && <Button label={t('show')} variant="outline" size="md" onPress={onShow} />}
      {!!note && (
        <AppText variant="caption" color="greenText">
          {note}
        </AppText>
      )}
    </Card>
  );
}
