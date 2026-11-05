// A task's words in the reader's language (tasks.translations, filled by translate-task). Falls back to the original.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

type Translatable = { title: string; translations?: Record<string, { title?: string } | undefined> | null };

export const titleIn = (t: Translatable, lang: string | null | undefined): string => (lang ? t.translations?.[lang]?.title : null) ?? t.title;

/** Worth holding this message for a minute? A new task whose translation isn't ready; never for long (see the function). */
export async function translationPending(admin: SupabaseClient, taskId: string, lang: string | null | undefined): Promise<boolean> {
  if (!lang) return false;
  const { data } = await admin.rpc('task_translation_pending', { p_task: taskId, p_lang: lang });
  return data === true;
}
