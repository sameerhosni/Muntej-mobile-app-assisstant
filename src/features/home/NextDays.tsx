// "Next 3 days" on the manager Home: the most important open work (the team's and your own) due within the next
// 3 working days (Sun–Thu, Riyadh), urgent / high first, then the soonest. Late work is not here: it is under
// "Needs support". A row Muntej thinks may slip (blocked, not started, or barely moving with under a day left)
// gets a small "may be late" note. Hidden when nothing is coming up.
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';
import { AppText } from '@/components/ui';
import { colors, sizes, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { useTasks, type TaskPriority, type TaskWithPeople } from '@/lib/api';
import { isLate } from '@/features/tasks/model';
import { TaskRow } from '@/features/tasks/TaskRow';
import { NEXT_DAYS_NS } from './nextDaysStrings';

const DAYS = 3;
const MAX_ROWS = 5;
const RIYADH = 3 * 3_600_000;
const DAY = 86_400_000;
const WORKING = ['draft', 'assigned', 'in_progress', 'blocked', 'returned'];
const RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** end of the 3rd working day from today (today counts when it is a working day), Riyadh time */
function windowEnd(now: number): number {
  let day = Math.floor((now + RIYADH) / DAY); // Riyadh calendar day number
  let left = DAYS;
  for (;;) {
    const dow = new Date(day * DAY).getUTCDay();
    if (dow !== 5 && dow !== 6) left--;
    if (left === 0) break;
    day++;
  }
  return (day + 1) * DAY - RIYADH - 1;
}

/** blocked, not started, or under half done with less than a day to go */
function mayBeLate(t: TaskWithPeople, now: number): boolean {
  if (t.status === 'blocked') return true;
  const left = Date.parse(t.due_at!) - now;
  if (left > DAY) return false;
  return t.status === 'assigned' || t.status === 'draft' || (t.progress ?? 0) < 50;
}

export function useNextDays() {
  const tasks = useTasks();
  const now = Date.now();
  const end = windowEnd(now);
  const rows = (tasks.data ?? [])
    .filter((t) => WORKING.includes(t.status) && t.due_at && !isLate(t, now) && Date.parse(t.due_at) <= end)
    .sort((a, b) => RANK[a.priority] - RANK[b.priority] || Date.parse(a.due_at!) - Date.parse(b.due_at!));
  return { rows, now };
}

export function NextDays() {
  const { t } = useScreenT(NEXT_DAYS_NS);
  const { rows, now } = useNextDays();
  if (rows.length === 0) return null;
  const all: Href = { pathname: '/38-tasks', params: { ids: rows.slice(0, 50).map((x) => x.id).join(',') } };

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AppText variant="section" style={{ flex: 1 }}>
          {t('title')}
        </AppText>
        {rows.length > MAX_ROWS && (
          <Pressable onPress={() => router.push(all)} accessibilityRole="link" hitSlop={8} style={{ minHeight: sizes.touch, justifyContent: 'center' }}>
            <AppText variant="small" weight="bold" color="primary">
              {t('seeAll', { count: rows.length })}
            </AppText>
          </Pressable>
        )}
      </View>
      <View style={{ gap: spacing.sm }}>
        {rows.slice(0, MAX_ROWS).map((x) => (
          <View key={x.id} style={{ gap: 4 }}>
            <TaskRow task={x} />
            {mayBeLate(x, now) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingStart: spacing.md }}>
                <AlertTriangle color={colors.red} size={12} strokeWidth={2.4} />
                <AppText variant="caption" weight="bold" color="red">
                  {x.status === 'blocked' ? t('blocked') : t('mayBeLate')}
                </AppText>
              </View>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
