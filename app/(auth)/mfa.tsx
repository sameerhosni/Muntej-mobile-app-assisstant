// Screen · Authenticator code (2FA step after the email code) — no mockup; v2 light style per design/TOKENS.md
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { AppText, Button, TextField } from '@/components/ui';
import { sizes, spacing } from '@/theme/tokens';
import { supabase } from '@/lib/supabase';
import { AuthShell } from '@/features/auth/AuthShell';
import { useAuth } from '@/features/auth/AuthProvider';
import { deviceUser, signInWithBiometric } from '@/features/auth/deviceKey';
import { otpSchema, type OtpForm } from '@/features/auth/validation';

export default function MfaScreen() {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, formState, setValue } = useForm<OtpForm>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: '' },
  });

  // owner, 27 Oct: "no need for this, simply with fingerprint only". Signed in by email on a phone that has the
  // fingerprint set up for this same person: ask for the fingerprint straight away. It opens a fresh fingerprint
  // session (device key checked by the server), which never needs the authenticator code (bioSession.ts).
  const { session } = useAuth();
  const [bio, setBio] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const tryFingerprint = async () => {
    setBioBusy(true);
    setServerError(null);
    try {
      await signInWithBiometric(t('auth.bioPrompt'));
    } catch {
      setServerError(t('auth.genericError'));
    } finally {
      setBioBusy(false);
    }
  };
  useEffect(() => {
    let alive = true;
    deviceUser().then((u) => {
      if (!alive || !u || u !== session?.user.id) return;
      setBio(true);
      tryFingerprint();
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const onSubmit = handleSubmit(async ({ code }) => {
    setServerError(null);
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((f) => f.status === 'verified');
    if (listError || !factor) return setServerError(t('auth.genericError'));
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) {
      setValue('code', '');
      setServerError(t('auth.mfaWrong'));
    }
    // on success the session becomes aal2 and the guard in app/_layout.tsx opens the app
  });

  return (
    <AuthShell title={t('auth.mfaTitle')} hint={t('auth.mfaHint')}>
      {bio && <Button label={t('auth.mfaUseBio')} onPress={tryFingerprint} loading={bioBusy} />}
      <Controller
        control={control}
        name="code"
        render={({ field }) => (
          <TextField
            label={t('auth.codeLabel')}
            code
            placeholder="••••••"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
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
      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        <Pressable
          onPress={() => supabase.auth.signOut()}
          accessibilityRole="button"
          style={{ minHeight: sizes.touch, justifyContent: 'center', paddingHorizontal: spacing.xs }}
        >
          <AppText variant="small" color="primary" weight="bold">
            {t('auth.signOut')}
          </AppText>
        </Pressable>
      </View>
    </AuthShell>
  );
}
