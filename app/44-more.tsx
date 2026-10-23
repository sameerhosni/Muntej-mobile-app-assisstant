// Screen 44 · Everything Muntej does — no mockup; v2 light style per design/TOKENS.md
// One place for every deeper screen, so Home can stay calm ("the app is optional", BRD v1.2 M10). Grouped by job:
// Plan · Follow-up · Capture · Team. Managers see all; employees see what's theirs (waiting on others, too busy?,
// capture, achievements, their week). Live counts only where they're free (Incoming).
import { ScreenTip } from '@/features/coach/ScreenTip';
import type { ComponentType } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Award,
  Bot,
  ChevronLeft,
  CircleGauge,
  Eye,
  Gavel,
  Hand,
  Hourglass,
  Inbox,
  LayoutGrid,
  Mic,
  Plug,
  Receipt,
  Sprout,
  RotateCw,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  Waypoints,
  type LucideProps,
} from 'lucide-react-native';
import { AppText, IconButton } from '@/components/ui';
import { colors, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { useIncomingCount } from '@/features/incoming/api';
import { MORE_NS } from '@/features/more/strings';
import { CoachSwitch } from '@/features/coach/CoachSwitch';

type Tile = { key: string; href: Href; Icon: ComponentType<LucideProps>; bg: ColorToken; fg: string; who: 'all' | 'manager' | 'super'; count?: number };

export default function MoreScreen() {
  const { t } = useScreenT(MORE_NS);
  const { isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const me = useMyProfile();
  const incoming = useIncomingCount();
  const manager = me.data?.role !== 'employee';

  const groups: { key: string; tiles: Tile[] }[] = [
    {
      key: 'plan',
      tiles: [
        { key: 'roadmap', href: '/24-roadmap', Icon: Waypoints, bg: 'primaryTint', fg: colors.primary, who: 'manager' },
        { key: 'radar', href: '/11-load-radar', Icon: CircleGauge, bg: 'greenTint', fg: colors.green, who: 'manager' },
        { key: 'workspaces', href: '/19-workspaces', Icon: LayoutGrid, bg: 'purpleTint', fg: colors.purple, who: 'manager' },
        { key: 'objectives', href: '/40-objectives', Icon: Target, bg: 'amberTint', fg: colors.amberText, who: 'all' },
      ],
    },
    {
      key: 'follow',
      tiles: [
        { key: 'waiting', href: '/09-reverse-followup', Icon: Hourglass, bg: 'purpleTint', fg: colors.purple, who: 'all' },
        { key: 'pushback', href: '/08-pushback', Icon: Hand, bg: 'orangeTint', fg: colors.orange, who: 'all' },
        { key: 'evidence', href: '/10-evidence', Icon: Eye, bg: 'redTint', fg: colors.red, who: 'manager' },
        { key: 'autopilot', href: '/03-autopilot', Icon: RotateCw, bg: 'amberTint', fg: colors.amberText, who: 'manager' },
        { key: 'decisions', href: '/04-decisions', Icon: Gavel, bg: 'primaryTint', fg: colors.primary, who: 'manager' },
      ],
    },
    {
      key: 'capture',
      tiles: [
        { key: 'incoming', href: '/42-incoming', Icon: Inbox, bg: 'primaryTint', fg: colors.primary, who: 'all', count: incoming.count },
        { key: 'meeting', href: '/45-record-meeting', Icon: Mic, bg: 'redTint', fg: colors.red, who: 'all' },
        { key: 'sources', href: '/12-sources', Icon: Plug, bg: 'greenTint', fg: colors.green, who: 'all' },
      ],
    },
    {
      key: 'team',
      tiles: [
        { key: 'team', href: '/39-team', Icon: Users, bg: 'primaryTint', fg: colors.primary, who: 'manager' },
        { key: 'invite', href: '/48-invite', Icon: UserPlus, bg: 'greenTint', fg: colors.green, who: 'manager' },
        { key: 'performance', href: '/16-dashboard', Icon: TrendingUp, bg: 'greenTint', fg: colors.green, who: 'manager' },
        { key: 'achievements', href: '/21-achievements', Icon: Award, bg: 'amberTint', fg: colors.amberText, who: 'all' },
        { key: 'agents', href: '/22-agents', Icon: Bot, bg: 'purpleTint', fg: colors.purple, who: 'manager' },
        { key: 'week', href: '/32-receipt', Icon: Receipt, bg: 'greenTint', fg: colors.green, who: 'all' },
        // the super admin's view of every account's first steps + feedback
        { key: 'growth', href: '/46-growth', Icon: Sprout, bg: 'greenTint', fg: colors.green, who: 'super' },
      ],
    },
  ];
  // the pushback screen is the employee's tool: managers don't need it in their list
  const visible = (x: Tile) =>
    (x.who === 'super' ? me.data?.role === 'super_admin' : x.who === 'all' || manager) && !(manager && x.key === 'pushback');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.screen, paddingBottom: 40, gap: spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconButton label={t('back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <ChevronLeft color={colors.text} size={20} strokeWidth={1.9} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </IconButton>
          <AppText variant="title" style={{ flex: 1 }}>
            {t('title')}
          </AppText>
        </View>
        <AppText color="textSoft">{t('sub')}</AppText>
        <ScreenTip id="more" />
        {/* Saree3 the teacher: on, or on a coffee break (call him back here) */}
        <CoachSwitch />

        {groups.map((g) => {
          const tiles = g.tiles.filter(visible);
          if (!tiles.length) return null;
          return (
            <View key={g.key} style={{ gap: spacing.sm }}>
              <AppText variant="section">{t(`g_${g.key}`)}</AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {tiles.map((x) => (
                  <Pressable
                    key={x.key}
                    onPress={() => router.push(x.href)}
                    accessibilityRole="link"
                    accessibilityLabel={`${t(x.key)}. ${t(`${x.key}Sub`)}`}
                    style={({ pressed }) => ({
                      width: '48.5%',
                      minHeight: sizes.touch + 48,
                      padding: spacing.md,
                      gap: 6,
                      borderRadius: radius.tile,
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors[x.bg], alignItems: 'center', justifyContent: 'center' }}>
                        <x.Icon color={x.fg} size={18} strokeWidth={2.1} />
                      </View>
                      {!!x.count && (
                        <View style={{ minWidth: 22, paddingHorizontal: 6, height: 22, borderRadius: 11, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' }}>
                          <AppText variant="micro" weight="extrabold" color="onDark">
                            {String(x.count)}
                          </AppText>
                        </View>
                      )}
                    </View>
                    <AppText weight="bold" numberOfLines={1}>
                      {t(x.key)}
                    </AppText>
                    <AppText variant="caption" color="textMuted" numberOfLines={2}>
                      {t(`${x.key}Sub`)}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
