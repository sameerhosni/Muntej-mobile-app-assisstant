import { registerStrings } from '@/lib/i18n/register';

// Inviting people by email (app/48-invite.tsx) and the WhatsApp / any-app message that goes with it. No codes: the
// email decides the team.
const en = {
  title: 'Invite your team',
  back: 'Back',
  byEmail: 'Add them by email',
  byEmailHint: 'They get an invitation email and just sign in with it. Muntej knows they’re in your team, no code needed.',
  inviteGo: 'Invite',
  emailSent: '✓ Invitation sent to {{email}}',
  emailTaken: 'This email is already in your team.',
  tellThem: 'The email may land in spam: tell them on WhatsApp too.',
  whatsapp: 'WhatsApp',
  share: 'Other apps',
  messageEmail:
    'Hi! 👋 {{inviter}} added you to {{company}} on Muntej, the assistant that follows up on work for the team.\n1) Download the app: {{link}}\n2) Sign in with your email: {{email}}\nThat’s it, you’re in 🚀',
  failed: 'Something went wrong. Try again.',
};

const ar: typeof en & Record<string, string> = {
  title: 'ادعُ فريقك',
  back: 'رجوع',
  byEmail: 'أضفه بالإيميل',
  byEmailHint: 'يوصله إيميل دعوة ويسجّل دخول فيه على طول. منتج يعرف إنه في فريقك، بدون أي رمز.',
  inviteGo: 'ادعُه',
  emailSent: '✓ انرسلت الدعوة لـ {{email}}',
  emailTaken: 'هالإيميل موجود في فريقك.',
  tellThem: 'الإيميل ممكن يروح للسبام: بلّغه على الواتساب بعد.',
  whatsapp: 'واتساب',
  share: 'تطبيق ثاني',
  messageEmail:
    'هلا! 👋 {{inviter}} أضافك لفريق {{company}} على منتج، المساعد اللي يتابع الشغل بدال الفريق.\n١) حمّل التطبيق: {{link}}\n٢) سجّل دخول بإيميلك: {{email}}\nوخلاص، أنت معنا 🚀',
  failed: 'صار خطأ. جرّب مرة ثانية.',
};

export const INVITE_NS = registerStrings('invite', { en, ar });
