// Support mode: what needs THIS person right now, each with Saree3's one-tap action.
// When anything is here he grows, pulses and shows a count; tapping him lists the top items with their buttons.
//   decisions waiting (managers) · finished work to review (Approve) · tasks found in messages
//   your own late tasks (ask for more time) · your blocked tasks (tell Muntej what's in the way)
import { useMemo } from 'react';
import type { Href } from 'expo-router';
import { useDecisions, useMyProfile, useTasks, useTeam } from '@/lib/api';
import { useDirection } from '@/lib/i18n';
import { isLate } from '@/features/tasks/model';
import { useIncomingCount } from '@/features/incoming/api';

export type SupportItem =
  | { key: string; kind: 'decisions'; n: number; href: Href }
  | { key: string; kind: 'review'; taskId: string; title: string; name: string }
  | { key: string; kind: 'incoming'; n: number; href: Href }
  | { key: string; kind: 'late'; taskId: string; title: string }
  | { key: string; kind: 'blocked'; taskId: string; title: string };

export function useSupport() {
  const me = useMyProfile();
  const team = useTeam();
  const tasks = useTasks();
  const decisions = useDecisions('pending');
  const incoming = useIncomingCount();
  const { lang } = useDirection();
  const meId = me.data?.id;
  const employee = me.data?.role === 'employee';

  return useMemo(() => {
    if (!meId) return { items: [] as SupportItem[], count: 0 };
    const first = (id: string | null) => {
      const p = id ? (team.data ?? []).find((x) => x.id === id) : undefined;
      return p ? ((lang === 'ar' && p.full_name_ar) || p.full_name).split(' ')[0] : '…';
    };
    const all = tasks.data ?? [];
    const items: SupportItem[] = [];
    const nDec = employee ? 0 : (decisions.data ?? []).length;
    if (nDec) items.push({ key: 'decisions', kind: 'decisions', n: nDec, href: '/04-decisions' });
    for (const x of all) {
      if (x.status === 'submitted' && x.owner_id !== meId && (x.assigner_id === meId || !employee))
        items.push({ key: `r-${x.id}`, kind: 'review', taskId: x.id, title: x.title, name: first(x.owner_id) });
    }
    if (incoming.count) items.push({ key: 'incoming', kind: 'incoming', n: incoming.count, href: '/42-incoming' });
    const now = Date.now();
    for (const x of all) {
      if (x.owner_id !== meId) continue;
      if (isLate(x, now)) items.push({ key: `l-${x.id}`, kind: 'late', taskId: x.id, title: x.title });
      else if (x.status === 'blocked') items.push({ key: `b-${x.id}`, kind: 'blocked', taskId: x.id, title: x.title });
    }
    // the count is "things", not rows: N decisions / N incoming tasks count as N
    const count = items.reduce((s, it) => s + ('n' in it ? it.n : 1), 0);
    return { items, count };
  }, [meId, employee, tasks.data, decisions.data, incoming.count, team.data, lang]);
}
