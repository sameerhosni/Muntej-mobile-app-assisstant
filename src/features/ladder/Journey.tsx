// Value Ladder in the app, built from the app's own pieces (Card, IconBadge, ProgressBar, Munti, munti.celebrate):
//   JourneyCard   manager Home: M1–M6 as steps, the current one lit, one button for the next action; gone after M6
//   EmployeeSteps My profile: E1–E3
//   LadderCelebrations  once per reached rung: Saree3's toast + confetti; M3 (the aha) gets its own card, once
import { useEffect, useRef, useState } from 'react';
import { Modal, View } from 'react-native';
import { router } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { AppText, Button, Card, IconBadge, IconButton, ProgressBar } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { Munti } from '@/features/munti/Munti';
import { munti } from '@/features/munti/store';
import { useLadder, useLadderProgress, useMarkCelebrated, useSkipRung } from './api';
import { useDirection } from '@/lib/i18n';
import { showFeature, useWhatsNew, WHATS_NEW_NS } from '@/features/launch/WhatsNew';
import { markFeature } from '@/features/launch/launch';
import { useAppPrefs, useSaveAppPrefs } from '@/features/prefs/appPrefs';
import { track } from '@/lib/analytics';
import { EMPLOYEE_RUNGS, LADDER_NS, MANAGER_RUNGS, NEXT } from './rungs';

function useReached() {
  const ladder = useLadder();
  const reached = new Set((ladder.data ?? []).filter((r) => r.reached_at).map((r) => r.rung_id));
  const skipped = new Set((ladder.data ?? []).filter((r) => r.skipped_at && !r.reached_at).map((r) => r.rung_id));
  return { reached, skipped, ready: !!ladder.data, rows: ladder.data ?? [] };
}

function Steps({ ids, reached, skipped = new Set(), progress }: { ids: readonly string[]; reached: Set<string>; skipped?: Set<string>; progress?: Record<string, number> }) {
  const { t } = useScreenT(LADDER_NS);
  const current = ids.find((id) => !reached.has(id) && !skipped.has(id));
  return (
    <View style={{ gap: spacing.sm }}>
      {ids.map((id) => {
        const done = reached.has(id);
        const now = id === current;
        return (
          <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: done || now ? 1 : 0.55 }}>
            <IconBadge size={28} bg={done ? 'greenTint' : now ? 'primaryTint' : 'chip'} round>
              {done ? (
                <Check color={colors.green} size={14} strokeWidth={3} />
              ) : (
                <AppText variant="micro" weight="extrabold" color={now ? 'primary' : 'textMuted'}>
                  {ids.indexOf(id) + 1}
                </AppText>
              )}
            </IconBadge>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="small" weight={now ? 'extrabold' : 'semibold'} color={done ? 'greenText' : 'text'}>
                {t(`r_${id}`)}
              </AppText>
              {(done || now || skipped.has(id)) && (
                <AppText variant="caption" color="textMuted" numberOfLines={2}>
                  {done ? t(`feel_${id}`) : skipped.has(id) ? t('skipped') : t(`next_${id}`)}
                </AppText>
              )}
              {/* not done yet: where it stands, so it's clear why */}
              {!done && progress?.[id] !== undefined && (
                <AppText variant="caption" weight="semibold" color="primary">
                  {t(`p_${id}`, { n: progress[id] })}
                </AppText>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** manager Home: where they are on the way to "create it and forget it" (hidden once the team runs on Muntej) */
export function JourneyCard() {
  const { t } = useScreenT(LADDER_NS);
  const { reached, skipped, ready } = useReached();
  const skip = useSkipRung();
  const progress = useLadderProgress();
  if (!ready) return null;
  if (reached.has('M6')) return <DiscoverCard />;
  // a skipped step no longer holds the journey; when every open step is skipped, the card goes away
  const done = MANAGER_RUNGS.filter((id) => reached.has(id) || skipped.has(id)).length;
  const next = MANAGER_RUNGS.find((id) => !reached.has(id) && !skipped.has(id));
  if (!next) return <DiscoverCard />;
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="section" style={{ flex: 1 }}>
          {t('title')}
        </AppText>
        <AppText variant="caption" weight="bold" color="textMuted">
          {t('step', { n: Math.min(done + 1, MANAGER_RUNGS.length), total: MANAGER_RUNGS.length })}
        </AppText>
      </View>
      <ProgressBar value={done / MANAGER_RUNGS.length} />
      {/* the spec's nudge, in the app: Saree3 says the next step himself (no push) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.tile, backgroundColor: colors.primaryTint }}>
        <Munti mood="wave" size="sm" />
        <AppText variant="small" weight="semibold" color="primary" style={{ flex: 1 }}>
          {t(`next_${next}`)}
        </AppText>
      </View>
      <Steps ids={MANAGER_RUNGS} reached={reached} skipped={skipped} progress={progress.data} />
      <Button label={`${t('go')}: ${t(`r_${next}`)}`} size="md" onPress={() => router.push(NEXT[next])} />
      <Button label={t('skip')} variant="ghost" size="md" onPress={() => skip(next)} />
    </Card>
  );
}

/** employee Home: E1–E3 with the next one lit and its button; then Discover Muntej */
export function EmployeeJourneyCard() {
  const { t } = useScreenT(LADDER_NS);
  const { reached, skipped, ready } = useReached();
  const skip = useSkipRung();
  if (!ready) return null;
  const next = EMPLOYEE_RUNGS.find((id) => !reached.has(id) && !skipped.has(id));
  if (!next) return <DiscoverCard />;
  const done = EMPLOYEE_RUNGS.filter((id) => reached.has(id) || skipped.has(id)).length;
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="section" style={{ flex: 1 }}>
          {t('e_title')}
        </AppText>
        <AppText variant="caption" weight="bold" color="textMuted">
          {t('step', { n: Math.min(done + 1, EMPLOYEE_RUNGS.length), total: EMPLOYEE_RUNGS.length })}
        </AppText>
      </View>
      <ProgressBar value={done / EMPLOYEE_RUNGS.length} />
      <Steps ids={EMPLOYEE_RUNGS} reached={reached} skipped={skipped} />
      <Button label={`${t('go')}: ${t(`r_${next}`)}`} size="md" onPress={() => router.push(NEXT[next])} />
      <Button label={t('skip')} variant="ghost" size="md" onPress={() => skip(next)} />
    </Card>
  );
}

/** My profile, for employees: E1–E3 */
export function EmployeeSteps() {
  const { t } = useScreenT(LADDER_NS);
  const me = useMyProfile();
  const { reached, ready } = useReached();
  if (!ready || me.data?.role !== 'employee') return null;
  return (
    <Card style={{ gap: spacing.md }}>
      <AppText variant="section">{t('yourSteps')}</AppText>
      <Steps ids={EMPLOYEE_RUNGS} reached={reached} />
    </Card>
  );
}

/** mounted once (tabs): each newly reached rung is celebrated once; M3 gets the bigger card */
export function LadderCelebrations() {
  const { t } = useScreenT(LADDER_NS);
  const { rows } = useReached();
  const mark = useMarkCelebrated();
  const [m3, setM3] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    if (busy.current) return;
    const fresh = rows.filter((r) => r.reached_at && !r.celebrated_at);
    if (!fresh.length) return;
    busy.current = true;
    (async () => {
      // one toast at a time: the newest moment speaks, the rest are just marked; M3 always gets its card
      const latest = fresh.filter((r) => r.rung_id !== 'M3').sort((a, b) => (a.reached_at! < b.reached_at! ? 1 : -1))[0];
      if (fresh.some((r) => r.rung_id === 'M3')) setM3(true);
      else if (latest) munti.celebrate(t('reached', { name: t(`r_${latest.rung_id}`) }));
      for (const r of fresh) await mark(r.rung_id);
      busy.current = false;
    })();
  }, [rows, mark, t]);

  return (
    <Modal visible={m3} transparent animationType="fade" onRequestClose={() => setM3(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(11,26,51,0.45)', justifyContent: 'center', padding: spacing.screen }}>
        <Card style={{ gap: spacing.lg, alignItems: 'center', paddingVertical: spacing.xxl, borderRadius: radius.cardLg }}>
          <Munti mood="celebrate" size="lg" />
          <AppText variant="titleLg" align="center">
            {t('m3Title')}
          </AppText>
          <AppText color="textSoft" align="center">
            {t('m3Body')}
          </AppText>
          <Button label={t('m3Ok')} onPress={() => setM3(false)} style={{ alignSelf: 'stretch' }} />
        </Card>
      </View>
    </Modal>
  );
}

/** after the steps (all reached or skipped): one feature at a time this person hasn't tried, with "Show me", till
 *  they've used everything Muntej has (owner: "let everyone notice each step till the client uses all features") */
export function DiscoverCard() {
  const { t } = useScreenT(LADDER_NS);
  const { t: tw } = useScreenT(WHATS_NEW_NS);
  const { lang } = useDirection();
  const { list, states, role, ready } = useWhatsNew();
  const [passed, setPassed] = useState<Set<string>>(new Set());
  const prefs = useAppPrefs();
  const savePrefs = useSaveAppPrefs();
  // hidden with its ✕ (also on the employee Home, which has no Customize switches of its own)
  if (!ready || prefs.data?.home?.journey === false) return null;
  const used = (key: string) => ['adopted', 'tried'].includes(states?.get(key)?.state ?? '');
  // put off ("Not now") or turned down: off the card for good (What's new still lists them)
  const open = list.filter((f) => !used(f.key) && !['not_interested', 'later'].includes(states?.get(f.key)?.state ?? '') && !passed.has(f.key));
  const next = open[0];
  if (!next) return null;
  const tried = list.filter((f) => used(f.key)).length;
  const ar = lang === 'ar';
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="section" style={{ flex: 1 }}>
          {t('discover')}
        </AppText>
        <AppText variant="caption" weight="bold" color="textMuted">
          {t('discoverStep', { n: tried, total: list.length })}
        </AppText>
        {/* hide the whole card (Customize Home brings it back) */}
        <IconButton
          label={t('hideCard')}
          onPress={() => {
            track('discover_hidden', { tried, total: list.length });
            savePrefs.mutate({ home: { ...(prefs.data?.home ?? {}), journey: false } });
          }}
        >
          <X color={colors.textMuted} size={18} />
        </IconButton>
      </View>
      <ProgressBar value={list.length ? tried / list.length : 0} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Munti mood="star" size="sm" />
        <AppText variant="small" color="textSoft" style={{ flex: 1 }}>
          {t('discoverSay')}
        </AppText>
      </View>
      <View style={{ gap: 2 }}>
        <AppText weight="extrabold">{ar ? next.title_ar : next.title}</AppText>
        <AppText variant="small" color="textMuted">
          {ar ? next.benefit_ar : next.benefit}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label={t('showMe')} size="md" onPress={() => showFeature(next, ar, tw('myDemo'), role)} style={{ flex: 1.4 }} />
        <Button
          label={t('notNow')}
          variant="ghost"
          size="md"
          onPress={() => {
            setPassed((s) => new Set(s).add(next.key));
            markFeature(next.key, 'later').catch(() => {});
          }}
          style={{ flex: 1 }}
        />
      </View>
    </Card>
  );
}
