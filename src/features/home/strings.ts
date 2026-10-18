import { registerStrings } from '@/lib/i18n/register';

const en = {
  energyTitle: 'Team energy this week',
  pointsSettings: 'Points settings',
  energySub: 'pts earned · {{count}} on a streak',
  didGreat: '{{a}} & {{b}} did great',
  recognize: 'Recognize',
};

const ar: typeof en = {
  energyTitle: 'حماس الفريق هالأسبوع',
  pointsSettings: 'إعدادات النقاط',
  energySub: 'نقطة · {{count}} مستمرين',
  didGreat: '{{a}} و{{b}} أبدعوا',
  recognize: 'كافئهم',
};

export const NS = registerStrings('s01', { en, ar });
