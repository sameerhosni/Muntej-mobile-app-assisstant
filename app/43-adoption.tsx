// Screen 43 · Feature adoption — no mockup; v2 light style per design/TOKENS.md. Admins only.
// Per new feature: who it's for, and how many of them haven't seen it / saw it / tried it / use it / said later /
// not for me. Tap a feature for the people not using it yet (+ "Announce again") and the "target later" list
// (said not for me). Data: features + feature_events (admins read everyone's) + team.
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react-native';
import { AppText, Avatar, Button, Card, IconButton, avatarGradientFor } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { useMyProfile, useTeam, type Profile } from '@/lib/api';
import { formatNumber } from '@/features/home/value';
import { canSwitchView } from '@/features/view-as/store';
import { useFeatures, type Feature, type FeatureState } from '@/features/launch/launch';
import { LAUNCH_NS } from '@/features/launch/strings';

type Bucket = 'new' | FeatureState;
const BUCKETS: Bucket[] = ['adopted', 'tried', 'seen', 'later', 'new', 'not_interested'];
const COLOR: Record<Bucket, string> = {
  adopted: colors.green,
  tried: colors.primary,
  seen: colors.purple,
  later: colors.amber,
  new: colors.borderDashed,
  not_interested: colors.red,
};

// feature tables aren't in the generated types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

export default function AdoptionScreen() {
  const { t } = useScreenT(LAUNCH_NS);
  const { isRTL } = useDirection();
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const me = useMyProfile();
  const team = useTeam();
  const features = useFeatures();
  const events = useQuery({
    queryKey: ['featureStates', 'all'],
    queryFn: async () => {
      const { data, error } = await untyped.from('feature_events').select('profile_id, feature_key, state');
      if (error) throw new Error(error.message);
      return (data ?? []) as { profile_id: string; feature_key: string; state: FeatureState }[];
    },
  });
  const isAdmin = canSwitchView(me.data?.actual_role ?? me.data?.role);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.screen, paddingTop: 20, gap: spacing.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={events.isRefetching} onRefresh={() => events.refetch()} tintColor={colors.primary} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconButton label={t('back')} onPress={back}>
            <ChevronLeft color={colors.text} size={22} strokeWidth={2} style={flip} />
          </IconButton>
          <AppText variant="titleLg" style={{ flex: 1 }}>
            {t('title')}
          </AppText>
        </View>
        <AppText color="textMuted">{t('subtitle')}</AppText>

        {!isAdmin ? (
          <Card>
            <AppText color="textMuted">{t('adminsOnly')}</AppText>
          </Card>
        ) : features.isLoading || events.isLoading || team.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              {BUCKETS.map((b) => (
                <View key={b} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLOR[b] }} />
                  <AppText variant="caption" color="textMuted">
                    {t(`st_${b}`)}
                  </AppText>
                </View>
              ))}
            </View>
            {(features.data ?? []).map((f) => (
              <FeatureCard key={f.key} f={f} team={team.data ?? []} events={events.data ?? []} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureCard({ f, team, events }: { f: Feature; team: Profile[]; events: { profile_id: string; feature_key: string; state: FeatureState }[] }) {
  const { t } = useScreenT(LAUNCH_NS);
  const { lang } = useDirection();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const ar = lang === 'ar';
  const n = (v: number) => formatNumber(v, lang);

  const people = team.filter(
    (p) =>
      p.status === 'active' &&
      (f.audience === 'all' ||
        (f.audience === 'admin' && canSwitchView(p.role)) ||
        (f.audience === 'manager' && p.role !== 'employee') ||
        (f.audience === 'employee' && p.role === 'employee')),
  );
  const stateOf = new Map(events.filter((e) => e.feature_key === f.key).map((e) => [e.profile_id, e.state]));
  const bucket = (p: Profile): Bucket => stateOf.get(p.id) ?? 'new';
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, people.filter((p) => bucket(p) === b).length])) as Record<Bucket, number>;
  const total = people.length || 1;
  const pct = Math.round((counts.adopted / total) * 100);
  const notUsing = people.filter((p) => !['adopted', 'not_interested'].includes(bucket(p)));
  const turnedDown = people.filter((p) => bucket(p) === 'not_interested');
  const name = (p: Profile) => ((ar && p.full_name_ar) || p.full_name).split(' ')[0];

  const reannounce = async (list: Profile[], key: string) => {
    setBusy(key);
    setNote(null);
    const { data, error } = await untyped.rpc('reannounce_feature', { p_key: f.key, p_profiles: list.map((p) => p.id) });
    setBusy(null);
    if (error) return setNote(error.message);
    setNote(t('reannounced', { n: n(Number(data ?? list.length)) }));
    qc.invalidateQueries({ queryKey: ['featureStates'] });
  };

  const peopleRow = (list: Profile[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {list.map((p) => (
        <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingEnd: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.chip }}>
          <Avatar name={p.full_name} size={22} gradient={avatarGradientFor(p.full_name)} />
          <AppText variant="caption" weight="semibold">
            {name(p)}
          </AppText>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: COLOR[bucket(p)] }} />
        </View>
      ))}
    </View>
  );

  return (
    <Card style={{ gap: spacing.md }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText weight="bold" style={{ flex: 1 }}>
            {ar ? f.title_ar : f.title}
          </AppText>
          <AppText variant="caption" weight="bold" color={pct >= 50 ? 'greenText' : 'textMuted'}>
            {t('usingPct', { pct: n(pct) })}
          </AppText>
        </View>
        <AppText variant="caption" color="textMuted">
          {t(`forWhom_${f.audience}`)} · {n(people.length)}
        </AppText>
        {/* the funnel as one bar */}
        <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.track }}>
          {BUCKETS.map((b) => (counts[b] ? <View key={b} style={{ flex: counts[b], backgroundColor: COLOR[b] }} /> : null))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {BUCKETS.filter((b) => counts[b]).map((b) => (
            <AppText key={b} variant="caption" color="textSoft">
              {t(`st_${b}`)} {n(counts[b])}
            </AppText>
          ))}
        </View>
      </Pressable>

      {open && (
        <View style={{ gap: spacing.md }}>
          <AppText variant="small" weight="bold">
            {t('notUsing')} · {n(notUsing.length)}
          </AppText>
          {notUsing.length ? peopleRow(notUsing) : <AppText color="textMuted">{t('nobody')}</AppText>}
          {notUsing.length > 0 && <Button label={t('reannounce')} size="md" loading={busy === 'not'} onPress={() => reannounce(notUsing, 'not')} />}
          {turnedDown.length > 0 && (
            <>
              <AppText variant="small" weight="bold" color="red">
                {t('targetLater')} · {n(turnedDown.length)}
              </AppText>
              {peopleRow(turnedDown)}
              <Button label={t('reannounce')} variant="outline" size="md" loading={busy === 'down'} onPress={() => reannounce(turnedDown, 'down')} />
            </>
          )}
          {note && (
            <AppText variant="small" color="greenText">
              {note}
            </AppText>
          )}
        </View>
      )}
    </Card>
  );
}
