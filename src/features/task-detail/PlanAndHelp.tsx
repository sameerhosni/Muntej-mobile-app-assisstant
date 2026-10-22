// On the task page, in context (nothing new to find):
//   Muntej's plan — the follow-up timeline Muntej made when the task was created (followups): what was sent ✓ and
//                   what comes next, so nobody wonders "will anyone check on this?"
//   Who should take it? — for the person who gives the work: load per teammate (screen 11, ?task=)
//   Too busy? — for the person doing it, while it's new: Muntej asks their manager what to move (screen 08, ?task=)
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { BellRing, CircleCheck, CircleGauge, Hand } from 'lucide-react-native';
import { AppText, Card } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import type { Followup, Profile } from '@/lib/api';
import { contentDirection } from '@/features/chat/Bubbles';
import { PLAN_NS } from './planStrings';

type TaskLike = { id: string; status: string; owner_id: string | null; assigner_id: string | null; created_at: string; followups?: Followup[] };

const OPEN = ['draft', 'assigned', 'in_progress', 'blocked', 'returned'];

export function PlanAndHelp({ task, me, team }: { task: TaskLike; me: Profile | undefined; team: Profile[] }) {
  const { t } = useScreenT(PLAN_NS);
  const { lang } = useDirection();
  const open = OPEN.includes(task.status);
  const isOwner = !!me && task.owner_id === me.id;
  const owner = team.find((p) => p.id === task.owner_id);
  const givesWork = !!me && !isOwner && (task.assigner_id === me.id || owner?.manager_id === me.id);
  const manager = team.find((p) => p.id === me?.manager_id);
  const managerName = manager ? ((lang === 'ar' && manager.full_name_ar) || manager.full_name).split(' ')[0] : null;
  const isNew = Date.now() - Date.parse(task.created_at) < 3 * 86_400_000;
  const showPushback = open && isOwner && !!managerName && isNew && task.assigner_id !== me?.id;

  const steps = (task.followups ?? []).filter((f) => ['sent', 'replied', 'scheduled'].includes(f.status));
  const nextIdx = steps.findIndex((f) => f.status === 'scheduled');
  const shown = steps.slice(Math.max(0, nextIdx - 1), Math.max(0, nextIdx - 1) + 4);
  const when = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', { timeZone: 'Asia/Riyadh', weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

  if (!shown.length && !(open && givesWork) && !showPushback) return null;

  return (
    <View style={{ gap: spacing.md }}>
      {shown.length > 0 && (
        <Card padding={spacing.lg} style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <BellRing color={colors.primary} size={15} strokeWidth={2.2} />
            <AppText variant="cardTitle" weight="bold" style={{ flex: 1 }}>
              {t('plan')}
            </AppText>
            {open && (
              <AppText variant="caption" color="textMuted">
                {t('planSub')}
              </AppText>
            )}
          </View>
          {shown.map((f) => {
            const sent = f.status !== 'scheduled';
            const text = (lang === 'ar' && f.message_ar) || f.message;
            return (
              <View key={f.id} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
                {sent ? (
                  <CircleCheck color={colors.greenText} size={16} strokeWidth={2.4} style={{ marginTop: 2 }} />
                ) : (
                  <View style={{ width: 16, height: 16, marginTop: 2, borderRadius: 8, borderWidth: 2, borderColor: colors.primary }} />
                )}
                <View style={{ flex: 1, gap: 1 }}>
                  <AppText variant="caption" weight="bold" color={sent ? 'textMuted' : 'primary'}>
                    {sent ? t('sentAt', { when: when(f.sent_at ?? f.scheduled_at) }) : when(f.scheduled_at)}
                  </AppText>
                  <AppText variant="small" color={sent ? 'textMuted' : 'textSoft'} numberOfLines={2} style={{ writingDirection: contentDirection(text) }}>
                    {text}
                  </AppText>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {open && givesWork && (
        <HelpRow
          icon={<CircleGauge color={colors.green} size={18} strokeWidth={2.2} />}
          title={t('whoTitle')}
          sub={t('whoSub')}
          onPress={() => router.push({ pathname: '/11-load-radar', params: { task: task.id } })}
        />
      )}
      {showPushback && (
        <HelpRow
          icon={<Hand color={colors.orange} size={18} strokeWidth={2.2} />}
          title={t('busyTitle')}
          sub={t('busySub', { name: managerName })}
          onPress={() => router.push({ pathname: '/08-pushback', params: { task: task.id } })}
        />
      )}
    </View>
  );
}

function HelpRow({ icon, title, sub, onPress }: { icon: React.ReactNode; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: sizes.touch + 8,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.tile,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {icon}
      <View style={{ flex: 1, paddingVertical: spacing.sm }}>
        <AppText weight="bold">{title}</AppText>
        <AppText variant="caption" color="textMuted">
          {sub}
        </AppText>
      </View>
    </Pressable>
  );
}
