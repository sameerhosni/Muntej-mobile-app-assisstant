import { registerStrings } from '@/lib/i18n/register';

const en = {
  recordingLength: 'Recording length {{time}}',
  pointsValue: '+{{n}} pts',
  pointsEarly: '+{{n}} if early',
};

const ar: typeof en = {
  recordingLength: 'مدة التسجيل {{time}}',
  pointsValue: '+{{n}} نقطة',
  pointsEarly: '+{{n}} لو بدري',
};

export const NS = registerStrings('s02', { en, ar });
