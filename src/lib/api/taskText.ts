// A task's words in the reader's language (tasks.translations, filled by the translate-task function). Tasks are read
// through useTask / useTasks, so every screen shows the reader's language without knowing about it; the original stays
// in `translated.original` for "See original". Whoever wrote the words keeps reading them as written.
import type { Json } from './database.types';

const FIELDS = ['title', 'description', 'goal', 'definition_of_done'] as const;
type Field = (typeof FIELDS)[number];
type Translation = Partial<Record<Field, string>> & { steps?: Record<string, string> };

type Readable = {
  title: string;
  description?: string | null;
  goal?: string | null;
  definition_of_done?: string | null;
  source_language?: string | null;
  source_by?: string | null;
  translations?: Json;
  subtasks?: { id: string; title: string }[];
};

export type TranslatedInfo = {
  from: string;
  original: { title: string; description: string | null; goal: string | null; definition_of_done: string | null; steps: Record<string, string> };
};

function translationOf(task: Readable, lang: string, meId: string | null | undefined): Translation | null {
  if (!task.source_language || task.source_language === lang || task.source_by === meId) return null;
  const all = task.translations as Record<string, Translation> | null | undefined;
  return all?.[lang] ?? null;
}

/** The task with its text in `lang` where a translation is ready; `translated` says it was translated and from what. */
export function localizeTask<T extends Readable>(task: T, lang: string, meId: string | null | undefined): T & { translated: TranslatedInfo | null } {
  const tr = translationOf(task, lang, meId);
  if (!tr?.title) return { ...task, translated: null };
  return {
    ...task,
    title: tr.title,
    description: tr.description ?? task.description,
    goal: tr.goal ?? task.goal,
    definition_of_done: tr.definition_of_done ?? task.definition_of_done,
    ...(task.subtasks ? { subtasks: task.subtasks.map((s) => ({ ...s, title: tr.steps?.[s.id] ?? s.title })) } : null),
    translated: {
      from: task.source_language as string,
      original: {
        title: task.title,
        description: task.description ?? null,
        goal: task.goal ?? null,
        definition_of_done: task.definition_of_done ?? null,
        steps: Object.fromEntries((task.subtasks ?? []).map((s) => [s.id, s.title])),
      },
    },
  };
}

/** For a task read with only its title (decisions, requests…): add `translations, source_language, source_by` to the select. */
export const titleFor = (task: Readable | null | undefined, lang: string, meId: string | null | undefined) =>
  task ? (translationOf(task, lang, meId)?.title ?? task.title) : null;

/** Someone opened a task nobody has put in their language yet (a manager above, an old task). */
export const lacksTranslation = (task: Readable, lang: string, meId: string | null | undefined) =>
  !!task.source_language && task.source_language !== lang && task.source_by !== meId && !translationOf(task, lang, meId)?.title;
