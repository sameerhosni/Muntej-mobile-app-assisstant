// Who may cancel a task (and bring it back) — the app's copy of can_cancel_task, so a ✕ only shows where the server will
// say yes (R15): whoever gave it, anyone above its owner, an admin, or you for a task nobody else gave you.
type Person = { id: string; manager_id?: string | null; role?: string | null };
type TaskLike = { owner_id: string | null; assigner_id: string | null; status: string };

export const OPEN_STATUSES = ['draft', 'assigned', 'in_progress', 'blocked', 'returned', 'submitted'];

export function canCancel(task: TaskLike, me: Person | undefined | null, team: Person[]): boolean {
  if (!me) return false;
  if (me.role === 'admin' || me.role === 'super_admin') return true;
  if (task.assigner_id === me.id) return true;
  if (!task.assigner_id && task.owner_id === me.id) return true;
  // above the owner in the tree
  let cur = team.find((p) => p.id === task.owner_id)?.manager_id ?? null;
  for (let i = 0; cur && i < 20; i++) {
    if (cur === me.id) return true;
    cur = team.find((p) => p.id === cur)?.manager_id ?? null;
  }
  return false;
}
