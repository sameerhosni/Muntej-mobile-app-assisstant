// Friendly row types over the generated schema (regenerate with `npm run db:types`).
import type { Database } from './database.types';

type PublicSchema = Database['public'];
export type Row<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type Insert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type Update<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
export type Enum<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];

export type Profile = Row<'profiles'>;
export type Workspace = Row<'workspaces'>;
export type Task = Row<'tasks'>;
export type Subtask = Row<'subtasks'>;
export type Evidence = Row<'evidence'>;
export type Followup = Row<'followups'>;
export type Review = Row<'reviews'>;
export type Decision = Row<'decisions'>;
export type ActivityEntry = Row<'activity_log'>;
export type Achievement = Row<'achievements'>;
export type Agent = Row<'agents'>;
export type NotificationPrefs = Row<'notification_prefs'>;
export type Source = Row<'sources'>;

export type TaskStatus = Enum<'task_status'>;
export type TaskPriority = Enum<'task_priority'>;
export type DecisionStatus = Enum<'decision_status'>;

export const ACTIVE_STATUSES: TaskStatus[] = ['assigned', 'in_progress', 'blocked', 'submitted', 'returned'];

/** Task with the people around it, as most screens need. */
export type TaskWithPeople = Task & {
  owner: Pick<Profile, 'id' | 'full_name' | 'full_name_ar' | 'avatar_color'> | null;
  helper: Pick<Profile, 'id' | 'full_name' | 'full_name_ar'> | null;
  workspace: Pick<Workspace, 'id' | 'name' | 'name_ar' | 'color'> | null;
};

export type DecisionWithContext = Decision & {
  task: Pick<Task, 'id' | 'title' | 'due_at'> | null;
  requester: Pick<Profile, 'id' | 'full_name' | 'full_name_ar'> | null;
};
