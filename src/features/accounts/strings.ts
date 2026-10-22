import { registerStrings } from '@/lib/i18n/register';

// Accounts: "not invited yet", the account name in Settings, and the super admin's switcher.
const en = {
  notInvitedTitle: 'You’re not invited yet',
  notInvitedBody: 'Muntej works by invitation. Ask your company’s admin to add {{email}}, then sign in again.',
  signOut: 'Sign out',
  account: 'Account',
  accounts: 'Accounts',
  switchHint: 'Tap an account to work in it',
  people_one: '{{n}} person',
  people_other: '{{n}} people',
  viewing: 'Viewing {{name}}',
  viewingOnly: 'You’re looking as super admin',
  backHome: 'Back to my account',
  current: 'Current',
  switchFailed: 'Couldn’t switch: {{reason}}',
};

const ar: typeof en & Record<string, string> = {
  notInvitedTitle: 'للحين ما انضفت',
  notInvitedBody: 'منتج بالدعوة. اطلب من مسؤول شركتك يضيف {{email}}، وبعدين سجّل دخول مرة ثانية.',
  signOut: 'تسجيل خروج',
  account: 'الحساب',
  accounts: 'الحسابات',
  switchHint: 'اضغط على حساب عشان تشتغل فيه',
  people_one: 'شخص واحد',
  people_other: '{{n}} أشخاص',
  people_two: 'شخصين',
  people_few: '{{n}} أشخاص',
  people_many: '{{n}} شخص',
  viewing: 'تشوف {{name}}',
  viewingOnly: 'داخل كمسؤول عام',
  backHome: 'رجوع لحسابي',
  current: 'الحالي',
  switchFailed: 'ما قدرت أبدّل: {{reason}}',
};

export const ACCOUNTS_NS = registerStrings('accounts', { en, ar });
