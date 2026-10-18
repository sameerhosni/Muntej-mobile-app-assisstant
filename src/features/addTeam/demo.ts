// Demo data for Screen 34 until the staff-list OCR (Edge Function) and contacts picker exist.
// Parsed list mirrors the seed team (supabase/seed.sql); Maha's number needs a check.
import type { GradientToken } from '@/theme/tokens';

export type ParsedPerson = {
  id: string;
  name: string;
  nameAr: string;
  role: string;
  roleAr: string;
  /** Masked number as read from the photo; null = couldn't read it. */
  phone: string | null;
  gradient: GradientToken;
};

export const PARSED_STAFF: ParsedPerson[] = [
  { id: 'faisal', name: 'Faisal Shaheen', nameAr: 'فيصل شاهين', role: 'Sales', roleAr: 'مبيعات', phone: '05x xxx 4412', gradient: 'avatarBlue' },
  { id: 'abdullah', name: 'Abdullah Al-Qahtani', nameAr: 'عبدالله القحطاني', role: 'Finance', roleAr: 'مالية', phone: '05x xxx 9031', gradient: 'avatarPurple' },
  { id: 'noura', name: 'Noura Al-Harbi', nameAr: 'نورة الحربي', role: 'Design', roleAr: 'تصميم', phone: '05x xxx 7720', gradient: 'avatarOrange' },
  { id: 'khalid', name: 'Khalid Al-Dosari', nameAr: 'خالد الدوسري', role: 'Operations', roleAr: 'عمليات', phone: '05x xxx 1186', gradient: 'avatarGreen' },
  { id: 'saad', name: 'Saad Al-Mutairi', nameAr: 'سعد المطيري', role: 'Mobile dev', roleAr: 'تطوير جوال', phone: '05x xxx 5503', gradient: 'avatarOrange' },
  { id: 'maha', name: 'Maha Al-Shehri', nameAr: 'مها الشهري', role: 'Marketing', roleAr: 'تسويق', phone: null, gradient: 'avatarGreen' },
];

/** "Top work contacts" for the contacts picker (demo). */
export const DEMO_CONTACTS: ParsedPerson[] = [
  { id: 'huda', name: 'Huda Al-Otaibi', nameAr: 'هدى العتيبي', role: 'HR', roleAr: 'موارد بشرية', phone: '05x xxx 2208', gradient: 'avatarPurple' },
  { id: 'turki', name: 'Turki Al-Zahrani', nameAr: 'تركي الزهراني', role: 'Sales', roleAr: 'مبيعات', phone: '05x xxx 6614', gradient: 'avatarBlue' },
  { id: 'reem', name: 'Reem Al-Ghamdi', nameAr: 'ريم الغامدي', role: 'Finance', roleAr: 'مالية', phone: '05x xxx 3397', gradient: 'avatarOrange' },
  { id: 'omar', name: 'Omar Al-Harthi', nameAr: 'عمر الحارثي', role: 'Operations', roleAr: 'عمليات', phone: '05x xxx 8045', gradient: 'avatarGreen' },
];

export const JOIN_LINK = 'muntej.app/join/ahmed';
