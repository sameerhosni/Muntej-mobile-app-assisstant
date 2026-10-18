// Writes for screen 24: apply a roadmap suggestion to a task (+ activity_log 'roadmap_adjusted', undoable),
// and undo it again from the same card.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import i18n from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { fmtDate, type Suggestion } from './model';
import { NS } from './strings';

type LiveSuggestion = Exclude<Suggestion, { kind: 'demo' }>;

export type ApplyInput = { s: LiveSuggestion; meId: string; statusEn: string };
export type Applied = { taskId: string; logId: string; prev: LiveSuggestion['prev'] };

function check(res: { error: { message: string } | null }) {
  if (res.error) throw new Error(res.error.message);
}

const INVALIDATE = ['tasks', 'task', 'activity', 'homeStats'];

function dateIn(lng: 'en' | 'ar', ms: number) {
  return fmtDate(ms, i18n.t(`${NS}.months`, { lng }), (m, d) => i18n.t(`${NS}.dateFmt`, { m, d, lng }));
}

export function useRoadmapApply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ s, meId, statusEn }: ApplyInput): Promise<Applied> => {
      check(await supabase.from('tasks').update(s.patch).eq('id', s.taskId));
      const key = s.kind === 'move_due' ? 'moveDue' : 'setForecast';
      const res = await supabase
        .from('activity_log')
        .insert({
          actor_type: 'user',
          actor_id: meId,
          task_id: s.taskId,
          action: 'roadmap_adjusted',
          summary: i18n.t(`${NS}.log.${key}`, { task: s.task, date: dateIn('en', s.date), lng: 'en' }),
          summary_ar: i18n.t(`${NS}.log.${key}`, { task: s.task, date: dateIn('ar', s.date), lng: 'ar' }),
          reason: i18n.t(`${NS}.log.reason`, { status: statusEn, lng: 'en' }),
          undoable: true,
          undo_payload: { task_id: s.taskId, ...s.prev },
        })
        .select('id')
        .single();
      check(res);
      return { taskId: s.taskId, logId: res.data!.id, prev: s.prev };
    },
    onSettled: () => {
      for (const key of INVALIDATE) qc.invalidateQueries({ queryKey: [key] });
    },
  });
}

export function useRoadmapUndo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, logId, prev }: Applied) => {
      check(await supabase.from('tasks').update(prev).eq('id', taskId));
      check(await supabase.from('activity_log').update({ undone_at: new Date().toISOString() }).eq('id', logId));
    },
    onSettled: () => {
      for (const key of INVALIDATE) qc.invalidateQueries({ queryKey: [key] });
    },
  });
}
