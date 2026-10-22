// Screen 07 · Promise Catcher — see design/v2/html/PromiseCatcher.dc.html (Arabic: PromiseCatcherAR.dc.html)
// Demo data: promises from src/features/promise-catcher/demo.ts. Confirm / Skip / Confirm all update local state only
// (TODO in demo.ts: wire confirmed promises to createTask).
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banknote, Calendar, Check, Clock, MessageCircle, Mic, ShieldCheck, X } from 'lucide-react-native';
import { AppText, Avatar, Button, Gradient, IconBadge, IconButton, PointsCoin, ProgressBar, StatTile } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { NS } from '@/features/promise-catcher/strings';
import { DEMO_PROMISES, DEMO_VALUE, MEETING_MINUTES, type PromiseId } from '@/features/promise-catcher/demo';

type Verdict = 'ok' | 'skip';

const BOTTOM_SPACE = 150;

/** The original design demo, kept for reference (not routed). */
export function PromiseCatcherScreenDemo() {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const insets = useSafeAreaInsets();
  const [verdicts, setVerdicts] = useState<Partial<Record<PromiseId, Verdict>>>({});

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const total = DEMO_PROMISES.length;
  const done = DEMO_PROMISES.filter((p) => verdicts[p.id]).length;
  const left = total - done;
  const pct = Math.round((done / total) * 100);

  const set = (id: PromiseId, v: Verdict) => setVerdicts((s) => ({ ...s, [id]: v }));
  const confirmAll = () => {
    if (left === 0) return goBack();
    setVerdicts((s) => {
      const n = { ...s };
      DEMO_PROMISES.forEach((p) => {
        n[p.id] = n[p.id] ?? 'ok';
      });
      return n;
    });
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.screen, paddingTop: spacing.xs, paddingBottom: BOTTOM_SPACE, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                backgroundColor: colors.primaryTint,
                borderRadius: radius.pill,
                paddingVertical: 4,
                paddingStart: 4,
                paddingEnd: spacing.lg,
                flexShrink: 1,
              }}
            >
              <IconBadge size={26} gradient="avatarBlue" round>
                <Mic color={colors.onDark} size={14} strokeWidth={2} />
              </IconBadge>
              <AppText variant="caption" weight="bold" color="primary" numberOfLines={1} style={{ flexShrink: 1 }}>
                {t('meeting', { min: formatNumber(MEETING_MINUTES, lang) })}
              </AppText>
            </View>
            <IconButton label={t('close')} onPress={goBack}>
              <X color={colors.text} size={20} strokeWidth={1.9} />
            </IconButton>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
            <AppText variant="big" display style={{ lineHeight: 32 }}>
              {t('caughtPre')}
            </AppText>
            <Gradient name="primary" style={{ borderRadius: 9, paddingHorizontal: 9, boxShadow: shadows.primary }}>
              <AppText variant="big" weight="extrabold" color="onDark" style={{ lineHeight: 32 }}>
                {formatNumber(total, lang)}
              </AppText>
            </Gradient>
            <AppText variant="big" display style={{ lineHeight: 32 }}>
              {t('caughtPost')}
            </AppText>
          </View>
        </View>

        {/* Value tiles (demo figures from the design) */}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <StatTile
            icon={<ShieldCheck color={colors.green} size={15} strokeWidth={2.2} />}
            iconBg="greenTint"
            value={formatNumber(DEMO_VALUE.forgotten, lang)}
            label={t('forgotten')}
          />
          <StatTile
            icon={<Clock color={colors.primary} size={15} strokeWidth={2.2} />}
            iconBg="primaryTint"
            value={t('notesValue', { n: formatNumber(DEMO_VALUE.notesMinutes, lang) })}
            label={t('notesSaved')}
          />
          <StatTile
            icon={<Banknote color={colors.orange} size={15} strokeWidth={2.2} />}
            iconBg="orangeTint"
            value={formatNumber(DEMO_VALUE.sar, lang)}
            label={t('sarSaved')}
          />
        </View>

        {/* Progress */}
        <View
          accessible
          accessibilityLabel={t('progress', { pct: formatNumber(pct, lang) })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
        >
          <View style={{ flex: 1 }}>
            <ProgressBar value={pct / 100} />
          </View>
          <AppText variant="caption" weight="extrabold" color="primary">
            {formatNumber(pct, lang)}%
          </AppText>
        </View>

        {/* Promises */}
        <View style={{ gap: spacing.sm }}>
          {DEMO_PROMISES.map((p) => {
            const v = verdicts[p.id];
            const who = t(`promises.${p.id}.who`);
            const task = t(`promises.${p.id}.task`);
            const due = t(`promises.${p.id}.due`);
            return (
              <View
                key={p.id}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radius.card,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.lg,
                  gap: 6,
                  boxShadow: shadows.card,
                  opacity: v === 'skip' ? 0.7 : 1,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <Avatar name={who} size={38} gradient={p.gradient} />
                  <View
                    accessible
                    accessibilityLabel={t('rowLabel', { who, task, due })}
                    style={{ flex: 1, minWidth: 0, gap: 3 }}
                  >
                    <AppText weight="bold" numberOfLines={1}>
                      {task}
                    </AppText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {who}
                      </AppText>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          backgroundColor: colors.primaryTint,
                          borderRadius: radius.pill,
                          paddingHorizontal: 7,
                          paddingVertical: 1,
                        }}
                      >
                        <Calendar color={colors.primary} size={11} strokeWidth={2.4} />
                        <AppText variant="caption" weight="bold" color="primary">
                          {due}
                        </AppText>
                      </View>
                    </View>
                  </View>

                  {!v && (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Pressable
                        onPress={() => set(p.id, 'skip')}
                        accessibilityRole="button"
                        accessibilityLabel={`${t('skip')} · ${task}`}
                        style={({ pressed }) => ({
                          width: sizes.touch,
                          height: sizes.touch,
                          borderRadius: sizes.touch / 2,
                          borderWidth: 1,
                          borderColor: colors.borderBlue,
                          backgroundColor: colors.surface,
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: pressed ? 0.8 : 1,
                        })}
                      >
                        <X color={colors.textMuted} size={18} strokeWidth={2} />
                      </Pressable>
                      <Pressable
                        onPress={() => set(p.id, 'ok')}
                        accessibilityRole="button"
                        accessibilityLabel={`${t('confirm')} · ${task}`}
                        style={({ pressed }) => ({
                          width: sizes.touch,
                          height: sizes.touch,
                          borderRadius: sizes.touch / 2,
                          boxShadow: shadows.primary,
                          opacity: pressed ? 0.85 : 1,
                        })}
                      >
                        <Gradient
                          name="primary"
                          style={{ flex: 1, borderRadius: sizes.touch / 2, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Check color={colors.onDark} size={20} strokeWidth={2.4} />
                        </Gradient>
                      </Pressable>
                    </View>
                  )}
                  {v === 'ok' && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: colors.greenTint,
                        borderRadius: radius.pill,
                        paddingHorizontal: spacing.md,
                        paddingVertical: 6,
                      }}
                    >
                      <Check color={colors.green} size={12} strokeWidth={3} />
                      <AppText variant="caption" weight="bold" color="green">
                        {t('task')}
                      </AppText>
                    </View>
                  )}
                  {v === 'skip' && (
                    <View style={{ backgroundColor: colors.chip, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 }}>
                      <AppText variant="caption" weight="semibold" color="textMuted">
                        {t('skipped')}
                      </AppText>
                    </View>
                  )}
                </View>

                {/* What they said */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm,
                    backgroundColor: colors.bg,
                    borderRadius: radius.sm,
                    paddingVertical: 5,
                    paddingHorizontal: 9,
                  }}
                >
                  <MessageCircle color={colors.borderDashed} size={13} strokeWidth={2.2} />
                  <AppText variant="caption" color="textSoft" numberOfLines={1} style={{ flex: 1 }}>
                    {t('quote', { q: t(`promises.${p.id}.quote`) })}
                  </AppText>
                  <AppText variant="caption" color="textFaint" style={{ writingDirection: 'ltr' }}>
                    {p.time}
                  </AppText>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Sticky actions */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: spacing.screen,
          paddingTop: spacing.md,
          paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.sm,
          backgroundColor: colors.bg,
          gap: spacing.sm,
        }}
      >
        <Button label={left === 0 ? t('done') : t('confirmAll', { n: formatNumber(left, lang) })} onPress={confirmAll} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: colors.surface,
              borderRadius: radius.pill,
              paddingHorizontal: 9,
              paddingVertical: 4,
            }}
          >
            <MessageCircle color={colors.green} size={12} strokeWidth={2.2} />
            <AppText variant="micro" weight="semibold" color="textMuted">
              {t('whatsapp')}
            </AppText>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: colors.surface,
              borderRadius: radius.pill,
              paddingHorizontal: 9,
              paddingVertical: 4,
            }}
          >
            <PointsCoin size={14} />
            <AppText variant="micro" weight="bold" color="orangeText">
              {t('points')}
            </AppText>
            <AppText variant="micro" weight="semibold" color="textMuted">
              {t('ifKept')}
            </AppText>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

/** The real promise catcher is Incoming: pasted messages and recorded meetings, tasks to Add / Ignore. */
export default function PromiseCatcherScreen() {
  return <Redirect href="/42-incoming" />;
}
