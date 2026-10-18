import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Screen } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';

/** Shared layout for the sign-in screens: brand mark, title, hint, then the form. */
export function AuthShell({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentStyle={{ paddingTop: 56, gap: spacing.xxl + 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.teal }} />
          <AppText variant="lead" weight="extrabold" color="teal">
            {t('common.appName')}
          </AppText>
        </View>
        <View style={{ gap: spacing.sm }}>
          <AppText variant="titleLg">{title}</AppText>
          <AppText color="textMuted">{hint}</AppText>
        </View>
        {children}
        <AppText variant="caption" color="textDim" align="center" style={{ marginTop: spacing.xxl }}>
          {t('auth.tagline')}
        </AppText>
      </Screen>
    </KeyboardAvoidingView>
  );
}
