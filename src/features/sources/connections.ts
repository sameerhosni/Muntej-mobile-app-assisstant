// Connected tools (table connections, own rows, read-only) + the connect / disconnect / check-now calls
// (Edge Function `connect`). Signing in happens on the tool's own page in the browser; it sends the person back to
// muntej://12-sources?connected=… (or the web preview), and the screen refreshes.
import { Linking, Platform } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toError } from '@/features/capture/api';
import { useMyProfile } from '@/lib/api';

export const PROVIDER_IDS = ['microsoft', 'google', 'slack', 'jira', 'clickup', 'trello', 'notion', 'azure_devops'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type Connection = {
  id: string;
  provider: ProviderId;
  status: 'connected' | 'error';
  account_label: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  found_today: number;
  found_day: string | null;
};
/** configured = sign-in is set up on the server; token = the person can connect with their own personal API token */
export type ProviderInfo = { id: ProviderId; available: boolean; configured: boolean; token: boolean; tokenFields: string[] };

// connections isn't in the generated types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('connect', { body });
  if (error) throw await toError(error);
  return data as T;
}

export function useConnections() {
  return useQuery({
    queryKey: ['connections'],
    queryFn: async (): Promise<Connection[]> => {
      const { data, error } = await untyped.from('connections').select('id, provider, status, account_label, last_sync_at, last_error, found_today, found_day');
      if (error) throw new Error(error.message);
      return (data ?? []) as Connection[];
    },
  });
}

/** which tools this server can connect today (built + credentials set) */
export function useProviders() {
  // asked only once signed in (the function needs the session), retried if the first call races the sign-in
  const me = useMyProfile();
  return useQuery({
    queryKey: ['connectProviders', me.data?.id],
    enabled: !!me.data,
    queryFn: () => call<ProviderInfo[]>({ action: 'providers' }),
    staleTime: 5 * 60_000,
    retry: 3,
  });
}

export function useConnectionActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['connections'] });
  return {
    /** opens the tool's sign-in page; it comes back to this screen when done */
    connect: async (provider: ProviderId) => {
      const redirect = ExpoLinking.createURL('/12-sources');
      const { url } = await call<{ url: string }>({ action: 'start', provider, redirect });
      if (Platform.OS === 'web') window.location.href = url;
      else await Linking.openURL(url);
    },
    /** connect with a personal API token; the server checks it and reads the first tasks right away */
    connectWithToken: async (provider: ProviderId, creds: Record<string, string>) => {
      const r = await call<{ ok: boolean; label: string; read: number; tasks: number; error?: string }>({ action: 'token', provider, creds });
      await refresh();
      await qc.invalidateQueries({ queryKey: ['incoming'] });
      await qc.invalidateQueries({ queryKey: ['tasks'] });
      return r;
    },
    disconnect: async (provider: ProviderId) => {
      await call({ action: 'disconnect', provider });
      await refresh();
    },
    syncNow: async (provider: ProviderId) => {
      const r = await call<{ read: number; tasks: number; error?: string }>({ action: 'sync', provider });
      await refresh();
      await qc.invalidateQueries({ queryKey: ['incoming'] });
      return r;
    },
    refresh,
  };
}
