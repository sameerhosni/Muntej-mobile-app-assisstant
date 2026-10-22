import { registerStrings } from '@/lib/i18n/register';

// Inviting people (app/48-invite.tsx: by email, or with the team code), the shared message, and the optional code
// on the sign-in screen.
const en = {
  title: 'Invite your team',
  back: 'Back',
  // 1. by email
  byEmail: 'Add them by email',
  byEmailHint: 'They get an invitation email and just sign in with it. Muntej knows they’re in your team, no code needed.',
  inviteGo: 'Invite',
  emailSent: '✓ Invitation sent to {{email}}',
  emailTaken: 'This email is already in your team.',
  // 2. the team code
  byCode: 'Or share your team code',
  byCodeHint: 'For people whose email you don’t have. Whoever signs in with it joins {{company}}, in your team.',
  validUntil: 'Valid until {{date}}',
  used_one: 'used once',
  used_other: 'used {{count}} times',
  copy: 'Copy',
  copied: 'Copied ✓',
  edit: 'Choose my own code',
  save: 'Save',
  cancel: 'Cancel',
  codeSaved: 'Done ✓ Your team code is ready (valid 30 days).',
  codeTaken: 'Someone already uses this code. Try another.',
  codeFormat: '6 to 12 letters or numbers, please (not starting with MNT).',
  renew: 'New code',
  renewed: 'Done. The old code no longer works.',
  whatsapp: 'WhatsApp',
  share: 'Other apps',
  // the message people receive ({{name}} has a leading space when given)
  message:
    'Hi{{name}}! 👋 {{inviter}} invites you to join {{company}} on Muntej, the assistant that follows up on work for the team.\n1) Download the app: {{link}}\n2) Sign in with your email\n3) Enter the invite code: {{code}}\nThat’s it, you’re in 🚀',
  failed: 'Something went wrong. Try again.',
  // sign-in
  haveCode: 'I have an invite code',
  codeLabel: 'Invite code',
  joinPh: 'MNT-XXXXXX',
};

const ar: typeof en & Record<string, string> = {
  title: 'ادعُ فريقك',
  back: 'رجوع',
  byEmail: 'أضفه بالإيميل',
  byEmailHint: 'يوصله إيميل دعوة ويسجّل دخول فيه على طول. منتج يعرف إنه في فريقك، بدون أي رمز.',
  inviteGo: 'ادعُه',
  emailSent: '✓ انرسلت الدعوة لـ {{email}}',
  emailTaken: 'هالإيميل موجود في فريقك.',
  byCode: 'أو شارك رمز فريقك',
  byCodeHint: 'للي ما عندك إيميله. اللي يسجّل فيه يدخل {{company}} في فريقك على طول.',
  validUntil: 'صالح لين {{date}}',
  used_one: 'استُخدم مرة',
  used_other: 'استُخدم {{count}} مرات',
  used_two: 'استُخدم مرتين',
  used_few: 'استُخدم {{count}} مرات',
  used_many: 'استُخدم {{count}} مرة',
  copy: 'نسخ',
  copied: 'انسخ ✓',
  edit: 'اختر رمزك بنفسك',
  save: 'حفظ',
  cancel: 'إلغاء',
  codeSaved: 'تم ✓ رمز فريقك جاهز (صالح ٣٠ يوم).',
  codeTaken: 'هالرمز مستخدم. جرّب غيره.',
  codeFormat: 'من ٦ إلى ١٢ حرف أو رقم (وما يبدأ بـ MNT).',
  renew: 'رمز جديد',
  renewed: 'تم. الرمز القديم ما عاد يشتغل.',
  whatsapp: 'واتساب',
  share: 'تطبيق ثاني',
  message:
    'هلا{{name}}! 👋 {{inviter}} يدعوك تنضم لفريق {{company}} على منتج، المساعد اللي يتابع الشغل بدال الفريق.\n١) حمّل التطبيق: {{link}}\n٢) سجّل دخول بإيميلك\n٣) اكتب رمز الدعوة: {{code}}\nوخلاص، أنت معنا 🚀',
  failed: 'صار خطأ. جرّب مرة ثانية.',
  haveCode: 'عندي رمز دعوة',
  codeLabel: 'رمز الدعوة',
  joinPh: 'MNT-XXXXXX',
};

export const INVITE_NS = registerStrings('invite', { en, ar });
