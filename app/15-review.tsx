// Screen 15 · Review loop — see design/v2/html/Review.dc.html (Arabic: ReviewAR.dc.html)
// With ?id= → live review rounds (useTask(id).reviews); the decision writes reviews + tasks + activity_log.
// Without → the design's demo rounds; rating, Approve & close and Send back are local state.
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Check, ChevronLeft, Clock, FileText, Hand, Heart, MessageCircle, Play, RotateCcw, Star } from 'lucide-react-native';
import { AppText, Avatar, Button, Gradient, IconBadge, IconButton, PointsCoin, TextField } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTask } from '@/lib/api';
import { formatNumber } from '@/features/home/value';
import { shortName } from '@/features/decisions/people';
import { person, personLabel } from '@/features/demo/team';
import { useDecideReview } from '@/features/review/useDecideReview';
import { AutoApproveTag } from '@/features/review/ReviewBar';
import { autoApproveAt, openReview } from '@/features/review/countdown';
import { NS } from '@/features/review/strings';

type Status = 'pending' | 'approved' | 'returned';
type FileTag = { label: string; bg: ColorToken; fg: ColorToken };
type RoundVM = {
  n: number;
  day: string;
  sub: string;
  files: FileTag[];
  reply: { stars: number; decision: 'approved' | 'sent_back'; note: string | null; voice?: string } | null;
};

const CRITERIA = ['Quality', 'On time', 'Communication'] as const;
const criteriaStyle: Record<(typeof CRITERIA)[number], { bg: ColorToken; fg: ColorToken; Icon: typeof Star }> = {
  Quality: { bg: 'primaryTint', fg: 'primary', Icon: Star },
  'On time': { bg: 'greenTint', fg: 'greenText', Icon: Clock },
  Communication: { bg: 'purpleTint', fg: 'purpleText', Icon: MessageCircle },
};

const starsText = (r: number) => [1, 2, 3, 4, 5].map((i) => (i <= r ? '★' : '☆')).join('');
const starPoints = (r: number) => (r === 5 ? 30 : r * 5);

/** Weekday name; Jan 4 2026 is a Sunday, so dayIdx 0 = Sunday. */
function weekday(dayIdx: number, lang: string) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-US', { weekday: lang === 'ar' ? 'long' : 'short' }).format(new Date(2026, 0, 4 + dayIdx));
}

export default function ReviewScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const live = !!id;
  const task = useTask(id);
  const me = useMyProfile();
  const decide = useDecideReview();

  const [rating, setRating] = useState(4);
  const [criteria, setCriteria] = useState<string[]>([...CRITERIA]);
  const [status, setStatus] = useState<Status>('pending');
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);
  const [panelH, setPanelH] = useState(260);

  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const d = task.data;

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

  // ---- shape rounds from live reviews or the design's demo
  const ownerName = live ? (d?.owner ? shortName(d.owner, lang) : '') : personLabel(person('faisal'), lang);
  const taskTitle = live ? d!.title : t('demoTask');
  const reviews = live ? [...(d?.reviews ?? [])].sort((a, b) => a.round - b.round) : [];
  const pendingReview = live ? reviews.filter((r) => !r.decision).pop() ?? null : null;
  const lastReview = reviews[reviews.length - 1] ?? null;

  const rounds: RoundVM[] = live
    ? reviews.map((r) => ({
        n: r.round,
        day: weekday(new Date(r.created_at).getDay(), lang),
        sub: r.submission_note || t('submittedFallback'),
        files: [],
        reply: r.decision ? { stars: r.rating ?? 0, decision: r.decision, note: r.note } : null,
      }))
    : [
        {
          n: 1,
          day: weekday(2, lang),
          sub: t('demo.r1Sub'),
          files: [{ label: 'PDF · v1', bg: 'redTint', fg: 'red' }],
          reply: { stars: 3, decision: 'sent_back', note: t('demo.r1Note'), voice: '0:18' },
        },
        {
          n: 2,
          day: weekday(3, lang),
          sub: t('demo.r2Sub'),
          files: [
            { label: 'PDF · v2', bg: 'redTint', fg: 'red' },
            { label: 'XLS', bg: 'greenTint', fg: 'green' },
          ],
          reply: status === 'returned' ? { stars: rating, decision: 'sent_back', note: note.trim() || t('demo.r3Note') } : null,
        },
      ];

  // live: what the bottom area shows when nothing was decided in this visit
  // the owner never decides on their own work (a manager's own task goes to their manager): they see it waiting
  const ownerViewing = live && !!me.data && me.data.id === d?.owner_id;
  const liveView: Status | 'waiting' =
    status !== 'pending' ? status : pendingReview ? (ownerViewing ? 'waiting' : 'pending') : lastReview?.decision === 'approved' ? 'approved' : 'waiting';
  const view = live ? liveView : status;
  const shownRating = live && status === 'pending' && liveView === 'approved' ? lastReview?.rating ?? 5 : rating;
  const currentRound = live ? pendingReview?.round ?? lastReview?.round ?? 1 : 2;
  const roundLabel = view === 'returned' ? currentRound + 1 : currentRound;
  const pts = 50 + 15 + starPoints(shownRating);

  const reset = () => {
    setStatus('pending');
    setNoteOpen(false);
    setNote('');
    setRating(4);
    setCriteria([...CRITERIA]);
  };

  const submit = (decision: 'approved' | 'sent_back') => {
    setFailed(false);
    const next: Status = decision === 'approved' ? 'approved' : 'returned';
    if (!live) {
      setStatus(next);
      return;
    }
    if (!pendingReview || !me.data || !d) {
      setFailed(true);
      return;
    }
    decide.mutate(
      {
        reviewId: pendingReview.id,
        round: pendingReview.round,
        taskId: d.id,
        taskTitle: d.title,
        ownerId: d.owner_id,
        meId: me.data.id,
        decision,
        rating,
        criteria,
        note: note.trim() || null,
      },
      { onSuccess: () => setStatus(next), onError: () => setFailed(true) },
    );
  };

  const toggleCriterion = (c: string) => setCriteria((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.xs, paddingBottom: panelH + insets.bottom + 40, paddingHorizontal: spacing.screen, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <IconButton label={t('back')} onPress={leave}>
            <ChevronLeft color={colors.text} size={20} strokeWidth={1.9} style={flip} />
          </IconButton>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="title" style={{ fontSize: 22, lineHeight: 28 }}>
              {t('title')}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {!!ownerName && <Avatar name={ownerName} size={18} gradient="avatarBlue" />}
              <AppText variant="small" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
                {ownerName ? t('taskOwner', { task: taskTitle, name: ownerName }) : taskTitle}
              </AppText>
            </View>
          </View>
          <Gradient name="warning" style={{ borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6 }}>
            <AppText variant="caption" weight="extrabold" color="onDark">
              {t('roundBadge', { n: formatNumber(roundLabel, lang) })}
            </AppText>
          </Gradient>
        </View>

        {/* stats */}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <MiniStat flex={1} bg="purpleTint" icon={<RotateCcw color={colors.purple} size={15} strokeWidth={2.1} />} value={formatNumber(live ? Math.max(1, reviews.length) : 2, lang)} label={t('rounds')} />
          <MiniStat flex={1.4} bg="primaryTint" icon={<Clock color={colors.primary} size={15} strokeWidth={2.1} />} value={t('faster')} label={t('fasterLabel')} />
          <MiniStat flex={1} bg="orangeTint" icon={<Hand color={colors.orange} size={15} strokeWidth={2.1} />} value={formatNumber(0, lang)} label={t('chases')} />
        </View>

        {/* thread */}
        <View style={{ gap: 9 }}>
          {rounds.map((r) => (
            <View key={r.n} style={{ gap: 9 }}>
              <View style={{ alignSelf: 'center', backgroundColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 3 }}>
                <AppText variant="micro" weight="bold" color="textMuted">
                  {t('roundDay', { n: formatNumber(r.n, lang), day: r.day })}
                </AppText>
              </View>
              <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, maxWidth: '85%' }}>
                <Avatar name={ownerName || '?'} size={28} gradient="avatarBlue" />
                <View
                  style={{
                    flexShrink: 1,
                    backgroundColor: colors.surface,
                    boxShadow: shadows.tile,
                    borderRadius: 18,
                    borderBottomStartRadius: 6,
                    paddingVertical: 9,
                    paddingHorizontal: spacing.lg,
                    gap: 6,
                  }}
                >
                  <AppText>{r.sub}</AppText>
                  {r.files.length > 0 && (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {r.files.map((f) => (
                        <View key={f.label} style={{ backgroundColor: colors[f.bg], borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
                          <AppText variant="micro" weight="extrabold" color={f.fg}>
                            {f.label}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
              {r.reply && (
                <View style={{ alignSelf: 'flex-end', maxWidth: '80%', borderRadius: 18, borderBottomEndRadius: 6, boxShadow: shadows.primary, overflow: 'hidden' }}>
                  <Gradient name="primary" style={{ paddingVertical: 9, paddingHorizontal: spacing.lg, gap: 5 }}>
                    <AppText variant="caption" weight="bold" color="goldLight">
                      {t(r.reply.decision === 'approved' ? 'approvedTag' : 'sentBackTag', { stars: starsText(r.reply.stars) })}
                    </AppText>
                    {!!r.reply.note && (
                      <AppText color="onDark" style={{ lineHeight: 20 }}>
                        {r.reply.note}
                      </AppText>
                    )}
                    {r.reply.voice && (
                      <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.glass, borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
                        <Play color={colors.onDark} fill={colors.onDark} size={10} style={flip} />
                        <AppText variant="micro" weight="bold" color="onDark">
                          {t('voice', { t: r.reply.voice })}
                        </AppText>
                      </View>
                    )}
                  </Gradient>
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* bottom panel */}
      <View
        onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}
        style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 14 }}
      >
        {view === 'pending' && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 26, padding: spacing.xxl, gap: spacing.lg, boxShadow: shadows.raised }}>
            {live && <AutoApproveTag at={autoApproveAt(openReview(d?.reviews))} />}
            <AppText variant="section" style={{ fontSize: 18 }}>
              {t('rate')}
            </AppText>
            <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Pressable
                  key={i}
                  onPress={() => setRating(i)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: rating === i }}
                  accessibilityLabel={i === 1 ? t('starOne') : t('starMany', { n: formatNumber(i, lang) })}
                  style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Star size={36} color={colors.amber} fill={i <= rating ? colors.gold : colors.transparent} strokeWidth={1.5} />
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              {CRITERIA.map((c) => {
                const on = criteria.includes(c);
                const st = criteriaStyle[c];
                return (
                  <Pressable
                    key={c}
                    onPress={() => toggleCriterion(c)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    hitSlop={{ top: 8, bottom: 8 }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      minHeight: 30,
                      backgroundColor: on ? colors[st.bg] : colors.surface,
                      borderWidth: 1,
                      borderColor: on ? colors.transparent : colors.borderBlue,
                      borderRadius: radius.pill,
                      paddingStart: 7,
                      paddingEnd: spacing.md,
                    }}
                  >
                    <st.Icon color={on ? colors[st.fg] : colors.textFaint} size={13} strokeWidth={2.2} />
                    <AppText variant="caption" weight="bold" color={on ? st.fg : 'textMuted'}>
                      {t(`criteria.${c}`)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            {noteOpen && (
              <TextField
                label={t('noteLabel', { name: ownerName })}
                placeholder={live ? t('notePh') : t('demo.r3Note')}
                value={note}
                onChangeText={setNote}
                autoFocus
                returnKeyType="done"
              />
            )}
            {failed && (
              <AppText variant="caption" color="red" align="center">
                {t('saveFailed')}
              </AppText>
            )}
            {noteOpen ? (
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button label={t('sendBack')} onPress={() => submit('sent_back')} loading={decide.isPending} style={{ flex: 1 }} />
                <Button label={t('cancel')} variant="outline" onPress={() => setNoteOpen(false)} disabled={decide.isPending} style={{ flex: 1 }} />
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button label={t('approve')} onPress={() => submit('approved')} loading={decide.isPending} style={{ flex: 1 }} />
                <Button label={t('sendBack')} variant="outline" onPress={() => setNoteOpen(true)} disabled={decide.isPending} style={{ flex: 1 }} />
              </View>
            )}
          </View>
        )}

        {view === 'returned' && (
          <View style={{ backgroundColor: colors.amberTint, borderWidth: 1, borderColor: colors.gold, borderRadius: radius.cardLg, paddingVertical: spacing.xl, paddingHorizontal: spacing.xxl, gap: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
              <IconBadge size={38} gradient="warning">
                <RotateCcw color={colors.onDark} size={18} strokeWidth={2} />
              </IconBadge>
              <View style={{ flex: 1, gap: 1 }}>
                <AppText variant="cardTitle" weight="bold" color="amberStrong">
                  {t('sentBackTo', { name: ownerName })}
                </AppText>
                <AppText variant="caption" color="amberStrong">
                  {t('bringsNext', { n: formatNumber(currentRound + 1, lang) })}
                </AppText>
              </View>
            </View>
            <Button size="md" variant="outline" label={live ? t('backToTask') : t('replay')} onPress={live ? leave : reset} />
          </View>
        )}

        {view === 'approved' && (
          <View style={{ backgroundColor: colors.greenTint, borderWidth: 1, borderColor: colors.greenLight, borderRadius: radius.cardLg, padding: spacing.xxl, gap: spacing.md, overflow: 'hidden', boxShadow: shadows.raised }}>
            <Svg width={64} height={26} viewBox="0 0 110 44" style={{ position: 'absolute', top: 6, ...(isRTL ? { left: 10 } : { right: 10 }) }} pointerEvents="none">
              <Path d="M10 6l4 4-4 4-4-4z" fill={colors.purple} />
              <Path d="M40 4l5 8h-10z" fill={colors.gold} />
              <Path d="M70 10l1.8 3.8 4.2.6-3 2.9.7 4.1-3.7-2-3.7 2 .7-4.1-3-2.9 4.2-.6z" fill={colors.orange} />
              <Circle cx={55} cy={30} r={3} fill={colors.primary} />
              <Circle cx={95} cy={8} r={3} fill={colors.cyan} />
              <Rect x={88} y={28} width={8} height={4} rx={2} fill={colors.green} transform="rotate(30 92 30)" />
            </Svg>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <IconBadge size={32} round gradient="success">
                <Check color={colors.onDark} size={16} strokeWidth={3} />
              </IconBadge>
              <AppText variant="section" color="greenText" style={{ fontSize: 19 }}>
                {t('done', { stars: starsText(shownRating) })}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.orangeTint, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg }}>
              <PointsCoin size={24} />
              <AppText variant="big" color="orangeText">
                +{formatNumber(pts, lang)}
              </AppText>
              <AppText variant="caption" color="orangeText" style={{ flex: 1, lineHeight: 17 }}>
                {t('ptsWhy', { r: shownRating, sp: starPoints(shownRating) })}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <ResultChip bg="primaryTint" fg="primary" icon={<Check color={colors.primary} size={13} strokeWidth={2.4} />} label={t('jira')} />
              <ResultChip bg="redTint" fg="red" icon={<Heart color={colors.red} size={13} strokeWidth={2.2} />} label={t('thanked')} />
              <ResultChip bg="purpleTint" fg="purpleText" icon={<FileText color={colors.purpleText} size={13} strokeWidth={2.2} />} label={t('logged')} />
              <ResultChip bg="amberTint" fg="amberStrong" icon={<Star color={colors.amberStrong} size={13} strokeWidth={2.2} />} label={t('fiveStars', { p: shownRating === 5 ? t('unlocked') : '4/5' })} />
            </View>
            <Button size="md" variant="outline" label={live ? t('backToTask') : t('replay')} onPress={live ? leave : reset} />
          </View>
        )}

        {view === 'waiting' && (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.cardLg, padding: spacing.xxl, gap: spacing.sm, boxShadow: shadows.raised }}>
            <AppText variant="cardTitle" weight="bold">
              {t('waiting')}
            </AppText>
            <AppText variant="small" color="textMuted">
              {t('waitingBody', { name: ownerName })}
            </AppText>
            {live && <AutoApproveTag at={autoApproveAt(openReview(d?.reviews))} />}
            <Button size="md" variant="outline" label={t('backToTask')} onPress={leave} />
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function MiniStat({ flex, bg, icon, value, label }: { flex: number; bg: ColorToken; icon: ReactNode; value: string; label: string }) {
  return (
    <View style={{ flex, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 7, paddingStart: 7, paddingEnd: spacing.md, boxShadow: shadows.tile, minHeight: sizes.touch }}>
      <IconBadge size={28} bg={bg}>
        {icon}
      </IconBadge>
      <View style={{ flexShrink: 1 }}>
        <AppText variant="cardTitle" weight="extrabold" numberOfLines={1}>
          {value}
        </AppText>
        <AppText variant="micro" color="textMuted" numberOfLines={1}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

function ResultChip({ bg, fg, icon, label }: { bg: ColorToken; fg: ColorToken; icon: ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors[bg], borderRadius: radius.pill, paddingVertical: 4, paddingStart: 6, paddingEnd: 9 }}>
      {icon}
      <AppText variant="caption" weight="bold" color={fg}>
        {label}
      </AppText>
    </View>
  );
}
