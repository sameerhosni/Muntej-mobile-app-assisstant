// Ideas, problems and likes (table ideas): people send them and see their own; the super admin sees all (wish list),
// sets the status and replies; the person hears it from Saree3 (alert idea_update, written by a database trigger).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/api';
import { track } from '@/lib/analytics';

// ideas is not in the generated database types yet; the untyped client stays inside this file
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

export type IdeaKind = 'idea' | 'problem' | 'like';
export type IdeaStatus = 'new' | 'planned' | 'building' | 'done' | 'not_now';
export const IDEA_KINDS: IdeaKind[] = ['idea', 'problem', 'like'];
export const IDEA_STATUSES: IdeaStatus[] = ['new', 'planned', 'building', 'done', 'not_now'];

export type Idea = {
  id: string;
  profile_id: string;
  account_id: string;
  kind: IdeaKind;
  body: string;
  screen: string | null;
  status: IdeaStatus;
  reply: string | null;
  created_at: string;
  updated_at: string;
  person?: { full_name: string; full_name_ar: string | null } | null;
  account?: { name: string } | null;
};

const key = ['ideas'] as const;

export function useMyIdeas() {
  const me = useMyProfile();
  return useQuery({
    queryKey: [...key, 'mine', me.data?.id],
    enabled: !!me.data?.id,
    queryFn: async (): Promise<Idea[]> => {
      const { data, error } = await untyped.from('ideas').select('*').eq('profile_id', me.data!.id).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** super admin: everyone's, newest first, with who and which company */
export function useAllIdeas() {
  return useQuery({
    queryKey: [...key, 'all'],
    queryFn: async (): Promise<Idea[]> => {
      const { data, error } = await untyped
        .from('ideas')
        .select('*, person:profiles!ideas_profile_id_fkey(full_name, full_name_ar), account:accounts(name)')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useSendIdea() {
  const qc = useQueryClient();
  const me = useMyProfile();
  return useMutation({
    mutationFn: async (v: { kind: IdeaKind; body: string; screen: string | null }) => {
      const p = me.data;
      if (!p) throw new Error('Not signed in');
      const { error } = await untyped.from('ideas').insert({ profile_id: p.id, account_id: p.account_id, kind: v.kind, body: v.body.trim(), screen: v.screen });
      if (error) throw new Error(error.message);
      track('idea_sent', { kind: v.kind, screen: v.screen, length: v.body.trim().length });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/** super admin: status and / or reply */
export function useUpdateIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; status?: IdeaStatus; reply?: string | null }) => {
      const patch: Record<string, unknown> = {};
      if (v.status) patch.status = v.status;
      if (v.reply !== undefined) patch.reply = v.reply?.trim() || null;
      const { error } = await untyped.from('ideas').update(patch).eq('id', v.id);
      if (error) throw new Error(error.message);
      track('idea_updated', { status: v.status ?? null, replied: v.reply !== undefined });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}
