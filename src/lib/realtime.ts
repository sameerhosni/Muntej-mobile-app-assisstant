// Live updates for signed-in users: one Supabase Realtime channel listens to every table the app shows
// (RLS decides which rows each person hears about) and refreshes whatever is on screen. Bursts (a bulk change,
// a job run) are merged into one refresh. Coming back to the app from the background refreshes too.
// Tables are added to the realtime publication in supabase/migrations/20261020180000_realtime.sql.
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { focusManager, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

const TABLES = [
  'tasks',
  'subtasks',
  'evidence',
  'reviews',
  'followups',
  'decisions',
  'activity_log',
  'alerts',
  'chat_messages',
  'profiles',
  'objectives',
  'recurring_tasks',
  'achievements',
  'workspaces',
  'incoming_items',
] as const;

/** merge a burst of changes into one refresh */
const DEBOUNCE_MS = 400;

export function useLiveSync(enabled: boolean, userId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled || !userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // refetches the queries on screen; the rest are marked stale and refetch when they are shown again
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => qc.invalidateQueries(), DEBOUNCE_MS);
    };

    const channel = supabase.channel(`live:${userId}`);
    for (const table of TABLES) channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh);
    // (re)connected after a drop: catch up on anything missed meanwhile
    let connectedOnce = false;
    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      if (connectedOnce) refresh();
      connectedOnce = true;
    });

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, userId, qc]);

  // back from the background (phones): TanStack Query refetches stale queries on focus
  useEffect(() => {
    if (Platform.OS === 'web') return; // the browser tab already reports focus
    const sub = AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
    return () => sub.remove();
  }, []);
}
