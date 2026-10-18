// Screen 17 · Summaries — see design/v2/html/Summaries.dc.html (Arabic: SummariesAR.dc.html)
// Live data: workspaces (Project tab), all tasks (Product tab = the whole portfolio), team + tasks + reviews (Employee tab).
// Summaries are built locally from tasks (done / in progress / late / next due) — no AI call yet.
// Listen = demo player, PDF/Share = system share sheet with the text, feedback Send = demo sent state.
// Tabs with nothing live fall back to the design's sample.
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { router } from 'expo-router';
import {
  AlertCircle,
  Banknote,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleCheck,
  Clock,
  FileText,
  Flame,
  Hand,
  Sparkles,
  Square,
  Star,
  TrendingUp,
  Upload,
  Volume2,
} from 'lucide-react-native';
import { AppText, Avatar, Button, Card, Gradient, Hero, IconBadge, IconButton, PointsCoin, StatTile, TextField } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useTasks, useTeam } from '@/lib/api';
import { formatNumber, HOURLY_COST_SAR } from '@/features/home/value';
import { personName } from '@/features/dashboard/metrics';
import { useRatedReviews } from '@/features/dashboard/model';
import { useDemoAudio } from '@/features/brief/useDemoAudio';
import { demoSummary, summarize, useWorkspaces, type Item, type Tab, type Tone } from '@/features/summaries/model';
import { NS } from '@/features/summaries/strings';

const TABS: Tab[] = ['p', 'r', 'e'];
/** Writing a status report by hand ≈ 2 h of a manager's time. */
const REPORT_HOURS = 2;
const DEMO_ID = '__demo__';

const TONE: Record<Tone, { bg: ColorToken; Icon: typeof Check }> = {
  ok: { bg: 'green', Icon: Check },
  info: { bg: 'primaryLight', Icon: Clock },
  warn: { bg: 'amberText', Icon: AlertCircle },
  risk: { bg: 'red', Icon: Flame },
  star: { bg: 'orange', Icon: Star },
  next: { bg: 'primary', Icon: Sparkles },
};

export default function SummariesScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const tasks = useTasks();
  const team = useTeam();
  const workspaces = useWorkspaces();
  const reviews = useRatedReviews();
  const audio = useDemoAudio(30);

  const [tab, setTab] = useState<Tab>('p');
  const [picked, setPicked] = useState<Partial<Record<Tab, string>>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [generated, setGenerated] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Record<string, boolean>>({});

  const taskList = tasks.data ?? [];
  const teamList = team.data ?? [];

  const items: Record<Tab, Item[]> = useMemo(
    () => ({
      p: (workspaces.data ?? []).map((w) => ({ id: w.id, name: lang === 'ar' && w.name_ar ? w.name_ar : w.name })),
      r: taskList.length > 0 ? [{ id: 'all', name: t('allProjects') }] : [],
      e: teamList.filter((p) => p.role === 'employee').map((p) => ({ id: p.id, name: personName(p, lang) })),
    }),
    [workspaces.data, taskList.length, teamList, lang, t],
  );

  const list = items[tab];
  const demo = list.length === 0;
  const item: Item = demo ? { id: DEMO_ID, name: '' } : list.find((x) => x.id === picked[tab]) ?? list[0];
  const key = `${tab}:${item.id}`;
  const isGen = !!generated[key];

  const summary = useMemo(
    () =>
      demo
        ? demoSummary(tab, t)
        : summarize(tab, item, { t, lang, tasks: taskList, reviews: reviews.data ?? [], team: teamList, workspaceCount: items.p.length }),
    [demo, tab, item, t, lang, taskList, reviews.data, teamList, items.p.length],
  );

  const draft = drafts[key] ?? summary.draft ?? '';
  const reportText = [t('report.title', { subject: summary.subject }), summary.score, '', ...summary.bullets.map((b) => `• ${b.text}`), '', t('report.footer')].join('\n');

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const share = (title?: string) => {
    Share.share({ message: reportText, title: title ?? t('report.title', { subject: summary.subject }) }).catch(() => undefined);
  };
  const switchTab = (k: Tab) => {
    setTab(k);
    setPickerOpen(false);
    audio.stop();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Hero overlap={30}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconButton variant="glass" label={t('back')} onPress={back}>
              <ChevronLeft color={colors.onDark} size={22} strokeWidth={2.2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </IconButton>
            <AppText variant="titleLg" color="onDark" numberOfLines={1} style={{ flex: 1, fontSize: 28, lineHeight: 36 }}>
              {t('title')}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile variant="glass" iconBg="primaryLight" icon={<Clock color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={t('hours', { n: formatNumber(REPORT_HOURS, lang) })} label={t('writingSaved')} />
            <StatTile variant="glass" iconBg="green" icon={<Banknote color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={formatNumber(REPORT_HOURS * HOURLY_COST_SAR, lang)} label={t('sarReport')} />
            <StatTile variant="glass" iconBg="orange" icon={<Hand color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={t('oneTap')} label={t('thatsAll')} />
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -30, gap: spacing.lg }}>
          {/* Tabs */}
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 4, padding: 5, backgroundColor: colors.surface, borderRadius: radius.pill, boxShadow: shadows.raised }}>
            {TABS.map((k) => {
              const on = tab === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => switchTab(k)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={{ flex: 1, minHeight: sizes.touch, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : colors.surface }}
                >
                  <AppText weight="bold" color={on ? 'onDark' : 'text'}>
                    {t(`tabs.${k}`)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Subject picker */}
          <View style={{ gap: spacing.sm }}>
            <Card
              padding={spacing.lg}
              onPress={list.length > 1 ? () => setPickerOpen((o) => !o) : undefined}
              accessibilityLabel={`${t('pickA11y')}: ${summary.subject}`}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl }}
            >
              <Avatar name={summary.subject || '?'} size={44} />
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <AppText weight="bold" numberOfLines={1} style={{ fontSize: 16 }}>
                  {summary.subject}
                </AppText>
                <AppText variant="caption" color="textMuted" numberOfLines={1}>
                  {summary.meta}
                </AppText>
              </View>
              {list.length > 1 && (
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: pickerOpen ? '180deg' : '0deg' }] }}>
                  <ChevronDown color={colors.primary} size={16} strokeWidth={2.2} />
                </View>
              )}
            </Card>
            {pickerOpen && (
              <Card padding={spacing.xs} style={{ gap: 0 }}>
                {list.map((x) => {
                  const on = x.id === item.id;
                  return (
                    <Pressable
                      key={x.id}
                      onPress={() => {
                        setPicked((s) => ({ ...s, [tab]: x.id }));
                        setPickerOpen(false);
                        audio.stop();
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={({ pressed }) => ({
                        minHeight: sizes.touch, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md,
                        borderRadius: radius.md, backgroundColor: on ? colors.primaryTint : pressed ? colors.surfaceMuted : colors.transparent,
                      })}
                    >
                      <Avatar name={x.name} size={28} />
                      <AppText weight={on ? 'bold' : 'semibold'} color={on ? 'primary' : 'text'} numberOfLines={1} style={{ flex: 1 }}>
                        {x.name}
                      </AppText>
                      {on && <Check color={colors.primary} size={16} strokeWidth={2.4} />}
                    </Pressable>
                  );
                })}
              </Card>
            )}
          </View>

          {!isGen ? (
            <>
              <Button
                label={t('generate')}
                onPress={() => setGenerated((g) => ({ ...g, [key]: true }))}
                icon={<Sparkles color={colors.onDark} size={22} strokeWidth={1.8} />}
                style={{ marginTop: spacing.xs }}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }}>
                <Feature bg="greenTint" icon={<TrendingUp color={colors.green} size={18} strokeWidth={1.9} />} label={t('features.progress')} />
                <Feature bg="amberTint" icon={<AlertCircle color={colors.amberText} size={18} strokeWidth={1.9} />} label={t('features.risks')} />
                <Feature bg="orangeTint" icon={<Star color={colors.orange} size={18} strokeWidth={1.9} />} label={t('features.points')} />
                <Feature bg="primaryTint" icon={<Sparkles color={colors.primary} size={18} strokeWidth={1.9} />} label={t('features.next')} />
              </View>
            </>
          ) : (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, overflow: 'hidden', boxShadow: shadows.raised }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md, paddingHorizontal: spacing.xxl, backgroundColor: colors.primaryTint }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Sparkles color={colors.primary} size={16} strokeWidth={2} />
                  <AppText variant="small" weight="bold" color="primary">
                    {t('last30')}
                  </AppText>
                </View>
                <View style={{ borderRadius: radius.pill, overflow: 'hidden' }}>
                  <Gradient name="avatarBlue" direction="horizontal" style={{ paddingHorizontal: spacing.md, paddingVertical: 4 }}>
                    <AppText variant="caption" weight="extrabold" color="onDark">
                      {summary.score}
                    </AppText>
                  </Gradient>
                </View>
              </View>
              <View style={{ paddingTop: spacing.md, paddingBottom: spacing.xl, paddingHorizontal: spacing.xxl, gap: 7 }}>
                {summary.bullets.map((b, i) => {
                  const st = TONE[b.tone];
                  return (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                      <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: colors[st.bg], alignItems: 'center', justifyContent: 'center' }}>
                        <st.Icon color={colors.onDark} size={14} strokeWidth={2.4} />
                      </View>
                      <AppText weight="semibold" style={{ flex: 1, lineHeight: 18 }}>
                        {b.text}
                      </AppText>
                    </View>
                  );
                })}
                {audio.playing && (
                  <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.track, overflow: 'hidden', flexDirection: 'row', marginTop: 4 }}>
                    <View style={{ width: `${audio.progress * 100}%`, backgroundColor: colors.primary }} />
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 4 }}>
                  <SmallAction
                    label={audio.playing ? t('stop') : t('listen')}
                    icon={audio.playing ? <Square color={colors.primary} size={13} strokeWidth={2.4} /> : <Volume2 color={colors.primary} size={15} strokeWidth={2} />}
                    onPress={audio.playing ? audio.stop : audio.toggle}
                  />
                  <SmallAction label={t('pdf')} icon={<FileText color={colors.primary} size={15} strokeWidth={2} />} onPress={() => share(t('report.pdfTitle'))} />
                  <SmallAction label={t('share')} icon={<Upload color={colors.primary} size={15} strokeWidth={2} />} onPress={() => share()} />
                </View>
              </View>
            </View>
          )}

          {/* Employee feedback (drafted, editable, demo send) */}
          {isGen && tab === 'e' && summary.short && (
            sent[key] ? (
              <Card tone="green" style={{ flexDirection: 'row', alignItems: 'center' }}>
                <IconBadge size={36} round gradient="success">
                  <CircleCheck color={colors.onDark} size={18} strokeWidth={2.4} />
                </IconBadge>
                <AppText weight="bold" color="greenText" style={{ flex: 1 }}>
                  {t('sent', { name: summary.short })}
                </AppText>
              </Card>
            ) : (
              <Card elevation="raised" padding={spacing.xxl} style={{ gap: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Avatar name={summary.subject} size={26} />
                  <AppText variant="small" weight="bold" color="textSoft" style={{ flex: 1 }} numberOfLines={1}>
                    {t('feedbackFor', { name: summary.short })}
                  </AppText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primaryTint, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
                    <Sparkles color={colors.primary} size={11} strokeWidth={2.4} />
                    <AppText variant="micro" weight="bold" color="primary">
                      {t('drafted')}
                    </AppText>
                  </View>
                </View>
                <TextField
                  value={draft}
                  onChangeText={(v) => setDrafts((d) => ({ ...d, [key]: v }))}
                  multiline
                  accessibilityLabel={t('feedbackA11y')}
                  style={{ minHeight: 72, textAlignVertical: 'top', lineHeight: 22 }}
                />
                <Button
                  label={t('send')}
                  disabled={!draft.trim()}
                  onPress={() => setSent((s) => ({ ...s, [key]: true }))}
                  icon={<PointsCoin size={20} />}
                />
              </Card>
            )
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Feature({ icon, label, bg }: { icon: ReactNode; label: string; bg: ColorToken }) {
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.tile, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, boxShadow: shadows.tile }}>
      <IconBadge size={36} bg={bg}>{icon}</IconBadge>
      <AppText weight="bold" numberOfLines={2} style={{ flexShrink: 1, lineHeight: 18 }}>
        {label}
      </AppText>
    </View>
  );
}

function SmallAction({ label, icon, onPress }: { label: string; icon: ReactNode; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1, minHeight: sizes.touch, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderBlue,
        backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.85 : 1,
      })}
    >
      {icon}
      <AppText variant="small" weight="bold" color="primary">
        {label}
      </AppText>
    </Pressable>
  );
}
