import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Globe } from 'lucide-react-native';
import { AppText, BrandChip, BrandWordmark, Hero } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { setLanguage, useDirection, type Language } from '@/lib/i18n';

const LANGUAGES: Language[] = ['ar', 'en', 'hi'];

/** before sign-in: a small globe that opens the languages, each named in its own script (owner, 8 Nov: "Language
 *  should be small icon in drop down"; the row of buttons covered the Muntej logo) */
function LanguageMenu() {
  const { t } = useTranslation();
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const name = (l: Language) => (l === 'en' ? t('settings.english', { lng: 'en' }) : l === 'ar' ? t('settings.arabic', { lng: 'ar' }) : t('settings.hindi', { lng: 'en' }));
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${name('en')} · ${name('ar')} · ${name('hi')}`}
        hitSlop={4}
        style={({ pressed }) => ({
          width: sizes.touch,
          height: sizes.touch,
          borderRadius: sizes.touch / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Globe color={colors.primary} size={20} strokeWidth={2.2} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} accessibilityLabel={t('capture.close')}>
          <View
            style={{
              position: 'absolute',
              top: insets.top + spacing.lg + sizes.touch + spacing.sm,
              // the globe sits at the row's end: right in English, left in Arabic
              ...(isRTL ? { left: spacing.screen } : { right: spacing.screen }),
              minWidth: 168,
              paddingVertical: spacing.xs,
              borderRadius: radius.md,
              backgroundColor: colors.surface,
              boxShadow: shadows.primary,
            }}
          >
            {LANGUAGES.map((l) => (
              <Pressable
                key={l}
                onPress={() => {
                  setOpen(false);
                  if (l !== lang) setLanguage(l);
                }}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: l === lang }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  minHeight: sizes.touch,
                  paddingHorizontal: spacing.lg,
                  backgroundColor: pressed ? colors.primaryTint : 'transparent',
                })}
              >
                <AppText weight={l === lang ? 'bold' : 'regular'} color={l === lang ? 'primary' : 'text'} style={{ flex: 1 }}>
                  {name(l)}
                </AppText>
                {l === lang && <Check color={colors.primary} size={16} strokeWidth={2.4} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
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
            <LanguageMenu />
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
