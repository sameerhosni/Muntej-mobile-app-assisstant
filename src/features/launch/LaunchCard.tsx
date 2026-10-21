// "New for you": after an update, on Home, Saree3 hops in with one new feature — one benefit line for this person and
// Show me (→ the right screen, the right button lit up) · Later (again in 3 days, at most twice) · Not for me.
// At most one card a day, a few seconds after Home opens, only features meant for this person's role.
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { AppText, Button } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTasks } from '@/lib/api';
import { canSwitchView } from '@/features/view-as/store';
import { Munti } from '@/features/munti/Munti';
import { munti } from '@/features/munti/store';
import {
  FEATURE_PLACES,
  LATER_MS,
  MAX_LATER,
  markFeature,
  setLaunchCardOn,
  spotlight,
  useFeatures,
  useLaunchClient,
  useMyFeatureStates,
  type Feature,
  type FeatureEvent,
} from './launch';
import { LAUNCH_NS } from './strings';

const HOMES = ['/01-home', '/25-employee-home'];
const DELAY_MS = 4000;
const DAY_KEY = 'launch.lastShown';
const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

function due(e: FeatureEvent | undefined) {
  if (!e) return true; // never shown
  const age = Date.now() - Date.parse(e.updated_at);
  if (e.state === 'later') return e.later_count <= MAX_LATER && age > LATER_MS;
  if (e.state === 'seen') return age > 86_400_000; // shown but no answer (app closed): once more the next day
  return false; // tried / using it / not for me
}

export function LaunchCard() {
  useLaunchClient();
  const { t } = useScreenT(LAUNCH_NS);
  const { lang } = useDirection();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const me = useMyProfile();
  const tasks = useTasks();
  const features = useFeatures();
  const states = useMyFeatureStates(me.data?.id);
  const [current, setCurrent] = useState<Feature | null>(null);

  const role = me.data?.role;
  const realRole = me.data?.actual_role ?? role;
  const forMe = (f: Feature) =>
    f.audience === 'all' ||
    (f.audience === 'admin' && canSwitchView(realRole)) ||
    (f.audience === 'manager' && role !== 'employee') ||
    (f.audience === 'employee' && role === 'employee');

  // on Home, a few seconds in, at most once a day: the first feature that's due for this person.
  // The timer depends only on "on Home + data ready" (not on each refetch), reading the latest data when it fires.
  const latest = useRef({ features: features.data, states: states.data, forMe });
  latest.current = { features: features.data, states: states.data, forMe };
  const ready = !!features.data && !!states.data && !!role;
  useEffect(() => {
    if (!HOMES.includes(pathname) || !ready || current) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        if ((await AsyncStorage.getItem(DAY_KEY)) === today()) return;
      } catch {
        // storage unavailable: still fine to show
      }
      const { features: fs, states: st, forMe: fm } = latest.current;
      const next = (fs ?? []).filter(fm).find((f) => due(st?.get(f.key)));
      if (!next || cancelled) return;
      AsyncStorage.setItem(DAY_KEY, today()).catch(() => {});
      markFeature(next.key, 'seen');
      setCurrent(next);
      setLaunchCardOn(true);
    }, DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, ready]);

  if (!current) return null;
  const close = () => {
    setCurrent(null);
    setLaunchCardOn(false);
  };
  const answer = (state: 'later' | 'not_interested') => {
    markFeature(current.key, state);
    close();
  };
  const showMe = () => {
    const place = FEATURE_PLACES[current.key] ?? {};
    markFeature(current.key, 'tried');
    close();
    // steps live on a task: open your first open task (else the Tasks list)
    const ownTask =
      current.key === 'steps'
        ? (tasks.data ?? []).find((x) => x.owner_id === me.data?.id && !['done', 'cancelled', 'submitted'].includes(x.status)) ??
          (tasks.data ?? []).find((x) => !['done', 'cancelled'].includes(x.status))
        : undefined;
    if (ownTask) {
      router.push({ pathname: '/14-task-detail', params: { id: ownTask.id } });
      if (place.spot) setTimeout(() => spotlight.show(place.spot!), 700);
    } else if (place.href) {
      router.push(place.href);
      if (place.spot) setTimeout(() => spotlight.show(place.spot!), 700);
    } else {
      // Saree3 shows himself
      munti.flash('brand', 9000);
      munti.say(t('saree3Demo'), 'wave', { ms: 9000 });
    }
  };
  const ar = lang === 'ar';

  return (
    <View
      accessibilityViewIsModal
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: spacing.lg,
        right: spacing.lg,
        bottom: Math.max(insets.bottom, 10) + sizes.tabBarHeight + spacing.md,
        backgroundColor: colors.surface,
        borderRadius: radius.cardLg,
        borderWidth: 1.5,
        borderColor: colors.primary,
        boxShadow: shadows.raised,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <Munti size="md" mood="celebrate" tone="gold" />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="caption" weight="extrabold" color="primary">
            {t('badge')}
          </AppText>
          <AppText weight="extrabold" style={{ fontSize: 17, lineHeight: 22 }}>
            {ar ? current.title_ar : current.title}
          </AppText>
          <AppText variant="small" color="textSoft">
            {ar ? current.benefit_ar : current.benefit}
          </AppText>
        </View>
        <Pressable onPress={() => answer('later')} accessibilityRole="button" accessibilityLabel={t('later')} hitSlop={8} style={{ padding: 4 }}>
          <X color={colors.textMuted} size={18} strokeWidth={2.2} />
        </Pressable>
      </View>
      <Button label={t('showMe')} size="md" onPress={showMe} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label={t('later')} variant="outline" size="md" onPress={() => answer('later')} style={{ flex: 1 }} />
        <Button label={t('notForMe')} variant="ghost" size="md" onPress={() => answer('not_interested')} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
