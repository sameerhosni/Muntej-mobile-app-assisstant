// Screen 08 · Polite Pushback — see design/v2/html/Pushback.dc.html (Arabic: PushbackAR.dc.html)
// Employee screen. Live data: my active tasks (useTasks, owner = me) → week load + newest task as "the new task"
// (falls back to the design demo when I have none). Send = LIVE insert into decisions (type priority_question,
// requested_by me, manager_id = my manager) via src/features/pushback/usePushback. Points pill = demo wallet.
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar,
  ChartNoAxesColumn,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Hand,
  ShieldCheck,
  Sparkles,
} from 'lucide-react-native';
import { AppText, Avatar, Button, Card, Gradient, Hero, IconBadge, IconButton, PointsCoin, StatTile } from '@/components/ui';
import { colors, radius, shadows, spacing, type ColorToken } from '@/theme/tokens';
import i18n, { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { formatNumber } from '@/features/home/value';
import { LEVEL, useWallet, wallet } from '@/features/rewards/wallet';
import { NS } from '@/features/pushback/strings';
import { useDecisionStatus, usePushbackModel, useSendPushback } from '@/features/pushback/usePushback';

type Step = 'ask' | 'preview' | 'sent' | 'taken';

const FLAG_POINTS = 10;
const SEGMENT_COLORS: ColorToken[] = ['primary', 'cyan', 'purpleLight'];

export default function PushbackScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const { balance } = useWallet();
  const me = useMyProfile();
  // ?task=<id> from the task page's "Too busy?": talk about that task
  const { task: taskParam } = useLocalSearchParams<{ task?: string }>();
  const { model, profileId } = usePushbackModel(lang, taskParam);
  const send = useSendPushback();
  const [step, setStep] = useState<Step>('ask');
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const status = useDecisionStatus(decisionId);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  const meName = model.meName ?? t('demo.me');
  const managerName = model.managerName ?? t('demo.manager');
  const taskTitle = model.newTask.title ?? t('demo.task');
  const topTitle = model.live ? model.topTitle ?? t('otherWork') : t('demo.top');
  const over = model.total > model.capacity;
  const n = (v: number) => formatNumber(v, lang);
  const days = (d: number) => (d === 1 ? t('oneDay') : d === 2 ? t('twoDays') : t('nDays', { n: n(d) }));

  const dueLabel = model.live
    ? model.newTask.dueAt
      ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { weekday: 'short', day: 'numeric' }).format(
          new Date(model.newTask.dueAt),
        )
      : t('noDue')
    : t('demo.due');

  const itemLabel = (label: string | null, i: number) => {
    if (label) return label;
    if (!model.live) return i === 0 ? t('demo.top') : i === 1 ? t('demo.second') : null;
    return null;
  };

  const segments = [
    ...model.items.map((it, i) => ({ key: it.key, hours: it.hours, color: SEGMENT_COLORS[Math.min(i, 2)], label: itemLabel(it.label, i) })),
    { key: 'new', hours: model.newTask.hours, color: 'red' as ColorToken, label: null },
  ].filter((s) => s.hours > 0);

  /** The neutral question, in a given language (both are stored on the decision). */
  const message = (lng: 'en' | 'ar') => {
    const p = me.data;
    const name = p ? (lng === 'ar' && p.full_name_ar ? p.full_name_ar : p.full_name).split(' ')[0] : i18n.t('s08.demo.me', { lng });
    const task = model.newTask.title ?? i18n.t('s08.demo.task', { lng });
    const top = model.live ? model.topTitle ?? i18n.t('s08.otherWork', { lng }) : i18n.t('s08.demo.top', { lng });
    const d = model.slipDays;
    const dayText = d === 1 ? i18n.t('s08.oneDay', { lng }) : d === 2 ? i18n.t('s08.twoDays', { lng }) : i18n.t('s08.nDays', { lng, n: d });
    const body = over
      ? i18n.t('s08.message', { lng, name, h: model.total, task, top, days: dayText })
      : i18n.t('s08.messageRoom', { lng, name, h: model.total, cap: model.capacity, task });
    return {
      name,
      task,
      top,
      body,
      question: i18n.t('s08.question', { lng }),
      title: i18n.t('s08.decisionTitle', { lng, name, task, top }),
      recommendation: i18n.t('s08.recommendation', { lng, task, top }),
      reason: i18n.t('s08.reason', { lng, name, h: model.total, cap: model.capacity }),
    };
  };

  const preview = message(lang === 'ar' ? 'ar' : 'en');

  const onSend = () => {
    const en = message('en');
    const ar = message('ar');
    send.mutate(
      {
        managerId: model.managerId,
        requestedBy: profileId,
        taskId: model.newTask.id,
        title: en.title,
        titleAr: ar.title,
        recommendation: en.recommendation,
        recommendationAr: ar.recommendation,
        reason: en.reason,
        details: {
          kind: 'polite_pushback',
          load_hours: model.total,
          capacity_hours: model.capacity,
          new_task: { id: model.newTask.id, title: en.task, estimate_hours: model.newTask.hours, due_at: model.newTask.dueAt },
          current: model.items.map((it) => ({ id: it.key, title: it.label, hours: it.hours })),
          slip_days: over ? model.slipDays : 0,
          message: `${en.body} ${en.question}`,
          message_ar: `${ar.body} ${ar.question}`,
        },
      },
      {
        onSuccess: (id) => {
          setDecisionId(id);
          wallet.earn('pushback', FLAG_POINTS);
          setStep('sent');
        },
      },
    );
  };

  const sendError = send.error
    ? t('sendError', {
        msg: send.error.message === 'no-manager' ? t('noManager') : send.error.message === 'no-profile' ? t('noProfile') : send.error.message,
      })
    : null;

  const resolved = status.data && status.data.status !== 'pending' ? status.data.status : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <Hero variant="employee" overlap={40}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
            <IconButton variant="glass" label={t('back')} onPress={goBack}>
              <BackIcon color={colors.onDark} size={22} strokeWidth={2} />
            </IconButton>
            <Pressable
              onPress={() => router.push('/25-employee-home')}
              accessibilityRole="button"
              accessibilityLabel={t('pointsLabel', { lv: n(LEVEL), pts: n(balance) })}
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
                boxShadow: shadows.purple,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <PointsCoin size={20} />
              <AppText variant="caption" weight="bold" color="orangeText" numberOfLines={1}>
                {`${t('level', { n: n(LEVEL) })}${n(balance)} ${t('pts')}`}
              </AppText>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <AppText variant="small" color="onDarkMuted" numberOfLines={1}>
                {t('role', { name: meName })}
              </AppText>
              <AppText variant="titleLg" color="onDark" numberOfLines={1}>
                {t('title')}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <ShieldCheck color={colors.onDark} size={13} strokeWidth={2.2} />
                <AppText variant="caption" color="onDark" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {t('subtitle')}
                </AppText>
              </View>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: colors.glass,
                borderWidth: 1,
                borderColor: colors.glassBorder,
                borderRadius: radius.pill,
                paddingVertical: 3,
                paddingStart: 3,
                paddingEnd: spacing.md,
              }}
            >
              <Avatar name={managerName} size={20} gradient="heroManager" />
              <AppText variant="caption" weight="semibold" color="onDark" numberOfLines={1}>
                {t('from', { name: managerName })}
              </AppText>
            </View>
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -40, gap: spacing.lg }}>
          {/* The new task */}
          <Card
            elevation="raised"
            padding={spacing.xxl}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl, paddingStart: 18 }}
          >
            <Gradient
              name="purple"
              style={{ position: 'absolute', start: 0, top: 16, bottom: 16, width: 4, borderTopEndRadius: 4, borderBottomEndRadius: 4 }}
            />
            <IconBadge size={40} bg="purpleTint">
              <ChartNoAxesColumn color={colors.purple} size={20} strokeWidth={1.8} />
            </IconBadge>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <AppText weight="bold" style={{ fontSize: 17, lineHeight: 22 }} numberOfLines={2}>
                {taskTitle}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <MetaChip icon={<Calendar color={colors.purple} size={12} strokeWidth={2.2} />} label={dueLabel} bg="purpleTint" fg="purple" />
                <MetaChip
                  icon={<CircleAlert color={colors.amberStrong} size={12} strokeWidth={2.2} />}
                  label={t(`priority.${model.newTask.priority}`)}
                  bg="amberTint"
                  fg="amberStrong"
                />
                <MetaChip
                  icon={<Clock color={colors.primary} size={12} strokeWidth={2.2} />}
                  label={t('estimate', { n: n(model.newTask.hours) })}
                  bg="primaryTint"
                  fg="primary"
                />
              </View>
            </View>
          </Card>

          {/* My week */}
          <Card padding={spacing.xxl} style={{ gap: spacing.md, paddingVertical: spacing.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 }}>
                <IconBadge size={32} bg="redTint">
                  <Clock color={colors.red} size={17} strokeWidth={1.8} />
                </IconBadge>
                <AppText weight="semibold" color="textSoft" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {t('plate')}
                </AppText>
              </View>
              <View style={{ backgroundColor: over ? colors.redTint : colors.greenTint, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 3 }}>
                <AppText weight="extrabold" color={over ? 'red' : 'greenText'} style={{ writingDirection: 'ltr' }}>
                  {t('load', { h: n(model.total), cap: n(model.capacity) })}
                </AppText>
              </View>
            </View>
            <View
              accessible
              accessibilityLabel={t('load', { h: n(model.total), cap: n(model.capacity) })}
              style={{ height: 12, borderRadius: 6, backgroundColor: colors.track, flexDirection: 'row', overflow: 'hidden', gap: 2 }}
            >
              {segments.map((s, i) =>
                i === 0 && s.color === 'primary' ? (
                  <Gradient key={s.key} name="primary" direction="horizontal" style={{ flex: s.hours }} />
                ) : (
                  <View key={s.key} style={{ flex: s.hours, backgroundColor: colors[s.color] }} />
                ),
              )}
              {!over && <View style={{ flex: Math.max(0, model.capacity - model.total) }} />}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.xl, rowGap: 4 }}>
              {segments.map((s) => (
                <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%' }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[s.color] }} />
                  <AppText variant="caption" color="textSoft" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {s.key === 'new'
                      ? t('newLegend', { h: n(s.hours) })
                      : s.label
                        ? t('legend', { name: s.label, h: n(s.hours) })
                        : t('other', { h: n(s.hours) })}
                  </AppText>
                </View>
              ))}
            </View>
          </Card>

          {/* Step 0 · choose */}
          {step === 'ask' && (
            <View style={{ gap: spacing.md, marginTop: 4 }}>
              <View
                style={{
                  backgroundColor: colors.amberTint,
                  borderRadius: radius.button,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.lg,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                }}
              >
                <IconBadge size={32} bg="surface">
                  <Sparkles color={colors.amberText} size={18} strokeWidth={1.8} />
                </IconBadge>
                <AppText weight="semibold" color="amberStrong" style={{ flex: 1, lineHeight: 20 }}>
                  {over
                    ? t('impactOver', { top: topTitle, days: days(model.slipDays) })
                    : t('impactRoom', { h: n(model.total), cap: n(model.capacity) })}
                </AppText>
              </View>
              <Button label={t('push')} tone="purple" onPress={() => setStep('preview')} />
              <Button label={t('take')} variant="outline" onPress={() => setStep('taken')} />
            </View>
          )}

          {/* Step 1 · preview the neutral question */}
          {step === 'preview' && (
            <View style={{ gap: spacing.md, marginTop: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ShieldCheck color={colors.purple} size={14} strokeWidth={2.2} />
                <AppText variant="small" weight="semibold" color="purple">
                  {t('sentBy')}
                </AppText>
              </View>
              <Card padding={spacing.xl} style={{ flexDirection: 'row', gap: spacing.md, borderBottomStartRadius: 6 }}>
                <Gradient name="heroEmployee" style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles color={colors.onDark} size={16} strokeWidth={2} />
                </Gradient>
                <AppText style={{ flex: 1, lineHeight: 22 }}>
                  {preview.body}
                  {'\n'}
                  <AppText weight="extrabold">{preview.question}</AppText>
                </AppText>
              </Card>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button label={t('send')} tone="purple" onPress={onSend} loading={send.isPending} style={{ flex: 1 }} />
                <Button
                  label={t('cancel')}
                  variant="outline"
                  onPress={() => {
                    send.reset();
                    setStep('ask');
                  }}
                  style={{ width: 100 }}
                />
              </View>
              {sendError && (
                <AppText variant="small" color="red">
                  {sendError}
                </AppText>
              )}
            </View>
          )}

          {/* Step 2 · sent */}
          {step === 'sent' && (
            <View style={{ gap: spacing.md, marginTop: 4 }}>
              <Card padding={spacing.xl} style={{ flexDirection: 'row', gap: spacing.md }}>
                <Avatar name={managerName} size={32} gradient="heroManager" />
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText variant="small" weight="bold" color="primary">
                    {resolved ? t('replied', { name: managerName }) : t('sentTo', { name: managerName })}
                  </AppText>
                  <AppText variant="cardTitle" weight="regular" style={{ lineHeight: 22 }}>
                    {resolved === 'approved'
                      ? t('approved', { top: topTitle })
                      : resolved === 'declined'
                        ? t('declined')
                        : resolved
                          ? t('answered', { name: managerName })
                          : t('waiting')}
                  </AppText>
                </View>
              </Card>
              <View
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: colors.orangeTint,
                  borderRadius: radius.pill,
                  paddingVertical: 4,
                  paddingStart: 4,
                  paddingEnd: spacing.md,
                }}
              >
                <PointsCoin size={20} />
                <AppText variant="caption" weight="bold" color="orangeText">
                  {`+${n(FLAG_POINTS)} ${t('flagged')}`}
                </AppText>
              </View>
              <Button label={t('done')} variant="outline" size="md" onPress={goBack} />
            </View>
          )}

          {/* "I'll take it" */}
          {step === 'taken' && (
            <View style={{ gap: spacing.md, marginTop: 4 }}>
              <View
                style={{
                  backgroundColor: colors.greenTint,
                  borderRadius: radius.button,
                  paddingVertical: spacing.lg,
                  paddingHorizontal: spacing.xl,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                }}
              >
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
                  <Check color={colors.onDark} size={16} strokeWidth={2.6} />
                </View>
                <AppText color="greenText" style={{ flex: 1 }}>
                  {t('taken')}
                </AppText>
              </View>
              <Button label={t('done')} variant="outline" size="md" onPress={goBack} />
            </View>
          )}

          {/* Value tiles (design figures; "protected" uses the live slip estimate) */}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <StatTile icon={<Clock color={colors.primary} size={15} strokeWidth={2} />} iconBg="primaryTint" value={t('tiles.fast')} label={t('tiles.fastLabel')} />
            <StatTile icon={<Hand color={colors.orange} size={15} strokeWidth={2} />} iconBg="orangeTint" value={n(0)} label={t('tiles.awkward')} />
            <StatTile
              icon={<ShieldCheck color={colors.purple} size={15} strokeWidth={2} />}
              iconBg="purpleTint"
              value={t('tiles.protectedValue', { n: n(over ? model.slipDays : 0) })}
              label={t('tiles.protectedLabel', { top: topTitle })}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function MetaChip({ icon, label, bg, fg }: { icon: ReactNode; label: string; bg: ColorToken; fg: ColorToken }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors[bg], borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
      {icon}
      <AppText variant="caption" weight="bold" color={fg} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}
