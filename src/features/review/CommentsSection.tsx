// Comments on a task (owner, 9 Nov, N2): what the doer and the giver wrote to each other from the bottom bar's
// «أكتب تعليق». Read-only here; writing is in the bar's sheet. Hidden when there are none.
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { AppText, Avatar, Card } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { registerStrings } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/api';
import { formatDue } from '@/features/capture/format';
import { contentDirection } from '@/features/chat/Bubbles';

const NS = registerStrings('taskComments', { en: { title: 'Comments', you: 'You' }, ar: { title: 'التعليقات', you: 'أنت' } });

type Row = { id: string; author_id: string; body: string; created_at: string };

export function CommentsSection({ taskId, team, meId }: { taskId: string; team: Profile[]; meId: string | undefined }) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const q = useQuery({
    queryKey: ['taskComments', taskId],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => any })
        .from('task_comments')
        .select('id, author_id, body, created_at')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []) as Row[];
    },
  });
  const rows = q.data ?? [];
  if (!rows.length) return null;
  const nameOf = (id: string) => {
    if (id === meId) return t('you');
    const p = team.find((x) => x.id === id);
    return p ? ((lang === 'ar' && p.full_name_ar) || p.full_name).split(' ')[0] : '…';
  };
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="section">{t('title')}</AppText>
      <Card style={{ gap: spacing.md }}>
        {rows.map((c) => (
          <View key={c.id} style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Avatar name={nameOf(c.author_id)} size={28} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="caption" color="textMuted">
                {`${nameOf(c.author_id)} · ${formatDue(c.created_at, lang)}`}
              </AppText>
              <AppText style={{ writingDirection: contentDirection(c.body), color: colors.text }}>{c.body}</AppText>
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}
