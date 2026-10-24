// Home: what you asked for and where it stands, so asking for more time (or help, or which task first) visibly
// changes something: "⏳ waiting for Sameer" until they answer, then "✅ new due date …" / "the date stays" for two
// days. Saree3 chases the answer; you don't need to.
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AppText, Card } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { useMyProfile, useTeam } from '@/lib/api';
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
  const { lang } = useDirection();
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
  const rows = reqs.data ?? [];
  if (!rows.length) return null;
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
      {rows.map((r) => {
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
      })}
    </Card>
  );
}
