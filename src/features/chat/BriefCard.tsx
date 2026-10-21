// A team / tasks question answered as a small table (supabase/functions/muntej-chat: buildBrief):
//   headline · one row per person or task (avatar, name, coloured status, the key number, the task)
//   ✓ what Muntej already did by itself (reminder / check-in) · the one fix waiting for a tap (move it / +2 days)
//   "Do all" when there are two or more fixes. Applied rows turn green; Undo is on the result message (5 minutes).
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowRightLeft, CalendarPlus, CircleCheck, Sparkles, Zap } from 'lucide-react-native';
import { AppText, Avatar } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import type { Brief, BriefRow, BriefStatus } from './api';
import { contentDirection } from './Bubbles';
import { BRIEF_NS } from './briefStrings';

const TONE: Record<BriefStatus, { fg: ColorToken; bg: ColorToken }> = {
  late: { fg: 'red', bg: 'redTint' },
  blocked: { fg: 'red', bg: 'redTint' },
  overloaded: { fg: 'orangeText', bg: 'orangeTint' },
  at_risk: { fg: 'amberStrong', bg: 'amberTint' },
  unassigned: { fg: 'purpleText', bg: 'purpleTint' },
  on_track: { fg: 'greenText', bg: 'greenTint' },
  star: { fg: 'primary', bg: 'primaryTint' },
};

export function BriefCard({
  brief,
  applied,
  open,
  onApply,
}: {
  brief: Brief;
  /** keys of rows whose fix was applied (from later result messages) */
  applied: Set<string>;
  /** false when the chat moved on: fixes still work, but the card is quieter */
  open: boolean;
  onApply: (rows: BriefRow[]) => Promise<void>;
}) {
  const { t } = useScreenT(BRIEF_NS);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useMemo(() => brief.rows.filter((r) => r.action && !applied.has(r.key)), [brief.rows, applied]);

  const run = async (key: string, rows: BriefRow[]) => {
    setBusy(key);
    setError(null);
    try {
      await onApply(rows);
    } catch (e) {
      setError(t('failed', { reason: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View
      style={{
        alignSelf: 'stretch',
        maxWidth: '100%',
        backgroundColor: colors.surface,
        borderRadius: radius.tile,
        borderWidth: 1,
        borderColor: colors.borderBlue,
        boxShadow: shadows.card,
        overflow: 'hidden',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.primaryTint }}>
        <Sparkles color={colors.primary} size={14} strokeWidth={2.4} />
        <AppText variant="small" weight="extrabold" color="primary" style={{ flex: 1, writingDirection: contentDirection(brief.headline) }}>
          {brief.headline}
        </AppText>
      </View>

      {brief.rows.map((r, i) => (
        <Row key={r.key} row={r} first={i === 0} applied={applied.has(r.key)} busy={busy} onFix={() => run(r.key, [r])} />
      ))}

      {pending.length >= 2 && (
        <View style={{ padding: spacing.lg, paddingTop: spacing.sm }}>
          <Pressable
            onPress={() => run('all', pending)}
            disabled={!!busy}
            accessibilityRole="button"
            accessibilityLabel={t('doAll', { count: pending.length })}
            style={({ pressed }) => ({
              minHeight: sizes.touch,
              borderRadius: radius.pill,
              backgroundColor: open ? colors.primary : colors.surface,
              borderWidth: 1,
              borderColor: colors.primary,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              opacity: busy && busy !== 'all' ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            {busy === 'all' ? (
              <ActivityIndicator size="small" color={open ? colors.onDark : colors.primary} />
            ) : (
              <>
                <Zap color={open ? colors.onDark : colors.primary} size={15} strokeWidth={2.4} />
                <AppText weight="extrabold" color={open ? 'onDark' : 'primary'}>
                  {t('doAll', { count: pending.length })}
                </AppText>
              </>
            )}
          </Pressable>
        </View>
      )}
      {!!error && (
        <AppText variant="small" color="red" style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
          {error}
        </AppText>
      )}
    </View>
  );
}

function Row({ row, first, applied, busy, onFix }: { row: BriefRow; first: boolean; applied: boolean; busy: string | null; onFix: () => void }) {
  const { t } = useScreenT(BRIEF_NS);
  const { lang } = useDirection();
  const tone = TONE[row.status] ?? TONE.on_track;
  const name = row.person_name ?? t('nobody');
  const timeFmt = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const dayFmt = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', { timeZone: 'Asia/Riyadh', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
  const a = row.action;
  const fixLabel = a
    ? a.kind === 'owner'
      ? t('moveTo', { name: a.to_name ?? '', hours: a.free_hours ?? 0 })
      : t('moreDays', { day: a.due_at ? dayFmt(a.due_at) : '' })
    : null;
  const openTask = row.task_id ? () => router.push({ pathname: '/14-task-detail', params: { id: row.task_id! } }) : undefined;

  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 6, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>
      {/* person · status · number */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Avatar name={name} size={28} />
        <AppText weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
          {name}
        </AppText>
        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors[tone.bg] }}>
          <AppText variant="micro" weight="extrabold" color={tone.fg}>
            {t(`s_${row.status}`)}
          </AppText>
        </View>
        <View style={{ flex: 1 }} />
        <AppText variant="small" weight="extrabold" color={tone.fg} style={{ writingDirection: contentDirection(row.metric) }}>
          {row.metric}
        </AppText>
      </View>

      {/* the task / reason */}
      <Pressable onPress={openTask} disabled={!openTask} accessibilityRole={openTask ? 'link' : undefined} hitSlop={4}>
        <AppText variant="small" color="textSoft" numberOfLines={2} style={{ paddingStart: 36, writingDirection: contentDirection(row.task_title ?? row.note) }}>
          {row.task_title ? `${row.task_title}${row.note && row.note !== row.task_title ? ` · ${row.note}` : ''}` : row.note}
        </AppText>
      </Pressable>

      {/* what Muntej did by itself */}
      {row.auto && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingStart: 36 }}>
          <CircleCheck color={colors.greenText} size={13} strokeWidth={2.4} />
          <AppText variant="caption" weight="bold" color="greenText">
            {t(row.auto.kind === 'checked_in' ? (row.auto.now ? 'checkedNow' : 'checkedAt') : row.auto.now ? 'remindedNow' : 'remindedAt', {
              name: row.person_name ?? '',
              time: timeFmt(row.auto.at),
            })}
          </AppText>
        </View>
      )}

      {/* the one fix, one tap */}
      {a && fixLabel && (
        <View style={{ paddingStart: 36, flexDirection: 'row' }}>
          {applied ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <CircleCheck color={colors.greenText} size={13} strokeWidth={2.4} />
              <AppText variant="caption" weight="bold" color="greenText">
                {t('fixed', { what: fixLabel })}
              </AppText>
            </View>
          ) : (
            <Pressable
              onPress={onFix}
              disabled={!!busy}
              accessibilityRole="button"
              accessibilityLabel={fixLabel}
              style={({ pressed }) => ({
                minHeight: sizes.touch - 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.primary,
                backgroundColor: colors.surface,
                opacity: busy && busy !== row.key ? 0.5 : pressed ? 0.85 : 1,
              })}
            >
              {busy === row.key ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : a.kind === 'owner' ? (
                <ArrowRightLeft color={colors.primary} size={14} strokeWidth={2.4} />
              ) : (
                <CalendarPlus color={colors.primary} size={14} strokeWidth={2.4} />
              )}
              <AppText variant="small" weight="extrabold" color="primary">
                {fixLabel}
              </AppText>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
