// Writes for screen 15: record the manager's review decision, update the task, and log it.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import i18n from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { NS } from './strings';

export type DecideInput = {
  reviewId: string;
  round: number;
  taskId: string;
  taskTitle: string;
  ownerId: string | null;
  meId: string;
  decision: 'approved' | 'sent_back';
  rating: number;
  criteria: string[];
  note: string | null;
};

function check(res: { error: { message: string } | null }) {
  if (res.error) throw new Error(res.error.message);
}

export function useDecideReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: DecideInput) => {
      const now = new Date().toISOString();
      check(
        await supabase
          .from('reviews')
          .update({ rating: v.rating, criteria: v.criteria, note: v.note, decision: v.decision, reviewer_id: v.meId, decided_at: now })
          .eq('id', v.reviewId),
      );
      const approved = v.decision === 'approved';
      check(
        await supabase
          .from('tasks')
          .update(approved ? { status: 'done', closed_at: now, progress: 100 } : { status: 'returned' })
          .eq('id', v.taskId),
      );
      const key = approved ? 'approved' : 'sentBack';
      const opts = { task: v.taskTitle, r: String(v.rating), n: String(v.round + 1) };
      check(
        await supabase.from('activity_log').insert({
          actor_type: 'user',
          actor_id: v.meId,
          subject_id: v.ownerId,
          task_id: v.taskId,
          action: approved ? 'task_closed' : 'sent_back',
          summary: i18n.t(`${NS}.log.${key}`, { ...opts, lng: 'en' }),
          summary_ar: i18n.t(`${NS}.log.${key}`, { ...opts, lng: 'ar' }),
          reason: v.note,
          undoable: false,
        }),
      );
    },
    onSettled: () => {
      for (const key of ['task', 'tasks', 'activity', 'homeStats']) qc.invalidateQueries({ queryKey: [key] });
    },
  });
}
