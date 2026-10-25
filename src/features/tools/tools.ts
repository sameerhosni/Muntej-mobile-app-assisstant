// Every tool has its own page (screen 55): one table of tools, what each one reads (incoming_items.source), and the
// data a page needs: its waiting messages, the tasks already added from it, and the hub's tile list (screen 42).
// Google is split by part (Gmail · Calendar · Meet · Chat): one sign-in, a page each.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { colors, type ColorToken } from '@/theme/tokens';
import { useConnections, type Connection, type ProviderId } from '@/features/sources/connections';
import { useIncoming, type IncomingItem } from '@/features/incoming/api';
import type { GooglePart } from './ToolSettings';

export type ToolKey =
  | 'whatsapp'
  | 'gmail'
  | 'calendar'
  | 'meet'
  | 'google_chat'
  | 'microsoft'
  | 'slack'
  | 'jira'
  | 'clickup'
  | 'trello'
  | 'notion'
  | 'azure_devops'
  | 'pasted'
  | 'api';

export type Tool = {
  key: ToolKey;
  /** incoming_items.source values this tool writes */
  sources: string[];
  provider?: ProviderId;
  part?: GooglePart;
  letter: string;
  bg: ColorToken;
  fg: string;
};

export const TOOLS: Tool[] = [
  { key: 'whatsapp', sources: ['whatsapp'], letter: 'W', bg: 'greenTint', fg: colors.green },
  { key: 'gmail', sources: ['gmail', 'email'], provider: 'google', part: 'gmail', letter: 'G', bg: 'redTint', fg: colors.red },
  { key: 'meet', sources: ['meet', 'meeting'], provider: 'google', part: 'meet', letter: 'M', bg: 'greenTint', fg: colors.green },
  { key: 'google_chat', sources: ['google_chat'], provider: 'google', part: 'chat', letter: 'C', bg: 'greenTint', fg: colors.green },
  { key: 'calendar', sources: ['calendar'], provider: 'google', part: 'calendar', letter: 'C', bg: 'primaryTint', fg: colors.primary },
  { key: 'microsoft', sources: ['outlook', 'teams'], provider: 'microsoft', letter: 'M', bg: 'primaryTint', fg: colors.primary },
  { key: 'slack', sources: ['slack'], provider: 'slack', letter: 'S', bg: 'purpleTint', fg: colors.purple },
  { key: 'jira', sources: ['jira'], provider: 'jira', letter: 'J', bg: 'primaryTint', fg: colors.primary },
  { key: 'clickup', sources: ['clickup'], provider: 'clickup', letter: 'C', bg: 'purpleTint', fg: colors.purple },
  { key: 'trello', sources: ['trello'], provider: 'trello', letter: 'T', bg: 'primaryTint', fg: colors.primary },
  { key: 'notion', sources: ['notion'], provider: 'notion', letter: 'N', bg: 'chip', fg: colors.text },
  { key: 'azure_devops', sources: ['azure_devops'], provider: 'azure_devops', letter: 'A', bg: 'primaryTint', fg: colors.primary },
  { key: 'pasted', sources: ['paste', 'share'], letter: 'P', bg: 'chip', fg: colors.textSoft },
  { key: 'api', sources: ['api'], letter: 'A', bg: 'chip', fg: colors.textSoft },
];

export const toolOf = (key: string | undefined): Tool | undefined => TOOLS.find((t) => t.key === key);
/** the page a message's source belongs to */
export const toolForSource = (source: string): Tool | undefined => TOOLS.find((t) => t.sources.includes(source));
/** the page for a connected account's problem (Google: the part that failed, else Gmail) */
export function toolForConnection(c: Connection): ToolKey {
  if (c.provider !== 'google') return c.provider as ToolKey;
  const cur = (c.cursor ?? {}) as Record<string, unknown>;
  if (cur.meet_error || cur.tx_error) return 'meet';
  if (cur.chat_error) return 'google_chat';
  return 'gmail';
}

/** this tool's accounts (a Google part only when it's switched on for that account) */
export function connectionsFor(tool: Tool, all: Connection[]): Connection[] {
  if (!tool.provider) return [];
  return all.filter((c) => c.provider === tool.provider && (!tool.part || c.features?.[tool.part] !== false));
}

/** what's wrong with this tool right now, in its own words (null = fine) */
export function problemOf(tool: Tool, conns: Connection[]): string | null {
  for (const c of conns) {
    if (c.status === 'error' && c.last_error) return c.last_error;
    const cur = (c.cursor ?? {}) as Record<string, unknown>;
    if (tool.part === 'meet' && typeof cur.meet_error === 'string') return cur.meet_error;
    if (tool.part === 'meet' && typeof cur.tx_error === 'string') return cur.tx_error;
    if (tool.part === 'chat' && typeof cur.chat_error === 'string') return cur.chat_error;
  }
  return null;
}

const waitingIn = (items: IncomingItem[], tool: Tool) =>
  items.filter((it) => tool.sources.includes(it.source)).reduce((n, it) => n + it.suggestions.filter((s) => s.state === 'new').length, 0);

export type ToolTile = { tool: Tool; conns: Connection[]; waiting: number; problem: string | null; lastRead: string | null };

/** the hub's tiles: WhatsApp, every connected tool (Google by part), and pasted / API once they have something waiting */
export function useToolList() {
  const conns = useConnections();
  const incoming = useIncoming();
  const all = conns.data ?? [];
  const items = incoming.data ?? [];
  const tiles: ToolTile[] = [];
  for (const tool of TOOLS) {
    const mine = connectionsFor(tool, all);
    const waiting = waitingIn(items, tool);
    const show = tool.key === 'whatsapp' || mine.length > 0 || waiting > 0;
    if (!show) continue;
    const reads = mine.map((c) => c.last_sync_at).filter(Boolean) as string[];
    tiles.push({ tool, conns: mine, waiting, problem: problemOf(tool, mine), lastRead: reads.sort().at(-1) ?? null });
  }
  return { tiles, loading: conns.isLoading || incoming.isLoading };
}

// incoming_items isn't in the generated types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;
const ITEM_COLS = 'id, source, sender, subject, body, summary, received_at, status, suggestions';

/** everything this tool brought in lately (waiting and decided), newest first */
export function useToolItems(tool: Tool | undefined) {
  return useQuery({
    queryKey: ['incoming', 'tool', tool?.key],
    enabled: !!tool,
    queryFn: async (): Promise<IncomingItem[]> => {
      const { data, error } = await untyped
        .from('incoming_items')
        .select(ITEM_COLS)
        .in('source', tool!.sources)
        .neq('status', 'nothing')
        .order('received_at', { ascending: false })
        .limit(60);
      if (error) throw new Error(error.message);
      return (data ?? []) as IncomingItem[];
    },
  });
}

export type AddedTask = { id: string; title: string; status: string; owner_id: string | null; due_at: string | null };

/** the tasks already added from this tool (the accepted suggestions of its messages) */
export function useToolTasks(items: IncomingItem[] | undefined) {
  const ids = [...new Set((items ?? []).flatMap((it) => it.suggestions.filter((s) => s.state === 'accepted' && s.task_id).map((s) => s.task_id!)))];
  return useQuery({
    queryKey: ['tasks', 'fromTool', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async (): Promise<AddedTask[]> => {
      const { data, error } = await supabase.from('tasks').select('id, title, status, owner_id, due_at, created_at').in('id', ids).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as AddedTask[];
    },
  });
}
