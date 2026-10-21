// Tool tags: which tasks are linked to a connected tool (table task_links, RLS = tasks you can see), so rows and the
// task page can show "Jira" / "ClickUp" / "Trello" and open the item there.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type TaskTool = { provider: string; url: string | null; direction: 'in' | 'out' };

/** brand names stay as they are in both languages */
export const TOOL_LABEL: Record<string, string> = {
  clickup: 'ClickUp',
  jira: 'Jira',
  trello: 'Trello',
  notion: 'Notion',
  azure_devops: 'Azure DevOps',
  microsoft: 'Microsoft 365',
  google: 'Google',
  slack: 'Slack',
};

// task_links isn't in the generated types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

/** task id → its tool link (one per task is enough for the tag) */
export function useTaskTools() {
  return useQuery({
    queryKey: ['taskLinks'],
    queryFn: async (): Promise<Map<string, TaskTool>> => {
      const { data, error } = await untyped.from('task_links').select('task_id, provider, external_url, direction').limit(1000);
      if (error) throw new Error(error.message);
      return new Map(
        ((data ?? []) as { task_id: string; provider: string; external_url: string | null; direction: 'in' | 'out' }[]).map((l) => [
          l.task_id,
          { provider: l.provider, url: l.external_url, direction: l.direction },
        ]),
      );
    },
    staleTime: 60_000,
  });
}
