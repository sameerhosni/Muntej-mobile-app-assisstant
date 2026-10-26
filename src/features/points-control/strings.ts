import { registerStrings } from '@/lib/i18n/register';

const en = {
  back: 'Back',
  title: 'Team points',
  subtitle: 'Set it once · I hand them out',
  budget: '{{month}} budget',
  budgetOf: '/ {{total}}',
  budgetSar: 'SAR {{sar}}',
  budgetHours: '~{{h}} h on-time work',
  rules: {
    ontime: 'On time',
    early: 'Early bonus',
    proof: 'Proof attached',
    star: '5-star review',
    help: 'Helped teammate',
  },
  ptsPlus: '+{{n}}',
  ptsLess: 'Fewer points for {{name}}',
  ptsMore: 'More points for {{name}}',
  rulesHint: 'Tap the points to change them',
  requests: 'Reward requests',
  reqs: {
    early: 'Leave 1 h early',
    coffee: 'Coffee on Muntej',
  },
  cost: '{{n}} pts',
  sar: '≈ SAR {{n}}',
  approve: 'Approve',
  approved: 'Approved ✓',
  fairTitle: '{{name}} · 0 kudos',
  fairSub: '{{n}} tasks done · 30 days',
  sendKudos: 'Send kudos',
};

const ar: typeof en = {
  back: 'رجوع',
  title: 'نقاط الفريق',
  subtitle: 'تضبطها مرة · وأنا أوزّعها',
  budget: 'ميزانية {{month}}',
  budgetOf: '/ {{total}}',
  budgetSar: '{{sar}} ريال',
  budgetHours: '{{h}} ساعة شغل بوقته',
  rules: {
    ontime: 'بوقتها',
    early: 'بونص التبكير',
    proof: 'أرفق إثبات',
    star: 'تقييم 5 نجوم',
    help: 'ساعد زميله',
  },
  ptsPlus: '+{{n}}',
  ptsLess: 'نقاط أقل لـ {{name}}',
  ptsMore: 'نقاط أكثر لـ {{name}}',
  rulesHint: 'اضغط على النقاط عشان تغيّرها',
  requests: 'طلبات المكافآت',
  reqs: {
    early: 'تطلع قبل بساعة',
    coffee: 'قهوة على حساب منتج',
  },
  cost: '{{n}} نقطة',
  sar: '≈ {{n}} ريال',
  approve: 'وافق',
  approved: 'وافقت ✓',
  fairTitle: '{{name}} · ولا شكر',
  fairSub: 'خلّص {{n}} مهام · آخر 30 يوم',
  sendKudos: 'اشكره',
};

export const NS = registerStrings('s27', { en, ar });
