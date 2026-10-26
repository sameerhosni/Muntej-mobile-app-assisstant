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
  remindedNow: 'I just nudged {{name}}',
  remindedAt: 'I nudged {{name}} at {{time}}',
  checkedNow: 'I asked {{name}} what’s holding it up',
  checkedAt: 'I checked in with {{name}} at {{time}}',
  moveTo: 'Move to {{name}} · {{hours}}h free',
  moreDays: '+2 days (till {{day}})',
  fixed: 'Sorted: {{what}}',
  doAll: 'Do all ({{count}})',
  failed: 'That didn’t work on my side: {{reason}}',
};

const ar: typeof en = {
  s_late: 'متأخرة',
  s_blocked: 'واقفة',
  s_overloaded: 'محمّل',
  s_at_risk: 'ممكن تتأخر',
  s_unassigned: 'بدون مسؤول',
  s_on_track: 'ماشي تمام',
  s_star: 'نجم',
  nobody: 'بدون مسؤول',
  remindedNow: 'ذكّرت {{name}} توّني',
  remindedAt: 'ذكّرت {{name}} الساعة {{time}}',
  checkedNow: 'سألت {{name}} وش اللي موقفها',
  checkedAt: 'سألت {{name}} الساعة {{time}}',
  moveTo: 'انقلها لـ{{name}} · فاضي {{hours}} ساعة',
  moreDays: '+يومين (لين {{day}})',
  fixed: 'تمام ✓ {{what}}',
  doAll: 'سوّها كلها ({{count}})',
  failed: 'ما ضبطت معي: {{reason}}',
};

export const BRIEF_NS = registerStrings('chatBrief', { en, ar });
