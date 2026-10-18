// "Test it now": what an agent would do right now, computed from live tasks (no side effects).
import type { TaskWithPeople } from '@/lib/api';
import { daysLate, matchTasks, type Recipe, type Tr } from '@/features/agents/recipe';

export type DryRun = {
  found: number;
  title: string;
  detail: string | null;
  lines: string[];
  more: string | null;
  /** Stored in agent_runs.output. */
  output: Record<string, unknown>;
};

const MAX_LINES = 2;

export function runDry(recipe: Recipe, tasks: TaskWithPeople[], t: Tr, lang: string): DryRun {
  const now = Date.now();
  const firstName = (task: TaskWithPeople) => {
    const o = task.owner;
    const full = o ? (lang === 'ar' && o.full_name_ar ? o.full_name_ar : o.full_name) : null;
    return full ? full.split(' ')[0] : t('someone');
  };
  const days = (n: number) => (n === 1 ? t('oneDay') : n === 2 ? t('twoDays') : t('nDays', { n }));

  const emailEvent = recipe.trigger.type === 'event' && recipe.trigger.event === 'email_received';
  const matches = matchTasks(recipe, tasks, now);
  const owners = Array.from(new Set(matches.map(firstName)));
  const acts = recipe.do.map((d) => d.action);

  const lines: string[] = [];
  for (const task of matches) {
    if (lines.length >= MAX_LINES) break;
    const vars = { name: firstName(task), task: task.title };
    if (acts.includes('nudge_owner'))
      lines.push(recipe.find.overdue ? t('msg.late', { ...vars, days: days(daysLate(task, now)) }) : t('msg.check', vars));
    else if (acts.includes('escalate')) lines.push(t('msg.escalate', vars));
    else if (acts.includes('suggest_kudos')) lines.push(t('msg.kudos', vars));
    else if (acts.includes('create_task')) lines.push(t('msg.create', vars));
  }
  if (acts.includes('summarize') && matches.length > 0) {
    lines.unshift(t('msg.summary', { n: matches.length, people: owners.length }));
    lines.splice(MAX_LINES);
  }

  const shown = acts.includes('summarize') ? 0 : lines.length;
  const rest = matches.length - shown;
  const more =
    shown > 0 && rest > 0 ? t('more', { n: rest, people: owners.slice(1, 4).join(lang === 'ar' ? '، ' : ', ') || '…' }) : null;

  let title: string;
  let detail: string | null = null;
  if (emailEvent) {
    title = t('testEmail');
    detail = t('testEmailDetail');
  } else if (matches.length === 0) {
    title = t('testNone');
    detail = t('testNoneDetail');
  } else {
    title = recipe.find.overdue ? t('testOverdue', { n: matches.length }) : t('testFound', { n: matches.length });
  }

  return {
    found: matches.length,
    title,
    detail,
    lines,
    more,
    output: {
      checked_at: new Date(now).toISOString(),
      found: matches.length,
      task_ids: matches.map((m) => m.id),
      owners,
      lines,
      lang,
    },
  };
}
