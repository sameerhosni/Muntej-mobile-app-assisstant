// Who you may give a task to (owner, 8 Nov: "can give tasks to his team and users in the same level of other teams";
// admins: anyone). The database decides (assignable_people, the same check that guards every task); the pickers only
// offer those people. Until it answers, nobody is hidden (the database still refuses a wrong pick).
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useAssignable() {
  const q = useQuery({
    queryKey: ['assignable'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: string[] | { assignable_people: string }[] | null; error: { message: string } | null }>)(
        'assignable_people',
      );
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((x) => (typeof x === 'string' ? x : x.assignable_people)));
    },
  });
  /** true when you may give `id` a task (also while still loading) */
  return (id: string) => !q.data || q.data.has(id);
}
