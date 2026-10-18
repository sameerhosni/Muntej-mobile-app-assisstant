// Screen 09 · Reverse follow-up — see design/v2/html/ReverseFollowup.dc.html (Arabic: ReverseFollowupAR.dc.html)
// Employee screen. Live data: pending decisions I requested (age) + blocked tasks I own or help on.
// Falls back to the design's three sample items. "Nudge politely" is demo state only (no message is sent yet).
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronLeft, Clock, Hand, Lock, Mic, Send } from 'lucide-react-native';
import { AppText, Avatar, Card, Gradient, Hero, IconBadge, IconButton, PointsCoin } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { ACTIVE_STATUSES, useDecisions, useMyProfile, useTasks, useTeam } from '@/lib/api';
import { formatNumber } from '@/features/home/value';
import { LEVEL, useWallet } from '@/features/rewards/wallet';
import { demoItems, liveItems, type WaitItem } from '@/features/reverse-followup/model';
import { NS } from '@/features/reverse-followup/strings';

/** Design value for the sample: hours of waiting Muntej's nudges cut this week. */
const DEMO_WAITING_CUT_H = 31;
/** Auto-nudges Muntej already sent before you open the screen (design). */
const BASE_AUTO_NUDGES = 3;

export default function ReverseFollowupScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const me = useMyProfile();
  const team = useTeam();
  const tasks = useTasks({ statuses: ACTIVE_STATUSES });
  const decisions = useDecisions('pending');
  const w = useWallet();
  const [nudged, setNudged] = useState<Record<string, boolean>>({});
  const [voiceHint, setVoiceHint] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };

  const live = useMemo(
    () =>
      me.data
        ? liveItems({ t, lang, me: me.data, team: team.data ?? [], tasks: tasks.data ?? [], decisions: decisions.data ?? [] })
        : [],
    [t, lang, me.data, team.data, tasks.data, decisions.data],
  );
  const loading = (tasks.isLoading || decisions.isLoading || me.isLoading) && live.length === 0;
  const failed = tasks.isError && decisions.isError;
  const items: WaitItem[] = live.length > 0 ? live : demoItems(t);
  const isSample = live.length === 0;

  const nudgedCount = items.filter((i) => nudged[i.id]).length;
  // Live estimate: a polite nudge roughly halves the remaining wait on each item.
  const waitingCut = isSample ? DEMO_WAITING_CUT_H : Math.round(items.reduce((s, i) => s + i.waitHours, 0) / 2);

  const myName = me.data ? ((lang === 'ar' && me.data.full_name_ar ? me.data.full_name_ar : me.data.full_name).split(' ')[0] ?? '') : '';
  const role = me.data?.role === 'manager' ? t('roleManager') : t('roleEmployee');
  const firstOpen = items.find((i) => !nudged[i.id]) ?? items[0];
  const voiceText = isSample || !firstOpen ? t('voiceExample') : t('voiceExampleLive', { name: firstOpen.who, what: firstOpen.what });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 56 + 30 + Math.max(insets.bottom, spacing.lg) + spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={tasks.isRefetching || decisions.isRefetching}
            onRefresh={() => {
              tasks.refetch();
              decisions.refetch();
            }}
            tintColor={colors.purple}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Hero variant="employee" overlap={34}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconButton variant="glass" label={t('back')} onPress={back}>
              <ChevronLeft color={colors.onDark} size={20} strokeWidth={2} style={flip} />
            </IconButton>
            <AppText variant="small" color="onDarkMuted" style={{ flex: 1 }} numberOfLines={1}>
              {myName ? t('whoLine', { name: myName, role }) : ' '}
            </AppText>
            <Pressable
              onPress={() => router.navigate('/25-employee-home')}
              accessibilityRole="link"
              accessibilityLabel={t('levelA11y', { level: LEVEL, pts: formatNumber(w.balance, lang) })}
              hitSlop={{ top: 8, bottom: 8 }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: colors.surface,
                borderRadius: radius.pill,
                paddingVertical: 4,
                paddingStart: 4,
                paddingEnd: spacing.md,
                minHeight: 30,
                boxShadow: shadows.purple,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <PointsCoin size={20} />
              <AppText variant="caption" weight="bold" color="orangeText" numberOfLines={1}>
                {t('levelPill', { level: LEVEL, pts: formatNumber(w.balance, lang) })}
              </AppText>
            </Pressable>
          </View>
          <View style={{ gap: 4 }}>
            <AppText variant="titleLg" color="onDark" style={{ lineHeight: 32 }}>
              {t('title')}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Send color={colors.onDark} size={14} strokeWidth={2.2} />
              <AppText variant="small" color="onDarkMuted">
                {t('subtitle')}
              </AppText>
            </View>
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -34, gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Tile icon={<Clock color={colors.primary} size={15} strokeWidth={2} />} bg="primaryTint"
              value={t('hours', { n: formatNumber(waitingCut, lang) })} label={t('waitingCut')} />
            <Tile icon={<Hand color={colors.orange} size={15} strokeWidth={2} />} bg="orangeTint"
              value={formatNumber(0, lang)} label={t('chasesByYou')} />
            <Tile icon={<Send color={colors.purple} size={15} strokeWidth={2} />} bg="purpleTint"
              value={formatNumber(BASE_AUTO_NUDGES + nudgedCount, lang)} label={t('autoNudges')} />
          </View>

          {failed && (
            <AppText variant="caption" color="textMuted" align="center">
              {t('error')}
            </AppText>
          )}

          {loading ? (
            <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
              <ActivityIndicator color={colors.purple} />
            </Card>
          ) : (
            items.map((it) => (
              <WaitCard
                key={it.id}
                item={it}
                done={!!nudged[it.id]}
                onNudge={() => setNudged((n) => ({ ...n, [it.id]: true }))}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Voice bar (design: "Remind Ahmed about the discount") */}
      <View
        style={{
          position: 'absolute',
          start: spacing.screen,
          end: spacing.screen,
          bottom: Math.max(insets.bottom, spacing.lg) + spacing.sm,
          gap: spacing.sm,
        }}
      >
        {voiceHint && (
          <View style={{ backgroundColor: colors.purpleTint, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg }}>
            <AppText variant="caption" color="purpleText" align="center">
              {t('voiceSoon')}
            </AppText>
          </View>
        )}
        <View
          style={{
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.surface,
            boxShadow: shadows.raised,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingStart: spacing.xxl,
            paddingEnd: 6,
          }}
        >
          <AppText variant="small" color="textMuted" style={{ flex: 1, lineHeight: 18 }} numberOfLines={2}>
            {voiceText}
          </AppText>
          <Pressable
            onPress={() => setVoiceHint((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={t('voice')}
            style={({ pressed }) => ({ width: sizes.touch, height: sizes.touch, borderRadius: sizes.touch / 2, boxShadow: shadows.purple, opacity: pressed ? 0.85 : 1 })}
          >
            <Gradient name="purple" style={{ flex: 1, borderRadius: sizes.touch / 2, alignItems: 'center', justifyContent: 'center' }}>
              <Mic color={colors.onDark} size={20} strokeWidth={1.8} />
            </Gradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Tile({ icon, bg, value, label }: { icon: ReactNode; bg: 'primaryTint' | 'orangeTint' | 'purpleTint'; value: string; label: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.tile, paddingVertical: 9, paddingHorizontal: spacing.md, gap: 3, boxShadow: shadows.raised }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <IconBadge size={26} bg={bg}>
          {icon}
        </IconBadge>
        <AppText variant="stat" numberOfLines={1} style={{ flexShrink: 1 }}>
          {value}
        </AppText>
      </View>
      <AppText variant="micro" color="textMuted" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

function WaitCard({ item, done, onNudge }: { item: WaitItem; done: boolean; onNudge: () => void }) {
  const { t } = useScreenT(NS);
  return (
    <Card padding={0} style={{ paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, gap: spacing.sm, borderRadius: radius.card }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        {item.gradient ? (
          <Avatar name={item.who} size={40} gradient={item.gradient} />
        ) : (
          <View accessibilityLabel={item.who} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.textFaint, alignItems: 'center', justifyContent: 'center' }}>
            <AppText weight="bold" color="onDark" style={{ fontSize: 15 }}>
              {item.who.trim().charAt(0).toUpperCase()}
            </AppText>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <AppText variant="cardTitle" weight="bold" numberOfLines={2}>
            {item.what}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ flexShrink: 0 }}>
              {item.who}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.redTint, borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: 7, flexShrink: 1 }}>
              <Lock color={colors.red} size={11} strokeWidth={2.4} />
              <AppText variant="caption" weight="bold" color="red" numberOfLines={1} style={{ flexShrink: 1 }}>
                {item.blocks}
              </AppText>
            </View>
            {item.sample && (
              <View style={{ backgroundColor: colors.chip, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 1 }}>
                <AppText variant="micro" weight="bold" color="textMuted">
                  {t('sample')}
                </AppText>
              </View>
            )}
          </View>
        </View>
        <View
          accessibilityLabel={t('waitA11y', { wait: item.wait })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.bg, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 9 }}
        >
          <Clock color={colors[item.waitColor]} size={12} strokeWidth={2.6} />
          <AppText variant="small" weight="extrabold" color={item.waitColor}>
            {item.wait}
          </AppText>
        </View>
      </View>

      {done ? (
        <View style={{ backgroundColor: colors.greenTint, borderStartWidth: 3, borderStartColor: colors.green, borderRadius: 12, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Check color={colors.greenText} size={12} strokeWidth={2.6} />
            <AppText variant="caption" weight="bold" color="greenText">
              {t('sentBy')}
            </AppText>
          </View>
          <AppText variant="caption" color="textSoft" style={{ lineHeight: 17 }}>
            {item.msg}
          </AppText>
        </View>
      ) : (
        <Pressable
          onPress={onNudge}
          accessibilityRole="button"
          accessibilityLabel={t('nudgeA11y', { name: item.who, what: item.what })}
          style={({ pressed }) => ({
            minHeight: sizes.touch,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: colors.purpleBorder,
            backgroundColor: colors.purpleTint,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Send color={colors.purple} size={16} strokeWidth={2} />
          <AppText variant="cardTitle" weight="bold" color="purple">
            {t('nudge')}
          </AppText>
        </Pressable>
      )}
    </Card>
  );
}
