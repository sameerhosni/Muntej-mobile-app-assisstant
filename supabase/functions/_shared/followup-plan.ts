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
  /** who gave the task, named in the hand-off message */
  assignerFirstName?: string | null;
  now?: Date;
}): PlanStep[] {
  const { title, ownerArabic: ar, self } = opts;
  const name = opts.ownerFirstName ?? '';
  const now = (opts.now ?? new Date()).getTime();
  const due = opts.dueAt ? Date.parse(opts.dueAt) : NaN;
  const helper = opts.helperFirstName;
  const from = opts.assignerFirstName;
  // the due date in a few words, Riyadh time: "Thursday 23 Oct, 5:00 PM"
  const when = Number.isNaN(due)
    ? ''
    : new Intl.DateTimeFormat(ar ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Riyadh',
      }).format(due);

  // the one notification the owner gets for a new task: from whom, what, by when (the "assigned you" alert isn't pushed)
  const brief: PlanStep = {
    at: iso(now),
    kind: 'brief',
    channel: self ? 'push' : 'whatsapp',
    summary: ar ? 'أبلّغه بالمهمة وأتأكد إنه استلم' : 'Brief the owner and get a confirm',
    message: self
      ? ar ? `⏰ لا تنسى «${title}»! أنا سريع، والتذكير شغلتي 😄` : `⏰ Don't forget "${title}"! I'm Saree3, reminding is literally my job 😄`
      : ar
        ? `هلا ${name} 👋 ${from ? `${from} عطاك مهمة` : 'جاتك مهمة جديدة'}: «${title}»${when ? `\n⏰ موعدها ${when}` : ''}${helper ? `\n🤝 ${helper} بيساعدك` : ''}\nاضغط وأكّد إنك استلمتها`
        : `Hi ${name} 👋 ${from ? `${from} gave you a task` : 'New task for you'}: "${title}"${when ? `\n⏰ Due ${when}` : ''}${helper ? `\n🤝 ${helper} will help` : ''}\nTap to confirm you've got it`,
  };

  const check = (at: number): PlanStep => ({
    at: iso(intoWorkHours(at)),
    kind: 'check',
    channel: 'push',
    summary: ar ? 'أسأل وين وصل' : 'Check where it is at',
    message: self
      ? ar ? `👀 وين وصلت في «${title}»؟ ردّ بضغطة: خلصت، ماشية، أو واقفة` : `👀 How's "${title}" going? One tap: done, on track or blocked`
      : ar ? `👀 هلا ${name}، «${title}» وين وصلت؟ ضغطة وحدة تكفي 😉` : `👀 Hi ${name}, where's "${title}" at? One tap is enough 😉`,
  });

  // ~2 working hours after the hand-off: still not confirmed → Saree3 asks again (send-followups words it as a receipt
  // chase; once they've confirmed it is skipped). Not for your own tasks.
  const receipt = self ? [] : [check(now + 2 * H)];
  // two checks that working hours rounded onto the same moment are one
  const once = (steps: PlanStep[]) => steps.filter((s, i) => s.kind !== 'check' || steps.findIndex((o) => o.kind === 'check' && o.at === s.at) === i);

  // no due date: brief + one check in ~2 working days
  if (Number.isNaN(due) || due <= now) return once([brief, ...receipt, check(now + 48 * H)]);

  const span = due - now;
  const collect: PlanStep = {
    at: iso(due),
    kind: 'collect',
    channel: 'push',
    summary: ar ? 'أجمع التسليم وأرسله لك' : 'Collect the deliverable and send it to you',
    message: self
      ? ar ? `🎯 اليوم يوم «${title}»! خلّصها وارتاح 💪` : `🎯 Today is "${title}" day! Finish it and relax 💪`
      : ar ? `🎯 ${name}، اليوم موعد «${title}». ارفع التسليم هنا وأنا أوصله 📎` : `🎯 ${name}, "${title}" is due today. Drop it here and I'll deliver it 📎`,
  };
  if (span < 24 * H) return once([brief, ...receipt, check(now + span / 2), collect].filter((s) => s.kind !== 'check' || Date.parse(s.at) < due));

  const risk: PlanStep = {
    at: iso(intoWorkHours(now + span * 0.65)),
    kind: 'risk',
    channel: 'push',
    summary: ar ? 'لو التقدم أقل من ٥٠٪ أنبهك ومعي حل' : 'If progress is under 50%, flag it with a fix',
    message: self
      ? ar ? `⏳ الوقت يركض على «${title}»! وين وصلت؟ لو تحتاج شي قول` : `⏳ The clock is running on "${title}"! Where are you at? Need anything?`
      : ar ? `⏳ ${name}، «${title}» قرّب موعدها. تحتاج مساعدة؟ قول وأنا أدبّرها` : `⏳ ${name}, "${title}" is coming up. Need help? Say it and I'll sort it`,
  };
  const steps = [brief, ...receipt, check(now + span * 0.35), risk, collect];
  // drop any middle step that working-hours rounding pushed past the due date
  return once(steps.filter((s) => s.kind === 'collect' || s.kind === 'brief' || Date.parse(s.at) < due));
}
