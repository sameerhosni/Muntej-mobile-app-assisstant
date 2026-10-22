import { registerStrings } from '@/lib/i18n/register';

// Inviting people with a code (app/48-invite.tsx), joining with one (sign-in + the same screen), the shared message.
const en = {
  title: 'Invite your team',
  titleJoin: 'Join a team',
  back: 'Back',
  saree3: 'Share this code. Whoever joins with it lands in {{company}}, in your team. No forms, no waiting 😉',
  validUntil: 'Valid until {{date}}',
  used_one: 'used once',
  used_other: 'used {{count}} times',
  whatsapp: 'WhatsApp',
  email: 'Email',
  share: 'Other apps',
  copy: 'Copy',
  copied: 'Copied ✓',
  renew: 'Cancel this code and make a new one',
  renewed: 'Done. The old code no longer works.',
  aiHint: 'Or just tell me in the chat: “Invite Faisal on WhatsApp 0555…” and I’ll get the message ready.',
  emailSubject: 'Join {{company}} on Muntej',
  // the message people receive ({{name}} has a leading space when given)
  message:
    'Hi{{name}}! 👋 {{inviter}} invites you to join {{company}} on Muntej, the assistant that follows up on work for the team.\n1) Download the app: {{link}}\n2) Sign in with your email\n3) Enter the invite code: {{code}}\nThat’s it, you’re in 🚀',
  // join
  joinTitle: 'Got a code from another team?',
  joinHint: 'Enter it and you join that team too. You can switch between teams any time.',
  joinPh: 'MNT-XXXXXX',
  joinGo: 'Join',
  joined: 'Welcome to {{company}} 🎉 You’re in.',
  already: 'You’re already in {{company}}. I switched you to it.',
  invalid: 'That code doesn’t work. It may have expired or been cancelled. Ask for a new one.',
  tooMany: 'Too many tries. Wait a little and try again.',
  failed: 'Something went wrong. Try again.',
  // sign-in
  haveCode: 'I have an invite code',
  codeLabel: 'Invite code',
  // More tile
};

const ar: typeof en & Record<string, string> = {
  title: 'ادعُ فريقك',
  titleJoin: 'انضم لفريق',
  back: 'رجوع',
  saree3: 'شارك هالرمز. اللي ينضم فيه يدخل {{company}} على طول، في فريقك. لا نماذج ولا انتظار 😉',
  validUntil: 'صالح لين {{date}}',
  used_one: 'استُخدم مرة',
  used_other: 'استُخدم {{count}} مرات',
  used_two: 'استُخدم مرتين',
  used_few: 'استُخدم {{count}} مرات',
  used_many: 'استُخدم {{count}} مرة',
  whatsapp: 'واتساب',
  email: 'إيميل',
  share: 'تطبيق ثاني',
  copy: 'نسخ',
  copied: 'انسخ ✓',
  renew: 'ألغِ هالرمز وسوّ واحد جديد',
  renewed: 'تم. الرمز القديم ما عاد يشتغل.',
  aiHint: 'أو قول لي في المحادثة: «ادعُ فيصل على الواتساب 0555…» وأجهّز لك الرسالة.',
  emailSubject: 'انضم لـ {{company}} على منتج',
  message:
    'هلا{{name}}! 👋 {{inviter}} يدعوك تنضم لفريق {{company}} على منتج، المساعد اللي يتابع الشغل بدال الفريق.\n١) حمّل التطبيق: {{link}}\n٢) سجّل دخول بإيميلك\n٣) اكتب رمز الدعوة: {{code}}\nوخلاص، أنت معنا 🚀',
  joinTitle: 'عندك رمز من فريق ثاني؟',
  joinHint: 'اكتبه وتنضم لهالفريق بعد. وتقدر تتنقل بين الفرق أي وقت.',
  joinPh: 'MNT-XXXXXX',
  joinGo: 'انضم',
  joined: 'حيّاك في {{company}} 🎉 صرت معهم.',
  already: 'أنت أصلاً في {{company}}. نقلتك له.',
  invalid: 'هالرمز ما يشتغل. يمكن انتهى أو انلغى. اطلب واحد جديد.',
  tooMany: 'محاولات كثيرة. انتظر شوي وجرّب مرة ثانية.',
  failed: 'صار خطأ. جرّب مرة ثانية.',
  haveCode: 'عندي رمز دعوة',
  codeLabel: 'رمز الدعوة',
};

export const INVITE_NS = registerStrings('invite', { en, ar });
