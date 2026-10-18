// Write for screen 11: move a task to a new owner and log it to activity_log (undoable with the old owner).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import i18n from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { NS } from './strings';

export type AssignInput = {
  taskId: string;
  taskTitle: string;
  meId: string;
  prevOwnerId: string | null;
  to: { id: string; name: string; nameAr: string };
  totalPct: number;
};

function check(res: { error: { message: string } | null }) {
  if (res.error) throw new Error(res.error.message);
}

const first = (n: string) => n.trim().split(/\s+/)[0] ?? n;

export function useAssign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, taskTitle, meId, prevOwnerId, to, totalPct }: AssignInput) => {
      check(await supabase.from('tasks').update({ owner_id: to.id }).eq('id', taskId));
      const en = (k: string, o: Record<string, string>) => i18n.t(`${NS}.log.${k}`, { ...o, lng: 'en' });
      const ar = (k: string, o: Record<string, string>) => i18n.t(`${NS}.log.${k}`, { ...o, lng: 'ar' });
      check(
        await supabase.from('activity_log').insert({
          actor_type: 'user',
          actor_id: meId,
          subject_id: to.id,
          task_id: taskId,
          action: 'reassigned',
          summary: en('reassigned', { task: taskTitle, name: first(to.name) }),
          summary_ar: ar('reassigned', { task: taskTitle, name: first(to.nameAr) }),
          reason: en('reason', { name: first(to.name), pct: String(totalPct) }),
          undoable: true,
          undo_payload: { task_id: taskId, owner_id: prevOwnerId },
        }),
      );
    },
    onSettled: () => {
      for (const key of ['tasks', 'task', 'activity', 'homeStats']) qc.invalidateQueries({ queryKey: [key] });
    },
  });
}
