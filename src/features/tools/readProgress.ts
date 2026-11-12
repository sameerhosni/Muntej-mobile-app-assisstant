// Following a read the server runs (owner, 12 Nov: "How can I know it is finished"; he picked option 1: one line per
// source). The app starts it (connect `read`, answers at once) and watches connections.reading: Gmail ✓ · Chat ✓ ·
// Meet …, then «خلصت ✓ …» even after he left the page and came back. Errors are one plain sentence (R7), never the
// raw message. Testers first (features.read_progress, R69); with it off the screens wait on the old call as before.
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { useFeatureOn } from '@/lib/useFeatureOn';
import { isReading, useConnectionActions, type Connection, type ReadSource, type Reading } from '@/features/sources/connections';

const en = {
  s_gmail: 'Gmail',
  s_google_chat: 'Chat',
  s_meet: 'Meet',
  s_calendar: 'Calendar',
  s_outlook: 'Outlook',
  s_teams: 'Teams',
  s_slack: 'Slack',
  s_jira: 'Jira',
  s_clickup: 'ClickUp',
  s_trello: 'Trello',
  s_notion: 'Notion',
  s_azure_devops: 'Azure DevOps',
  s_microsoft: 'Microsoft 365',
  s_google: 'Google',
  waitLine: '{{name}} · reading…',
  countLine: '{{name}} · reading {{read}} of {{total}}',
  readLine_one: '{{name}} · read {{count}}',
  readLine_other: '{{name}} · read {{count}}',
  msgs_one: '{{count}} message',
  msgs_other: '{{count}} messages',
  noneLine: '{{name}} · nothing new',
  canLeave: 'You can leave the page: I carry on, and tell you if I find tasks',
  done_one: 'Done ✓ read {{msgs}} from {{from}}, found {{count}} task: it’s just below 👇',
  done_other: 'Done ✓ read {{msgs}} from {{from}}, found {{count}} tasks: they’re just below 👇',
  doneNone: 'Done ✓ read {{msgs}} from {{from}}, nothing new for you',
  more: '. The rest come in the next read',
  stalled: 'This read didn’t finish: {{retry}}',
  doneEmpty: 'Done ✓ nothing new in {{from}}',
  e_signin: 'Your {{tool}} sign-in ended: sign in again',
  e_ai_off: 'AI is off: allow it in Settings so I can read {{tool}}',
  e_tool_down: '{{tool}} didn’t answer: {{retry}}',
  e_other: 'I couldn’t read {{tool}} this time: {{retry}}',
  e_start: 'I couldn’t reach Muntej: check your internet and try again',
  e_signedout: 'Your Muntej sign-in ended: open the app again and sign in',
  e_failed: 'Muntej couldn’t start the read: try again in a bit',
  retryIn: 'I’ll try again by myself {{when}}',
  retryManual: 'tap «Read now» again in a bit',
  whenMin: 'in {{n}} min',
  whenH: 'in {{n}} h',
  whenDay: 'tomorrow',
  and: ' and ',
  comma: ', ',
};
const ar: typeof en & Record<string, string> = {
  s_gmail: 'Gmail',
  s_google_chat: 'Chat',
  s_meet: 'Meet',
  s_calendar: 'التقويم',
  s_outlook: 'Outlook',
  s_teams: 'Teams',
  s_slack: 'Slack',
  s_jira: 'Jira',
  s_clickup: 'ClickUp',
  s_trello: 'Trello',
  s_notion: 'Notion',
  s_azure_devops: 'Azure DevOps',
  s_microsoft: 'مايكروسوفت ٣٦٥',
  s_google: 'قوقل',
  waitLine: '{{name}} · أقرا…',
  countLine: '{{name}} · أقرا {{read}} من {{total}}',
  readLine_one: '{{name}} · قريت رسالة وحدة',
  readLine_two: '{{name}} · قريت رسالتين',
  readLine_few: '{{name}} · قريت {{count}} رسائل',
  readLine_many: '{{name}} · قريت {{count}} رسالة',
  readLine_other: '{{name}} · قريت {{count}} رسالة',
  msgs_one: 'رسالة وحدة',
  msgs_two: 'رسالتين',
  msgs_few: '{{count}} رسائل',
  msgs_many: '{{count}} رسالة',
  msgs_other: '{{count}} رسالة',
  noneLine: '{{name}} · ما فيه جديد',
  canLeave: 'تقدر تطلع من الصفحة: أكمل لحالي، وأعلمك إذا لقيت مهام',
  done_one: 'خلصت ✓ قريت {{msgs}} من {{from}}، ولقيت مهمة: تحت 👇',
  done_two: 'خلصت ✓ قريت {{msgs}} من {{from}}، ولقيت مهمتين: تحت 👇',
  done_few: 'خلصت ✓ قريت {{msgs}} من {{from}}، ولقيت {{count}} مهام: تحت 👇',
  done_many: 'خلصت ✓ قريت {{msgs}} من {{from}}، ولقيت {{count}} مهمة: تحت 👇',
  done_other: 'خلصت ✓ قريت {{msgs}} من {{from}}، ولقيت {{count}} مهمة: تحت 👇',
  doneNone: 'خلصت ✓ قريت {{msgs}} من {{from}}، وما فيه شي جديد لك',
  more: '، والباقي أكمله في القراءة الجاية',
  stalled: 'ما كملت القراءة هالمرة: {{retry}}',
  doneEmpty: 'خلصت ✓ ما فيه جديد في {{from}}',
  e_signin: 'انتهى دخولك لـ {{tool}}: ادخل مرة ثانية',
  e_ai_off: 'الذكاء الاصطناعي مقفل: فعّله من الإعدادات عشان أقرا {{tool}}',
  e_tool_down: '{{tool}} ما رد: {{retry}}',
  e_other: 'ما قدرت أقرا {{tool}} هالمرة: {{retry}}',
  e_start: 'ما وصلت لمنتج: تأكد من النت وجرب مرة ثانية',
  e_signedout: 'انتهى دخولك لمنتج: افتح التطبيق من جديد وادخل',
  e_failed: 'منتج ما قدر يبدأ القراءة: جرب بعد شوي',
  retryIn: 'بحاول مرة ثانية بنفسي {{when}}',
  retryManual: 'جرّب «اقرا الحين» بعد شوي',
  whenMin: 'بعد {{n}} د',
  whenH: 'بعد {{n}} س',
  whenDay: 'بكرة',
  and: ' و',
  comma: '، ',
};
export const READ_NS = registerStrings('readProgress', { en, ar });

/** a result worth showing: a read you started that ended in the last 15 minutes */
const RECENT_MS = 15 * 60_000;

export type ReadLine = { key: string; text: string; done: boolean };
export type ReadOutcome = { ok: true; text: string; tasks: number } | { ok: false; text: string; code: string };

export function useFollowRead(conns: Connection[], onDone?: () => void) {
  const { t } = useScreenT(READ_NS);
  const on = useFeatureOn('read_progress');
  const qc = useQueryClient();
  const actions = useConnectionActions();
  const [startFailed, setStartFailed] = useState<'e_start' | 'e_signedout' | 'e_failed' | null>(null);
  const [starting, setStarting] = useState(false);
  const running = conns.some(isReading);
  const name = (key: string) => t(`s_${key}`, { defaultValue: key });
  /** what happens next on its own, from the tool's own schedule (0 = only when you tap) */
  const retry = (c: Connection) => {
    const every = c.read_every_min ?? 10;
    if (!every) return t('retryManual');
    const when = every < 60 ? t('whenMin', { n: every }) : every < 1440 ? t('whenH', { n: Math.round(every / 60) }) : t('whenDay');
    return t('retryIn', { when });
  };

  // the moment it ends: the lists under it catch up (the tasks it found are just below)
  const was = useRef(running);
  useEffect(() => {
    if (was.current && !running) {
      void qc.invalidateQueries({ queryKey: ['incoming'] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      onDone?.();
    }
    was.current = running;
  }, [running, qc, onDone]);

  const start = async () => {
    setStartFailed(null);
    setStarting(true);
    try {
      for (const c of conns) {
        try {
          await actions.startRead(c.provider, c.id);
        } catch (e) {
          // an expired Muntej session: refresh it and try once more before saying anything (reviewer, 12 Nov)
          if (!(e instanceof FunctionsHttpError) || e.context?.status !== 401) throw e;
          await supabase.auth.refreshSession();
          await actions.startRead(c.provider, c.id);
        }
      }
    } catch (e) {
      console.error('read start failed', e);
      setStartFailed(
        e instanceof FunctionsFetchError ? 'e_start' : e instanceof FunctionsHttpError && e.context?.status === 401 ? 'e_signedout' : 'e_failed',
      );
    } finally {
      setStarting(false);
    }
  };

  // one line per source, across this tool's accounts (the same source twice adds up)
  const merged = new Map<string, ReadSource>();
  for (const c of conns.filter(isReading))
    for (const s of c.reading!.sources ?? []) {
      const m = merged.get(s.key);
      merged.set(
        s.key,
        m
          ? { key: s.key, total: m.total + s.total, read: m.read + s.read, added: (m.added ?? 0) + (s.added ?? 0), done: m.done && s.done }
          : { ...s },
      );
    }
  const fetched = [...merged.values()].some((s) => s.done || s.total > 0);
  const lines: ReadLine[] = [...merged.values()].map((s) => ({
    key: s.key,
    done: fetched && s.done,
    text: !fetched || (!s.done && !s.total)
      ? t('waitLine', { name: name(s.key) })
      : s.done
        ? s.total
          ? t('readLine', { name: name(s.key), count: s.added ?? s.read })
          : t('noneLine', { name: name(s.key) })
        : t('countLine', { name: name(s.key), read: s.read, total: s.total }),
  }));

  const list = (names: string[]) =>
    names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(t('comma'))}${t('and')}${names.at(-1)}`;
  const toolName = (c: Connection) => t(`s_${c.provider}`, { defaultValue: c.provider });
  const finished = conns
    .map((c) => ({ c, r: c.reading as Reading | null }))
    .filter(({ r }) => r && r.by === 'you' && r.state !== 'reading' && r.finished_at && Date.now() - Date.parse(r.finished_at) < RECENT_MS);
  // a read you started that never ended (the server was stopped): say so, never just stop spinning (reviewer, 12 Nov)
  const stalled = conns.find(
    (c) =>
      c.reading?.by === 'you' &&
      c.reading.state === 'reading' &&
      !isReading(c) &&
      Date.now() - Date.parse(c.reading.started_at) < RECENT_MS + 8 * 60_000,
  );
  let outcome: ReadOutcome | null = null;
  if (startFailed) outcome = { ok: false, text: t(startFailed), code: startFailed };
  else if (!running && finished.length) {
    const failed = finished.find(({ r }) => r!.state === 'failed');
    const read = finished.reduce((n, { r }) => n + (r!.read ?? 0), 0);
    const tasks = finished.reduce((n, { r }) => n + (r!.tasks ?? 0), 0);
    const more = finished.some(({ r }) => r!.more === true);
    if (failed && !read) {
      const code = failed.r!.error_code ?? 'other';
      outcome = { ok: false, text: t(`e_${code}`, { tool: toolName(failed.c), retry: retry(failed.c) }), code };
    } else {
      const from = list([...new Set(finished.flatMap(({ r }) => (r!.sources ?? []).map((s) => name(s.key))))]);
      const msgs = t('msgs', { count: read });
      const text = tasks ? t('done', { count: tasks, msgs, from }) : read ? t('doneNone', { msgs, from }) : t('doneEmpty', { from });
      outcome = { ok: true, tasks, text: more ? `${text}${t('more')}` : text };
    }
  } else if (!running && stalled) outcome = { ok: false, text: t('stalled', { retry: retry(stalled) }), code: 'stalled' };

  return { on, running: running || starting, lines, outcome, start, retry, canLeave: t('canLeave') };
}
