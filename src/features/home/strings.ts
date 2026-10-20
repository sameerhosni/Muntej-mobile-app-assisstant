import { registerStrings } from '@/lib/i18n/register';

const en = {
  energyTitle: 'Team energy this week',
  pointsSettings: 'Points settings',
  energySub: 'pts earned · {{count}} on a streak',
  didGreat: '{{a}} & {{b}} did great',
  recognize: 'Recognize',
  // simple Home: "Needs you" + shortcuts
  needsYou: 'Needs you',
  seeAll: 'See all ({{count}})',
  nothingNeeds: 'Nothing needs you right now. Muntej has it 😎',
  ny_decision: 'Decision waiting',
  ny_review: '{{name}} finished it · waiting for your review',
  ny_late: '{{name}} · was due {{when}}',
  ny_lateNoOwner: 'Unassigned · was due {{when}}',
  sc_week: 'Your week',
  sc_team: 'Team',
  sc_objectives: 'Objectives',
  sc_autopilot: 'Autopilot',
  sc_rewards: 'Rewards',
  sc_quest: 'Team quest',
  progressA11y: 'Level {{level}}, {{streak}}-day streak, {{pts}} points. Open rewards',
};

const ar: typeof en = {
  energyTitle: 'حماس الفريق هالأسبوع',
  pointsSettings: 'إعدادات النقاط',
  energySub: 'نقطة · {{count}} مستمرين',
  didGreat: '{{a}} و{{b}} أبدعوا',
  recognize: 'كافئهم',
  needsYou: 'يحتاجك',
  seeAll: 'شوف الكل ({{count}})',
  nothingNeeds: 'ما فيه شي يحتاجك الحين. منتج ماسك الأمور 😎',
  ny_decision: 'قرار ينتظرك',
  ny_review: '{{name}} خلّصها · تنتظر مراجعتك',
  ny_late: '{{name}} · كانت {{when}}',
  ny_lateNoOwner: 'بدون مسؤول · كانت {{when}}',
  sc_week: 'أسبوعك',
  sc_team: 'الفريق',
  sc_objectives: 'الأهداف',
  sc_autopilot: 'الطيار الآلي',
  sc_rewards: 'المكافآت',
  sc_quest: 'تحدي الفريق',
  progressA11y: 'المستوى {{level}}، {{streak}} يوم متواصل، {{pts}} نقطة. افتح المكافآت',
};

export const NS = registerStrings('s01', { en, ar });
