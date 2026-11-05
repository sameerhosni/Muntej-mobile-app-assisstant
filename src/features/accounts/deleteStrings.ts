import { registerStrings } from '@/lib/i18n/register';

// Settings → Delete my account (DeleteAccount.tsx).
const en = {
  row: 'Delete my account',
  title: 'Delete your Muntej account?',
  body: 'Your login is removed and you leave every company account you’re in. Your tasks and their history stay with your team. This can’t be undone.',
  adminNote: 'You’re an admin: if nobody else is, the next person on your team becomes admin and takes over your direct reports.',
  keep: 'Keep it',
  confirm: 'Delete',
  failed: 'Couldn’t delete it. Check your connection and try again.',
};

const ar: typeof en = {
  row: 'احذف حسابي',
  title: 'تحذف حسابك في منتج؟',
  body: 'ينحذف دخولك وتطلع من كل حسابات الشركات اللي أنت فيها. مهامك وتاريخها تبقى عند فريقك. ما ينفع التراجع.',
  adminNote: 'أنت مدير الحساب: إذا ما فيه مدير حساب غيرك، بيصير الشخص التالي في فريقك مدير الحساب ويستلم اللي تحتك.',
  keep: 'خلّه',
  confirm: 'احذف',
  failed: 'ما قدرت أحذفه. تأكد من النت وجرّب مرة ثانية.',
};

export const DELETE_NS = registerStrings('deleteAccount', { en, ar });
