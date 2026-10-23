// Screen 13 · Note Taker — see design/v2/html/NoteTaker.dc.html (Arabic: NoteTakerAR.dc.html)
// Demo only: bot toggles and recorder connect are local state; the in-room recording is a visual timer
// (no microphone). "Stop & extract tasks" shows the done card and opens Promise Catcher (/07-promise-catcher).
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  Banknote,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hand,
  Lock,
  Mic,
  NotebookText,
  Square,
  Users,
  Video,
  type LucideProps,
} from 'lucide-react-native';
import { AppText, Button, Card, IconBadge, IconButton, StatTile, Toggle } from '@/components/ui';
import { colors, radius, shadows, spacing, type GradientToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { NS } from '@/features/note-taker/strings';
import { DEMO_MEETING_MINUTES, useDemoRecording } from '@/features/note-taker/useDemoRecording';

type Bot = 'zoom' | 'meet' | 'teams';
const BOTS: { id: Bot; gradient: GradientToken }[] = [
  { id: 'zoom', gradient: 'primary' },
  { id: 'meet', gradient: 'avatarGreen' },
  { id: 'teams', gradient: 'purple' },
];

const WAVE = [4, 12, 18, 8, 14, 6, 16, 8, 4];
const PIN_BATTERY = 82;
const DEMO_VALUE = { minutes: 45, sar: 150, notes: 0 };
/** Short pause on the done card before Promise Catcher opens. */
const OPEN_REVIEW_MS = 1200;

/** The original design demo, kept for reference (not routed). */
export function NoteTakerScreenDemo() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const [done, setDone] = useState(false);
  const [bots, setBots] = useState<Record<Bot, boolean>>({ zoom: true, meet: true, teams: false });
  const [recorder, setRecorder] = useState(false);
  const rec = useDemoRecording(!done);
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => () => {
    if (navTimer.current) clearTimeout(navTimer.current);
  }, []);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const openReview = () => {
    if (navTimer.current) clearTimeout(navTimer.current);
    navTimer.current = null;
    router.push('/07-promise-catcher');
  };
  const stop = () => {
    setDone(true);
    navTimer.current = setTimeout(openReview, OPEN_REVIEW_MS);
  };
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.screen, paddingTop: spacing.xs, paddingBottom: spacing.xxl, gap: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <IconButton label={t('back')} onPress={goBack}>
            <BackIcon color={colors.text} size={20} strokeWidth={2} />
          </IconButton>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="titleLg" style={{ lineHeight: 32 }}>
              {t('title')}
            </AppText>
            <AppText variant="small" color="textMuted">
              {t('subtitle')}
            </AppText>
          </View>
        </View>

        {/* In-room recording */}
        {!done ? (
          <Card
            padding={spacing.xl}
            elevation="raised"
            style={{ borderStartWidth: 4, borderStartColor: colors.red, gap: spacing.md, paddingEnd: spacing.xxl }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  backgroundColor: colors.redTint,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 5,
                  flexShrink: 1,
                }}
              >
                <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red, opacity: pulse }} />
                <AppText variant="small" weight="bold" color="red" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {t('recording')}
                </AppText>
              </View>
              <AppText
                variant="lead"
                weight="extrabold"
                color="red"
                accessibilityLabel={t('timerLabel', { time: rec.time })}
                style={{ writingDirection: 'ltr', fontVariant: ['tabular-nums'] }}
              >
                {rec.time}
              </AppText>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
              <AppText variant="lead" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
                {t('room')}
              </AppText>
              <Svg width={54} height={22} viewBox="0 0 54 22" aria-hidden>
                {WAVE.map((h0, i) => {
                  // shift the bar heights every second so the wave looks alive
                  const h = WAVE[(i + rec.tick) % WAVE.length] || h0;
                  const x = 2 + i * 6;
                  return <Path key={i} d={`M${x} ${11 - h / 2}v${h}`} stroke={colors.red} strokeWidth={2.4} strokeLinecap="round" />;
                })}
              </Svg>
            </View>

            <View style={{ gap: 6 }}>
              {rec.captured.map((id) => (
                <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ backgroundColor: colors.primaryTint, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <AppText variant="micro" weight="bold" color="primary">
                      {t('addTask')}
                    </AppText>
                  </View>
                  <AppText variant="small" color="textSoft" numberOfLines={1} style={{ flex: 1 }}>
                    {t(`captured.${id}`)}
                  </AppText>
                </View>
              ))}
            </View>

            <Button
              label={t('stop')}
              icon={<Square color={colors.onDark} fill={colors.onDark} size={16} strokeWidth={2} />}
              onPress={stop}
            />
          </Card>
        ) : (
          <Card
            tone="green"
            padding={spacing.xxl}
            style={{ borderStartWidth: 4, borderStartColor: colors.green, gap: spacing.md, overflow: 'hidden', boxShadow: shadows.raised }}
          >
            <Svg
              width={90}
              height={40}
              viewBox="0 0 90 40"
              style={{ position: 'absolute', top: 10, end: 12 }}
              aria-hidden
            >
              <Path d="M10 6l4 4-4 4-4-4z" fill={colors.purple} />
              <Path d="M40 4l5 8h-10z" fill={colors.gold} />
              <Path d="M70 10l1.8 3.8 4.2.6-3 2.9.7 4.1-3.7-2-3.7 2 .7-4.1-3-2.9 4.2-.6z" fill={colors.orange} />
              <Circle cx={55} cy={30} r={3} fill={colors.primary} />
            </Svg>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Check color={colors.green} size={16} strokeWidth={2.6} />
              <AppText weight="bold" color="green">
                {t('doneTitle', { min: formatNumber(DEMO_MEETING_MINUTES, lang) })}
              </AppText>
            </View>
            <AppText variant="title">{t('doneSummary', { n: formatNumber(rec.totalPromises, lang) })}</AppText>
            <Button label={t('review')} onPress={openReview} />
          </Card>
        )}

        {/* Online meeting bots */}
        <View style={{ gap: spacing.sm }}>
          <SectionLabel Icon={Video} iconColor={colors.primary} label={t('online')} />
          <Card padding={spacing.xl} style={{ paddingVertical: 0, gap: 0 }}>
            {BOTS.map((b, i) => (
              <View
                key={b.id}
                style={{
                  minHeight: 52,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.lg,
                  borderBottomWidth: i === BOTS.length - 1 ? 0 : 1,
                  borderBottomColor: colors.border,
                }}
              >
                <IconBadge size={36} gradient={b.gradient}>
                  <Video color={colors.onDark} size={18} strokeWidth={2} />
                </IconBadge>
                <AppText variant="cardTitle" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
                  {t(`bots.${b.id}`)}
                </AppText>
                <Toggle
                  value={bots[b.id]}
                  onValueChange={(v) => setBots((s) => ({ ...s, [b.id]: v }))}
                  accessibilityLabel={t(`bots.${b.id}`)}
                />
              </View>
            ))}
          </Card>
        </View>

        {/* In-person devices */}
        <View style={{ gap: spacing.sm }}>
          <SectionLabel Icon={Users} iconColor={colors.purple} label={t('inPerson')} />
          <Card padding={spacing.xl} style={{ paddingVertical: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <IconBadge size={40} bg="primaryTint">
              <Mic color={colors.primary} size={20} strokeWidth={1.8} />
            </IconBadge>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="cardTitle" weight="bold">
                {t('pin')}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green }} />
                <AppText variant="caption" color="textMuted">
                  {t('connected')}
                </AppText>
              </View>
            </View>
            <View
              accessible
              accessibilityLabel={t('battery', { pct: formatNumber(PIN_BATTERY, lang) })}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: colors.greenTint,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.sm,
                paddingVertical: 4,
              }}
            >
              <Svg width={16} height={9} viewBox="0 0 16 9">
                <Path d="M2.5 0.5h9a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z" fill="none" stroke={colors.green} />
                <Path d="M3 2h7a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z" fill={colors.green} />
                <Path d="M14.3 3.7a0.7 0.7 0 0 1 1.4 0v1.6a0.7 0.7 0 0 1-1.4 0z" fill={colors.green} />
              </Svg>
              <AppText variant="small" weight="bold" color="green">
                {formatNumber(PIN_BATTERY, lang)}%
              </AppText>
            </View>
          </Card>
          <Card padding={spacing.xl} style={{ paddingVertical: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <IconBadge size={40} bg="purpleTint">
              <NotebookText color={colors.purple} size={20} strokeWidth={1.8} />
            </IconBadge>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="cardTitle" weight="bold">
                {t('external')}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {t('autoImport')}
              </AppText>
            </View>
            <Pressable
              onPress={() => setRecorder((v) => !v)}
              accessibilityRole="switch"
              accessibilityLabel={t('external')}
              accessibilityState={{ checked: recorder }}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                borderWidth: 1,
                borderColor: recorder ? colors.greenTint : colors.borderBlue,
                backgroundColor: recorder ? colors.greenTint : colors.surface,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.md,
                paddingVertical: 5,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {recorder && <Check color={colors.green} size={13} strokeWidth={2.6} />}
              <AppText variant="small" weight="bold" color={recorder ? 'green' : 'primary'}>
                {recorder ? t('connected') : t('connect')}
              </AppText>
            </Pressable>
          </Card>
        </View>

        {/* Value tiles (demo figures from the design) */}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <StatTile
            icon={<Clock color={colors.primary} size={15} strokeWidth={2.2} />}
            iconBg="primaryTint"
            value={t('savedValue', { n: formatNumber(DEMO_VALUE.minutes, lang) })}
            label={t('savedMeeting')}
          />
          <StatTile
            icon={<Banknote color={colors.green} size={15} strokeWidth={2.2} />}
            iconBg="greenTint"
            value={formatNumber(DEMO_VALUE.sar, lang)}
            label={t('sarMeeting')}
          />
          <StatTile
            icon={<Hand color={colors.orange} size={15} strokeWidth={2.2} />}
            iconBg="orangeTint"
            value={formatNumber(DEMO_VALUE.notes, lang)}
            label={t('notesTyped')}
          />
        </View>

        {/* Consent notice */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Bell color={colors.green} size={13} strokeWidth={2} />
            <AppText variant="micro" weight="semibold" color="textMuted">
              {t('notified')}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Lock color={colors.green} size={13} strokeWidth={2} />
            <AppText variant="micro" weight="semibold" color="textMuted">
              {t('audioDeleted')}
            </AppText>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({ Icon, iconColor, label }: { Icon: ComponentType<LucideProps>; iconColor: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon color={iconColor} size={14} strokeWidth={2} />
      <AppText variant="small" weight="bold" color="textMuted">
        {label}
      </AppText>
    </View>
  );
}

/** Meetings come from Google Calendar / Meet now (Connect your tools): the old note taker opens there. */
export default function NoteTakerScreen() {
  return <Redirect href="/12-sources" />;
}
