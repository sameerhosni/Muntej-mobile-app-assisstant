// Strings for support chat with the Muntej team (Intercom), from Saree3's menu, Settings and My profile.
import { registerStrings } from '@/lib/i18n/register';

const en = {
  talk: 'Talk to the Muntej team',
  talkSub: 'Question, idea or problem? A real human answers, promise',
  back: 'Back',
  failed: 'I couldn’t open the chat 😕 Check your internet and try again.',
  retry: 'Try again',
  unread_one: '{{count}} new reply from the team',
  unread_other: '{{count}} new replies from the team',
};
const ar: typeof en & Record<string, string> = {
  talk: 'كلّم فريق منتج',
  talkSub: 'سؤال، فكرة أو مشكلة؟ يرد عليك إنسان حقيقي، وعد',
  back: 'رجوع',
  failed: 'ما قدرت أفتح المحادثة 😕 شيّك على النت وجرّب مرة ثانية.',
  retry: 'جرّب مرة ثانية',
  unread_one: 'رد جديد من الفريق',
  unread_two: 'ردّين جدد من الفريق',
  unread_few: '{{count}} ردود جديدة من الفريق',
  unread_many: '{{count}} رد جديد من الفريق',
  unread_other: '{{count}} رد جديد من الفريق',
};
export const SUPPORT_NS = registerStrings('support', { en, ar });
