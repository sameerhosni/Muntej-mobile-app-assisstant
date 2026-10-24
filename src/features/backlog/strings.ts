import { registerStrings } from '@/lib/i18n/register';

// Super admin's Backlog (app/49-backlog.tsx + its Settings row). The items themselves are English (docs/BACKLOG.md).
const en = {
  title: 'Backlog',
  back: 'Back',
  sub_one: '{{n}} thing not finished yet · updated {{date}}',
  sub_other: '{{n}} things not finished yet · updated {{date}}',
  settingsRow: 'Backlog',
  settingsSub: 'Everything not finished yet: setup, builds, testing, ideas',
  designRow: 'System design',
  designSub: 'HLD + LLD, the full design image and the integration API (PDF)',
};

const ar: typeof en & Record<string, string> = {
  title: 'المتبقي',
  back: 'رجوع',
  sub_one: 'شي واحد ما خلص للحين · آخر تحديث {{date}}',
  sub_other: '{{n}} شي ما خلص للحين · آخر تحديث {{date}}',
  settingsRow: 'المتبقي (Backlog)',
  settingsSub: 'كل شي ما خلص للحين: إعدادات، بناء، اختبار، أفكار',
  designRow: 'تصميم النظام',
  designSub: 'HLD + LLD، صورة التصميم كامل، وواجهة الربط (PDF)',
};

export const BACKLOG_NS = registerStrings('backlog', { en, ar });
