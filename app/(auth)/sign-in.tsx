// Screen · Sign in (email) — no mockup; dark style per design/TOKENS.md
import { useState } from 'react';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Button, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { AuthShell } from '@/features/auth/AuthShell';
import { emailSchema, type EmailForm } from '@/features/auth/validation';

export default function SignInScreen() {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setServerError(null);
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      setServerError(error.status === 429 ? t('auth.rateLimited') : t('auth.genericError'));
      return;
    }
    router.push({ pathname: '/verify', params: { email } });
  });

  return (
    <AuthShell title={t('auth.emailTitle')} hint={t('auth.emailHint')}>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label={t('auth.emailLabel')}
            placeholder="name@company.sa"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            ltr
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={() => onSubmit()}
            error={formState.errors.email?.message ? t(formState.errors.email.message) : serverError ?? undefined}
          />
        )}
      />
      <Button label={t('auth.continue')} onPress={onSubmit} loading={formState.isSubmitting} />
    </AuthShell>
  );
}
