// Screen 12 · Sources — see design/v2/html/Sources.dc.html (Arabic: SourcesAR.dc.html)
// Live data: sources (own rows, RLS). Tiles toggle connect/disconnect (or waitlist for coming-soon types) optimistically
// via src/features/sources/useSources. "copy-paste" and "saved / day" tiles are demo figures from the design.
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeftRight, Camera, Check, ChevronLeft, ChevronRight, Clock, Hand } from 'lucide-react-native';
import { AppText, Button, Card, Gradient, Hero, IconBadge, IconButton, StatTile } from '@/components/ui';
import { colors, radius, shadows, spacing, type ColorToken, type GradientToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { NS } from '@/features/sources/strings';
import { useSources, type SourceType, type SourceView } from '@/features/sources/useSources';

/** Connected-tile fill. Closest app tokens to each brand (brand colors aren't tokens yet). */
const TILE_GRADIENT: Record<SourceType, GradientToken> = {
  whatsapp: 'success',
  email: 'points',
  meeting: 'avatarPurple',
  teams: 'purple',
  slack: 'heroEmployee',
  google_chat: 'avatarGreen',
  jira: 'primary',
  azure_devops: 'avatarBlue',
  sticky_note: 'warning',
};

const GRID_GAP = spacing.lg;
const DEMO_SAVED_HOURS = 1.5;
const DEMO_COPY_PASTE = 0;
const DEMO_DUPLICATES = 0;

export default function SourcesScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { sources, ready, isLoading, isError, isRefetching, refetch, saveError, toggle } = useSources();

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  const connected = sources.filter((s) => s.status === 'connected');
  const captured = connected.reduce((sum, s) => sum + s.todayCount, 0);
  const tileW = (Math.min(width, 520) - spacing.screen * 2 - GRID_GAP * 2) / 3;

  const status = (s: SourceView): { label: string; color: ColorToken; hint: string } => {
    if (s.status === 'connected')
      return { label: t('today', { n: formatNumber(s.todayCount, lang) }), color: 'green', hint: t('tileHint.connected') };
    if (s.status === 'error') return { label: t('reconnect'), color: 'red', hint: t('tileHint.error') };
    if (s.status === 'coming_soon')
      return s.waitlist
        ? { label: t('onList'), color: 'purple', hint: t('tileHint.soonOn') }
        : { label: t('notify'), color: 'primary', hint: t('tileHint.soon') };
    return { label: t('connect'), color: 'primary', hint: t('tileHint.disconnected') };
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
      >
        <Hero>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg }}>
            <IconButton variant="glass" label={t('back')} onPress={goBack}>
              <BackIcon color={colors.onDark} size={22} strokeWidth={2} />
            </IconButton>
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="titleLg" color="onDark" style={{ lineHeight: 32 }}>
                {t('title')}
              </AppText>
              <AppText color="onDarkMuted">{t('subtitle')}</AppText>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile
              variant="glass"
              iconBg="purple"
              icon={<Check color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={formatNumber(captured, lang)}
              label={t('caught')}
            />
            <StatTile
              variant="glass"
              iconBg="orange"
              icon={<Hand color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={formatNumber(DEMO_COPY_PASTE, lang)}
              label={t('copyPaste')}
            />
            <StatTile
              variant="glass"
              iconBg="primaryLight"
              icon={<Clock color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={t('savedValue', { n: formatNumber(DEMO_SAVED_HOURS, lang, 1) })}
              label={t('saved')}
            />
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, paddingTop: spacing.xl, gap: spacing.lg }}>
          {/* Live count + duplicates */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors.green,
                  borderWidth: 0,
                  boxShadow: `0px 0px 0px 3px ${colors.greenTint}`,
                }}
              />
              <AppText variant="small" weight="bold">
                {t('live', { n: formatNumber(connected.length, lang) })}
              </AppText>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: colors.greenTint,
                borderRadius: radius.pill,
                paddingHorizontal: 9,
                paddingVertical: 4,
              }}
            >
              <Check color={colors.green} size={11} strokeWidth={2.6} />
              <AppText variant="micro" weight="bold" color="green">
                {t('duplicates', { n: formatNumber(DEMO_DUPLICATES, lang) })}
              </AppText>
            </View>
          </View>

          {isLoading && (
            <Card padding={spacing.lg} style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.md }}>
              <ActivityIndicator color={colors.primary} />
              <AppText color="textMuted">{t('loading')}</AppText>
            </Card>
          )}
          {isError && (
            <Card tone="red" padding={spacing.lg}>
              <AppText color="red">{t('error')}</AppText>
            </Card>
          )}
          {saveError && (
            <Card tone="amber" padding={spacing.lg}>
              <AppText variant="small" color="amberStrong">
                {t('saveError')}
              </AppText>
            </Card>
          )}

          {/* Tiles */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
            {sources.map((s) => {
              const on = s.status === 'connected';
              const soon = s.status === 'coming_soon';
              const st = status(s);
              const name = t(`name.${s.type}`);
              return (
                <Pressable
                  key={s.type}
                  onPress={() => toggle(s.type)}
                  disabled={!ready}
                  accessibilityRole={soon ? 'button' : 'switch'}
                  accessibilityLabel={name}
                  accessibilityHint={st.hint}
                  accessibilityState={soon ? { selected: s.waitlist, disabled: !ready } : { checked: on, disabled: !ready }}
                  style={({ pressed }) => ({
                    width: tileW,
                    height: 96,
                    borderRadius: radius.card,
                    backgroundColor: colors.surface,
                    borderWidth: 1.5,
                    borderStyle: on ? 'solid' : 'dashed',
                    borderColor: on ? colors.surface : s.status === 'error' ? colors.red : colors.borderDashed,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    boxShadow: shadows.tile,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  {soon && (
                    <View
                      style={{
                        position: 'absolute',
                        top: 6,
                        end: 6,
                        backgroundColor: colors.chip,
                        borderRadius: radius.pill,
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                      }}
                    >
                      <AppText variant="micro" weight="bold" color="textMuted" style={{ fontSize: 9 }}>
                        {t('soon')}
                      </AppText>
                    </View>
                  )}
                  {on ? (
                    <Gradient
                      name={TILE_GRADIENT[s.type]}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: shadows.raised,
                      }}
                    >
                      <AppText variant="small" weight="extrabold" color="onDark" style={{ writingDirection: 'ltr' }}>
                        {t(`abbr.${s.type}`)}
                      </AppText>
                    </Gradient>
                  ) : (
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: colors.chip,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <AppText variant="small" weight="extrabold" color="textFaint" style={{ writingDirection: 'ltr' }}>
                        {t(`abbr.${s.type}`)}
                      </AppText>
                    </View>
                  )}
                  <AppText variant="small" weight="bold" align="center" numberOfLines={1} style={{ paddingHorizontal: 4 }}>
                    {name}
                  </AppText>
                  <AppText variant="micro" weight="semibold" color={st.color} align="center" numberOfLines={1}>
                    {st.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Two-way sync */}
          <Card
            padding={spacing.lg}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.lg,
              borderStartWidth: 4,
              borderStartColor: colors.primary,
              paddingEnd: spacing.xl,
            }}
          >
            <IconBadge size={34} bg="primaryTint">
              <ArrowLeftRight color={colors.primary} size={18} strokeWidth={1.9} />
            </IconBadge>
            <View style={{ flex: 1, gap: 1 }}>
              <AppText weight="bold">{t('syncTitle')}</AppText>
              <AppText variant="caption" color="textMuted">
                {t('syncDetail')}
              </AppText>
            </View>
            <View importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <IconBadge size={26} gradient="avatarBlue">
                <AppText variant="micro" weight="extrabold" color="onDark">
                  {t('syncM')}
                </AppText>
              </IconBadge>
              <ArrowLeftRight color={colors.textFaint} size={14} strokeWidth={2.2} />
              <IconBadge size={26} gradient={TILE_GRADIENT.jira}>
                <AppText variant="micro" weight="extrabold" color="onDark" style={{ fontSize: 10 }}>
                  {t('abbr.jira')}
                </AppText>
              </IconBadge>
            </View>
          </Card>
        </View>
      </ScrollView>

      {/* Sticky actions */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: spacing.screen,
          paddingTop: spacing.lg,
          paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.sm,
          backgroundColor: colors.bg,
          flexDirection: 'row',
          gap: spacing.md,
        }}
      >
        <Button
          label={t('snap')}
          icon={<Camera color={colors.onDark} size={20} strokeWidth={1.9} />}
          onPress={() => router.push({ pathname: '/02-capture', params: { mode: 'text' } })}
          style={{ flex: 1 }}
        />
        <Button label={t('noteTaker')} variant="outline" onPress={() => router.push('/13-note-taker')} style={{ minWidth: 120 }} />
      </View>
    </View>
  );
}
