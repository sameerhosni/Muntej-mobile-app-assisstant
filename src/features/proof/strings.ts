import { registerStrings } from '@/lib/i18n/register';

// Proof on the task page (ProofSection) + the finishing gate in the bottom bar.
const en = {
  title: 'Proof',
  need_any: 'Needs proof',
  need_file: 'Needs a file',
  need_image: 'Needs a photo',
  need_link: 'Needs a link',
  none: 'Nothing attached yet',
  photo: 'Photo',
  camera: 'Camera',
  file: 'File',
  link: 'Link',
  linkPh: 'Paste the link',
  save: 'Add',
  cancel: 'Cancel',
  adding: 'Adding…',
  failed: 'Couldn’t add it: {{reason}}',
  noPermission: 'Allow Muntej to use photos in your phone settings',
  checked: 'Muntej checked it',
  v_pass: 'Looks complete',
  v_missing: 'Something is missing',
  v_unclear: 'Hard to tell from what’s attached',
  updateApp: 'Photos and files arrive with the next app version; links work now',
};

const ar: typeof en = {
  title: 'الإثبات',
  need_any: 'يحتاج إثبات',
  need_file: 'يحتاج ملف',
  need_image: 'يحتاج صورة',
  need_link: 'يحتاج رابط',
  none: 'ما فيه شي مرفق للحين',
  photo: 'صورة',
  camera: 'كاميرا',
  file: 'ملف',
  link: 'رابط',
  linkPh: 'الصق الرابط',
  save: 'أضف',
  cancel: 'إلغاء',
  adding: 'قاعد أضيفه…',
  failed: 'ما قدرت أضيفه: {{reason}}',
  noPermission: 'اسمح لمنتج يستخدم الصور من إعدادات جوالك',
  checked: 'منتج راجعه',
  v_pass: 'يبان كامل',
  v_missing: 'فيه شي ناقص',
  v_unclear: 'ما يبان من المرفق',
  updateApp: 'الصور والملفات توصل مع النسخة الجاية من التطبيق، والروابط شغالة الحين',
};

export const PROOF_NS = registerStrings('proof', { en, ar });
