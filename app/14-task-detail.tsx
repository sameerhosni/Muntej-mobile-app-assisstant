// Screen 14 · Task detail — see design/v2/html/TaskDetail.dc.html (Arabic: TaskDetailAR.dc.html)
// With ?id= → live task (useTask: subtasks, evidence). Without → the design's demo task "Prepare SPL pitch".
// "Ask <assigner>" and "Split with AI" are local demo actions; ticking a live subtask writes subtasks.done.
// "Change with Muntej" (bottom bar) opens the chat locked on this task — the one place changes are made.
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from 'react-native';
import { TOOL_LABEL, useTaskTools } from '@/features/tasks/toolTags';
import { StepsSection } from '@/features/steps/StepsSection';
import { Spotlight } from '@/features/launch/Spotlight';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Check, ChevronLeft, Clock, Link2, Mic, MessageSquare, Plus, Send, Sparkles } from 'lucide-react-native';
import { AppText, Avatar, BottomCTA, BOTTOM_CTA_SPACE, Card, Gradient, IconBadge, IconButton, PointsCoin } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTask, useTeam, type Evidence, type TaskPriority } from '@/lib/api';
import { ReviewBar } from '@/features/review/ReviewBar';
import { ProofSection } from '@/features/proof/ProofSection';
import { PlanAndHelp } from '@/features/task-detail/PlanAndHelp';
import type { Enum } from '@/lib/api';
import { formatNumber } from '@/features/home/value';
import { shortName } from '@/features/decisions/people';
import { person, personLabel } from '@/features/demo/team';
import { ClarityRing } from '@/features/task-detail/ClarityRing';
import { useToggleSubtask } from '@/features/task-detail/useToggleSubtask';
import { NS } from '@/features/task-detail/strings';

type CheckKey = 'owner' | 'due' | 'doneDef' | 'budget';
type SubVM = { id: string; name: string; who: string; done: boolean };
type ProofVM = { id: string; badge: string; label: string; bg: ColorToken; fg: ColorToken };

const REWARD = { pts: 65, early: 20 };

const priorityTone: Record<TaskPriority, { bg: ColorToken; fg: ColorToken }> = {
  low: { bg: 'chip', fg: 'textMuted' },
  medium: { bg: 'primaryTint', fg: 'primary' },
  high: { bg: 'amberTint', fg: 'amberStrong' },
  urgent: { bg: 'redTint', fg: 'red' },
};

function proofFromEvidence(e: Evidence, lang: string, t: (k: string) => string): ProofVM {
  if (e.type === 'voice') {
    const s = e.duration_seconds ?? 0;
    return { id: e.id, badge: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, label: e.title ?? t('voiceShort'), bg: 'purpleTint', fg: 'purple' };
  }
  if (e.type === 'image') return { id: e.id, badge: 'IMG', label: e.title ?? 'IMG', bg: 'primaryTint', fg: 'primary' };
  if (e.type === 'link') return { id: e.id, badge: 'URL', label: e.title ?? t('link'), bg: 'primaryTint', fg: 'primary' };
  const src = e.title ?? e.storage_path ?? e.url ?? '';
  const ext = (src.match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? e.mime_type?.split('/')[1] ?? 'FILE').slice(0, 4).toUpperCase();
  const green = ['XLS', 'XLSX', 'CSV'].includes(ext);
  const red = ext === 'PDF';
  return {
    id: e.id,
    badge: ext === 'XLSX' ? 'XLS' : ext,
    label: (e.title ?? ext).replace(/\.[a-z0-9]{2,4}$/i, ''),
    bg: red ? 'redTint' : green ? 'greenTint' : 'primaryTint',
    fg: red ? 'red' : green ? 'green' : 'primary',
  };
}

export default function TaskDetailScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const live = !!id;
  const task = useTask(id);
  const tool = useTaskTools().data?.get(id ?? '');
  const team = useTeam();
  const me = useMyProfile();
  const toggle = useToggleSubtask();

  const [asked, setAsked] = useState<Partial<Record<CheckKey, boolean>>>({});
  const [splitting, setSplitting] = useState(false);
  const [localSubs, setLocalSubs] = useState<SubVM[] | null>(null);
  const [liveDone, setLiveDone] = useState<Record<string, boolean>>({});
  const [saveFailed, setSaveFailed] = useState(false);

  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const d = task.data;
  const nameOf = (pid: string | null | undefined) => {
    const p = team.data?.find((x) => x.id === pid);
    return p ? shortName(p, lang) : '';
  };

  // ---- shape the screen from live data or the design's demo values
  const title = live ? d?.title ?? '' : t('demoTitle');
  const ownerName = live ? (d?.owner ? shortName(d.owner, lang) : t('unassigned')) : personLabel(person('faisal'), lang);
  const assignerName = live ? nameOf(d?.assigner_id) || t('manager') : personLabel(person('ahmed'), lang);
  const dueIso = live ? d?.due_at ?? null : nextThursday5pm();
  const due = dueIso
    ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { weekday: lang === 'ar' ? 'long' : 'short', hour: 'numeric' }).format(new Date(dueIso))
    : t('noDue');
  const priority: TaskPriority = live ? d?.priority ?? 'medium' : 'high';
  const source: Enum<'task_source'> = live ? d?.source ?? 'text' : 'teams';
  const sourceRef = live ? d?.source_ref ?? null : 'Jira SPL-142';
  const estimate = live ? d?.estimate_hours ?? null : 22;

  const baseChecks: Record<CheckKey, boolean> = live
    ? { owner: !!d?.owner_id, due: !!d?.due_at, doneDef: !!d?.definition_of_done, budget: !!d?.budget }
    : { owner: true, due: true, doneDef: true, budget: false };
  const checks = (Object.keys(baseChecks) as CheckKey[]).map((k) => ({ key: k, ok: baseChecks[k] || !!asked[k] }));
  const passing = checks.filter((c) => c.ok).length;
  const askedAny = Object.keys(asked).length > 0;
  const baseScore = live ? d?.clarity_score || passing * 25 : 82;
  const clarity = passing === 4 ? 100 : askedAny ? Math.max(baseScore, passing * 25) : baseScore;
  const missing = (['budget', 'doneDef', 'due', 'owner'] as CheckKey[]).find((k) => !checks.find((c) => c.key === k)?.ok);

  const liveSubs: SubVM[] = (d?.subtasks ?? []).map((s) => ({
    id: s.id,
    name: s.title,
    who: nameOf(s.owner_id),
    done: liveDone[s.id] ?? s.done,
  }));
  const subs: SubVM[] | null = live && liveSubs.length > 0 ? liveSubs : localSubs;
  const doneCount = subs?.filter((s) => s.done).length ?? 0;

  const proof: ProofVM[] = live
    ? (d?.evidence ?? []).slice(0, 4).map((e) => proofFromEvidence(e, lang, (k) => t(k)))
    : [
        { id: 'p1', badge: 'PDF', label: t('demoProof.deck'), bg: 'redTint', fg: 'red' },
        { id: 'p2', badge: 'IMG', label: t('demoProof.board'), bg: 'primaryTint', fg: 'primary' },
        { id: 'p3', badge: 'XLS', label: t('demoProof.q3'), bg: 'greenTint', fg: 'green' },
        { id: 'p4', badge: '0:42', label: t('demoProof.voice'), bg: 'purpleTint', fg: 'purple' },
      ];

  const split = () => {
    setSplitting(true);
    setTimeout(() => {
      const me = ownerName;
      setLocalSubs(
        live
          ? [
              { id: 'g1', name: t('genSubs.g1'), who: me, done: false },
              { id: 'g2', name: t('genSubs.g2'), who: me, done: false },
              { id: 'g3', name: t('genSubs.g3', { name: assignerName }), who: assignerName, done: false },
              { id: 'g4', name: t('genSubs.g4'), who: me, done: false },
            ]
          : [
              { id: 'a', name: t('demoSubs.a'), who: me, done: true },
              { id: 'b', name: t('demoSubs.b'), who: personLabel(person('abdullah'), lang), done: true },
              { id: 'c', name: t('demoSubs.c'), who: me, done: false },
              { id: 'd', name: t('demoSubs.d'), who: me, done: false },
              { id: 'e', name: t('demoSubs.e'), who: assignerName, done: false },
            ],
      );
      setSplitting(false);
    }, 650);
  };

  const onToggle = (s: SubVM) => {
    if (live && liveSubs.length > 0) {
      setSaveFailed(false);
      setLiveDone((m) => ({ ...m, [s.id]: !s.done }));
      toggle.mutate(
        { id: s.id, done: !s.done },
        {
          onError: () => {
            setSaveFailed(true);
            setLiveDone((m) => ({ ...m, [s.id]: s.done }));
          },
        },
      );
    } else {
      setLocalSubs((list) => list?.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) ?? null);
    }
  };

  const pTone = priorityTone[priority];
  const SourceIcon = ['voice', 'teams', 'meeting'].includes(source) ? Mic : MessageSquare;

  if (live && (task.isLoading || task.isError || !d)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.screen, gap: spacing.xl }}>
        <IconButton label={t('back')} onPress={leave}>
          <ChevronLeft color={colors.text} size={20} strokeWidth={1.9} style={flip} />
        </IconButton>
        {task.isLoading ? <ActivityIndicator color={colors.primary} /> : <AppText color="textMuted">{t('notFound')}</AppText>}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.xs, paddingBottom: BOTTOM_CTA_SPACE + insets.bottom + (d?.status === 'submitted' ? 70 : 0), gap: spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {/* header */}
        <View style={{ paddingHorizontal: spacing.screen, gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <IconButton label={t('back')} onPress={leave}>
              <ChevronLeft color={colors.text} size={20} strokeWidth={1.9} style={flip} />
            </IconButton>
            <View style={{ flex: 1, gap: 3 }}>
              <AppText variant="title" style={{ fontSize: 22, lineHeight: 28 }}>
                {title}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Avatar name={ownerName} size={18} gradient="avatarBlue" />
                <AppText variant="small" color="textMuted">
                  {t('ownerDue', { name: ownerName, due })}
                </AppText>
                <View style={{ backgroundColor: colors[pTone.bg], borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 1 }}>
                  <AppText variant="micro" weight="bold" color={pTone.fg}>
                    {t(`priority.${priority}`)}
                  </AppText>
                </View>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <MetaChip bg="purpleTint" fg="purpleText" icon={<SourceIcon color={colors.purpleText} size={14} strokeWidth={2} />} label={t(`source.${source}`)} />
            {sourceRef && <MetaChip bg="primaryTint" fg="primary" icon={<Link2 color={colors.primary} size={14} strokeWidth={2} />} label={sourceRef} />}
            {/* the tool this task is linked to (two-way sync): tap to open it there */}
            {tool && (
              <Pressable
                onPress={() => tool.url && Linking.openURL(tool.url)}
                disabled={!tool.url}
                accessibilityRole="link"
                hitSlop={{ top: 8, bottom: 8 }}
              >
                <MetaChip
                  bg="primaryTint"
                  fg="primary"
                  icon={<Link2 color={colors.primary} size={14} strokeWidth={2} />}
                  label={`${TOOL_LABEL[tool.provider] ?? tool.provider}${tool.url ? ' ↗' : ''}`}
                />
              </Pressable>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.orangeTint, borderRadius: radius.pill, paddingVertical: 4, paddingStart: 4, paddingEnd: spacing.md }}>
              <PointsCoin size={18} />
              <AppText variant="caption" weight="bold" color="orangeText">
                {t('points', { pts: formatNumber(REWARD.pts, lang), early: formatNumber(REWARD.early, lang) })}
              </AppText>
            </View>
          </View>
        </View>

        {/* clarity */}
        <View style={{ paddingHorizontal: spacing.screen }}>
          <Card elevation="raised" padding={0} style={{ overflow: 'hidden', padding: spacing.xl, paddingStart: 18, gap: spacing.md }}>
            <Gradient name="avatarBlue" style={{ position: 'absolute', start: 0, top: 0, bottom: 0, width: 4 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xl }}>
              <ClarityRing pct={clarity} lang={lang} label={t('clarityA11y', { n: clarity })} />
              <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
                <AppText weight="bold">{t('clarity')}</AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {checks.map((c) => (
                    <View key={c.key} style={{ backgroundColor: c.ok ? colors.greenTint : colors.surfaceMuted, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <AppText variant="micro" weight="bold" color={c.ok ? (c.key === 'budget' ? 'green' : 'greenText') : 'amberText'}>
                        {c.ok ? '✓' : '✗'} {t(`check.${c.key}`)}
                      </AppText>
                    </View>
                  ))}
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <IconBadge size={22} bg="primaryTint">
                  <Clock color={colors.primary} size={13} strokeWidth={2.2} />
                </IconBadge>
                <AppText variant="caption" weight="bold" color="primary" style={{ flex: 1 }}>
                  {t('clearSooner')}
                </AppText>
              </View>
              {missing && (
                <Pressable
                  onPress={() => setAsked((a) => ({ ...a, [missing]: true }))}
                  accessibilityRole="button"
                  accessibilityLabel={t('askA11y', { name: assignerName, what: t(`checkWhat.${missing}`) })}
                  hitSlop={{ top: 6, bottom: 6 }}
                  style={({ pressed }) => ({ height: 32, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.amberTint, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
                >
                  <AppText variant="caption" weight="bold" color="amberStrong">
                    {t('ask', { name: assignerName })}
                  </AppText>
                </Pressable>
              )}
            </View>
          </Card>
        </View>

        {/* Muntej's follow-up plan + "Who should take it?" / "Too busy?" right where they're needed */}
        {live && d && (
          <View style={{ paddingHorizontal: spacing.screen }}>
            <PlanAndHelp task={d} me={me.data} team={team.data ?? []} />
          </View>
        )}

        {/* steps: live tasks get the real steps section; the prototype tour keeps the design's demo */}
        {live && d ? (
          <Spotlight id="task.steps" style={{ marginHorizontal: spacing.screen }}>
            <StepsSection task={d as unknown as Parameters<typeof StepsSection>[0]['task']} />
          </Spotlight>
        ) : (
        <View style={{ paddingHorizontal: spacing.screen, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="section">{t('subtasks')}</AppText>
            <View style={{ backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 3 }}>
              <AppText variant="caption" weight="extrabold" color="green">
                {subs ? `${formatNumber(doneCount, lang)} / ${formatNumber(subs.length, lang)}` : '—'}
              </AppText>
            </View>
          </View>
          {subs ? (
            <Card padding={0} style={{ paddingHorizontal: spacing.xl, paddingTop: 2, gap: 0, overflow: 'hidden' }}>
              {subs.map((s, i) => (
                <Pressable
                  key={s.id}
                  onPress={() => onToggle(s)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: s.done }}
                  accessibilityLabel={s.name}
                  style={{ minHeight: sizes.touch, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: i === subs.length - 1 ? 0 : 1, borderBottomColor: colors.border }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: s.done ? colors.green : colors.borderBlue, backgroundColor: s.done ? colors.green : colors.transparent, alignItems: 'center', justifyContent: 'center' }}>
                    {s.done && <Check color={colors.onDark} size={13} strokeWidth={3} />}
                  </View>
                  <AppText color={s.done ? 'textFaint' : 'text'} style={{ flex: 1, textDecorationLine: s.done ? 'line-through' : 'none' }} numberOfLines={2}>
                    {s.name}
                  </AppText>
                  {!!s.who && (
                    <AppText variant="caption" color="textFaint">
                      {s.who}
                    </AppText>
                  )}
                </Pressable>
              ))}
            </Card>
          ) : (
            <Card style={{ gap: spacing.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <IconBadge size={38} bg="amberTint">
                  <AlertTriangle color={colors.amberText} size={18} strokeWidth={1.9} />
                </IconBadge>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText weight="bold">{estimate ? t('bigTask', { h: formatNumber(estimate, lang) }) : t('bigTaskPlain')}</AppText>
                  <AppText variant="caption" color="textMuted">
                    {estimate ? t('slips', { h: formatNumber(estimate, lang) }) : t('slipsPlain')}
                  </AppText>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
                  <Clock color={colors.greenText} size={11} strokeWidth={2.6} />
                  <AppText variant="micro" weight="bold" color="greenText">
                    {t('splitSaves')}
                  </AppText>
                </View>
              </View>
              <Pressable
                onPress={split}
                disabled={splitting}
                accessibilityRole="button"
                accessibilityState={{ busy: splitting }}
                style={({ pressed }) => ({ borderRadius: radius.pill, boxShadow: shadows.purple, opacity: pressed ? 0.88 : 1 })}
              >
                <Gradient name="purple" style={{ minHeight: 46, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
                  {splitting ? <ActivityIndicator color={colors.onDark} /> : <Sparkles color={colors.onDark} fill={colors.onDark} size={16} strokeWidth={1.6} />}
                  <AppText variant="cardTitle" weight="bold" color="onDark">
                    {splitting ? t('splitting') : t('split')}
                  </AppText>
                </Gradient>
              </Pressable>
            </Card>
          )}
          {saveFailed && (
            <AppText variant="caption" color="red">
              {t('saveFailed')}
            </AppText>
          )}
        </View>
        )}

        {/* proof: live tasks get the real block (what's needed, attached, add, Muntej's check); the demo keeps the grid */}
        {live && d ? (
          <View style={{ paddingHorizontal: spacing.screen }}>
            <ProofSection task={d} me={me.data} />
          </View>
        ) : (
        <View style={{ paddingHorizontal: spacing.screen, gap: spacing.sm }}>
          <AppText variant="section">{t('proof')}</AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {proof.map((p) => (
              <View key={p.id} style={{ flex: 1, height: 74, borderRadius: radius.tile, backgroundColor: colors.surface, boxShadow: shadows.tile, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 2 }}>
                <View style={{ width: 32, height: 26, borderRadius: 8, backgroundColor: colors[p.bg], alignItems: 'center', justifyContent: 'center' }}>
                  <AppText variant="micro" weight="extrabold" color={p.fg}>
                    {p.badge}
                  </AppText>
                </View>
                <AppText variant="micro" color="textSoft" numberOfLines={1}>
                  {p.label}
                </AppText>
              </View>
            ))}
            {Array.from({ length: Math.max(0, 4 - proof.length) }).map((_, i) => (
              <View key={`sp${i}`} style={{ flex: 1 }} />
            ))}
            <Pressable
              onPress={() => router.push('/10-evidence')}
              accessibilityRole="button"
              accessibilityLabel={t('attach')}
              style={({ pressed }) => ({ flex: 1, height: 74, borderRadius: radius.tile, backgroundColor: colors.primaryTint, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderDashed, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
            >
              <Plus color={colors.primary} size={22} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
        )}
      </ScrollView>

      {live && d ? (
        <ReviewBar task={d} me={me.data} team={team.data ?? []} />
      ) : (
      <BottomCTA
        secondary={
          id
            ? {
                label: t('changeWithMuntej'),
                onPress: () => router.push({ pathname: '/02-capture', params: { mode: 'text', focus: id } }),
                icon: <MessageSquare color={colors.primary} size={18} strokeWidth={2.2} />,
              }
            : undefined
        }
        primary={{
          label: t('submit'),
          onPress: () => router.push(id ? { pathname: '/15-review', params: { id } } : '/15-review'),
          icon: <Send color={colors.onDark} size={18} strokeWidth={2.2} style={flip} />,
        }}
      />
      )}
    </View>
  );
}

function MetaChip({ bg, fg, icon, label }: { bg: ColorToken; fg: ColorToken; icon: ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors[bg], borderRadius: radius.pill, paddingVertical: 4, paddingStart: 6, paddingEnd: spacing.md }}>
      {icon}
      <AppText variant="caption" weight="semibold" color={fg}>
        {label}
      </AppText>
    </View>
  );
}

/** Demo due date: the coming Thursday at 5 PM. */
function nextThursday5pm(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7 || 7));
  d.setHours(17, 0, 0, 0);
  return d.toISOString();
}
