import { registerStrings } from '@/lib/i18n/register';

// "Next 3 days" on the manager Home (NextDays.tsx).
const en = {
  title: 'Next 3 days',
  seeAll: 'See all {{count}}',
  mayBeLate: 'May be late: not moving fast enough yet',
  blocked: 'Blocked: may be late',
};

const ar: typeof en = {
  title: 'الأيام الثلاث الجاية',
  seeAll: 'شوف الكل ({{count}})',
  mayBeLate: 'ممكن تتأخر: ماشية ببطء',
  blocked: 'واقفة: ممكن تتأخر',
};

export const NEXT_DAYS_NS = registerStrings('nextDays', { en, ar });
