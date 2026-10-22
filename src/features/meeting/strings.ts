import { registerStrings } from '@/lib/i18n/register';

// Record a meeting (app/45-record-meeting.tsx): record in the room → written down → Muntej finds the tasks → Incoming.
const en = {
  back: 'Back',
  title: 'Record a meeting',
  sub: 'Put the phone on the table. When you stop, Muntej writes it down and finds who promised what.',
  start: 'Start recording',
  stop: 'Stop & find the tasks',
  cancel: 'Discard',
  recording: 'Recording',
  limit: 'Up to {{min}} minutes',
  writing: 'Writing down the meeting…',
  finding: 'Finding who promised what…',
  found_one: 'Muntej found {{n}} task',
  found_other: 'Muntej found {{n}} tasks',
  foundNone: 'No tasks or promises in this meeting',
  review: 'Review and add them',
  again: 'Record another',
  privacy: 'The recording is deleted from the phone after it is written down. Tell people you are recording.',
  micDenied: 'Allow the microphone for Muntej in your phone settings',
  failed: 'Couldn’t finish: {{reason}}',
  subject: 'Meeting · {{when}}',
};

const ar: typeof en & Record<string, string> = {
  back: 'رجوع',
  title: 'سجّل اجتماع',
  sub: 'حط الجوال على الطاولة. لما توقف، منتج يكتب الاجتماع ويطلع مين وعد بإيش.',
  start: 'ابدأ التسجيل',
  stop: 'وقّف وطلّع المهام',
  cancel: 'تجاهل',
  recording: 'يسجّل',
  limit: 'لين {{min}} دقيقة',
  writing: 'قاعد أكتب الاجتماع…',
  finding: 'قاعد أطلّع مين وعد بإيش…',
  found_one: 'منتج لقى مهمة وحدة',
  found_other: 'منتج لقى {{n}} مهام',
  found_two: 'منتج لقى مهمتين',
  found_few: 'منتج لقى {{n}} مهام',
  found_many: 'منتج لقى {{n}} مهمة',
  foundNone: 'ما فيه مهام ولا وعود في هالاجتماع',
  review: 'راجعها وأضفها',
  again: 'سجّل اجتماع ثاني',
  privacy: 'التسجيل ينحذف من الجوال بعد ما ينكتب. علّم الحاضرين إنك تسجّل.',
  micDenied: 'اسمح لمنتج يستخدم المايك من إعدادات جوالك',
  failed: 'ما قدرت أكمّل: {{reason}}',
  subject: 'اجتماع · {{when}}',
};

export const MEETING_NS = registerStrings('meeting', { en, ar });
