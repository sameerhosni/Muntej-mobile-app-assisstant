import { registerStrings } from '@/lib/i18n/register';

// The forget rate (ForgetCard on Your week, the line on Home's "Muntej is on it").
const en = {
  title: 'Your forget rate',
  body: '{{forgotten}} of {{closed}} tasks you handed off closed without you touching them again',
  target: 'Goal: {{target}}% or more',
  great: 'You said it once and Muntej did the rest',
  low: 'You still step in often. Let Muntej chase, and you only decide',
  none: 'Nothing you handed off has closed yet this period',
  touched: 'Where you still stepped in',
  touches_one: '{{n}} touch',
  touches_other: '{{n}} touches',
  homeLine: 'you forgot {{pct}}% this week',
};

// Arabic has more plural forms (zero, two, few, many) than English: extra keys are allowed here
const ar: typeof en & Record<string, string> = {
  title: 'نسبة النسيان',
  body: '{{forgotten}} من {{closed}} مهام سلّمتها انقفلت بدون ما ترجع لها',
  target: 'الهدف: {{target}}٪ أو أكثر',
  great: 'قلتها مرة وحدة ومنتج كمّل الباقي',
  low: 'للحين ترجع للمهام كثير. خل منتج يلاحق وأنت بس قرّر',
  none: 'ما انقفلت ولا مهمة سلّمتها في هالفترة',
  touched: 'وين رجعت تتدخل',
  touches_one: 'تدخّل {{n}}',
  touches_other: '{{n}} تدخلات',
  touches_two: 'تدخلين',
  touches_few: '{{n}} تدخلات',
  touches_many: '{{n}} تدخل',
  homeLine: 'نسيت {{pct}}٪ هالأسبوع',
};

export const FORGET_NS = registerStrings('forget', { en, ar });
