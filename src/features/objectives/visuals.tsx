// Small shared visuals for objectives: start-anchored positioning, dual progress/time bar, status chip, gap icons.
import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { AlertTriangle, CalendarX, Check, Clock, FileQuestion, UserX } from 'lucide-react-native';
import { AppText, Chip } from '@/components/ui';
import type { ChipTone } from '@/components/ui/Chip';
import { colors, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import type { HealthLabel, ObjectiveHealth } from './health';
import { NS } from './strings';

export const labelTone: Record<HealthLabel, ChipTone> = {
  onTrack: 'green',
  behind: 'amber',
  atRisk: 'red',
  achieved: 'green',
  missed: 'neutral',
  cancelled: 'neutral',
};

const labelFill: Record<HealthLabel, ColorToken> = {
  onTrack: 'green',
  behind: 'amber',
  atRisk: 'red',
  achieved: 'green',
  missed: 'textFaint',
  cancelled: 'textFaint',
};

/**
 * Absolute full-width layer that places its child at fraction `at` of the track, measured from the start edge.
 * Same approach as screen 24's AtStart: a flex row + percentage spacer (no left/right insets), so it follows the
 * layout direction in RTL exactly like the bar fill does.
 */
export function AtStart({ at, anchor = 'start', style, children }: { at: number; anchor?: 'start' | 'end'; style?: ViewStyle; children: ReactNode }) {
  const w: `${number}%` = `${Math.round(Math.max(0, Math.min(1, at)) * 1000) / 10}%`;
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, flexDirection: 'row' }, style]}>
      {anchor === 'start' ? (
        <>
          <View style={{ width: w }} />
          {children}
        </>
      ) : (
        <View style={{ width: w, flexDirection: 'row', justifyContent: 'flex-end' }}>{children}</View>
      )}
    </View>
  );
}

/** Progress fill (coloured by health) with a dark marker line at "time used". */
export function DualBar({ health, height = 10 }: { health: Pick<ObjectiveHealth, 'label' | 'progress' | 'timeUsed'>; height?: number }) {
  const showMarker = health.label !== 'achieved' && health.label !== 'cancelled';
  return (
    <View style={{ height: height + 8, justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ height, borderRadius: height / 2, backgroundColor: colors.track, overflow: 'hidden', flexDirection: 'row' }}>
        <View style={{ width: `${health.progress}%`, backgroundColor: colors[labelFill[health.label]], borderRadius: height / 2 }} />
      </View>
      {showMarker && (
        <AtStart at={health.timeUsed / 100} style={{ top: 0, bottom: 0 }}>
          <View style={{ width: 2.5, height: height + 8, marginStart: -1, borderRadius: 1.5, backgroundColor: colors.navy }} />
        </AtStart>
      )}
    </View>
  );
}

export function HealthChip({ label }: { label: HealthLabel }) {
  const { t } = useScreenT(NS);
  const prefix = label === 'achieved' ? '✓ ' : '';
  return <Chip label={`${prefix}${t(`l_${label}`)}`} tone={labelTone[label]} dot={label !== 'achieved'} />;
}

/** Tiny icon + count per gap kind (only the ones present). */
export function GapIcons({ health }: { health: ObjectiveHealth }) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  if (health.label === 'achieved' || health.label === 'cancelled') return null;
  const g = health.gaps;
  const items: { key: string; n: number; Icon: typeof Clock; color: ColorToken; a11y: string }[] = [];
  if (g.noTasks) items.push({ key: 'none', n: 0, Icon: FileQuestion, color: 'amberText', a11y: t('gi_noTasks') });
  if (g.late.length) items.push({ key: 'late', n: g.late.length, Icon: Clock, color: 'red', a11y: t('gi_late', { n: g.late.length }) });
  if (g.outsideWindow.length)
    items.push({ key: 'out', n: g.outsideWindow.length, Icon: CalendarX, color: 'red', a11y: t('gi_outside', { n: g.outsideWindow.length }) });
  if (g.unassigned.length)
    items.push({ key: 'un', n: g.unassigned.length, Icon: UserX, color: 'amberText', a11y: t('gi_unassigned', { n: g.unassigned.length }) });
  if (g.overloadedOwners.length)
    items.push({
      key: 'ov',
      n: g.overloadedOwners.length,
      Icon: AlertTriangle,
      color: 'amberText',
      a11y: t('gi_overloaded', { n: g.overloadedOwners.length }),
    });
  if (g.missingDoneWhen.length)
    items.push({ key: 'dod', n: g.missingDoneWhen.length, Icon: Check, color: 'textMuted', a11y: t('gi_dod', { n: g.missingDoneWhen.length }) });
  if (!items.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
      {items.map(({ key, n, Icon, color, a11y }) => (
        <View key={key} accessible accessibilityLabel={a11y} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Icon color={colors[color]} size={14} strokeWidth={2.2} />
          {n > 0 && (
            <AppText variant="caption" weight="bold" color={color}>
              {formatNumber(n, lang)}
            </AppText>
          )}
        </View>
      ))}
    </View>
  );
}

/** "12 days left" / "Due today" / "3 days over". */
export function daysLeftText(t: (k: string, o?: Record<string, unknown>) => string, days: number, lang: 'en' | 'ar') {
  if (days === 0) return t('dueToday');
  if (days > 0) return t('daysLeft', { count: days, n: formatNumber(days, lang) });
  return t('daysOver', { count: -days, n: formatNumber(-days, lang) });
}
