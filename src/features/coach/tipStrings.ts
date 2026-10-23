import { registerStrings } from '@/lib/i18n/register';

// Saree3's first-visit tip on each main screen (ScreenTip.tsx): the screen's main value in one line + one action.
const en = {
  gotIt: 'Got it',
  homeTitle: 'Only what needs you today',
  homeBody: 'Muntej follows up on the rest. Add a task any time with the mic below.',
  homeAction: 'Add a task',
  chatTitle: 'Say it like you’d tell a colleague',
  chatBody: '“Have Faisal send the quote by Sunday”: Muntej picks who, when, and follows up.',
  tasksTitle: 'All your tasks, followed up for you',
  tasksBody: 'Tap the circle when one is done. Muntej checks in on the rest by itself.',
  emailTitle: 'Tasks from your email, ready to add',
  emailBody: 'Muntej reads your new email and brings you the tasks in it. You add each one in one tap.',
  taskTitle: 'Need something on this task?',
  taskBody: 'Change it with Muntej: “make it Thursday”, “give it to Noura”. Steps and proof live here too.',
  teamTitle: 'Who’s free, who’s late',
  teamBody: 'Your team at a glance. Invite someone by email and they’re in.',
  teamAction: 'Invite someone',
  decisionsTitle: 'One tap per decision',
  decisionsBody: 'Approve or send back. If you don’t, Muntej approves it by itself after 2 working days.',
  moreTitle: 'Everything else is here',
  moreBody: 'Plans, team, captures and reports. You won’t need them every day.',
};

const ar: typeof en = {
  gotIt: 'فهمت',
  homeTitle: 'هنا بس اللي يحتاجك اليوم',
  homeBody: 'الباقي منتج يتابعه. أضف مهمة أي وقت من المايك تحت.',
  homeAction: 'أضف مهمة',
  chatTitle: 'قولها مثل ما تكلم زميلك',
  chatBody: '«خل فيصل يرسل العرض قبل الأحد»: منتج يختار مين ومتى، ويتابع.',
  tasksTitle: 'كل مهامك، ومنتج يتابعها',
  tasksBody: 'اضغط الدائرة لما تخلص وحدة. والباقي منتج يسأل عنه بنفسه.',
  emailTitle: 'مهام إيميلك تجيك جاهزة',
  emailBody: 'منتج يقرا إيميلاتك الجديدة ويجيب لك المهام اللي فيها. تضيف كل وحدة بضغطة.',
  taskTitle: 'تحتاج شي في هالمهمة؟',
  taskBody: 'غيّرها مع منتج: «خلها الخميس»، «عطها نورة». والخطوات والإثبات هنا بعد.',
  teamTitle: 'مين فاضي ومين متأخر',
  teamBody: 'فريقك بنظرة. ادعُ أي شخص بإيميله ويدخل على طول.',
  teamAction: 'ادعُ شخص',
  decisionsTitle: 'قرار بضغطة',
  decisionsBody: 'اعتمد أو رجّعها. ولو ما رديت، منتج يعتمدها بنفسه بعد يومين عمل.',
  moreTitle: 'كل شي ثاني هنا',
  moreBody: 'الخطط والفريق والتسجيلات والتقارير. ما تحتاجها كل يوم.',
};

export const TIPS_NS = registerStrings('screenTips', { en, ar });
