// The task page, split in two (owner, 8 Nov: "add sections in each task, one for current state and if any action
// required to be in different section and very clear to user to take actions"; design/examples/task-sections.png):
//   «🔔 مطلوب منك»   only what this person must do now, each with its own button (amber, so it stands out)
//   «📍 الحالة الآن» where the task stands: status, Muntej's next follow-up, clarity, steps, proof
import { Pressable, View } from 'react-native';
import { AppText, Card } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { intlTag } from '@/lib/i18n/locale';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import type { Profile } from '@/lib/api';

const en = {
  needsYou: '🔔 Needed from you ({{n}})',
  now: '📍 Where it stands',
  status: 'Status',
  next: 'Next follow-up',
  clarity: 'Clarity',
  steps: 'Steps',
  proof: 'Proof',
  set: 'Set the {{what}}',
  add: 'Add',
  askAbout: 'Ask {{name}} about the {{what}}',
  ask: 'Ask',
  asked: 'Asked ✓',
  review: '{{name}} finished it: approve it or send it back',
  reviewBtn: 'Review',
  remind: 'I’ll remind {{name}} {{when}}',
  noNext: 'Nothing planned',
  clarityLine: '{{pct}}% · missing {{what}}',
  clarityFull: '100% · clear',
  stepsLine: '{{done}} of {{n}} done',
  noSteps: 'No steps yet',
  proofNone: 'Not asked for',
  proofLine: '{{n}} attached',
  proofWaiting: 'Asked for, nothing yet',
  and: ' and ',
  st_draft: 'Nobody has it yet',
  st_assigned: 'With them · not confirmed yet',
  st_assigned_seen: 'With them · seen',
  st_in_progress: 'Working on it',
  st_blocked: 'Stuck: they need help',
  st_submitted: 'Finished · waiting for review',
  st_returned: 'Sent back for changes',
  st_done: 'Done ✓',
  st_cancelled: 'Cancelled',
};
const ar: typeof en = {
  needsYou: '🔔 مطلوب منك ({{n}})',
  now: '📍 الحالة الآن',
  status: 'الحالة',
  next: 'المتابعة الجاية',
  clarity: 'الوضوح',
  steps: 'الخطوات',
  proof: 'الإثبات',
  set: 'حدد {{what}}',
  add: 'أضف',
  askAbout: 'اسأل {{name}} عن {{what}}',
  ask: 'اسأل',
  asked: 'سألت ✓',
  review: '{{name}} خلّصها: اعتمدها أو رجّعها',
  reviewBtn: 'راجعها',
  remind: 'بذكّر {{name}} {{when}}',
  noNext: 'ما فيه شي مخطط',
  clarityLine: '{{pct}}٪ · ناقص {{what}}',
  clarityFull: '100٪ · واضحة',
  stepsLine: 'خلص {{done}} من {{n}}',
  noSteps: 'ما فيه خطوات للحين',
  proofNone: 'ما انطلب',
  proofLine: 'مرفق {{n}}',
  proofWaiting: 'انطلب، وما وصل شي للحين',
  and: ' و',
  st_draft: 'ما أحد ماسكها للحين',
  st_assigned: 'وصلتهم · ما أكدوا الاستلام',
  st_assigned_seen: 'وصلتهم · شافوها',
  st_in_progress: 'شغّالين عليها',
  st_blocked: 'متعطّلة: يحتاجون مساعدة',
  st_submitted: 'خلصت · تنتظر المراجعة',
  st_returned: 'رجعت للتعديل',
  st_done: 'خلصت ✓',
  st_cancelled: 'ملغية',
};
export const SECTIONS_NS = registerStrings('taskSections', { en, ar });

export type DetailKey = 'due' | 'doneDef' | 'budget';
type Task = {
  status: string;
  owner_id: string | null;
  assigner_id: string | null;
  seen_at?: string | null;
  proof_required?: string | null;
  followups?: { recipient_id: string | null; scheduled_at: string; status: string }[];
  subtasks?: { done: boolean }[];
  evidence?: unknown[];
};

export function TaskSections({
  task,
  me,
  team,
  missing,
  clarity,
  whatOf,
  doing,
  reviewer,
  asked,
  onAdd,
  onAsk,
  onReview,
}: {
  task: Task;
  me: Profile | undefined;
  team: Profile[];
  /** details still missing, in the order to ask for them */
  missing: DetailKey[];
  clarity: number;
  /** the detail's name ("budget" / "الميزانية") */
  whatOf: (k: DetailKey) => string;
  /** I'm the one doing it (I ask the giver); otherwise I gave it or manage them (I add it) */
  doing: boolean;
  /** it's finished and the call is mine */
  reviewer: boolean;
  asked: Partial<Record<DetailKey, boolean>>;
  onAdd: (k: DetailKey) => void;
  onAsk: (k: DetailKey) => void;
  onReview: () => void;
}) {
  const { t } = useScreenT(SECTIONS_NS);
  const { lang } = useDirection();
  const first = (id: string | null | undefined) => {
    const p = team.find((x) => x.id === id);
    return p ? ((lang === 'ar' && p.full_name_ar) || p.full_name).split(' ')[0] : '';
  };
  const giver = first(task.assigner_id);
  const owner = first(task.owner_id);
  const finished = ['done', 'cancelled'].includes(task.status);

  // what this person must do now
  const actions: { key: string; text: string; button: string; done?: boolean; onPress: () => void }[] = [];
  if (reviewer) actions.push({ key: 'review', text: t('review', { name: owner }), button: t('reviewBtn'), onPress: onReview });
  if (!finished && !!me && (doing ? !!giver : true))
    for (const k of missing)
      actions.push(
        doing
          ? { key: k, text: t('askAbout', { name: giver, what: whatOf(k) }), button: asked[k] ? t('asked') : t('ask'), done: !!asked[k], onPress: () => onAsk(k) }
          : { key: k, text: t('set', { what: whatOf(k) }), button: `${t('add')} ${whatOf(k)}`, onPress: () => onAdd(k) },
      );

  // where it stands
  const status = task.status === 'assigned' && task.seen_at ? t('st_assigned_seen') : t(`st_${task.status}`);
  const next = (task.followups ?? []).filter((f) => f.status === 'scheduled').sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
  const when = next
    ? new Intl.DateTimeFormat(intlTag(lang, 'ar-SA-u-nu-latn-ca-gregory', 'en-GB'), { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(new Date(next.scheduled_at))
    : '';
  const steps = task.subtasks ?? [];
  const proofs = task.evidence?.length ?? 0;
  const lines: [string, string][] = [
    [t('status'), status],
    [t('next'), next && !finished ? t('remind', { name: first(next.recipient_id) || owner, when }) : t('noNext')],
    [t('clarity'), missing.length ? t('clarityLine', { pct: clarity, what: missing.map(whatOf).join(t('and')) }) : t('clarityFull')],
    [t('steps'), steps.length ? t('stepsLine', { done: steps.filter((s) => s.done).length, n: steps.length }) : t('noSteps')],
    [t('proof'), proofs ? t('proofLine', { n: proofs }) : task.proof_required && task.proof_required !== 'none' ? t('proofWaiting') : t('proofNone')],
  ];

  return (
    <View style={{ gap: spacing.md }}>
      {actions.length > 0 && (
        <View style={{ borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.gold, backgroundColor: colors.amberTint, padding: spacing.lg, gap: spacing.sm }}>
          <AppText variant="cardTitle" weight="bold" color="amberStrong">
            {t('needsYou', { n: actions.length })}
          </AppText>
          {actions.map((a) => (
            <View key={a.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md }}>
              <AppText style={{ flex: 1 }}>{a.text}</AppText>
              <Pressable
                onPress={a.onPress}
                disabled={a.done}
                accessibilityRole="button"
                accessibilityLabel={a.text}
                style={({ pressed }) => ({
                  minHeight: sizes.touch - 6,
                  justifyContent: 'center',
                  paddingHorizontal: spacing.lg,
                  borderRadius: radius.pill,
                  backgroundColor: a.done ? colors.greenTint : colors.amberStrong,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <AppText variant="small" weight="bold" color={a.done ? 'greenText' : 'onDark'}>
                  {a.button}
                </AppText>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <Card style={{ gap: 0 }}>
        <AppText variant="cardTitle" weight="bold" style={{ marginBottom: spacing.sm }}>
          {t('now')}
        </AppText>
        {lines.map(([k, v], i) => (
          <View key={k} style={{ flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
            <AppText variant="small" color="textMuted" style={{ width: 96 }}>
              {k}
            </AppText>
            <AppText variant="small" style={{ flex: 1 }}>
              {v}
            </AppText>
          </View>
        ))}
      </Card>
    </View>
  );
}
