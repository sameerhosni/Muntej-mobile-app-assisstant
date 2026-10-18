// Screen 10 write: log a quiet "offer help" to activity_log (RLS allows actor_id = me).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import i18n from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { NS } from './strings';

export type OfferHelpInput = {
  meId: string;
  ownerId: string | null;
  taskId: string;
  taskTitle: string;
  ownerName: string;
  ownerNameAr: string;
  reported: number;
  signal: number;
};

export function useOfferHelp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: OfferHelpInput) => {
      const tr = (key: string, lng: 'en' | 'ar', o: Record<string, string | number>) => i18n.t(`${NS}.log.${key}`, { ...o, lng });
      const res = await supabase.from('activity_log').insert({
        actor_type: 'user',
        actor_id: p.meId,
        subject_id: p.ownerId,
        task_id: p.taskId,
        action: 'help_offered',
        summary: tr('summary', 'en', { name: p.ownerName, task: p.taskTitle }),
        summary_ar: tr('summary', 'ar', { name: p.ownerNameAr, task: p.taskTitle }),
        reason: tr('reason', 'en', { reported: p.reported, signal: p.signal }),
        undoable: false,
      });
      if (res.error) throw new Error(res.error.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}
