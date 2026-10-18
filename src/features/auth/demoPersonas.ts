// Demo personas (dev builds only). Phones are Supabase Auth test numbers with a fixed code,
// configured in the project's auth settings — no SMS is ever sent for them.
export const DEMO_CODE = '123456';

export type DemoPersona = {
  phone: string; // E.164
  name: string;
  nameAr: string;
  role: 'manager' | 'employee';
};

export const DEMO_PERSONAS: DemoPersona[] = [
  { phone: '+966500000001', name: 'Ahmed', nameAr: 'أحمد', role: 'manager' },
  { phone: '+966500000002', name: 'Faisal', nameAr: 'فيصل', role: 'employee' },
  { phone: '+966500000003', name: 'Abdullah', nameAr: 'عبدالله', role: 'employee' },
  { phone: '+966500000004', name: 'Noura', nameAr: 'نورة', role: 'employee' },
  { phone: '+966500000005', name: 'Khalid', nameAr: 'خالد', role: 'employee' },
  { phone: '+966500000006', name: 'Saad', nameAr: 'سعد', role: 'employee' },
  { phone: '+966500000007', name: 'Maha', nameAr: 'مها', role: 'employee' },
];

export function isDemoPhone(phone: string): boolean {
  return DEMO_PERSONAS.some((p) => p.phone === phone);
}
