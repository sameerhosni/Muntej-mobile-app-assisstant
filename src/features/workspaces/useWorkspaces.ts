// Live workspaces + members (RLS: owner or member). Shared by screens 19, 20 and 21.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile, Workspace } from '@/lib/api';

export const WORKSPACES_KEY = ['workspaces'] as const;

export type WorkspaceMember = {
  profile_id: string;
  role: string | null;
  profile: Pick<Profile, 'id' | 'full_name' | 'full_name_ar' | 'avatar_color'> | null;
};

export type WorkspaceWithMembers = Workspace & { members: WorkspaceMember[] };

export function useWorkspaces() {
  return useQuery({
    queryKey: WORKSPACES_KEY,
    queryFn: async (): Promise<WorkspaceWithMembers[]> => {
      const res = await supabase
        .from('workspaces')
        .select('*, members:workspace_members(profile_id, role, profile:profiles(id, full_name, full_name_ar, avatar_color))')
        .order('created_at', { ascending: true });
      if (res.error) throw new Error(res.error.message);
      return (res.data ?? []) as unknown as WorkspaceWithMembers[];
    },
  });
}

export function workspaceName(w: Pick<Workspace, 'name' | 'name_ar'> | null | undefined, lang: string) {
  if (!w) return '';
  return lang === 'ar' && w.name_ar ? w.name_ar : w.name;
}
