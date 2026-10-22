import { registerStrings } from '@/lib/i18n/register';

// Muntej's plan + in-context help on the task page (PlanAndHelp.tsx).
const en = {
  plan: "Muntej's plan",
  planSub: 'No need to chase',
  sentAt: 'Sent {{when}}',
  whoTitle: 'Who should take it?',
  whoSub: 'See who has time before you move it',
  busyTitle: 'Too busy for this?',
  busySub: 'Let Muntej ask {{name}} what to move',
};

const ar: typeof en = {
  plan: 'خطة منتج',
  planSub: 'ما تحتاج تلاحق',
  sentAt: 'انرسلت {{when}}',
  whoTitle: 'مين ياخذها؟',
  whoSub: 'شوف مين فاضي قبل ما تنقلها',
  busyTitle: 'مشغول عنها؟',
  busySub: 'خل منتج يسأل {{name}} وش يتأجل',
};

export const PLAN_NS = registerStrings('taskPlan', { en, ar });
