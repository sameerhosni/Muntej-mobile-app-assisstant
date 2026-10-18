import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react-native';
import { AppText, Hero, IconBadge } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';

/** Shared layout for the sign-in screens: v2 gradient hero with the brand, then the form on light. */
export function AuthShell({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Hero style={{ paddingBottom: 34 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg }}>
            <IconBadge size={40} bg="glass" round>
              <Sparkles color={colors.onDark} size={20} strokeWidth={1.8} />
            </IconBadge>
            <AppText variant="titleLg" color="onDark">
              {t('common.appName')}
            </AppText>
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
