// Screen · Sign in (phone) — no mockup; dark style per design/TOKENS.md
import { useState } from 'react';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Card, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { AuthShell } from '@/features/auth/AuthShell';
import { normalizeSaudiPhone, phoneSchema, type PhoneForm } from '@/features/auth/phone';

export default function SignInScreen() {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '' },
  });

  const onSubmit = handleSubmit(async ({ phone }) => {
    setServerError(null);
    const e164 = normalizeSaudiPhone(phone)!;
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    if (error) {
      setServerError(t('auth.genericError'));
      return;
    }
    router.push({ pathname: '/verify', params: { phone: e164 } });
  });

  return (
    <AuthShell title={t('auth.phoneTitle')} hint={t('auth.phoneHint')}>
      <Controller
        control={control}
        name="phone"
        render={({ field }) => (
          <TextField
            label={t('auth.phoneLabel')}
            prefix="+966"
            placeholder={t('auth.phonePlaceholder')}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            autoFocus
            maxLength={14}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={() => onSubmit()}
            error={formState.errors.phone?.message ? t(formState.errors.phone.message) : serverError ?? undefined}
          />
        )}
      />
      <Button label={t('auth.continue')} onPress={onSubmit} loading={formState.isSubmitting} />
      {__DEV__ && (
        <Card size="md" tone="teal">
          <AppText variant="caption" color="teal">
            {t('auth.devHint')}
          </AppText>
        </Card>
      )}
    </AuthShell>
  );
}
