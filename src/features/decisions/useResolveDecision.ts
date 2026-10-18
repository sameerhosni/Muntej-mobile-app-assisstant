// Writes for screen 04: resolve a decision (and optionally reassign its task), then log it to activity_log.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import i18n from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { DecisionWithContext, Profile } from '@/lib/api';
import { NS } from './strings';

type Person = Pick<Profile, 'id' | 'full_name' | 'full_name_ar'>;

export type ResolveInput = {
  decision: DecisionWithContext;
  outcome: 'approved' | 'declined';
  meId: string;
  /** Reassign the decision's task to this person before resolving. */
  moveTo?: Person | null;
  /** Current task owner (for the undo payload and the activity subject). */
  ownerId?: string | null;
};

function check(res: { error: { message: string } | null }) {
  if (res.error) throw new Error(res.error.message);
}

export function useResolveDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ decision: d, outcome, meId, moveTo, ownerId }: ResolveInput) => {
      const now = new Date().toISOString();
      const taskTitle = d.task?.title ?? d.title;

      if (moveTo && d.task_id) {
        check(await supabase.from('tasks').update({ owner_id: moveTo.id }).eq('id', d.task_id));
      }

      check(
        await supabase
          .from('decisions')
          .update({ status: outcome, resolved_by: meId, resolved_at: now })
          .eq('id', d.id),
      );

      const tEn = (k: string, o: Record<string, string>) => i18n.t(`${NS}.log.${k}`, { ...o, lng: 'en' });
      const tAr = (k: string, o: Record<string, string>) => i18n.t(`${NS}.log.${k}`, { ...o, lng: 'ar' });
      const moved = !!moveTo && !!d.task_id;
      const summary = moved
        ? tEn('moved', { task: taskTitle, name: moveTo!.full_name.split(' ')[0] })
        : tEn(outcome, { title: d.title });
      const summaryAr = moved
        ? tAr('moved', { task: taskTitle, name: (moveTo!.full_name_ar ?? moveTo!.full_name).split(' ')[0] })
        : tAr(outcome, { title: d.title_ar ?? d.title });

      check(
        await supabase.from('activity_log').insert({
          actor_type: 'user',
          actor_id: meId,
          subject_id: d.requested_by ?? ownerId ?? null,
          task_id: d.task_id,
          action: outcome === 'approved' ? 'decision_approved' : 'decision_declined',
          summary,
          summary_ar: summaryAr,
          reason: d.recommendation_reason,
          undoable: moved,
          undo_payload: moved ? { task_id: d.task_id, owner_id: ownerId ?? null, decision_id: d.id } : null,
        }),
      );
    },
    onSettled: () => {
      for (const key of ['decisions', 'tasks', 'task', 'activity', 'homeStats']) qc.invalidateQueries({ queryKey: [key] });
    },
  });
}

/** Owners of the tasks behind the pending decisions (decisions only embed id/title/due_at). */
export function useTaskOwners(taskIds: string[]) {
  const ids = [...new Set(taskIds)].sort();
  return useQuery({
    queryKey: ['tasks', 'decisionOwners', ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, string | null>> => {
      const res = await supabase.from('tasks').select('id, owner_id').in('id', ids);
      if (res.error) throw new Error(res.error.message);
      return Object.fromEntries((res.data ?? []).map((r) => [r.id, r.owner_id]));
    },
  });
}
