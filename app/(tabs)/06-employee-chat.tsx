// Screen 06 · Employee chat — see design/v2/html/Employee.dc.html (Arabic: EmployeeAR.dc.html)
// Live: the task card is the signed-in employee's first active task (tasks, RLS-scoped) with its assigner + helper.
// Demo: the chat thread, quick-reply answers and points (shared demo wallet) — no chat/points backend yet.
import { useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { CircleAlert, Banknote, Calendar, CheckCheck, Clock, Hand, Mic, Paperclip, Presentation, Send, Sparkles, Zap } from 'lucide-react-native';
import { AppText, Avatar, Gradient, IconBadge, PointsCoin, StatTile } from '@/components/ui';
import { colors, fontFamily, fontSize, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { ACTIVE_STATUSES, useHomeStats, useMyProfile, useTasks, useTeam, type TaskPriority } from '@/lib/api';
import { formatNumber, hoursSaved } from '@/features/home/value';
import { formatDue } from '@/features/capture/format';
import { LEVEL, useWallet, wallet } from '@/features/rewards/wallet';
import { NS } from '@/features/employee-chat/strings';

type Opt = '25' | '50' | '75' | 'Done';
const OPTS: Opt[] = ['25', '50', '75', 'Done'];
const OPT_KEY: Record<Opt, string> = { '25': 'opt25', '50': 'opt50', '75': 'opt75', Done: 'optDone' };
const REPLY_KEY: Record<Opt, string> = { '25': 'reply25', '50': 'reply50', '75': 'reply75', Done: 'replyDone' };

type Extra = { id: number; from: 'me' | 'muntej'; text: string };

const priorityStyle: Record<TaskPriority, { bg: 'redTint' | 'amberTint' | 'chip' | 'primaryTint'; fg: 'red' | 'amberText' | 'textMuted' | 'primary' }> = {
  urgent: { bg: 'redTint', fg: 'red' },
  high: { bg: 'redTint', fg: 'red' },
  medium: { bg: 'amberTint', fg: 'amberText' },
  low: { bg: 'chip', fg: 'textMuted' },
};

export default function EmployeeChatScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const me = useMyProfile();
  const team = useTeam();
  const stats = useHomeStats();
  const tasks = useTasks({ ownerId: me.data?.id, statuses: ACTIVE_STATUSES });
  const w = useWallet();
  const scroll = useRef<ScrollView>(null);

  const [picked, setPicked] = useState<Opt | null>(null);
  const [draft, setDraft] = useState('');
  const [extras, setExtras] = useState<Extra[]>([]);

  const task = me.data ? (tasks.data ?? []).find((x) => x.owner_id === me.data?.id) : undefined;
  const assigner = task ? team.data?.find((p) => p.id === task.assigner_id) : undefined;
  const nameOf = (p?: { full_name: string; full_name_ar: string | null } | null) =>
    p ? (lang === 'ar' && p.full_name_ar ? p.full_name_ar : p.full_name).split(' ')[0] : null;
  const manager = nameOf(assigner) ?? t('manager');
  const helper = task ? nameOf(task.helper) : t('helper');
  const priority: TaskPriority = task?.priority ?? 'high';
  const pr = priorityStyle[priority];

  const timeFmt = (d: Date) =>
    new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(d);
  const dayFmt = (d: Date) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US', { weekday: 'short' }).format(d);

  const hours = stats.data ? hoursSaved(0, stats.data.updatesReceived) : 1.5;
  const earned = picked ? (picked === 'Done' ? 55 : 5) : 0;

  const scrollToEnd = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
  const pick = (o: Opt) => {
    setPicked(o);
    wallet.earn('chat', o === 'Done' ? 55 : 5);
    scrollToEnd();
  };
  const say = (from: Extra['from'], text: string) => setExtras((xs) => [...xs, { id: xs.length + 1, from, text }]);
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    say('me', text);
    say('muntej', t('gotIt', { name: manager }));
    setDraft('');
    scrollToEnd();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior="padding">
      {/* Header */}
      <View
        style={{
          backgroundColor: colors.surface,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          boxShadow: shadows.card,
          paddingTop: insets.top + 4,
          paddingBottom: spacing.xl,
          paddingStart: spacing.screen,
          paddingEnd: 18,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.lg,
          zIndex: 1,
        }}
      >
        <View style={{ width: 46, height: 46 }}>
          <Gradient name="heroEmployee" style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', boxShadow: shadows.purple }}>
            <Sparkles color={colors.onDark} size={22} strokeWidth={1.8} />
          </Gradient>
          <View style={{ position: 'absolute', end: 0, bottom: 1, width: 11, height: 11, borderRadius: 6, backgroundColor: colors.green, borderWidth: 2, borderColor: colors.surface }} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="title" display>
            {t('name')}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green }} />
            <AppText variant="caption" color="textMuted">
              {t('assistant')}
            </AppText>
          </View>
        </View>
        <Pressable
          onPress={() => router.navigate('/25-employee-home')}
          accessibilityRole="link"
          accessibilityLabel={t('levelA11y', { level: LEVEL, pts: formatNumber(w.balance, lang) })}
          hitSlop={{ top: 8, bottom: 8 }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: colors.orangeTint,
            borderRadius: radius.pill,
            paddingVertical: 6,
            paddingStart: 6,
            paddingEnd: spacing.md,
            minHeight: 32,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <PointsCoin size={20} />
          <AppText variant="caption" weight="bold" color="orangeText" numberOfLines={1}>
            {t('levelPill', { level: LEVEL, pts: formatNumber(w.balance, lang) })}
          </AppText>
        </Pressable>
      </View>

      <ScrollView
        ref={scroll}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Value tiles */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, marginHorizontal: spacing.xxl }}>
          <StatTile iconBg="primaryTint" icon={<Clock color={colors.primary} size={15} strokeWidth={2} />}
            value={t('hours', { n: formatNumber(hours, lang, 1) })} label={t('lessReporting')} />
          <StatTile iconBg="greenTint" icon={<Banknote color={colors.green} size={15} strokeWidth={2} />}
            value={formatNumber(w.sar, lang)} label={t('sarPts', { pts: formatNumber(w.balance, lang) })} />
          <StatTile iconBg="orangeTint" icon={<Hand color={colors.orange} size={15} strokeWidth={2} />}
            value={formatNumber(0, lang)} label={t('statusMeetings')} />
        </View>

        <View style={{ paddingHorizontal: spacing.screen, paddingTop: spacing.lg, gap: spacing.lg }}>
          <DayPill label={task ? dayFmt(new Date(task.created_at)) : t('sun')} />

          {/* Task card from the manager */}
          <Bubble>
            <AppText style={{ fontSize: fontSize.cardTitle, lineHeight: 22 }}>{t('newTask', { name: manager })}</AppText>
            <View style={{ backgroundColor: colors.purpleTint, borderStartWidth: 4, borderStartColor: colors.purple, borderRadius: radius.md, padding: spacing.lg, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <IconBadge size={28} bg="surface">
                  <Presentation color={colors.purple} size={16} strokeWidth={1.8} />
                </IconBadge>
                <AppText variant="cardTitle" weight="bold" style={{ flex: 1 }} numberOfLines={2}>
                  {task?.title ?? t('demoTask')}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {(task?.due_at || !task) && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
                    <Calendar color={colors.purple} size={12} strokeWidth={2.2} />
                    <AppText variant="caption" color="textSoft">
                      {task?.due_at ? formatDue(task.due_at, lang) : t('demoDue')}
                    </AppText>
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors[pr.bg], borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
                  <CircleAlert color={colors[pr.fg]} size={12} strokeWidth={2.4} />
                  <AppText variant="caption" weight="bold" color={pr.fg}>
                    {t(`p_${priority}`)}
                  </AppText>
                </View>
              </View>
              {helper && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Avatar name={helper} size={22} gradient="avatarPurple" />
                  <AppText variant="small" color="textSoft" style={{ flex: 1 }}>
                    {t('helperLooped', { name: helper })}
                  </AppText>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <CheckCheck color={colors.primary} size={14} strokeWidth={2.2} />
              <AppText variant="caption" weight="semibold" color="primary">
                {t('received', { time: task ? timeFmt(new Date(task.created_at)) : '09:01' })}
              </AppText>
            </View>
          </Bubble>

          <DayPill label={task ? t('today') : t('tue')} />

          <Bubble>
            <AppText style={{ fontSize: fontSize.cardTitle, lineHeight: 22 }}>
              {task ? t('whereAtTask', { title: task.title }) : t('whereAt')}
            </AppText>
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.purpleTint, borderRadius: radius.pill, paddingVertical: 4, paddingStart: 4, paddingEnd: spacing.md }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' }}>
                <Zap color={colors.onDark} size={12} strokeWidth={2.4} />
              </View>
              <AppText variant="caption" weight="bold" color="purple">
                {t('oneTap')}
              </AppText>
            </View>
          </Bubble>

          {!picked && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {OPTS.map((o) => (
                <Pressable
                  key={o}
                  onPress={() => pick(o)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    height: sizes.touch,
                    paddingHorizontal: 18,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: colors.purpleBorder,
                    backgroundColor: colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0px 3px 10px rgba(109,74,255,0.12)',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <AppText weight="bold" color="purple" style={{ writingDirection: 'ltr' }}>
                    {t(OPT_KEY[o])}
                  </AppText>
                </Pressable>
              ))}
            </View>
          )}

          {picked && (
            <>
              <MyBubble text={t(OPT_KEY[picked])} />
              <Bubble>
                <AppText style={{ fontSize: fontSize.cardTitle, lineHeight: 23 }}>{t(REPLY_KEY[picked], { name: manager })}</AppText>
              </Bubble>
              <PointsBurst label={t('earned', { n: formatNumber(earned, lang), why: picked === 'Done' ? t('whyOnTime') : t('whyFast') })} />
            </>
          )}

          {extras.map((m) =>
            m.from === 'me' ? (
              <MyBubble key={m.id} text={m.text} />
            ) : (
              <Bubble key={m.id}>
                <AppText style={{ fontSize: fontSize.cardTitle, lineHeight: 23 }}>{m.text}</AppText>
              </Bubble>
            ),
          )}
        </View>
      </ScrollView>

      {/* Composer */}
      <View
        style={{
          marginHorizontal: spacing.xxl,
          marginBottom: spacing.md,
          height: 64,
          backgroundColor: colors.surface,
          borderRadius: 32,
          boxShadow: shadows.raised,
          paddingStart: spacing.sm,
          paddingEnd: 6,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={send}
          returnKeyType="send"
          placeholder={t('placeholder')}
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.purple}
          accessibilityLabel={t('message')}
          style={{
            flex: 1,
            minWidth: 0,
            height: 48,
            borderRadius: 24,
            backgroundColor: colors.bg,
            color: colors.text,
            paddingHorizontal: spacing.xxl,
            fontFamily: fontFamily[lang].regular,
            fontSize: fontSize.cardTitle,
            textAlign: isRTL ? 'right' : 'left',
            writingDirection: isRTL ? 'rtl' : 'ltr',
          }}
        />
        {draft.trim() ? (
          <RoundButton label={t('send')} onPress={send} gradient>
            <Send color={colors.onDark} size={20} strokeWidth={1.8} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </RoundButton>
        ) : (
          <>
            <RoundButton
              label={t('attach')}
              onPress={() => {
                say('muntej', t('attachDemo'));
                scrollToEnd();
              }}
            >
              <Paperclip color={colors.purple} size={20} strokeWidth={1.8} />
            </RoundButton>
            <RoundButton
              label={t('voice')}
              onPress={() => {
                say('muntej', t('voiceDemo'));
                scrollToEnd();
              }}
              gradient
            >
              <Mic color={colors.onDark} size={20} strokeWidth={1.8} />
            </RoundButton>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function DayPill({ label }: { label: string }) {
  return (
    <View style={{ alignSelf: 'center', backgroundColor: colors.chip, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 4 }}>
      <AppText variant="micro" weight="bold" color="textMuted" style={{ letterSpacing: 0.4 }}>
        {label}
      </AppText>
    </View>
  );
}

/** Muntej's bubble: start side, small corner at the bottom start. */
function Bubble({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        maxWidth: '88%',
        backgroundColor: colors.surface,
        borderRadius: 20,
        borderBottomStartRadius: 6,
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.xl,
        gap: spacing.md,
        boxShadow: shadows.card,
      }}
    >
      {children}
    </View>
  );
}

/** The employee's own bubble: end side, blue gradient. */
function MyBubble({ text }: { text: string }) {
  return (
    <View style={{ alignSelf: 'flex-end', maxWidth: '80%', borderRadius: 20, borderBottomEndRadius: 6, boxShadow: shadows.primary }}>
      <Gradient name="primary" style={{ borderRadius: 20, borderBottomEndRadius: 6, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl }}>
        <AppText weight="bold" color="onDark">
          {text}
        </AppText>
      </Gradient>
    </View>
  );
}

/** "+N pts" chip with a little confetti around it. */
function PointsBurst({ label }: { label: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ alignSelf: 'center', paddingVertical: spacing.md, paddingHorizontal: 26 }}>
      <View style={{ position: 'absolute', start: 4, top: 4, width: 7, height: 7, backgroundColor: colors.green, transform: [{ rotate: '45deg' }] }} />
      <Svg width={10} height={8} viewBox="0 0 10 8" style={{ position: 'absolute', end: 6, top: 2 }}>
        <Path d="M5 0l5 8H0z" fill={colors.purple} />
      </Svg>
      <Svg width={10} height={10} viewBox="0 0 24 24" style={{ position: 'absolute', start: 10, bottom: 2 }}>
        <Path d="M12 2l2.9 6.9L22 9.3l-5.5 4.8L18.2 22 12 18.1 5.8 22l1.7-7.9L2 9.3l7.1-.4z" fill={colors.gold} />
      </Svg>
      <View style={{ position: 'absolute', end: 2, bottom: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.cyan }} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: colors.orangeTint,
          borderRadius: radius.pill,
          paddingVertical: 5,
          paddingStart: 5,
          paddingEnd: spacing.lg,
          boxShadow: '0px 4px 12px rgba(242,106,27,0.15)',
        }}
      >
        <PointsCoin size={20} />
        <AppText variant="caption" weight="bold" color="orangeText">
          {label}
        </AppText>
      </View>
    </View>
  );
}

function RoundButton({ label, onPress, gradient, children }: { label: string; onPress: () => void; gradient?: boolean; children: ReactNode }) {
  const size = gradient ? 52 : 48;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, opacity: pressed ? 0.85 : 1, boxShadow: gradient ? shadows.purple : undefined })}
    >
      {gradient ? (
        <Gradient name="purple" style={{ flex: 1, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
          {children}
        </Gradient>
      ) : (
        <View style={{ flex: 1, borderRadius: size / 2, backgroundColor: colors.purpleTint, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
      )}
    </Pressable>
  );
}
