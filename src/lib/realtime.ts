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
  'connections',
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
    // (re)connected after a drop: catch up on anything missed meanwhile — at most once every 30 s, so a channel
    // that keeps re-joining can never turn into a refresh storm (every query refetched every second)
    let connectedOnce = false;
    let lastCatchUp = 0;
    channel.subscribe((status, err) => {
      if (status !== 'SUBSCRIBED') {
        if (status !== 'CLOSED') console.warn('[live] channel', status, err?.message ?? '');
        return;
      }
      if (connectedOnce && Date.now() - lastCatchUp > 30_000) {
        lastCatchUp = Date.now();
        refresh();
      }
      connectedOnce = true;
    });

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, userId, qc]);

  // back from the background: TanStack Query refetches stale queries on focus
  useEffect(() => {
    if (Platform.OS === 'web') {
      // only a real return counts (hidden for a few seconds): some embedded browsers flip visibility several times a
      // second, which refetched everything constantly and cancelled slower calls before they could finish
      let hiddenAt = 0;
      focusManager.setEventListener((setFocused) => {
        const onVis = () => {
          if (document.visibilityState === 'hidden') hiddenAt = Date.now();
          else if (hiddenAt && Date.now() - hiddenAt > 3000) setFocused(true);
        };
        document.addEventListener('visibilitychange', onVis);
        return () => document.removeEventListener('visibilitychange', onVis);
      });
      return;
    }
    const sub = AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
    return () => sub.remove();
  }, []);
}
