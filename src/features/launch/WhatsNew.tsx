// "New in Muntej": every feature announced so far, for this person's role, newest-to-you first. The daily "New for
// you" card only offers one a day; this is where all of them wait (owner: "where can I find the new updates?").
//   useWhatsNew()   the list + how many are still new to me
//   showFeature()   "Show me how": the right screen, the right button lit up with Saree3's line (same as the card);
//                   seen only once the walkthrough is finished
//   WhatsNewStrip   Home: "✨ 5 new things in Muntej · See them" while anything is still new
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Sparkles, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { AppText } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { canSwitchView } from '@/features/view-as/store';
import { homeRouteFor } from '@/features/screens/registry';
import { walkthrough } from '@/features/walkthrough/store';
import { munti } from '@/features/munti/store';
import { FEATURE_PLACES, isNewFor, markFeature, useFeatures, useMyFeatureStates, type Feature } from './launch';

const en = {
  title: 'New in Muntej',
  sub: 'Everything I learned lately. Tap "Show me how" and I walk you through it.',
  strip_one: '✨ {{count}} new thing in Muntej',
  strip_other: '✨ {{count}} new things in Muntej',
  stripSub: 'See what it does for you, I’ll show you how',
  showHow: 'Show me how',
  isNew: 'New',
  tried: 'Tried ✓',
  none: 'You’ve seen everything new 🎉',
  back: 'Back',
  myDemo: 'Drag me anywhere, hold me to talk, and drop me on the ✕ to hide me. Try it now!',
};
const ar: typeof en & Record<string, string> = {
  title: 'الجديد في منتج',
  sub: 'كل اللي تعلمته مؤخرًا. اضغط "ورّني كيف" وأنا أمشيك فيها.',
  strip_one: '✨ عندك ميزة جديدة في منتج',
  strip_other: '✨ عندك {{count}} ميزات جديدة في منتج',
  strip_two: '✨ عندك ميزتين جديدة في منتج',
  strip_few: '✨ عندك {{count}} ميزات جديدة في منتج',
  strip_many: '✨ عندك {{count}} ميزة جديدة في منتج',
  stripSub: 'شوف وش تفيدك فيه، وأنا أوريك كيف',
  showHow: 'ورّني كيف',
  isNew: 'جديد',
  tried: 'جرّبتها ✓',
  none: 'شفت كل الجديد 🎉',
  back: 'رجوع',
  myDemo: 'اسحبني لأي مكان، اضغط علي مطوّل وتكلّم، وارمني على ✕ عشان أختفي. جرّب الحين!',
};
export const WHATS_NEW_NS = registerStrings('whatsNew', { en, ar });

export function useWhatsNew() {
  const me = useMyProfile();
  const features = useFeatures();
  const states = useMyFeatureStates(me.data?.id);
  const role = me.data?.role;
  const realRole = me.data?.actual_role ?? role;
  const forMe = (f: Feature) =>
    f.audience === 'all' ||
    (f.audience === 'admin' && canSwitchView(realRole)) ||
    (f.audience === 'manager' && role !== 'employee') ||
    (f.audience === 'employee' && role === 'employee');
  const mine = (features.data ?? []).filter(forMe);
  const isNew = (f: Feature) => isNewFor(states.data, f.key);
  // still new first (in launch order), then the rest, newest released first
  const list = [...mine.filter(isNew), ...mine.filter((f) => !isNew(f)).sort((a, b) => b.released_at.localeCompare(a.released_at))];
  return { list, isNew, role, count: mine.filter(isNew).length, ready: !!features.data && !!states.data };
}

const HOMES = ['/', '/01-home', '/25-employee-home'];

/** go to where a feature lives. Home features go to YOUR home (managers 01, employees 25) and back to it rather than
 *  stacking a new copy: pushing '/' (a redirect) or the other role's home showed a blank screen */
export function goToPlace(href: Href, role: string | undefined) {
  if (typeof href === 'string' && HOMES.includes(href)) return router.navigate(homeRouteFor(role === 'employee' ? 'employee' : 'manager'));
  router.push(href);
}

/** "Show me how": go where it lives and light it up with Saree3's line; counts as seen only when finished */
export function showFeature(f: Feature, ar: boolean, demoText: string, role: string | undefined) {
  const place = FEATURE_PLACES[f.key] ?? {};
  if (place.href) goToPlace(place.href, role);
  if (place.spot)
    walkthrough.startWhenReady(
      `new_${f.key}`,
      [{ target: place.spot, key: '', title: `✨ ${ar ? f.title_ar : f.title}`, body: ar ? f.benefit_ar : f.benefit }],
      (finished) => markFeature(f.key, finished ? 'tried' : 'later'),
    );
  else {
    markFeature(f.key, 'tried');
    if (!place.href) {
      munti.flash('brand', 9000);
      munti.say(demoText, 'wave', { ms: 9000 });
    }
  }
}

/** Home: while anything is new to me, one strip that opens the list */
export function WhatsNewStrip() {
  const { t } = useScreenT(WHATS_NEW_NS);
  const { isRTL } = useDirection();
  const { count, ready } = useWhatsNew();
  if (!ready || !count) return null;
  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      onPress={() => router.push('/50-whats-new' as Href)}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: sizes.touch + 12,
        padding: spacing.md,
        borderRadius: radius.tile,
        backgroundColor: colors.purpleTint,
        borderWidth: 1.5,
        borderColor: colors.purpleBorder,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
        <Sparkles color={colors.purple} size={20} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="extrabold">{t('strip', { count })}</AppText>
        <AppText variant="caption" color="textSoft">
          {t('stripSub')}
        </AppText>
      </View>
      <Chevron color={colors.purple} size={20} />
    </Pressable>
  );
}
