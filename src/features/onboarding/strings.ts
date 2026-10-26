import { registerStrings } from '@/lib/i18n/register';

// The Home "Getting started" strip (the tour itself: tourStrings.ts).
const en = {
  hello: "Hi! I'm Saree3, Muntej's helper 👋 I'll show you how it works in 2 minutes. First, what should I call you?",
  helloNamed: "Hi {{name}}! I'm Saree3, Muntej's helper 👋 I'll show you how it works in 2 minutes.",
  askCompany: "Nice to meet you, {{name}}! And what's your company called?",
  companyOk: '{{company}} is set up ✓',
  demoIntro: "Here's the whole idea: you say a task once, like a message to a colleague. Watch me:",
  demoUser: 'Ask Sara to send the Q3 report by Thursday',
  demoExplain:
    'Got it in a second:\n• Who: Sara\n• When: Thursday 5 PM\n• I check in with Sara on Tuesday, nudge her if it slips, and collect the report as proof.\nYou chase nobody.',
  demoNext: 'My turn',
  demoWho: 'Sara',
  demoDue: 'Thu 5 PM',
  demoCheck: 'Check-in Tue 9 AM',
  demoAdded: 'Task added (sample)',
  tryIt: 'Now you: type a task below, or tap the mic 🎤 and just say it. Anything you need done this week.',
  value: "Done in {{s}} seconds ✓ That's your whole job. From here I follow up, remind and collect the proof.",
  valueNext: 'Next: add my team',
  team: "I'm at my best when you hand work off. Who works with you? Write it like this:",
  teamExample: 'Add Sara sara@example.com as designer',
  teamUse: 'Use this example',
  teamHint: 'They get an invite by email and sign in with it.',
  handoff: 'Nice, {{name}} is on the team ✓ Now give {{name}} a task and forget about it:',
  handoffExample: '{{name}}, prepare the price list by Sunday',
  handoffUse: 'Use this',
  finished:
    'You’re all set 🎉 From now on: say it once, I handle the rest. I’ll pop up with new stuff right when it matters, like when work comes back for your review.',
  skip: 'Skip for now',
  // Home strip
  stripTitle: 'Setting up your account',
  stripSub: '{{done}} of {{total}} ready · Saree3 can finish the rest for you',
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
    'فهمتها في ثانية:\n• مين: سارة\n• متى: الخميس الساعة ٥\n• أتابع مع سارة يوم الثلاثاء، وأذكّرها لو تأخرت، وأجمع التقرير كإثبات.\nوأنت ولا تلاحق أحد.',
  demoNext: 'دوري',
  demoWho: 'سارة',
  demoDue: 'الخميس ٥ م',
  demoCheck: 'متابعة الثلاثاء ٩ ص',
  demoAdded: 'انضافت (مثال)',
  tryIt: 'الحين دورك: اكتب مهمة تحت، أو اضغط المايك 🎤 وقلها بس. أي شي تبيه ينخلص هالأسبوع.',
  value: 'خلصت في {{s}} ثانية ✓ هذا كل اللي عليك. الباقي عليّ: أتابع وأذكّر وأجمع الإثبات.',
  valueNext: 'التالي: أضيف فريقي',
  team: 'أنا أبدع لما تسلّم الشغل لغيرك. مين يشتغل معك؟ اكتبها كذا:',
  teamExample: 'أضف سارة sara@example.com مصممة',
  teamUse: 'استخدم هالمثال',
  teamHint: 'توصلهم دعوة على الإيميل ويدخلون فيه.',
  handoff: 'حلو، {{name}} صار معنا ✓ الحين عط {{name}} مهمة وانساها:',
  handoffExample: '{{name}}، جهّز قائمة الأسعار قبل الأحد',
  handoffUse: 'استخدم هذي',
  finished: 'جاهز 🎉 من الحين: قولها مرة، والباقي عليّ. وأطلع لك بالجديد وقت ما يصير، مثل لما يرجع لك شغل تراجعه.',
  skip: 'بعدين',
  stripTitle: 'تجهيز حسابك',
  stripSub: '{{done}} من {{total}} جاهز · سريع يقدر يكمّل عنك',
  stripGo: 'كمّل',
};

export const ONBOARDING_NS = registerStrings('onboarding', { en, ar });
