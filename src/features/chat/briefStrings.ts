import { registerStrings } from '@/lib/i18n/register';

// The table answer in the chat (BriefCard).
const en = {
  s_late: 'Late',
  s_blocked: 'Blocked',
  s_overloaded: 'Overloaded',
  s_at_risk: 'At risk',
  s_unassigned: 'No owner',
  s_on_track: 'On track',
  s_star: 'Star',
  nobody: 'Unassigned',
  remindedNow: 'Muntej reminded {{name}} just now',
  remindedAt: 'Muntej reminded {{name}} at {{time}}',
  checkedNow: 'Muntej asked {{name}} what’s blocking it',
  checkedAt: 'Muntej asked {{name}} at {{time}}',
  moveTo: 'Move to {{name}} · {{hours}}h free',
  moreDays: '+2 days (till {{day}})',
  fixed: 'Done: {{what}}',
  doAll: 'Do all ({{count}})',
  failed: 'Couldn’t do it: {{reason}}',
};

const ar: typeof en = {
  s_late: 'متأخرة',
  s_blocked: 'واقفة',
  s_overloaded: 'محمّل',
  s_at_risk: 'ممكن تتأخر',
  s_unassigned: 'بدون مسؤول',
  s_on_track: 'ماشي تمام',
  s_star: 'مميّز',
  nobody: 'بدون مسؤول',
  remindedNow: 'منتج ذكّر {{name}} الحين',
  remindedAt: 'منتج ذكّر {{name}} الساعة {{time}}',
  checkedNow: 'منتج سأل {{name}} وش اللي موقفها',
  checkedAt: 'منتج سأل {{name}} الساعة {{time}}',
  moveTo: 'انقلها لـ{{name}} · فاضي {{hours}} ساعة',
  moreDays: '+يومين (لين {{day}})',
  fixed: 'تم: {{what}}',
  doAll: 'سوّها كلها ({{count}})',
  failed: 'ما قدرت: {{reason}}',
};

export const BRIEF_NS = registerStrings('chatBrief', { en, ar });
