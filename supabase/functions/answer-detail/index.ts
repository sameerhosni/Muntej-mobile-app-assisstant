// answer-detail — the task page's «جاوب» sheet (owner, 10 Nov, option 2): the giver answers the doer's question
// (due date, definition of done, budget) right on the task.
//   { task_id, what: 'due' | 'doneDef' | 'budget', text?, due?, none? }
//     due + text → the date is read from their own words (readWhen, like WhatsApp; only with AI allowed). Unclear →
//                  { unclear: true, choices } and nothing is saved
//     due + due  → that exact date (a quick choice)
//     doneDef / budget + text, or none → saved as written / "there's none"
//   → answer_task_detail as the caller (rights, the asker's alert, the question cleared, the log)
import { getCaller, HttpError, json, serve } from '../_shared/http.ts';
import { aiAllowed } from '../_shared/ai-consent.ts';
import { quickDates, readWhen } from '../_shared/when.ts';

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const { db, profileId } = await getCaller(req);
  // «جاوب» goes to testers first, like on WhatsApp (feature task_answers, R69)
  if ((await db.rpc('feature_on', { p_key: 'task_answers' })).data !== true) throw new HttpError(403, 'Not available yet');
  const body = (await req.json().catch(() => ({}))) as { task_id?: string; what?: string; text?: string; due?: string; none?: boolean };
  const what = body.what;
  if (!body.task_id || !['due', 'doneDef', 'budget'].includes(what ?? '')) throw new HttpError(400, 'Which task and which detail?');
  const text = (body.text ?? '').trim().slice(0, 1000);

  let due: string | null = null;
  if (what === 'due' && !body.none) {
    if (body.due && !Number.isNaN(Date.parse(body.due))) due = new Date(body.due).toISOString();
    else if (text) due = (await aiAllowed(profileId)) ? await readWhen(text).catch(() => null) : null;
    // never a guess: unclear words → the quick choices, nothing saved
    if (!due) return json({ unclear: true, choices: quickDates() });
  } else if (!body.none && !text) throw new HttpError(400, 'Nothing to save');

  const { data, error } = await db.rpc('answer_task_detail', {
    p_task: body.task_id,
    p_what: what,
    p_text: what === 'due' ? null : text || null,
    p_due: due,
    p_none: !!body.none,
  });
  if (error) throw new HttpError(400, error.message);
  return json({ saved: data as string, due });
});
