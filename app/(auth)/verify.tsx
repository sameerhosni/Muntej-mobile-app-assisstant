// Screen · Verify code (OTP) — no mockup; dark style per design/TOKENS.md
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { AppText, Button, TextField } from '@/components/ui';
import { sizes, spacing } from '@/theme/tokens';
import { supabase } from '@/lib/supabase';
import { AuthShell } from '@/features/auth/AuthShell';
import { otpSchema, type OtpForm } from '@/features/auth/validation';

export default function VerifyScreen() {
  const { t } = useTranslation();
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<OtpForm>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: '' },
  });

  const onSubmit = handleSubmit(async ({ code }) => {
    setServerError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) setServerError(t('auth.genericError'));
    // on success the auth guard in app/_layout.tsx swaps to the app automatically
  });

  const resend = async () => {
    setServerError(null);
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) setServerError(error.status === 429 ? t('auth.rateLimited') : t('auth.genericError'));
    else setNotice(t('auth.resent'));
  };

  return (
    <AuthShell title={t('auth.codeTitle')} hint={t('auth.codeHint', { email: `⁦${email}⁩` })}>
      <Controller
        control={control}
        name="code"
        render={({ field }) => (
          <TextField
            label={t('auth.codeLabel')}
            mono
            placeholder="••••••"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            autoFocus
            maxLength={6}
            style={{ letterSpacing: 8 }}
            value={field.value}
            onChangeText={(v) => {
              field.onChange(v);
              if (v.length === 6) onSubmit();
            }}
            onSubmitEditing={() => onSubmit()}
            error={formState.errors.code?.message ? t(formState.errors.code.message) : serverError ?? undefined}
          />
        )}
      />
      <Button label={t('auth.verify')} onPress={onSubmit} loading={formState.isSubmitting} />
      {notice && (
        <AppText variant="caption" color="teal">
          {notice}
        </AppText>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <LinkButton label={t('auth.changeNumber')} onPress={() => router.back()} />
        <LinkButton label={t('auth.resend')} onPress={resend} />
      </View>
    </AuthShell>
  );
}

function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ minHeight: sizes.touch, justifyContent: 'center', paddingHorizontal: spacing.xs }}
    >
      <AppText variant="small" color="teal" weight="semibold">
        {label}
      </AppText>
    </Pressable>
  );
}
