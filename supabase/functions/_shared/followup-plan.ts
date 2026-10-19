// Builds a task's follow-up plan in code (instant), instead of asking the AI to write it (slow):
// brief now → check(s) before the due date → risk check at ~65% → collect on the due date.
// Times land inside Saudi working hours (Sun–Thu 09:00–17:00, Asia/Riyadh = UTC+3, no DST).

export type PlanStep = {
  at: string;
  kind: 'brief' | 'check' | 'risk' | 'collect';
  channel: 'whatsapp' | 'in_app' | 'push' | 'email';
  summary: string;
  message: string;
};

const H = 3600_000;
const RIYADH = 3 * H;

/** Moves a time to the next Saudi working moment (Sun–Thu 09:00–17:00 Riyadh). */
function intoWorkHours(t: number): number {
  const local = new Date(t + RIYADH); // read UTC fields as Riyadh local time
  for (let i = 0; i < 8; i++) {
    const day = local.getUTCDay(); // 5 = Fri, 6 = Sat
    const hour = local.getUTCHours();
    if (day === 5 || day === 6 || hour >= 17) {
      local.setUTCDate(local.getUTCDate() + 1);
      local.setUTCHours(9, 0, 0, 0);
      continue;
    }
    if (hour < 9) local.setUTCHours(9, 0, 0, 0);
    break;
  }
  return local.getTime() - RIYADH;
}

const iso = (t: number) => new Date(t).toISOString();

export function buildPlan(opts: {
  title: string;
  dueAt: string | null;
  ownerFirstName: string | null;
  ownerArabic: boolean;
  /** the owner is the user themself → reminders instead of briefs */
  self: boolean;
  helperFirstName?: string | null;
  now?: Date;
}): PlanStep[] {
  const { title, ownerArabic: ar, self } = opts;
  const name = opts.ownerFirstName ?? '';
  const now = (opts.now ?? new Date()).getTime();
  const due = opts.dueAt ? Date.parse(opts.dueAt) : NaN;
  const helper = opts.helperFirstName;

  const brief: PlanStep = {
    at: iso(now),
    kind: 'brief',
    channel: self ? 'push' : 'whatsapp',
    summary: ar ? 'أبلّغه بالمهمة وأتأكد إنه استلم' : 'Brief the owner and get a confirm',
    message: self
      ? ar ? `تذكير: ${title}` : `Reminder: ${title}`
      : ar
        ? `هلا ${name}، عندك مهمة جديدة: ${title}.${helper ? ` ${helper} بيساعدك.` : ''} أكّد لي إنك استلمتها 🙏`
        : `Hi ${name}, you have a new task: ${title}.${helper ? ` ${helper} will help.` : ''} Please confirm you've got it 🙏`,
  };

  const check = (at: number): PlanStep => ({
    at: iso(intoWorkHours(at)),
    kind: 'check',
    channel: 'push',
    summary: ar ? 'أسأل وين وصل' : 'Check where it is at',
    message: self
      ? ar ? `وين وصلت في: ${title}؟` : `How is "${title}" going?`
      : ar ? `هلا ${name}، وين وصلت في "${title}"؟ رد بنسبة سريعة` : `Hi ${name}, how far along is "${title}"? A quick % is enough`,
  });

  // no due date: brief + one check in ~2 working days
  if (Number.isNaN(due) || due <= now) return [brief, check(now + 48 * H)];

  const span = due - now;
  const collect: PlanStep = {
    at: iso(due),
    kind: 'collect',
    channel: 'push',
    summary: ar ? 'أجمع التسليم وأرسله لك' : 'Collect the deliverable and send it to you',
    message: self
      ? ar ? `اليوم موعد: ${title}` : `"${title}" is due today`
      : ar ? `اليوم موعد تسليم "${title}"، ارفعه هنا لو سمحت` : `"${title}" is due today. Please upload it here`,
  };
  if (span < 24 * H) return [brief, check(now + span / 2), collect].filter((s) => s.kind !== 'check' || Date.parse(s.at) < due);

  const risk: PlanStep = {
    at: iso(intoWorkHours(now + span * 0.65)),
    kind: 'risk',
    channel: 'push',
    summary: ar ? 'لو التقدم أقل من ٥٠٪ أنبهك ومعي حل' : 'If progress is under 50%, flag it with a fix',
    message: self
      ? ar ? `باقي وقت قليل على "${title}"، وين وصلت؟` : `Not long left for "${title}". Where are you at?`
      : ar ? `${name}، باقي وقت قليل على "${title}". تحتاج مساعدة؟` : `${name}, "${title}" is coming up. Need any help?`,
  };
  const steps = [brief, check(now + span * 0.35), risk, collect];
  // drop any middle step that working-hours rounding pushed past the due date
  return steps.filter((s) => s.kind === 'collect' || s.kind === 'brief' || Date.parse(s.at) < due);
}
