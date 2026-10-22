import { registerStrings } from '@/lib/i18n/register';

// The Home "Getting started" strip (the tour itself: tourStrings.ts).
const en = {
  hello: "Hi! I'm Saree3, Muntej's helper 👋 I'll show you how it works in 2 minutes. First, what should I call you?",
  helloNamed: "Hi {{name}}! I'm Saree3, Muntej's helper 👋 I'll show you how it works in 2 minutes.",
  askCompany: 'Nice to meet you, {{name}}! And what is your company called?',
  companyOk: '{{company}} is set up ✓',
  demoIntro: "Here's the whole idea: you say a task once, like a message to a colleague. Watch me:",
  demoUser: 'Ask Sara to send the Q3 report by Thursday',
  demoExplain:
    'In a second Muntej understood:\n• Who: Sara\n• When: Thursday 5 PM\n• It will check in with Sara on Tuesday, remind her if it slips, and collect the report as proof.\nYou don’t chase anyone.',
  demoNext: 'My turn',
  demoWho: 'Sara',
  demoDue: 'Thu 5 PM',
  demoCheck: 'Check-in Tue 9 AM',
  demoAdded: 'Task added (sample)',
  tryIt: 'Now you: type a task below, or tap the mic 🎤 and just say it. Anything you need done this week.',
  value: 'Done in {{s}} seconds ✓ That’s all you do. From here Muntej follows up, reminds and collects the proof. Nothing else needed.',
  valueNext: 'Next: add my team',
  team: 'Muntej shines when you hand work off. Who works with you? Write it like this:',
  teamExample: 'Add Sara sara@example.com as designer',
  teamUse: 'Use this example',
  teamHint: 'They get an invitation email and sign in with it.',
  handoff: 'Great, {{name}} is on the team ✓ Now give {{name}} a task and forget it:',
  handoffExample: '{{name}}, prepare the price list by Sunday',
  handoffUse: 'Use this',
  finished:
    'You’re all set 🎉 From now on: say it once, Muntej handles the rest. I’ll show you new things right when they happen, like when work comes back for your review.',
  skip: 'Skip for now',
  // Home strip
  stripTitle: 'Getting started',
  stripSub: '{{done}} of {{total}} done · Saree3 shows you the rest',
  stripGo: 'Continue',
};

const ar: typeof en = {
  hello: 'هلا! أنا سريع، مساعد منتج 👋 بوريك كيف يشتغل في دقيقتين. أول شي، وش أناديك؟',
  helloNamed: 'هلا {{name}}! أنا سريع، مساعد منتج 👋 بوريك كيف يشتغل في دقيقتين.',
  askCompany: 'تشرفنا يا {{name}}! ووش اسم شركتك؟',
  companyOk: 'جهّزت {{company}} ✓',
  demoIntro: 'الفكرة كلها: تقول المهمة مرة وحدة، كأنك ترسل رسالة لزميلك. شوفني:',
  demoUser: 'خل سارة ترسل تقرير الربع الثالث قبل الخميس',
  demoExplain:
    'منتج فهمها في ثانية:\n• مين: سارة\n• متى: الخميس الساعة ٥\n• بيتابع مع سارة يوم الثلاثاء، ويذكّرها لو تأخرت، ويجمع التقرير كإثبات.\nأنت ما تلاحق أحد.',
  demoNext: 'دوري',
  demoWho: 'سارة',
  demoDue: 'الخميس ٥ م',
  demoCheck: 'متابعة الثلاثاء ٩ ص',
  demoAdded: 'انضافت (مثال)',
  tryIt: 'الحين أنت: اكتب مهمة تحت، أو اضغط المايك 🎤 وقلها بس. أي شي تبي ينخلص هالأسبوع.',
  value: 'خلصت في {{s}} ثانية ✓ هذا كل اللي عليك. الباقي على منتج: يتابع ويذكّر ويجمع الإثبات. ما تحتاج شي ثاني.',
  valueNext: 'التالي: أضيف فريقي',
  team: 'منتج يبدع لما تسلّم الشغل لغيرك. مين يشتغل معك؟ اكتبها كذا:',
  teamExample: 'أضف سارة sara@example.com مصممة',
  teamUse: 'استخدم هالمثال',
  teamHint: 'توصلهم دعوة على الإيميل ويدخلون فيه.',
  handoff: 'ممتاز، {{name}} صار في الفريق ✓ الحين عط {{name}} مهمة وانساها:',
  handoffExample: '{{name}}، جهّز قائمة الأسعار قبل الأحد',
  handoffUse: 'استخدم هذي',
  finished: 'جاهز 🎉 من الحين: قولها مرة، ومنتج يكمّل الباقي. بوريك الأشياء الجديدة وقت ما تصير، مثل لما يرجع لك شغل تراجعه.',
  skip: 'بعدين',
  stripTitle: 'البداية',
  stripSub: 'خلصت {{done}} من {{total}} · سريع يوريك الباقي',
  stripGo: 'كمّل',
};

export const ONBOARDING_NS = registerStrings('onboarding', { en, ar });
