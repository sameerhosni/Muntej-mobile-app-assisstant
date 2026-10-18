// Demo people for prototype screens that have no backend yet. Mirrors supabase/seed.sql.
import type { GradientToken } from '@/theme/tokens';

export type DemoPerson = {
  id: string;
  name: string;
  nameAr: string;
  role: 'manager' | 'employee';
  title: string;
  titleAr: string;
  gradient: GradientToken;
};

export const DEMO_TEAM: DemoPerson[] = [
  { id: 'ahmed', name: 'Ahmed', nameAr: 'أحمد', role: 'manager', title: 'Head of Business', titleAr: 'رئيس قطاع الأعمال', gradient: 'avatarOrange' },
  { id: 'faisal', name: 'Faisal', nameAr: 'فيصل', role: 'employee', title: 'Account Manager', titleAr: 'مدير حسابات', gradient: 'avatarBlue' },
  { id: 'abdullah', name: 'Abdullah', nameAr: 'عبدالله', role: 'employee', title: 'Financial Analyst', titleAr: 'محلل مالي', gradient: 'avatarPurple' },
  { id: 'noura', name: 'Noura', nameAr: 'نورة', role: 'employee', title: 'Marketing Lead', titleAr: 'قائدة التسويق', gradient: 'avatarOrange' },
  { id: 'khalid', name: 'Khalid', nameAr: 'خالد', role: 'employee', title: 'Product Manager', titleAr: 'مدير منتج', gradient: 'avatarGreen' },
  { id: 'saad', name: 'Saad', nameAr: 'سعد', role: 'employee', title: 'Software Engineer', titleAr: 'مهندس برمجيات', gradient: 'avatarOrange' },
  { id: 'maha', name: 'Maha', nameAr: 'مها', role: 'employee', title: 'UX Designer', titleAr: 'مصممة تجربة المستخدم', gradient: 'avatarPurple' },
];

export function person(id: string): DemoPerson {
  return DEMO_TEAM.find((p) => p.id === id) ?? DEMO_TEAM[0];
}

export function personLabel(p: DemoPerson, lang: string) {
  return lang === 'ar' ? p.nameAr : p.name;
}
