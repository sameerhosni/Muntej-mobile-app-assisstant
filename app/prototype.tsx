// Screen · Prototype hub — all 37 screens in one place; see design/v2/html/Prototype.dc.html
import { Fragment } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { AppText, Card, Chip, Hero, IconButton } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { setLanguage, useDirection, type Language } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { PROTO_NS } from '@/features/prototype/strings';
import { filteredScreens, LIVE_SCREENS, proto, useProto, type RoleFilter, type SprintFilter } from '@/features/prototype/store';

export default function PrototypeHub() {
  const { t } = useScreenT(PROTO_NS);
  const { t: tg } = useScreenT('screens');
  const { lang, isRTL } = useDirection();
  const s = useProto();
  const list = filteredScreens(s);
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };

  const open = (route: string) => {
    proto.start();
    router.push(route as Href);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Hero>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <IconButton variant="glass" label={t('close')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
              <ChevronLeft color={colors.onDark} size={22} strokeWidth={2} style={flip} />
            </IconButton>
            <Segmented
              glass
              value={lang}
              options={[
                ['en', 'English'],
                ['ar', 'العربية'],
              ]}
              onChange={(v) => setLanguage(v as Language)}
            />
          </View>
          <View style={{ gap: spacing.xs }}>
            <AppText variant="titleLg" color="onDark">
              {t('title')}
            </AppText>
            <AppText color="onDark" weight="bold">
              {t('tagline')}
            </AppText>
            <AppText variant="caption" color="onDarkMuted">
              {t('meta')}
            </AppText>
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, paddingTop: spacing.xxl, gap: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            {t('howTo')}
          </AppText>
          <Segmented
            value={s.role}
            options={[
              ['all', t('all')],
              ['manager', t('manager')],
              ['employee', t('employee')],
            ]}
            onChange={(v) => proto.setRole(v as RoleFilter)}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {(['all', 1, 2, 3] as SprintFilter[]).map((sp) => (
              <Chip
                key={String(sp)}
                label={sp === 'all' ? t('allSprints') : t('sprint', { n: sp })}
                selected={s.sprint === sp}
                onPress={() => proto.setSprint(sp)}
              />
            ))}
          </ScrollView>
          <AppText variant="caption" weight="bold" color="textMuted">
            {t('count', { n: list.length })}
          </AppText>

          {list.map((sc, i) => (
            <Fragment key={sc.num}>
              {(i === 0 || list[i - 1].sprint !== sc.sprint) && (
                <View style={{ marginTop: spacing.md, gap: 2 }}>
                  <AppText variant="section">{t('sprint', { n: sc.sprint })}</AppText>
                  <AppText variant="caption" color="textMuted">
                    {t(`sprint${sc.sprint}`)}
                  </AppText>
                </View>
              )}
              <Card padding={spacing.lg} onPress={() => open(sc.route)} accessibilityLabel={tg(sc.num)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.md,
                    backgroundColor: sc.audience === 'employee' ? colors.purpleTint : colors.primaryTint,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AppText weight="extrabold" color={sc.audience === 'employee' ? 'purple' : 'primary'}>
                    {sc.num}
                  </AppText>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText variant="cardTitle" numberOfLines={1}>
                    {tg(sc.num)}
                  </AppText>
                  <AppText variant="caption" color="textMuted" numberOfLines={2}>
                    {t(`d${sc.num}`)}
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Chip label={t(sc.audience)} tone={sc.audience === 'employee' ? 'purple' : sc.audience === 'both' ? 'green' : 'primary'} />
                    <Chip label={LIVE_SCREENS.includes(sc.num) ? t('live') : t('demo')} tone={LIVE_SCREENS.includes(sc.num) ? 'green' : 'neutral'} />
                  </View>
                </View>
                <ChevronRight color={colors.textFaint} size={18} strokeWidth={2} style={flip} />
              </Card>
            </Fragment>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Segmented({
  value,
  options,
  onChange,
  glass,
}: {
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
  glass?: boolean;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        flexDirection: 'row',
        backgroundColor: glass ? colors.glass : colors.track,
        borderWidth: glass ? 1 : 0,
        borderColor: colors.glassBorder,
        borderRadius: radius.pill,
        padding: 3,
        alignSelf: glass ? 'auto' : 'stretch',
      }}
    >
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={{
              ...(glass ? {} : { flex: 1 }),
              minHeight: sizes.touch - 6,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? colors.surface : colors.transparent,
              boxShadow: on ? shadows.tile : undefined,
            }}
          >
            <AppText variant="small" weight="bold" color={on ? 'primary' : glass ? 'onDark' : 'textMuted'}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
