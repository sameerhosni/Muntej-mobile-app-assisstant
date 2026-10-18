// Tick / untick a live subtask (RLS: anyone who can see the task).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useToggleSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const res = await supabase.from('subtasks').update({ done }).eq('id', id);
      if (res.error) throw new Error(res.error.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['task'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
