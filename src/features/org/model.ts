// Org data for screen 39: people, tree, permissions (mirrors upsert_person; the RPC re-checks) and task numbers.
import { emailInvite } from '@/features/invite/api';
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ACTIVE_STATUSES, qk, type Profile, type TaskWithPeople } from '@/lib/api';
import { isLate } from '@/features/tasks/model';

export type PersonRole = Profile['role'];
export type PersonStatus = Profile['status'];
export type Skill = { name: string; level: number; years?: number | null; notes?: string | null };

const ORG_COLUMNS =
  'id, user_id, full_name, full_name_ar, title, title_ar, phone, email, role, manager_id, weekly_capacity_hours, years_experience, skills_detail, skills, status, whatsapp_connected, telegram_connected, telegram_handle, avatar_color';

export type Person = Pick<
  Profile,
  | 'id'
  | 'user_id'
  | 'full_name'
  | 'full_name_ar'
  | 'title'
  | 'title_ar'
  | 'phone'
  | 'email'
  | 'role'
  | 'manager_id'
  | 'weekly_capacity_hours'
  | 'years_experience'
  | 'skills_detail'
  | 'skills'
  | 'status'
  | 'whatsapp_connected'
  | 'telegram_connected'
  | 'telegram_handle'
  | 'avatar_color'
>;

/** Key sits under ['team'] so invalidating the team also refreshes this list. */
export const orgKey = [...qk.team, 'org'] as const;

/** Everyone in the org (all statuses), ordered by name. Everyone may read all profiles. */
export function useOrg() {
  return useQuery({
    queryKey: orgKey,
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase.from('profiles').select(ORG_COLUMNS).order('full_name');
      if (error) throw new Error(error.message);
      return (data ?? []) as Person[];
    },
  });
}

export function skillsOf(p: Pick<Person, 'skills_detail'>): Skill[] {
  const raw: unknown[] = Array.isArray(p.skills_detail) ? p.skills_detail : [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && !Array.isArray(s))
    .map((s) => ({
      name: String(s.name ?? '').trim(),
      level: Math.min(5, Math.max(1, Math.round(Number(s.level) || 1))),
      years: s.years === null || s.years === undefined || s.years === '' ? null : Number(s.years),
      notes: typeof s.notes === 'string' ? s.notes : null,
    }))
    .filter((s) => s.name);
}

export function displayName(p: Pick<Person, 'full_name' | 'full_name_ar'>, lang: string) {
  return lang === 'ar' && p.full_name_ar ? p.full_name_ar : p.full_name;
}

export function displayTitle(p: Pick<Person, 'title' | 'title_ar'>, lang: string) {
  return (lang === 'ar' ? p.title_ar || p.title : p.title || p.title_ar) ?? '';
}

export type OrgIndex = {
  byId: Map<string, Person>;
  children: Map<string, Person[]>;
};

export function indexOrg(people: Person[]): OrgIndex {
  const byId = new Map(people.map((p) => [p.id, p]));
  const children = new Map<string, Person[]>();
  for (const p of people) {
    if (!p.manager_id) continue;
    const list = children.get(p.manager_id) ?? [];
    list.push(p);
    children.set(p.manager_id, list);
  }
  return { byId, children };
}

/** Managers above a person, top first (Ahmed › Khalid). */
export function managerChain(id: string, byId: Map<string, Person>): Person[] {
  const chain: Person[] = [];
  const seen = new Set<string>([id]);
  let cur = byId.get(id)?.manager_id ?? null;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const m = byId.get(cur);
    if (!m) break;
    chain.unshift(m);
    cur = m.manager_id;
  }
  return chain;
}

/** Is `id` somewhere below `ancestorId`? */
export function isBelow(id: string, ancestorId: string, byId: Map<string, Person>): boolean {
  return managerChain(id, byId).some((m) => m.id === ancestorId);
}

// ── permissions (client mirror of upsert_person; the RPC is the real check) ──

export const isAdminRole = (r: PersonRole | undefined) => r === 'admin' || r === 'super_admin';

export function canLead(me: Person | undefined, people: Person[]) {
  if (!me) return false;
  return (
    isAdminRole(me.role) ||
    me.role === 'manager' ||
    people.some((p) => p.manager_id === me.id && p.status !== 'deleted')
  );
}

/** 'full' = every field, 'self' = own skills + years only, 'none' = read only. */
export function editLevel(me: Person | undefined, target: Person, byId: Map<string, Person>): 'full' | 'self' | 'none' {
  if (!me) return 'none';
  if (isAdminRole(me.role)) {
    if (target.id !== me.id && isAdminRole(target.role) && me.role !== 'super_admin') return 'none';
    return 'full';
  }
  if (target.id === me.id) return 'self';
  return isBelow(target.id, me.id, byId) ? 'full' : 'none';
}

export function canAddUnder(me: Person | undefined, target: Person, people: Person[], byId: Map<string, Person>) {
  if (!me || target.status === 'deleted' || !canLead(me, people)) return false;
  return isAdminRole(me.role) || target.id === me.id || isBelow(target.id, me.id, byId);
}

export function roleOptions(me: Person | undefined): PersonRole[] {
  return me?.role === 'super_admin' ? ['super_admin', 'admin', 'manager', 'employee'] : ['manager', 'employee'];
}

/** Who can be picked as a manager: not deleted, not the person or anyone below them, and inside my branch unless admin. */
export function managerCandidates(me: Person | undefined, editingId: string | undefined, people: Person[], byId: Map<string, Person>) {
  if (!me) return [];
  const admin = isAdminRole(me.role);
  return people.filter(
    (p) =>
      p.status !== 'deleted' &&
      (!editingId || (p.id !== editingId && !isBelow(p.id, editingId, byId))) &&
      (admin || p.id === me.id || isBelow(p.id, me.id, byId)),
  );
}

// ── task numbers per person (from the tasks this user can see) ──

export type PersonStats = { open: number; doneMonth: number; onTimePct: number | null; late: number };

export function statsFor(personId: string, tasks: TaskWithPeople[] | undefined, now = new Date()): PersonStats {
  const mine = (tasks ?? []).filter((t) => t.owner_id === personId);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const done = mine.filter((t) => t.status === 'done');
  const doneMonth = done.filter((t) => t.closed_at && new Date(t.closed_at).getTime() >= monthStart).length;
  const timed = done.filter((t) => t.closed_at && t.due_at);
  const onTime = timed.filter((t) => new Date(t.closed_at!).getTime() <= new Date(t.due_at!).getTime()).length;
  return {
    open: mine.filter((t) => ACTIVE_STATUSES.includes(t.status)).length,
    doneMonth,
    onTimePct: timed.length ? Math.round((onTime / timed.length) * 100) : null,
    late: mine.filter((t) => isLate(t, now.getTime())).length,
  };
}

export function useOpenCounts(tasks: TaskWithPeople[] | undefined) {
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks ?? []) {
      if (t.owner_id && ACTIVE_STATUSES.includes(t.status)) m.set(t.owner_id, (m.get(t.owner_id) ?? 0) + 1);
    }
    return m;
  }, [tasks]);
}

// ── writes ──

export type PersonPayload = { id?: string } & Record<string, unknown>;

/** Maps upsert_person's exceptions to string keys (falls back to err_generic + the raw message). */
const SERVER_ERRORS: [string, string][] = [
  ['Not signed in', 'err_notSignedIn'],
  ['Person not found', 'err_notFound'],
  ['only change your own skills', 'err_selfOnly'],
  ['only add people under', 'err_addBranch'],
  ['only change people in your own team', 'err_editBranch'],
  ['only move people within', 'err_moveBranch'],
  ['give or change admin roles', 'err_adminRole'],
  ['can change an admin', 'err_adminEdit'],
  ['report to themselves', 'err_cycle'],
  ['Manager not found', 'err_manager'],
  ['Name is required', 'err_name'],
  ['already used by someone else', 'err_duplicate'],
  ['Only managers and admins', 'err_lead'],
];

export function serverErrorKey(message: string): string | null {
  return SERVER_ERRORS.find(([needle]) => message.includes(needle))?.[1] ?? null;
}

export function useUpsertPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: PersonPayload): Promise<string> => {
      const { data, error } = await supabase.rpc('upsert_person', { p: p as never });
      if (error) throw new Error(error.message);
      // someone new with an email: they get the invitation email (same as adding them in the chat)
      if (!(p as { id?: string }).id && (p as { email?: string | null }).email) await emailInvite(data as string).catch(() => {});
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.team });
      qc.invalidateQueries({ queryKey: qk.me });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
