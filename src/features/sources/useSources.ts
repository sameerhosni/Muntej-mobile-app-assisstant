// Live task sources (table `sources`, one row per (owner_id, type), RLS = own rows only).
// Missing rows render as disconnected; the first toggle creates the row (upsert on owner_id,type).
// Toggling is optimistic: connected <-> disconnected, error -> connected, coming_soon flips `waitlist`.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useMyProfile, type Source } from '@/lib/api';
import type { Enum } from '@/lib/api/types';

export type SourceType = Enum<'source_type'>;
export type SourceStatus = Enum<'source_status'>;

/** Tile order from the Sources design. */
export const SOURCE_TYPES: SourceType[] = [
  'whatsapp',
  'email',
  'meeting',
  'teams',
  'slack',
  'google_chat',
  'jira',
  'azure_devops',
  'sticky_note',
];

export type SourceView = { type: SourceType; status: SourceStatus; todayCount: number; waitlist: boolean };

type Patch = { type: SourceType; status?: SourceStatus; waitlist?: boolean };

const key = (profileId: string | undefined) => ['sources', profileId ?? ''] as const;
const MUTATION_KEY = ['sources', 'save'] as const;

export function useSources() {
  const me = useMyProfile();
  const profileId = me.data?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: key(profileId),
    enabled: !!profileId,
    queryFn: async (): Promise<Source[]> => {
      const { data, error } = await supabase.from('sources').select('*').eq('owner_id', profileId!);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const mutation = useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: async (patch: Patch) => {
      const { error } = await supabase.from('sources').upsert(
        {
          owner_id: profileId!,
          type: patch.type,
          ...(patch.status !== undefined && { status: patch.status }),
          ...(patch.waitlist !== undefined && { waitlist: patch.waitlist }),
        },
        { onConflict: 'owner_id,type' },
      );
      if (error) throw new Error(error.message);
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key(profileId) });
      const previous = qc.getQueryData<Source[]>(key(profileId));
      const rows = previous ?? [];
      const existing = rows.find((r) => r.type === patch.type);
      const now = new Date().toISOString();
      const next: Source[] = existing
        ? rows.map((r) => (r.type === patch.type ? { ...r, ...stripUndefined(patch) } : r))
        : [
            ...rows,
            {
              id: `optimistic-${patch.type}`,
              owner_id: profileId!,
              type: patch.type,
              status: patch.status ?? 'disconnected',
              waitlist: patch.waitlist ?? false,
              today_count: 0,
              config: {},
              created_at: now,
              updated_at: now,
            },
          ];
      qc.setQueryData<Source[]>(key(profileId), next);
      return { previous };
    },
    onError: (_e, _patch, ctx) => {
      qc.setQueryData(key(profileId), ctx?.previous);
    },
    onSettled: () => {
      // Refetch once the last queued toggle has landed, so quick taps don't flicker.
      if (qc.isMutating({ mutationKey: MUTATION_KEY }) <= 1) qc.invalidateQueries({ queryKey: key(profileId) });
    },
  });

  const rows = query.data ?? [];
  const sources: SourceView[] = SOURCE_TYPES.map((type) => {
    const r = rows.find((x) => x.type === type);
    return {
      type,
      status: r?.status ?? 'disconnected',
      todayCount: r?.today_count ?? 0,
      waitlist: r?.waitlist ?? false,
    };
  });

  const toggle = (type: SourceType) => {
    if (!profileId) return;
    // build on the latest cache (includes optimistic changes) so rapid taps compound correctly
    const latest = qc.getQueryData<Source[]>(key(profileId)) ?? rows;
    const r = latest.find((x) => x.type === type);
    const status: SourceStatus = r?.status ?? 'disconnected';
    if (status === 'coming_soon') mutation.mutate({ type, waitlist: !(r?.waitlist ?? false) });
    else mutation.mutate({ type, status: status === 'connected' ? 'disconnected' : 'connected' });
  };

  return {
    sources,
    ready: !!profileId && query.isSuccess,
    isLoading: me.isLoading || query.isLoading,
    isError: me.isError || query.isError,
    isRefetching: query.isRefetching,
    refetch: () => {
      me.refetch();
      query.refetch();
    },
    saveError: mutation.isError,
    toggle,
  };
}

function stripUndefined(p: Patch): Partial<Source> {
  const out: Partial<Source> = {};
  if (p.status !== undefined) out.status = p.status;
  if (p.waitlist !== undefined) out.waitlist = p.waitlist;
  return out;
}
