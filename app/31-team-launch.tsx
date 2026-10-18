// Screen 31 · Bring your team in — see design/v2/html/TeamLaunch.dc.html (Arabic: TeamLaunchAR.dc.html)
// Demo data (no invites backend yet): join progress + one-tap nudges. Share buttons use the native share sheet.
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Share, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banknote, Bell, ChevronLeft, Clock, FileDown, Hand, MessageCircle, Users, X, Zap } from 'lucide-react-native';
import { AppText, Avatar, Card, Gradient, Hero, IconBadge, IconButton, PointsCoin } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { person, personLabel } from '@/features/demo/team';
import { NS } from '@/features/team-launch/strings';
import { ALL_IN_PTS, INVITE_LINK, JOINED_BASE, MISSING, PTS_PER_SAR, TEAM_SIZE, type MissingId } from '@/features/team-launch/demo';

export default function TeamLaunchScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const [joined, setJoined] = useState<Partial<Record<MissingId, boolean>>>({});
  const [celebrationClosed, setCelebrationClosed] = useState(false);

  const n = JOINED_BASE + MISSING.filter((id) => joined[id]).length;
  const left = TEAM_SIZE - n;
  const allIn = n === TEAM_SIZE;
  const inviteText = t('inviteText', { link: INVITE_LINK });

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const shareWhatsApp = async () => {
    try {
      await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(inviteText)}`);
    } catch {
      Share.share({ message: inviteText }).catch(() => undefined);
    }
  };
  const sharePoster = () => {
    Share.share({ message: t('posterText', { link: INVITE_LINK }) }).catch(() => undefined);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, spacing.xxl) + 24 }} showsVerticalScrollIndicator={false}>
        <Hero overlap={36}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <IconButton variant="glass" label={t('back')} onPress={back}>
              <ChevronLeft color={colors.onDark} size={20} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </IconButton>
            <View style={{ flex: 1 }}>
              <AppText variant="big" display color="onDark">
                {t('title')}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Zap color={colors.onDark} size={14} strokeWidth={2.2} />
                <AppText variant="small" color="onDarkMuted">
                  {t('subtitle')}
                </AppText>
              </View>
            </View>
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -36, gap: spacing.xl }}>
          <Card elevation="raised" padding={0} style={{ borderRadius: radius.cardLg, paddingVertical: spacing.xxl, paddingHorizontal: 18, gap: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View
                style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel={`${formatNumber(n, lang)} ${t('ofJoined', { total: formatNumber(TEAM_SIZE, lang) })}`}
              >
                <AppText weight="extrabold" color="primary" style={{ fontSize: 40, lineHeight: 44 }}>
                  {formatNumber(n, lang)}
                </AppText>
                <AppText variant="lead" weight="bold">
                  {t('ofJoined', { total: formatNumber(TEAM_SIZE, lang) })}
                </AppText>
              </View>
              <View style={{ backgroundColor: allIn ? colors.greenTint : colors.primaryTint, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 }}>
                <AppText variant="caption" weight="bold" color={allIn ? 'green' : 'primary'}>
                  {left ? t('toGo', { n: formatNumber(left, lang) }) : t('complete')}
                </AppText>
              </View>
            </View>
            <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.track, overflow: 'hidden', flexDirection: 'row' }}>
              <Gradient name={allIn ? 'success' : 'avatarBlue'} direction="horizontal" style={{ width: `${Math.round((n / TEAM_SIZE) * 100)}%`, borderRadius: 5 }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.orangeTint, borderRadius: spacing.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
              <PointsCoin size={22} />
              <AppText variant="small" weight="semibold" color="orangeText" style={{ flex: 1 }}>
                {t('allInNote', { pts: formatNumber(ALL_IN_PTS, lang) })}
              </AppText>
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                <AppText variant="caption" weight="bold" color="green">
                  {t('sar', { n: formatNumber(ALL_IN_PTS / PTS_PER_SAR, lang) })}
                </AppText>
              </View>
            </View>
          </Card>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <ValueTile bg="primaryTint" icon={<Clock color={colors.primary} size={16} strokeWidth={2} />} value={t('dayValue')} label={t('dayLabel')} />
            <ValueTile bg="orangeTint" icon={<Hand color={colors.orange} size={16} strokeWidth={2} />} value={t('trainingValue')} label={t('trainingLabel')} />
            <ValueTile bg="greenTint" icon={<Banknote color={colors.green} size={16} strokeWidth={2} />} value={t('costValue')} label={t('costLabel')} />
          </View>

          <View style={{ gap: spacing.sm }}>
            <AppText variant="section">{t('notJoined')}</AppText>
            {MISSING.map((id) => {
              const p = person(id);
              const name = personLabel(p, lang);
              const done = !!joined[id];
              return (
                <Card key={id} padding={0} style={{ minHeight: 60, borderRadius: radius.button, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
                  <Avatar name={name} gradient={p.gradient} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="cardTitle" weight="bold" numberOfLines={1}>
                      {name}
                    </AppText>
                    <AppText variant="caption" color="textMuted" numberOfLines={1}>
                      {t(`notes.${id}`)}
                    </AppText>
                  </View>
                  {done ? (
                    <View style={{ backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 }}>
                      <AppText variant="caption" weight="bold" color="green">
                        {t('joined')}
                      </AppText>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => setJoined((j) => ({ ...j, [id]: true }))}
                      accessibilityRole="button"
                      accessibilityLabel={t('nudgeA11y', { name })}
                      hitSlop={{ top: 4, bottom: 4 }}
                      style={({ pressed }) => ({
                        height: 36,
                        paddingHorizontal: spacing.xl,
                        borderRadius: radius.pill,
                        borderWidth: 1,
                        borderColor: colors.borderBlue,
                        backgroundColor: colors.surface,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      <Bell color={colors.primary} size={14} strokeWidth={2} />
                      <AppText variant="small" weight="bold" color="primary">
                        {t('nudge')}
                      </AppText>
                    </Pressable>
                  )}
                </Card>
              );
            })}
          </View>

          <Card padding={0} style={{ borderRadius: radius.cardLg, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <IconBadge size={28} bg="greenTint">
                <MessageCircle color={colors.green} size={16} strokeWidth={1.8} />
              </IconBadge>
              <AppText variant="small" weight="bold">
                {t('inviteReady')}
              </AppText>
            </View>
            <View
              style={{
                backgroundColor: colors.greenTint,
                borderRadius: radius.tile,
                borderBottomStartRadius: 4,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.lg,
              }}
            >
              <AppText variant="small" color="greenText" style={{ lineHeight: 20 }} selectable>
                {inviteText}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <ShareButton primary label={t('whatsapp')} onPress={shareWhatsApp} icon={<MessageCircle color={colors.onDark} size={16} strokeWidth={2} />} />
              <ShareButton label={t('poster')} onPress={sharePoster} icon={<FileDown color={colors.primary} size={16} strokeWidth={2} />} />
            </View>
          </Card>
        </View>
      </ScrollView>

      {allIn && !celebrationClosed && (
        <Gradient
          name="heroManager"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            minHeight: 300,
            borderTopLeftRadius: radius.hero,
            borderTopRightRadius: radius.hero,
            paddingHorizontal: 24,
            paddingTop: spacing.screen,
            paddingBottom: Math.max(insets.bottom, spacing.xxl) + 24,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            boxShadow: '0px -10px 32px rgba(11,42,91,0.25)',
          }}
        >
          <View style={{ position: 'absolute', top: spacing.lg, end: spacing.lg }}>
            <IconButton variant="glass" label={t('close')} onPress={() => setCelebrationClosed(true)}>
              <X color={colors.onDark} size={18} strokeWidth={2} />
            </IconButton>
          </View>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
            <Users color={colors.onDark} size={34} strokeWidth={1.8} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={{ width: 8, height: 8, backgroundColor: colors.mint, transform: [{ rotate: '45deg' }] }} />
            <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: colors.purpleLight }} />
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gold }} />
          </View>
          <AppText variant="big" display color="onDark" align="center">
            {t('allInTitle')}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: spacing.lg }}>
            <PointsCoin size={20} />
            <AppText weight="bold" color="onDark">
              {t('allInPill', { pts: formatNumber(ALL_IN_PTS, lang), total: formatNumber(TEAM_SIZE, lang) })}
            </AppText>
          </View>
        </Gradient>
      )}
    </View>
  );
}

function ValueTile({ bg, icon, value, label }: { bg: ColorToken; icon: ReactNode; value: string; label: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: colors.surface, borderRadius: radius.tile, paddingVertical: 9, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, boxShadow: shadows.card }}>
      <IconBadge size={30} bg={bg}>
        {icon}
      </IconBadge>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="cardTitle" weight="extrabold" numberOfLines={1}>
          {value}
        </AppText>
        <AppText variant="micro" color="textMuted" numberOfLines={2} style={{ lineHeight: 14 }}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

function ShareButton({ label, onPress, icon, primary }: { label: string; onPress: () => void; icon: ReactNode; primary?: boolean }) {
  const inner = (
    <>
      {icon}
      <AppText weight="bold" color={primary ? 'onDark' : 'primary'}>
        {label}
      </AppText>
    </>
  );
  const box = { flex: 1, minHeight: 46, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 } as const;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ flex: 1, borderRadius: radius.pill, boxShadow: primary ? shadows.primary : undefined, opacity: pressed ? 0.88 : 1, minHeight: sizes.touch })}
    >
      {primary ? (
        <Gradient name="primary" style={box}>
          {inner}
        </Gradient>
      ) : (
        <View style={[box, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderBlue }]}>{inner}</View>
      )}
    </Pressable>
  );
}
