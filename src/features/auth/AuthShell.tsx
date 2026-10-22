import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, BrandChip, BrandWordmark, Hero } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';

/** Shared layout for the sign-in screens: v2 gradient hero with the brand, then the form on light. */
export function AuthShell({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior="padding">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Hero style={{ paddingBottom: 34 }}>
          {/* the brand: symbol + "Muntej" wordmark (Latin, so it doesn't flip in Arabic) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg }} accessibilityLabel={t('common.appName')}>
            <BrandChip size={48} />
            <BrandWordmark width={124} variant="white" style={{ marginTop: 4 }} />
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
