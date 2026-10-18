// Screen 20 write: workspace (owner = me) → members → activity_log row. RLS: owner may insert all three.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import i18n from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { WORKSPACES_KEY } from '@/features/workspaces/useWorkspaces';
import { NS } from './strings';

export type CreateWorkspaceInput = {
  meId: string;
  name: string;
  /** Arabic name when the user typed in Arabic. */
  nameAr: string | null;
  goal: string;
  color: string;
  members: { profileId: string; role: string | null }[];
};

/** RFC 4122 v4 id (no uuid package in the app; crypto.randomUUID when the runtime has it). */
function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function check(res: { error: { message: string } | null }) {
  if (res.error) throw new Error(res.error.message);
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateWorkspaceInput) => {
      // Id generated here and inserted without RETURNING: the SELECT policy (can_see_workspace) reads the table
      // through a stable function, which can't see the row inside its own INSERT statement.
      const id = uuid();
      check(
        await supabase
          .from('workspaces')
          .insert({ id, name: input.name, name_ar: input.nameAr, goal: input.goal, color: input.color, owner_id: input.meId }),
      );

      if (input.members.length) {
        check(
          await supabase
            .from('workspace_members')
            .insert(input.members.map((m) => ({ workspace_id: id, profile_id: m.profileId, role: m.role }))),
        );
      }

      const n = String(input.members.length);
      check(
        await supabase.from('activity_log').insert({
          actor_type: 'user',
          actor_id: input.meId,
          action: 'workspace_created',
          summary: i18n.t(`${NS}.log.summary`, { name: input.name, n, lng: 'en' }),
          summary_ar: i18n.t(`${NS}.log.summary`, { name: input.nameAr ?? input.name, n, lng: 'ar' }),
          reason: input.goal,
          undoable: false,
        }),
      );
      return id;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: WORKSPACES_KEY });
      for (const key of ['tasks', 'activity', 'achievements']) qc.invalidateQueries({ queryKey: [key] });
    },
  });
}
