import type { DecisionStatus, TaskStatus } from './types';

export type TaskFilter = { ownerId?: string; statuses?: TaskStatus[]; workspaceId?: string };

export const qk = {
  me: ['me'] as const,
  team: ['team'] as const,
  tasks: (f: TaskFilter = {}) => ['tasks', f] as const,
  task: (id: string) => ['task', id] as const,
  decisions: (status?: DecisionStatus) => ['decisions', status ?? 'all'] as const,
  activity: (limit: number) => ['activity', limit] as const,
  homeStats: ['homeStats'] as const,
};
