import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react-native';
import { AppText, BrandChip, BrandWordmark, Hero } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { setLanguage, useDirection, type Language } from '@/lib/i18n';

/** before sign-in: one tap to the other language, named in its own script ("English" / "عربي") (owner, 28 Oct) */
function LanguageButton() {
  const { t } = useTranslation();
  const { lang } = useDirection();
  const other: Language = lang === 'ar' ? 'en' : 'ar';
  const label = other === 'en' ? t('settings.english', { lng: 'en' }) : t('settings.arabic', { lng: 'ar' });
  return (
    <Pressable
      onPress={() => setLanguage(other)}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: sizes.touch,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Globe color={colors.primary} size={16} strokeWidth={2.2} />
      <AppText variant="small" weight="bold" color="primary">
        {label}
      </AppText>
    </Pressable>
  );
}

/** Shared layout for the sign-in screens: v2 gradient hero with the brand, then the form on light. */
export function AuthShell({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior="padding">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Hero style={{ paddingBottom: 34 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg }}>
            {/* the brand: symbol + "Muntej" wordmark (Latin, so it doesn't flip in Arabic) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }} accessibilityLabel={t('common.appName')}>
              <BrandChip size={48} />
              <BrandWordmark width={124} variant="white" style={{ marginTop: 4 }} />
            </View>
            <LanguageButton />
          </View>
          <AppText color="onDarkMuted">{t('auth.tagline')}</AppText>
        </Hero>
        <View style={{ paddingHorizontal: spacing.screen, paddingTop: 28, gap: spacing.xxl + 4 }}>
          <View style={{ gap: spacing.xs }}>
            <AppText variant="titleLg">{title}</AppText>
            <AppText color="textMuted">{hint}</AppText>
          </View>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
