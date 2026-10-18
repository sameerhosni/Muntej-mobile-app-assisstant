// Screen 19 view model: per-workspace health, wins and value, computed from live tasks + activity_log.
import type { ActivityEntry, Profile, TaskWithPeople } from '@/lib/api';
import { closedAt, isLateOpen, isOpen, startOfWeek } from '@/features/dashboard/metrics';
import { MIN_PER_FOLLOWUP, MIN_PER_UPDATE } from '@/features/home/value';
import type { WorkspaceWithMembers } from './useWorkspaces';

export type WorkspaceCardVM = {
  ws: WorkspaceWithMembers;
  members: number;
  tasks: number;
  winsThisWeek: number;
  stuck: number;
  attention: boolean;
  hoursSaved: number;
  /** Demo until the points tables exist. */
  points: number;
};

export function activityMinutes(a: ActivityEntry) {
  if (a.action === 'followup_sent') return MIN_PER_FOLLOWUP;
  if (a.action === 'update_received' || a.action === 'submission_received') return MIN_PER_UPDATE;
  return 0;
}

/** Needs attention when blocked/late work is a real share of what's open. */
export function health(open: number, stuck: number) {
  return stuck > 0 && (stuck >= 2 || stuck / Math.max(1, open) >= 0.25);
}

export function buildCards(
  workspaces: WorkspaceWithMembers[],
  tasks: TaskWithPeople[],
  activity: ActivityEntry[],
  now = Date.now(),
): WorkspaceCardVM[] {
  const weekStart = startOfWeek(new Date(now)).getTime();
  const taskWs = new Map<string, string>();
  for (const t of tasks) if (t.workspace_id) taskWs.set(t.id, t.workspace_id);

  const minutesByWs = new Map<string, number>();
  for (const a of activity) {
    if (!a.task_id || new Date(a.created_at).getTime() < weekStart) continue;
    const ws = taskWs.get(a.task_id);
    if (!ws) continue;
    minutesByWs.set(ws, (minutesByWs.get(ws) ?? 0) + activityMinutes(a));
  }

  return workspaces.map((ws) => {
    const mine = tasks.filter((t) => t.workspace_id === ws.id && t.status !== 'cancelled');
    const open = mine.filter(isOpen);
    const stuck = open.filter((t) => t.status === 'blocked' || isLateOpen(t, now)).length;
    const done = mine.filter((t) => t.status === 'done');
    const winsThisWeek = done.filter((t) => (closedAt(t) ?? 0) >= weekStart).length;
    return {
      ws,
      members: ws.members.length,
      tasks: mine.length,
      winsThisWeek,
      stuck,
      attention: health(open.length, stuck),
      hoursSaved: (minutesByWs.get(ws.id) ?? 0) / 60,
      points: done.length * 120 + ws.members.length * 30,
    };
  });
}

/** "Move N <ws> tasks to <person>": the most-stuck workspace and the least-loaded teammate outside its stuck owners. */
export function suggestion(cards: WorkspaceCardVM[], tasks: TaskWithPeople[], team: Profile[], now = Date.now()) {
  const worst = [...cards].filter((c) => c.attention).sort((a, b) => b.stuck - a.stuck)[0];
  if (!worst) return null;
  const stuckOwners = new Set(
    tasks
      .filter((t) => t.workspace_id === worst.ws.id && isOpen(t) && (t.status === 'blocked' || isLateOpen(t, now)))
      .map((t) => t.owner_id),
  );
  const load = (id: string) => tasks.filter((t) => t.owner_id === id && isOpen(t)).length;
  const helper = team
    .filter((p) => p.role === 'employee' && !stuckOwners.has(p.id))
    .sort((a, b) => load(a.id) - load(b.id))[0];
  if (!helper) return null;
  return { ws: worst.ws, n: Math.min(worst.stuck, 3), person: helper };
}
