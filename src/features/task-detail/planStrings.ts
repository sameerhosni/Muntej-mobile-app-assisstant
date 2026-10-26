import { registerStrings } from '@/lib/i18n/register';

// Muntej's plan + in-context help on the task page (PlanAndHelp.tsx).
const en = {
  plan: 'My plan for it',
  planSub: 'You don’t chase. I do',
  sentAt: 'Sent {{when}}',
  whoTitle: 'Who should take it?',
  whoSub: 'See who has time before you move it',
  busyTitle: 'Too busy for this?',
  busySub: 'I’ll ask {{name}} what can wait',
};

const ar: typeof en = {
  plan: 'خطتي لها',
  planSub: 'لا تلاحق، خلّها عليّ',
  sentAt: 'انرسلت {{when}}',
  whoTitle: 'مين ياخذها؟',
  whoSub: 'شوف مين فاضي قبل ما تنقلها',
  busyTitle: 'مشغول عنها؟',
  busySub: 'خلني أسأل {{name}} وش يقدر يتأجل',
};

export const PLAN_NS = registerStrings('taskPlan', { en, ar });
