// Typed data hooks (TanStack Query). RLS decides what each user can see, so queries stay simple.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCallback } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useViewAs, withView } from '@/features/view-as/store';
import { qk, type TaskFilter } from './keys';
import { logoutSupport } from '@/features/support/intercom';
import {
  ACTIVE_STATUSES,
  type ActivityEntry,
  type DecisionStatus,
  type DecisionWithContext,
  type Profile,
  type Subtask,
  type Evidence,
  type Followup,
  type Review,
  type TaskWithPeople,
} from './types';

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const TASK_SELECT =
  '*, owner:profiles!tasks_owner_id_fkey(id, full_name, full_name_ar, avatar_color), helper:profiles!tasks_helper_id_fkey(id, full_name, full_name_ar), workspace:workspaces(id, name, name_ar, color)';

/** Signed in, but no account has invited this email yet (handle_new_user creates no profile without an invite). */
export class NotInvitedError extends Error {}

/** The signed-in user's profile. For admins, `role` follows the "View as" switch; `actual_role` is the real one. */
export function useMyProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const view = useViewAs();
  const select = useCallback((p: Profile) => withView(p, view), [view]);
  return useQuery({
    queryKey: qk.me,
    enabled: !!userId,
    // "not invited" won't change by asking again
    retry: (n, e) => !(e instanceof NotInvitedError) && n < 3,
    // one login can be in several accounts: the profile of the account they're working in (current_profile_id)
    queryFn: async (): Promise<Profile> => {
      const { data: id, error } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: string | null; error: { message: string } | null }>)('current_profile_id');
      if (error) throw new Error(error.message);
      if (!id) throw new NotInvitedError('not invited');
      return unwrap(await supabase.from('profiles').select('*').eq('id', id).single());
    },
    select,
  });
}

/** Everyone the user may see (self, manager, reports, peers), ordered by name. */
export function useTeam() {
  return useQuery({
    queryKey: qk.team,
    queryFn: async (): Promise<Profile[]> =>
      // people who left (status deleted) stay in the org page but not in pickers and team lists
      // hidden = the super admin's viewing seat in an account: never in team lists
      unwrap(await supabase.from('profiles').select('*').neq('status', 'deleted').eq('hidden', false).order('full_name')),
  });
}

export function useTasks(filter: TaskFilter = {}) {
  return useQuery({
    queryKey: qk.tasks(filter),
    queryFn: async (): Promise<TaskWithPeople[]> => {
      let q =
        filter.orderBy === 'created'
          ? supabase.from('tasks').select(TASK_SELECT).order('created_at', { ascending: false })
          : supabase.from('tasks').select(TASK_SELECT).order('due_at', { ascending: true, nullsFirst: false });
      if (filter.ownerId) q = q.eq('owner_id', filter.ownerId);
      if (filter.workspaceId) q = q.eq('workspace_id', filter.workspaceId);
      if (filter.statuses?.length) q = q.in('status', filter.statuses);
      return unwrap(await q) as unknown as TaskWithPeople[];
    },
  });
}

export type TaskDetail = TaskWithPeople & {
  subtasks: Subtask[];
  evidence: Evidence[];
  followups: Followup[];
  reviews: Review[];
};

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: qk.task(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<TaskDetail> =>
      unwrap(
        await supabase
          .from('tasks')
          .select(`${TASK_SELECT}, subtasks(*), evidence(*), followups(*), reviews(*)`)
          .eq('id', id!)
          .order('position', { referencedTable: 'subtasks' })
          .order('scheduled_at', { referencedTable: 'followups' })
          .order('round', { referencedTable: 'reviews' })
          .single(),
      ) as unknown as TaskDetail,
  });
}

export function useDecisions(status?: DecisionStatus) {
  const me = useMyProfile();
  const meId = me.data?.id;
  return useQuery({
    queryKey: [...qk.decisions(status), meId],
    enabled: !!meId,
    queryFn: async (): Promise<DecisionWithContext[]> => {
      // only decisions that are yours to make: the person who asked can read their own request (to see its answer),
      // but never gets it as a decision with Approve / Decline
      let q = supabase
        .from('decisions')
        .select(
          '*, task:tasks(id, title, due_at), requester:profiles!decisions_requested_by_fkey(id, full_name, full_name_ar)',
        )
        .eq('manager_id', meId!)
        .order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      return unwrap(await q) as unknown as DecisionWithContext[];
    },
  });
}

/** Count for the Decisions tab badge. */
export function usePendingDecisionCount() {
  const { data } = useDecisions('pending');
  return data?.length ?? 0;
}

export function useActivity(limit = 50) {
  return useQuery({
    queryKey: qk.activity(limit),
    queryFn: async (): Promise<ActivityEntry[]> =>
      unwrap(await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(limit)),
  });
}

export type HomeStats = {
  handling: number;
  followupsSent: number;
  updatesReceived: number;
  timesAsked: number;
};

/** Numbers for the Home "Muntej is handling" card. */
export function useHomeStats() {
  return useQuery({
    queryKey: qk.homeStats,
    queryFn: async (): Promise<HomeStats> => {
      const count = async (p: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
        const r = await p;
        if (r.error) throw new Error(r.error.message);
        return r.count ?? 0;
      };
      const [handling, followupsSent, updatesReceived, timesAsked] = await Promise.all([
        count(supabase.from('tasks').select('id', { count: 'exact', head: true }).in('status', ACTIVE_STATUSES)),
        count(supabase.from('followups').select('id', { count: 'exact', head: true }).in('status', ['sent', 'replied'])),
        count(supabase.from('activity_log').select('id', { count: 'exact', head: true }).eq('action', 'update_received')),
        count(supabase.from('activity_log').select('id', { count: 'exact', head: true }).eq('action', 'manager_asked')),
      ]);
      return { handling, followupsSent, updatesReceived, timesAsked };
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // support chat: the next person on this phone starts fresh
      await logoutSupport().catch(() => {});
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => qc.clear(),
  });
}
