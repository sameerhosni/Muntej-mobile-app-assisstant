// Munti's lines: one short tip per main screen, value toasts and the helper's own labels (EN + Saudi Arabic).
import type { Href } from 'expo-router';
import { registerStrings } from '@/lib/i18n/register';

const en = {
  name: 'Munti',
  a11yHint: 'Tap for a tip. Long-press to hide Munti until you reopen the app.',
  hide: 'Hide Munti for now',
  showMe: 'Show me',
  close: 'Close',
  hidden: 'Munti is hiding. See you next time 👋',
  // settings
  settingTitle: 'Munti helper',
  settingHint: 'Your little robot buddy with tips and good news',
  // tips, one per main screen
  tip_home: "Just tell me what needs doing — I'll chase it. You go have your coffee ☕",
  tip_employeeHome: "Your tasks for today live here. Finish one and I'll brag about you to your manager 😉",
  tip_tasks: "Want to change a task? Don't hunt for an edit button — just tell me in the chat.",
  tip_team: 'Tap anyone to see their skills. Better skills here = I pick the right person every time 🎯',
  tip_chat: "Try “what's late?” or “move the report to Sunday”. I speak boss and I speak Saudi 😄",
  tip_decisions: "Only the things that really need you land here. Everything else? I've got it 💪",
  tip_autopilot: 'This is me working while you sleep 😴 Every follow-up I sent is listed here.',
  tip_alerts: 'Red means late, amber means wobbly. I warn you before it becomes a problem 🚨',
  tip_settings: "You can switch me off here… but I'd really miss you 🥲",
  // value toasts (munti.sayKey)
  value_followups: 'You just skipped {{n}} follow-ups — {{min}} minutes back 😎',
  value_created: "Task's in! I'll do the chasing, you do the relaxing 🏃",
  value_done: 'Done and dusted! Another one off your plate 🎉',
  value_noChase: "Nothing to chase today. I'm almost bored 😴",
  // performance (auto message on main screens); emp = own tasks, mgr = the team
  perf_great_emp: "{{name}}, {{done}} done this week and nothing late! You're on fire 🔥",
  perf_great_mgr: '{{done}} tasks done this week and nothing late. Your team is on fire 🔥',
  perf_good_emp: "All on track, {{name}}! {{open}} open and none late. Keep going 💪",
  perf_good_mgr: 'Everything is on track: {{open}} open, none late. Sit back, I’ve got it 😎',
  perf_watch_emp: 'Heads up {{name}} 👀 {{late}} late. Knock one out and I’ll stop staring at you 😅',
  perf_watch_mgr: 'Heads up 👀 {{late}} tasks are late. I’m already chasing them for you.',
  perf_soon_emp: '{{soon}} tasks due in the next 24 hours, {{name}}. Let’s get ahead of them ⏰',
  perf_soon_mgr: '{{soon}} tasks are due in the next 24 hours. I’m keeping an eye on them ⏰',
  perf_behind_emp: 'Uh-oh {{name}}… {{late}} tasks are late 😰 Let’s clear one now, I believe in you!',
  perf_behind_mgr: '{{late}} tasks are late 😰 Let’s look at them together and unblock your team.',
  perf_quiet_emp: 'Nothing on your plate, {{name}}… I’m so bored 😴',
  perf_quiet_mgr: 'Nothing to chase… give me something to do! 😴',
  // empty states
  empty_tasks: "No tasks yet, so I'm napping 😴 Tell me one thing that needs doing and I'll take it from there.",
  empty_team: "It's lonely in here! 👋 Add your first person and I'll start matching tasks to their skills.",
};

const ar: typeof en = {
  name: 'منتي',
  a11yHint: 'اضغط عشان تشوف نصيحة. اضغط مطوّل عشان تخفي منتي لين تفتح التطبيق مرة ثانية.',
  hide: 'أخفِ منتي الحين',
  showMe: 'ورّني',
  close: 'إغلاق',
  hidden: 'منتي راح يتخبّى. نشوفك المرة الجاية 👋',
  settingTitle: 'المساعد منتي',
  settingHint: 'صاحبك الروبوت الصغير، يعطيك نصايح وأخبار حلوة',
  tip_home: 'بس قول لي وش المطلوب وأنا أتابعه. وأنت روح اشرب قهوتك ☕',
  tip_employeeHome: 'مهامك اليوم كلها هنا. خلّص وحدة وأنا أمدحك عند مديرك 😉',
  tip_tasks: 'تبي تعدّل مهمة؟ لا تدوّر زر تعديل — بس قول لي في المحادثة.',
  tip_team: 'اضغط على أي شخص تشوف مهاراته. كل ما كانت المهارات أدق، اخترت الشخص الصح 🎯',
  tip_chat: 'جرّب «وش المتأخر؟» أو «أجّل التقرير ليوم الأحد». أفهم لغة المدراء وأفهم سعودي 😄',
  tip_decisions: 'هنا بس الأشياء اللي تحتاجك فعلاً. الباقي؟ عليّ أنا 💪',
  tip_autopilot: 'هذا أنا أشتغل وأنت نايم 😴 كل متابعة أرسلتها تلقاها هنا.',
  tip_alerts: 'الأحمر يعني متأخر، والبرتقالي يعني مهزوز. أنبّهك قبل لا تصير مشكلة 🚨',
  tip_settings: 'تقدر تطفيني من هنا… بس والله بتوحشني 🥲',
  value_followups: 'وفّرت على نفسك {{n}} متابعات — رجعت لك {{min}} دقيقة 😎',
  value_created: 'انضافت المهمة! أنا أتابع وأنت ارتاح 🏃',
  value_done: 'خلصت! وحدة أقل من على راسك 🎉',
  value_noChase: 'ما فيه شي أتابعه اليوم. بديت أطفش 😴',
  perf_great_emp: '{{name}}، خلّصت {{done}} هالأسبوع وما عندك ولا متأخرة! ولّعت 🔥',
  perf_great_mgr: 'فريقك خلّص {{done}} مهام هالأسبوع وما فيه ولا متأخرة. ولّعوا 🔥',
  perf_good_emp: 'كل شي ماشي تمام يا {{name}}! عندك {{open}} مفتوحة وولا وحدة متأخرة. كمّل 💪',
  perf_good_mgr: 'كل شي ماشي تمام: {{open}} مفتوحة وولا وحدة متأخرة. ارتاح، أنا ماسك الأمور 😎',
  perf_watch_emp: 'انتبه يا {{name}} 👀 عندك {{late}} متأخرة. خلّص وحدة وأوقف أطالع فيك 😅',
  perf_watch_mgr: 'انتبه 👀 فيه {{late}} مهام متأخرة. وأنا قاعد أتابعها عنك.',
  perf_soon_emp: 'عندك {{soon}} مهام موعدها خلال ٢٤ ساعة يا {{name}}. خلنا نسبقها ⏰',
  perf_soon_mgr: 'فيه {{soon}} مهام موعدها خلال ٢٤ ساعة. عيني عليها ⏰',
  perf_behind_emp: 'أوه يا {{name}}… عندك {{late}} مهام متأخرة 😰 يلا نخلّص وحدة الحين، أنا واثق فيك!',
  perf_behind_mgr: 'فيه {{late}} مهام متأخرة 😰 خلنا نشوفها سوا ونفك الزحمة عن فريقك.',
  perf_quiet_emp: 'ما عندك شي يا {{name}}… طفشت 😴',
  perf_quiet_mgr: 'ما فيه شي أتابعه… عطني شغل! 😴',
  empty_tasks: 'ما فيه مهام للحين، فأنا نايم 😴 قول لي شي واحد يبي له شغل وأنا أكمّل الباقي.',
  empty_team: 'المكان فاضي! 👋 أضف أول شخص وأنا أبدأ أوزّع المهام حسب مهاراته.',
};

export const MUNTI_NS = registerStrings('munti', { en, ar });

export type MuntiKey = keyof typeof en;

export type RouteTip = {
  tip: MuntiKey;
  /** optional "Show me" action */
  showMe?: Href;
  /** the floating Munti sits here (false = only toasts/tips, e.g. the chat has its own Munti) */
  fab: boolean;
  /** this screen has the bottom tab bar under it */
  tabBar: boolean;
};

/** Main screens (usePathname values) → Munti's tip. */
export const ROUTE_TIPS: Record<string, RouteTip> = {
  '/01-home': { tip: 'tip_home', showMe: { pathname: '/02-capture', params: { mode: 'text' } }, fab: true, tabBar: true },
  '/25-employee-home': { tip: 'tip_employeeHome', showMe: '/38-tasks', fab: true, tabBar: true },
  '/38-tasks': { tip: 'tip_tasks', showMe: { pathname: '/02-capture', params: { mode: 'text' } }, fab: true, tabBar: true },
  '/39-team': { tip: 'tip_team', fab: true, tabBar: false },
  '/02-capture': { tip: 'tip_chat', fab: false, tabBar: false },
  '/04-decisions': { tip: 'tip_decisions', fab: true, tabBar: true },
  '/03-autopilot': { tip: 'tip_autopilot', showMe: '/04-decisions', fab: true, tabBar: true },
  '/18-alerts': { tip: 'tip_alerts', showMe: '/38-tasks', fab: true, tabBar: false },
  '/settings': { tip: 'tip_settings', fab: true, tabBar: false },
};
