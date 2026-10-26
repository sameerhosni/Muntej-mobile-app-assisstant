import { registerStrings } from '@/lib/i18n/register';

// "Next 3 days" on the manager Home (NextDays.tsx).
const en = {
  title: 'Next 3 days',
  seeAll: 'See all {{count}}',
  mayBeLate: 'Might slip: moving a bit slow',
  blocked: 'Stuck: might slip',
};

const ar: typeof en = {
  title: 'الثلاث أيام الجاية',
  seeAll: 'شوف الكل ({{count}})',
  mayBeLate: 'ممكن تتأخر: ماشية على مهلها',
  blocked: 'واقفة: ممكن تتأخر',
};

export const NEXT_DAYS_NS = registerStrings('nextDays', { en, ar });
