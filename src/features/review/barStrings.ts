import { registerStrings } from '@/lib/i18n/register';

// The task page's bottom bar for reviews + the countdown everywhere it shows (ReviewBar, Review screen, Home).
const en = {
  sendForReview: 'Send for review',
  markDone: 'Mark done',
  approve: 'Approve',
  sendBack: 'Send back',
  changeWithMuntej: 'Change with Muntej',
  waitingFor: 'Waiting for {{name}}’s approval',
  waitingForYou: '{{name}} finished this. Your call',
  autoIn: 'Muntej approves it by itself in {{left}}',
  autoAt: '{{left}} · {{when}}',
  autoNow: 'Muntej is approving it now',
  autoShort: 'Auto in {{left}}',
  left_dh: '{{d}}d {{h}}h',
  left_hm: '{{h}}h {{m}}m',
  left_m: '{{m}}m',
  sent: 'Sent for review ✓',
  closed: 'Done ✓',
  approved: 'Approved ✓',
  failed: 'Couldn’t save: {{reason}}',
  yourManager: 'your manager',
};

const ar: typeof en = {
  sendForReview: 'أرسلها للمراجعة',
  markDone: 'خلصت',
  approve: 'اعتمد',
  sendBack: 'رجّعها',
  changeWithMuntej: 'غيّرها مع منتج',
  waitingFor: 'تنتظر اعتماد {{name}}',
  waitingForYou: '{{name}} خلّصها. القرار لك',
  autoIn: 'منتج يعتمدها بنفسه بعد {{left}}',
  autoAt: '{{left}} · {{when}}',
  autoNow: 'منتج يعتمدها الحين',
  autoShort: 'تلقائي بعد {{left}}',
  left_dh: '{{d}} يوم و{{h}} س',
  left_hm: '{{h}} س و{{m}} د',
  left_m: '{{m}} د',
  sent: 'انرسلت للمراجعة ✓',
  closed: 'خلصت ✓',
  approved: 'اعتمدتها ✓',
  failed: 'ما قدرت أحفظ: {{reason}}',
  yourManager: 'مديرك',
};

export const REVIEW_BAR_NS = registerStrings('reviewBar', { en, ar });
