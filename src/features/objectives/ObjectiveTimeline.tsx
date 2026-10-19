// Mini timeline for one objective: the objective window as a band, each task as a dot at its due date,
// a today line, and tasks outside the window in red. Positions use AtStart (flex spacer), so RTL mirrors cleanly.
import { View } from 'react-native';
import { AppText } from '@/components/ui';
import { colors, radius, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import type { TaskWithPeople } from '@/lib/api';
import { isLate } from '@/features/tasks/model';
import type { Objective } from './api';
import { shortDate } from './ObjectiveCard';
import { AtStart } from './visuals';
import { NS } from './strings';

const DOT = 12;
/** dot tops: on the track, then just above / below it, so dots on close dates stay visible */
const LANES = [27, 20, 34];

export function ObjectiveTimeline({ objective, tasks }: { objective: Objective; tasks: TaskWithPeople[] }) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const start = new Date(objective.start_at).getTime();
  const due = new Date(objective.due_at).getTime();
  const now = Date.now();
  const dated = tasks.filter((x) => x.due_at && x.status !== 'cancelled');
  const times = dated.map((x) => new Date(x.due_at!).getTime());
  // the axis covers the window plus any task (and today) that falls outside it, with a little padding
  let lo = Math.min(start, ...times, now);
  let hi = Math.max(due, ...times, now);
  const pad = (hi - lo) * 0.04 || 86_400_000;
  lo -= pad;
  hi += pad;
  const f = (ms: number) => (ms - lo) / (hi - lo);
  const ws = f(start);
  const we = f(due);

  const dotColor = (x: TaskWithPeople): ColorToken => {
    const d = new Date(x.due_at!).getTime();
    if (d > due || d < start) return 'red';
    if (x.status === 'done') return 'green';
    if (isLate(x, now)) return 'amber';
    return 'primary';
  };

  // stagger dots on 3 lanes so close dates don't hide each other
  const sorted = [...dated].sort((a, b) => a.due_at!.localeCompare(b.due_at!));

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ height: 70 }}>
        {/* full track */}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 30, height: 6, borderRadius: 3, backgroundColor: colors.track }} />
        {/* objective window */}
        <AtStart at={ws} style={{ top: 26, height: 14 }}>
          <View style={{ width: `${Math.max(1, (we - ws) * 100)}%`, height: 14, borderRadius: radius.sm, backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.borderBlue }} />
        </AtStart>
        {/* today */}
        <AtStart at={f(now)} style={{ top: 14, height: 40 }}>
          <View style={{ width: 2, height: 40, marginStart: -1, borderRadius: 1, backgroundColor: colors.purple, opacity: 0.75 }} />
        </AtStart>
        <AtStart at={f(now)} anchor={f(now) > 0.85 ? 'end' : 'start'} style={{ top: 0 }}>
          <AppText variant="micro" weight="bold" color="purple" style={{ marginHorizontal: 3 }}>
            {t('today')}
          </AppText>
        </AtStart>
        {/* tasks */}
        {sorted.map((x, i) => (
          <AtStart key={x.id} at={f(new Date(x.due_at!).getTime())} style={{ top: LANES[i % LANES.length] }}>
            <View
              style={{
                width: DOT,
                height: DOT,
                marginStart: -DOT / 2,
                borderRadius: DOT / 2,
                backgroundColor: colors[dotColor(x)],
                borderWidth: 2,
                borderColor: colors.surface,
              }}
            />
          </AtStart>
        ))}
        {/* window dates */}
        <AtStart at={ws} anchor={ws > 0.5 ? 'end' : 'start'} style={{ top: 50 }}>
          <AppText variant="micro" weight="semibold" color="textMuted" numberOfLines={1}>
            {shortDate(objective.start_at, lang)}
          </AppText>
        </AtStart>
        <AtStart at={we} anchor={we > 0.6 ? 'end' : 'start'} style={{ top: 50 }}>
          <AppText variant="micro" weight="semibold" color="textMuted" numberOfLines={1}>
            {shortDate(objective.due_at, lang)}
          </AppText>
        </AtStart>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <Legend color="primary" label={t('legendInside')} />
        <Legend color="green" label={t('legendDone')} />
        <Legend color="red" label={t('legendOutside')} />
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: ColorToken; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[color] }} />
      <AppText variant="micro" color="textSoft">
        {label}
      </AppText>
    </View>
  );
}
