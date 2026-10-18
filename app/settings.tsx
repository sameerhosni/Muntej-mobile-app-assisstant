// Screen · Settings — simple settings (language); no mockup, follows design/TOKENS.md
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { AppText, Avatar, Button, Card, Chip, Screen, SectionTitle } from '@/components/ui';
import { useMyProfile, useSignOut } from '@/lib/api';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { setLanguage, useDirection, type Language } from '@/lib/i18n';
import { SCREENS } from '@/features/screens/registry';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { lang, isRTL } = useDirection();
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const { data: me } = useMyProfile();
  const signOut = useSignOut();

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={{
            width: sizes.touch,
            height: sizes.touch,
            borderRadius: sizes.touch / 2,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft color={colors.textMuted} size={22} strokeWidth={2} style={flip} />
        </Pressable>
        <AppText variant="title">{t('settings.title')}</AppText>
      </View>

      {me && (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <Avatar name={me.full_name} size={48} bg="tealDeep" fg="teal" />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="caption" color="textMuted">
                {t('settings.signedInAs')}
              </AppText>
              <AppText variant="cardTitle">{lang === 'ar' && me.full_name_ar ? me.full_name_ar : me.full_name}</AppText>
              <AppText variant="caption" color="textMuted">
                {t(me.role === 'manager' ? 'settings.manager' : 'settings.employee')}
                {(lang === 'ar' ? me.title_ar : me.title) ? ` · ${lang === 'ar' ? me.title_ar : me.title}` : ''}
              </AppText>
            </View>
          </View>
          <Button
            label={t('settings.signOut')}
            variant="outline"
            tone="neutral"
            size="md"
            loading={signOut.isPending}
            onPress={() => signOut.mutate()}
          />
        </Card>
      )}

      <Card>
        <View style={{ gap: 4 }}>
          <AppText variant="cardTitle">{t('settings.language')}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('settings.languageHint')}
          </AppText>
        </View>
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: 'row', backgroundColor: colors.bg, borderRadius: radius.md, padding: 4 }}
        >
          {(['en', 'ar'] as Language[]).map((l) => {
            const active = lang === l;
            return (
              <Pressable
                key={l}
                onPress={() => setLanguage(l)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={{
                  flex: 1,
                  minHeight: sizes.touch,
                  borderRadius: radius.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? colors.teal : colors.transparent,
                }}
              >
                <AppText weight="bold" color={active ? 'onTeal' : 'textSoft'}>
                  {l === 'en' ? t('settings.english') : t('settings.arabic')}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <SectionTitle title={t('settings.allScreens')} kind="strong" />
      <AppText variant="caption" color="textMuted">
        {t('settings.allScreensHint')}
      </AppText>
      <Card size="md" style={{ gap: 0, paddingVertical: spacing.sm }}>
        {SCREENS.map((s, i) => (
          <Pressable
            key={s.num}
            onPress={() => router.push(s.route as Href)}
            accessibilityRole="link"
            style={{
              minHeight: sizes.touch + 4,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.lg,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <AppText mono weight="semibold" color="teal" style={{ width: 28 }}>
              {s.num}
            </AppText>
            <AppText style={{ flex: 1 }}>{t(`screens.${s.num}`)}</AppText>
            <Chip label={`S${s.sprint}`} style={{ alignSelf: 'center' }} />
            <ChevronRight color={colors.textMuted} size={18} strokeWidth={2} style={flip} />
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}
