// Builds a task's follow-up plan in code (instant), instead of asking the AI to write it (slow):
// brief now → check(s) before the due date → risk check at ~65% → collect on the due date.
// Times land inside Saudi working hours (Sun–Thu 09:00–17:00, Asia/Riyadh = UTC+3, no DST).

export type PlanStep = {
  at: string;
  kind: 'brief' | 'check' | 'risk' | 'collect';
  channel: 'whatsapp' | 'in_app' | 'push' | 'email';
  summary: string;
  message: string;
  /** the "have you got it?" check right after a hand-off (send-followups skips it once they've confirmed) */
  receipt?: boolean;
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

  // Saree3's words. The task's title is already the notification's title, so the text never repeats it (owner: "content
  // duplicate and not funny"): one of a few playful lines per moment, picked when the plan is made.
  const n = name;
  const LINES: Record<string, [string[], string[]]> = {
    selfStart: [
      ['⏰ سجّلتها عندي، وأنا اللي بذكّرك. ركّز أنت وخلّ الذاكرة عليّ 😎', '📌 ثبّتها! وإذا نسيت، أنا ما أنسى 😄', '🧠 خلّ مخك للشغل، والتذكير شغلتي'],
      ["⏰ Saved. I'll do the remembering, you do the work 😎", "📌 Pinned! If you forget, I won't 😄", '🧠 Keep your brain for the work, reminders are my job'],
    ],
    selfCheck: [
      ['👀 وين وصلت فيها؟ ضغطة وحدة: خلصت، ماشية، أو واقفة', '🏃‍♂️ كيف الشغل؟ طمّني بضغطة', '☕ استراحة قهوة؟ وأنت فيها قل لي وين وصلت'],
      ["👀 Where's it at? One tap: done, on track or blocked", '🏃‍♂️ How is it going? One tap to tell me', '☕ Coffee break? While you are at it, tell me where it stands'],
    ],
    check: [
      [`👀 هلا ${n}، وين وصلت فيها؟ ضغطة وحدة تكفي 😉`, `🏃‍♂️ ${n}، كيف ماشية؟ طمّني بضغطة`, `☕ ${n}، سؤال سريع وأخليك: وين وصلت؟`],
      [`👀 Hi ${n}, where's it at? One tap is enough 😉`, `🏃‍♂️ ${n}, how is it going? One tap`, `☕ Quick one ${n}, then I'm gone: where is it at?`],
    ],
    receipt: [
      [`📬 ${n}، وصلتك؟ أكّد بضغطة وأنا أكمل عنك`, `📬 ${n}، طرقت الباب مرة ثانية 🚪 استلمتها؟`, `📬 ${n}، ضغطة "استلمت" وأفكّك مني 😄`],
      [`📬 ${n}, did it reach you? One tap and I take it from there`, `📬 ${n}, knocking again 🚪 got it?`, `📬 ${n}, tap "Got it" and I'll leave you alone 😄`],
    ],
    risk: [
      [`⏳ ${n}، الموعد يقرّب. تحتاج شي؟ قول وأنا أدبّره`, `⏳ ${n}، الساعة تمشي وأنا معك. فيه شي موقفك؟`, `🚀 ${n}، باقي القليل! لو تبي مساعدة أنا جاهز`],
      [`⏳ ${n}, it's getting close. Need anything? Say it and I'll sort it`, `⏳ ${n}, the clock is ticking and I'm with you. Anything in the way?`, `🚀 ${n}, almost there! Want a hand? I'm ready`],
    ],
    selfRisk: [
      ['⏳ الموعد يقرّب! وين وصلت؟ لو تحتاج شي قول', '🚀 باقي شوي! كمّلها وارتاح', '⏳ الساعة تركض… وأنت أسرع منها 💪'],
      ["⏳ It's getting close! Where are you at?", '🚀 Almost there! Finish it and relax', "⏳ The clock is running… you're faster 💪"],
    ],
    lastCall: [
      [`⏰ ${n}، باقي ساعة! خلصتها؟ لو تحتاج شي قول الحين`, `⏰ ${n}، العد التنازلي بدأ: ساعة وحدة ⏳ كيف الوضع؟`, `⏰ ${n}، آخر ساعة! ضغطة "خلصت" تفرّحني 😄`],
      [`⏰ ${n}, one hour left! Done? Need anything, tell me now`, `⏰ ${n}, countdown on: one hour ⏳ how's it looking?`, `⏰ ${n}, last hour! A "Done" tap would make my day 😄`],
    ],
    selfLastCall: [
      ['⏰ باقي ساعة! خلصت؟', '⏰ آخر ساعة… يلا نختمها 💪', '⏰ ساعة وحدة وتخلص منها!'],
      ['⏰ One hour left! Done?', "⏰ Last hour… let's wrap it up 💪", '⏰ One hour and it is off your plate!'],
    ],
    collect: [
      [`🎯 ${n}، اليوم موعدها! ارفع التسليم هنا وأنا أوصله 📎`, `🎯 ${n}، يوم التسليم وصل 🥁 ارفعها وأنا أكمل الباقي`, `🎯 ${n}، اليوم يومها! خلّصها وأنا أوصلها 🚀`],
      [`🎯 ${n}, it's due today! Drop it here and I'll deliver it 📎`, `🎯 ${n}, delivery day 🥁 send it and I'll do the rest`, `🎯 ${n}, today's the day! Finish it and I'll pass it on 🚀`],
    ],
    selfCollect: [
      ['🎯 اليوم يومها! خلّصها وارتاح 💪', '🥁 يوم التسليم! يلا نشطبها', '🎯 اليوم موعدها، وبعدها راحة 😌'],
      ["🎯 Today's the day! Finish it and relax 💪", "🥁 Delivery day! Let's tick it off", "🎯 It's due today, then you rest 😌"],
    ],
    dueNow: [
      [`🎯 ${n}، حان الموعد! خلصتها؟ ارفع التسليم وأنا أوصله 📎`, `🔔 ${n}، الحين موعدها. ضغطة "خلصت" وأبشّر الكل 🎉`],
      [`🎯 ${n}, it's due now! Done? Send it and I'll deliver it 📎`, `🔔 ${n}, it's due now. Tap "Done" and I'll tell everyone 🎉`],
    ],
    selfDueNow: [
      ['🎯 حان الموعد! خلصتها؟', '🔔 الحين موعدها. ضغطة "خلصت" وتنشطب 🎉'],
      ["🎯 It's due now! Done?", '🔔 Due now. Tap "Done" and it\'s off the list 🎉'],
    ],
  };
  const line = (key: string) => {
    const options = LINES[key][ar ? 0 : 1];
    return options[Math.floor(Math.random() * options.length)];
  };

  // the one notification the owner gets for a new task: from whom, by when (the title is the notification's title;
  // the "assigned you" alert isn't pushed)
  const brief: PlanStep = {
    at: iso(now),
    kind: 'brief',
    channel: self ? 'push' : 'whatsapp',
    summary: ar ? 'أبلّغه بالمهمة وأتأكد إنه استلم' : 'Brief the owner and get a confirm',
    message: self
      ? line('selfStart')
      : ar
        ? `هلا ${name} 👋 ${from ? `${from} عطاك مهمة جديدة` : 'جاتك مهمة جديدة'}${when ? `\n⏰ موعدها ${when}` : ''}${helper ? `\n🤝 ${helper} بيساعدك` : ''}\nاضغط "استلمت" وأنا معك لين تخلص 🤝`
        : `Hi ${name} 👋 ${from ? `${from} gave you a new task` : 'A new task for you'}${when ? `\n⏰ Due ${when}` : ''}${helper ? `\n🤝 ${helper} will help` : ''}\nTap "Got it" and I'm with you till it's done 🤝`,
  };

  // a moment for a reminder: inside working hours when that still lands before the deadline; when the deadline itself
  // is outside them (an evening, a Saturday) the real time, but never at night (NaN = no reminder)
  const fit = (t: number) => {
    const w = intoWorkHours(t);
    if (Number.isNaN(due) || w < due - 15 * 60_000) return w;
    const h = new Date(t + RIYADH).getUTCHours();
    return h >= 8 && h < 22 && t < due ? t : NaN;
  };
  const at = (t: number) => (Number.isNaN(fit(t)) ? '' : iso(fit(t)));
  const check = (t: number): PlanStep => ({
    at: at(t),
    kind: 'check',
    channel: 'push',
    summary: ar ? 'أسأل وين وصل' : 'Check where it is at',
    message: self ? line('selfCheck') : line('check'),
  });

  // ~2 working hours after the hand-off: still not confirmed → Saree3 asks again (send-followups words it as a receipt
  // chase; once they've confirmed it is skipped). Not for your own tasks.
  // (sooner when the deadline is close: a third of the time left, at least an hour)
  const receiptIn = Number.isNaN(due) ? 2 * H : Math.min(2 * H, Math.max(H, (due - now) / 3));
  const receipt: PlanStep[] = self
    ? []
    : [
        {
          ...check(now + receiptIn),
          receipt: true,
          // 📬 marks it for send-followups: skipped once they've confirmed
          message: line('receipt'),
        },
      ];
  // steps without a moment are dropped; two checks that working hours rounded onto the same moment are one
  const once = (steps: PlanStep[]) =>
    steps.filter((s, i) => !!s.at && (s.kind !== 'check' || steps.findIndex((o) => o.kind === 'check' && o.at === s.at) === i));

  // no due date: brief + one check in ~2 working days
  if (Number.isNaN(due) || due <= now) return once([brief, ...receipt, check(now + 48 * H)]);

  const span = due - now;
  const collect: PlanStep = {
    at: iso(due),
    kind: 'collect',
    channel: 'push',
    summary: ar ? 'أجمع التسليم وأرسله لك' : 'Collect the deliverable and send it to you',
    message: self ? line('selfCollect') : line('collect'),
  };
  // due within a day: Saree3 stays on it all the way (owner: "don't keep silent till someone takes action"):
  // receipt (~1 h) · a check half-way · "one hour left" · the due time itself; after that the autopilot chases it as late
  if (span < 24 * H) {
    const lastCall: PlanStep = {
      at: due - H > now + 30 * 60_000 ? iso(due - H) : '',
      kind: 'risk',
      channel: 'push',
      summary: ar ? 'تذكير قبل الموعد بساعة' : 'One hour before the deadline',
      message: self ? line('selfLastCall') : line('lastCall'),
    };
    const dueNow: PlanStep = { ...collect, message: self ? line('selfDueNow') : line('dueNow') };
    const mid = span >= 3 * H ? [check(now + span / 2)] : [];
    // a receipt check within half an hour of "one hour left" is one message too many (unconfirmed, the last call is
    // worded as the receipt chase anyway)
    const close = (a: string, b: string) => !!a && !!b && Math.abs(Date.parse(a) - Date.parse(b)) < 30 * 60_000;
    const rec = receipt.filter((r) => !close(r.at, lastCall.at));
    return once([brief, ...rec, ...mid, lastCall, dueNow].filter((s) => s === brief || s === dueNow || !s.at || Date.parse(s.at) < due));
  }

  const risk: PlanStep = {
    at: at(now + span * 0.65),
    kind: 'risk',
    channel: 'push',
    summary: ar ? 'لو التقدم أقل من ٥٠٪ أنبهك ومعي حل' : 'If progress is under 50%, flag it with a fix',
    message: self ? line('selfRisk') : line('risk'),
  };
  const steps = [brief, ...receipt, check(now + span * 0.35), risk, collect];
  // drop any middle step that working-hours rounding pushed past the due date
  return once(steps.filter((s) => s.kind === 'collect' || s.kind === 'brief' || !s.at || Date.parse(s.at) < due));
}
