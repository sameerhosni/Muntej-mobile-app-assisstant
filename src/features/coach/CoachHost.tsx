// After onboarding, Saree3 teaches in the moment: the first time something happens to you (work waiting for your
// review, a blocked or late teammate, your first check-in, a task that needs proof, tasks found in a message) one
// small card explains it once, with "Show me". After big moments it asks for a one-tap rating (only the super admin
// sees the answers). At most ONE card per app open, on Home, a few seconds in, never over the "New for you" card,
// and feedback at most once a week.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router, usePathname, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { AppText, Button } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { useDirection } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useMyProfile, useTasks, type TaskWithPeople } from '@/lib/api';
import { useIncomingCount } from '@/features/incoming/api';
import { useLaunchCardOn } from '@/features/launch/launch';
import { useOnboarding } from '@/features/onboarding/api';
import { Munti } from '@/features/munti/Munti';
import { PAUSED_KEY, setCoachPaused } from './api';
import { COACH_NS } from './strings';

const HOMES = ['/01-home', '/25-employee-home'];
const DELAY_MS = 5000;
const DAY = 86_400_000;
const WEEK = 7 * DAY;
// Saree3 keeps teaching after the tour: one of these per app open, in order, each once
const LESSONS: { key: string; href: Href; managers?: boolean }[] = [
  { key: 'lesson_voice', href: '/02-capture' },
  { key: 'lesson_brief', href: '/05-brief', managers: true },
  { key: 'lesson_paste', href: '/42-incoming' },
  { key: 'lesson_meeting', href: '/55-tool?tool=meet' as Href },
  { key: 'lesson_more', href: '/44-more' },
];
const RATINGS = ['😍', '🙂', '😐', '🙁'];
// a supabase request is only a "thenable" (no .catch): wrap it in a real Promise so .catch(() => {}) works
const rpc = (fn: string, args?: object) => Promise.resolve((supabase.rpc as (f: string, a?: object) => PromiseLike<unknown>)(fn, args));

type Tip = { kind: 'tip'; key: string; text: string; href?: Href };
type Ask = { kind: 'ask'; moment: string; text: string };
type Card = Tip | Ask;

let shownThisOpen = false;

export function CoachHost() {
  const { t } = useScreenT(COACH_NS);
  const { lang } = useDirection();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const pathname = usePathname();
  const me = useMyProfile();
  const tasks = useTasks();
  const incoming = useIncomingCount();
  const launchOn = useLaunchCardOn();
  const onboarding = useOnboarding(me.data?.id);
  const meId = me.data?.id;

  const seen = useQuery({
    queryKey: ['coachSeen', meId],
    enabled: !!meId,
    queryFn: async () => {
      const [m, f] = await Promise.all([
        supabase.from('coach_moments').select('key').eq('profile_id', meId!),
        supabase.from('feedback').select('moment, created_at').eq('profile_id', meId!),
      ]);
      return {
        moments: new Set((m.data ?? []).map((r) => r.key as string)),
        asked: new Set((f.data ?? []).map((r) => r.moment as string)),
        lastAsk: Math.max(0, ...(f.data ?? []).map((r) => Date.parse(r.created_at as string))),
      };
    },
  });

  // what's worth saying right now (first match wins)
  const next = useMemo((): Card | null => {
    const m = me.data;
    const s = seen.data;
    const all = tasks.data;
    if (!m || !s || !all) return null;
    // on a coffee break: nothing until called back from More
    if (s.moments.has(PAUSED_KEY)) return null;
    // the first visit belongs to Home's walkthrough; the bottom card waits until it was shown
    if (!s.moments.has('tour_home')) return null;
    const name = (x: TaskWithPeople) => (x.owner ? ((lang === 'ar' && x.owner.full_name_ar) || x.owner.full_name).split(' ')[0] : '');
    const now = Date.now();
    const mine = (x: TaskWithPeople) => x.assigner_id === m.id && x.owner_id && x.owner_id !== m.id;

    // feedback: after big moments, at most once a week
    if (now - s.lastAsk > WEEK) {
      const ob = onboarding.data;
      // a day after graduating, so the first lessons come first
      if (ob?.finished_at && now - Date.parse(ob.finished_at) > DAY && !s.asked.has('onboarding_done'))
        return { kind: 'ask', moment: 'onboarding_done', text: t('fb_onboarding_done') };
      if (all.some((x) => mine(x) && x.status === 'done') && !s.asked.has('first_handoff'))
        return { kind: 'ask', moment: 'first_handoff', text: t('fb_first_handoff') };
      const since = ob?.started_at ? Date.parse(ob.started_at) : Date.parse(m.created_at);
      if (now - since > WEEK && !s.asked.has('day7')) return { kind: 'ask', moment: 'day7', text: t('fb_day7') };
    }

    // first-time tips
    const tip = (key: string, x: TaskWithPeople | null, href?: Href): Tip | null =>
      s.moments.has(key) ? null : { kind: 'tip', key, text: t(key, { name: x ? name(x) : '', task: x?.title ?? '' }), href };
    const review = all.find((x) => mine(x) && x.status === 'submitted');
    if (review) return tip('review_waiting', review, { pathname: '/14-task-detail', params: { id: review.id } });
    const blocked = all.find((x) => mine(x) && x.status === 'blocked');
    if (blocked) {
      const c = tip('blocked_teammate', blocked, { pathname: '/14-task-detail', params: { id: blocked.id } });
      if (c) return c;
    }
    const late = all.find((x) => mine(x) && x.due_at && Date.parse(x.due_at) < now && !['done', 'cancelled', 'submitted'].includes(x.status));
    if (late) {
      const c = tip('late_teammate', late, { pathname: '/14-task-detail', params: { id: late.id } });
      if (c) return c;
    }
    const given = all.find((x) => x.owner_id === m.id && x.assigner_id !== m.id && !['done', 'cancelled'].includes(x.status));
    if (given) {
      const c = tip('checkin_buttons', given);
      if (c) return c;
    }
    const proof = all.find(
      (x) =>
        x.owner_id === m.id &&
        ((x as { proof_required?: string }).proof_required ?? 'none') !== 'none' &&
        !['done', 'cancelled', 'submitted'].includes(x.status),
    );
    if (proof) {
      const c = tip('proof_needed', proof, { pathname: '/14-task-detail', params: { id: proof.id } });
      if (c) return c;
    }
    if (incoming.count > 0) {
      const c = tip('incoming_found', null, '/42-incoming');
      if (c) return c;
    }
    // nothing happening: the next lesson, one per app open
    for (const l of LESSONS) {
      if (l.managers && m.role === 'employee') continue;
      const c = tip(l.key, null, l.href);
      if (c) return c;
    }
    return null;
  }, [me.data, seen.data, tasks.data, onboarding.data, incoming.count, lang, t]);

  const [card, setCard] = useState<Card | null>(null);
  const latest = useRef(next);
  latest.current = next;

  // one card per app open: on Home, a few seconds in, never over another card / during onboarding
  const onboardingOpen = !!onboarding.data && !onboarding.data.finished_at && !onboarding.data.dismissed;
  useEffect(() => {
    if (shownThisOpen || card || launchOn || onboardingOpen || !HOMES.includes(pathname)) return;
    const id = setTimeout(() => {
      const c = latest.current;
      if (!c || shownThisOpen) return;
      shownThisOpen = true;
      setCard(c);
      if (c.kind === 'tip') rpc('coach_seen', { p_key: c.key }).catch(() => {});
    }, DELAY_MS);
    return () => clearTimeout(id);
  }, [pathname, launchOn, onboardingOpen, card]);

  if (!card) return null;
  const close = () => {
    setCard(null);
    qc.invalidateQueries({ queryKey: ['coachSeen'] });
  };

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: spacing.lg,
        right: spacing.lg,
        bottom: Math.max(insets.bottom, 10) + sizes.tabBarHeight + spacing.md,
        backgroundColor: colors.surface,
        borderRadius: radius.cardLg,
        borderWidth: 1.5,
        borderColor: colors.purple,
        boxShadow: shadows.raised,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      {card.kind === 'tip' ? (
        <TipCard
          tip={card}
          onShow={() => {
            rpc('coach_seen', { p_key: card.key, p_acted: true }).catch(() => {});
            close();
            if (card.href) router.push(card.href);
          }}
          onClose={close}
        />
      ) : (
        <AskCard ask={card} onDone={close} />
      )}
    </View>
  );
}

function TipCard({ tip, onShow, onClose }: { tip: Tip; onShow: () => void; onClose: () => void }) {
  const { t } = useScreenT(COACH_NS);
  const qc = useQueryClient();
  const [bye, setBye] = useState(false);
  // "thanks, I've got it": Saree3 goes on a coffee break until called back from More
  const pause = () => {
    setCoachPaused(qc, true).catch(() => {});
    setBye(true);
    setTimeout(onClose, 2600);
  };
  if (bye)
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Munti size="md" mood="sleep" />
        <AppText weight="bold" style={{ flex: 1 }}>
          {t('pausedBye')}
        </AppText>
      </View>
    );
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <Munti size="md" mood="talk" />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="caption" weight="extrabold" color="purpleText">
            {t('badge')}
          </AppText>
          <AppText variant="small" color="textSoft">
            {tip.text}
          </AppText>
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('gotIt')} hitSlop={8} style={{ padding: 4 }}>
          <X color={colors.textMuted} size={18} strokeWidth={2.2} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {!!tip.href && <Button label={t('showMe')} size="md" onPress={onShow} style={{ flex: 1 }} />}
        <Button label={t('gotIt')} variant="outline" size="md" onPress={onClose} style={{ flex: 1 }} />
      </View>
      <Pressable onPress={pause} accessibilityRole="button" style={{ minHeight: sizes.touch, alignItems: 'center', justifyContent: 'center' }}>
        <AppText variant="small" weight="semibold" color="textMuted">
          {t('pauseBtn')}
        </AppText>
      </Pressable>
    </>
  );
}

function AskCard({ ask, onDone }: { ask: Ask; onDone: () => void }) {
  const { t } = useScreenT(COACH_NS);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [thanks, setThanks] = useState(false);
  const send = (r: number | null) => {
    rpc('give_feedback', { p_moment: ask.moment, p_rating: r, p_comment: comment || null }).catch(() => {});
    if (r === null) return onDone();
    setThanks(true);
    setTimeout(onDone, 1400);
  };
  if (thanks)
    return (
      <AppText weight="bold" align="center">
        {t('fbThanks')}
      </AppText>
    );
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Munti size="md" mood="wave" />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="caption" weight="extrabold" color="purpleText">
            {t('fbTitle')}
          </AppText>
          <AppText weight="bold">{ask.text}</AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {RATINGS.map((e, i) => (
          <Pressable
            key={e}
            onPress={() => setRating(i + 1)}
            accessibilityRole="radio"
            accessibilityState={{ selected: rating === i + 1 }}
            style={{
              width: sizes.touch + 8,
              height: sizes.touch + 8,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: rating === i + 1 ? colors.purpleTint : colors.transparent,
              borderWidth: rating === i + 1 ? 1.5 : 0,
              borderColor: colors.purple,
            }}
          >
            <AppText style={{ fontSize: 26 }}>{e}</AppText>
          </Pressable>
        ))}
      </View>
      {rating !== null && (
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder={t('fbComment')}
          placeholderTextColor={colors.textFaint}
          multiline
          style={{
            minHeight: sizes.touch,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.md,
            color: colors.text,
          }}
        />
      )}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label={t('fbSend')} size="md" onPress={() => send(rating)} disabled={rating === null} style={{ flex: 1 }} />
        <Button label={t('fbNotNow')} variant="ghost" size="md" onPress={() => send(null)} style={{ flex: 1 }} />
      </View>
    </>
  );
}
