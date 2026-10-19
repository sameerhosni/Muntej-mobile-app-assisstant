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
