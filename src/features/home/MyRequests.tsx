// Home: what you asked for and where it stands, so asking for more time (or help, or which task first) visibly
// changes something: "⏳ waiting for Sameer" until they answer, then "✅ new due date …" / "the date stays" for two
// days. Saree3 chases the answer; you don't need to.
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AppText, Card } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { useMyProfile, useTasks, useTeam } from '@/lib/api';
import { useProofGaps } from '@/features/review/countdown';
import { formatDue } from '@/features/capture/format';

const en = {
  title: 'Your requests',
  waitingTime: '⏳ More time for “{{task}}”: waiting for {{name}}. I’ll tell you the answer',
  waitingOther: '⏳ “{{task}}”: waiting for {{name}}. I’ll tell you the answer',
  gotTime: '✅ {{name}} gave you more time: “{{task}}” is now due {{when}}',
  yes: '✅ {{name}} said yes: “{{task}}”',
  noTime: '“{{task}}”: the date stays. Need help to make it? Open it and tell me',
  no: '“{{task}}”: {{name}} said not this time',
  someone: 'your manager',
  updates_one: '✅ {{count}} update on your requests · see',
  updates_other: '✅ {{count}} updates on your requests · see',
  missing: '📎 “{{task}}” is missing: {{items}}. Add it and I’ll send it on',
};
const ar: typeof en & Record<string, string> = {
  title: 'طلباتك',
  waitingTime: '⏳ وقت زيادة لـ«{{task}}»: ننتظر رد {{name}}، وأبلّغك أول ما يرد',
  waitingOther: '⏳ «{{task}}»: ننتظر رد {{name}}، وأبلّغك أول ما يرد',
  gotTime: '✅ {{name}} عطاك وقت زيادة: «{{task}}» موعدها الجديد {{when}}',
  yes: '✅ {{name}} وافق: «{{task}}»',
  noTime: '«{{task}}»: الموعد باقي. تحتاج مساعدة تلحق؟ افتحها وقل لي',
  no: '«{{task}}»: {{name}} ما وافق هالمرة',
  someone: 'مديرك',
  updates_one: '✅ تحديث على طلباتك · شوف',
  updates_other: '✅ {{count}} تحديثات على طلباتك · شوف',
  updates_two: '✅ تحديثين على طلباتك · شوف',
  missing: '📎 «{{task}}» ناقصها: {{items}}. أضفها وأنا أوصلها',
};
const NS = registerStrings('myRequests', { en, ar });

type Req = {
  id: string;
  type: string;
  status: string;
  task_id: string | null;
  manager_id: string;
  details: { new_due_at?: string } | null;
  resolved_at: string | null;
  task: { title: string } | null;
};

export function MyRequests() {
  const { t } = useScreenT(NS);
  const [open, setOpen] = useState(false);
  const { lang, isRTL } = useDirection();
  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  const me = useMyProfile();
  const team = useTeam();
  const meId = me.data?.id;
  const reqs = useQuery({
    queryKey: ['myRequests', meId],
    enabled: !!meId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Req[]> => {
      const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('decisions')
        .select('id, type, status, task_id, manager_id, details, resolved_at, task:tasks(title)')
        .eq('requested_by', meId!)
        .neq('manager_id', meId!)
        .or(`status.eq.pending,resolved_at.gte.${since}`)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as Req[];
    },
  });
  const tasks = useTasks();
  // my work waiting for review that Saree3's proof check found incomplete
  const sent = (tasks.data ?? []).filter((x) => x.owner_id === meId && x.status === 'submitted');
  const gaps = useProofGaps(sent.map((x) => x.id));
  const short = sent.filter((x) => gaps.data?.has(x.id));
  const rows = reqs.data ?? [];
  // needs you: an extension that was turned down (help to make the date); the rest is just news
  const act = rows.filter((r) => r.status === 'declined' && r.type === 'extension_request');
  const info = rows.filter((r) => !act.includes(r));
  if (!rows.length && !short.length) return null;
  const ar_ = lang === 'ar';
  const nameOf = (id: string) => {
    const p = (team.data ?? []).find((x) => x.id === id);
    return p ? ((ar_ && p.full_name_ar) || p.full_name).split(' ')[0] : t('someone');
  };

  return (
    <Card padding={spacing.lg} style={{ gap: spacing.sm }}>
      <AppText weight="extrabold" style={{ fontSize: 17 }}>
        {t('title')}
      </AppText>
      {short.map((x) => (
        <View key={x.id} style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.amberTint }}>
          <AppText weight="semibold" onPress={() => router.push({ pathname: '/14-task-detail', params: { id: x.id } })}>
            {t('missing', { task: x.title, items: gaps.data!.get(x.id)!.join(ar_ ? '، ' : ', ') })}
          </AppText>
        </View>
      ))}
      {/* lines that need you stay open; the rest (answers, approvals, "waiting") fold into one line */}
      {act.map(line)}
      {info.length > 0 && (
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            minHeight: sizes.touch,
            paddingHorizontal: spacing.md,
            borderRadius: radius.md,
            backgroundColor: colors.greenTint,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <AppText weight="bold" color="greenText" style={{ flex: 1 }}>
            {t('updates', { count: info.length })}
          </AppText>
          <Chevron color={colors.greenText} size={18} style={{ transform: [{ rotate: open ? (isRTL ? '-90deg' : '90deg') : '0deg' }] }} />
        </Pressable>
      )}
      {open && info.map(line)}
    </Card>
  );

  function line(r: Req) {
        const task = r.task?.title ?? '…';
        const name = nameOf(r.manager_id);
        const time = r.type === 'extension_request';
        const text =
          r.status === 'pending'
            ? t(time ? 'waitingTime' : 'waitingOther', { task, name })
            : r.status === 'approved'
              ? time && r.details?.new_due_at
                ? t('gotTime', { task, name, when: formatDue(r.details.new_due_at, lang) })
                : t('yes', { task, name })
              : t(time ? 'noTime' : 'no', { task, name });
        const tone = r.status === 'pending' ? colors.amberTint : r.status === 'approved' ? colors.greenTint : colors.chip;
        return (
          <View key={r.id} style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: tone }}>
            <AppText
              weight="semibold"
              onPress={() => r.task_id && router.push({ pathname: '/14-task-detail', params: { id: r.task_id } })}
            >
              {text}
            </AppText>
          </View>
        );
  }
}
