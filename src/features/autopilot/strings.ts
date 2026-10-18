import { registerStrings } from '@/lib/i18n/register';

const en = {
  title: 'Autopilot',
  live: 'Live',
  subtitle: 'FYI only · nothing for you',
  savedToday: 'min saved today',
  sarSaved: 'SAR saved',
  chases: 'chases by you',
  all: 'All',
  followups: 'Follow-ups',
  updates: 'Updates',
  escalations: 'Escalations',
  today: 'Today',
  yesterday: 'Yesterday',
  earlier: 'Earlier',
  empty: 'Nothing here yet. Muntej logs every action it takes for you.',
  thisMonth: 'This month',
  monthValue: '{{h}} h · SAR {{sar}}',
  auto: 'Auto · your rules',
  undoable: 'Undoable',
};

const ar: typeof en = {
  title: 'الطيار الآلي',
  live: 'مباشر',
  subtitle: 'للعلم بس · ما فيه شي عليك',
  savedToday: 'دقيقة وفّرناها اليوم',
  sarSaved: 'ريال وفّرناها',
  chases: 'ملاحقة منك',
  all: 'الكل',
  followups: 'متابعات',
  updates: 'تحديثات',
  escalations: 'تصعيد',
  today: 'اليوم',
  yesterday: 'أمس',
  earlier: 'قبل',
  empty: 'ما فيه شي للحين. منتج يسجّل كل خطوة يسويها عنك.',
  thisMonth: 'هالشهر',
  monthValue: '{{h}} س · {{sar}} ريال',
  auto: 'تلقائي · حسب قواعدك',
  undoable: 'تقدر تتراجع',
};

export const NS = registerStrings('s03', { en, ar });
