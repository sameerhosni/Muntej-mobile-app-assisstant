// Screen · Sign in (email code; optional authenticator step after) — no mockup; v2 light style per design/TOKENS.md
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { AppText, Avatar, avatarGradientFor, Button, Card, TextField } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { emailRedirectTo, supabase } from '@/lib/supabase';
import { AuthShell } from '@/features/auth/AuthShell';
import { DEMO_PERSONAS, type DemoPersona } from '@/features/auth/demoPersonas';
import { setPendingLogin } from '@/features/auth/pending';
import { isAdminUsername, startAdminLogin } from '@/features/auth/adminLogin';
import { useBiometricSignIn } from '@/features/auth/BiometricCard';
import { signInWithBiometric } from '@/features/auth/deviceKey';
import { emailSchema, type EmailForm } from '@/features/auth/validation';
import { kindOf, sendWaitingReports, signInFailure, signInFailureRef } from '@/features/auth/signInError';

export default function SignInScreen() {
  const { t } = useTranslation();
  // a failure kept on this phone while it had no internet goes to our log now
  useEffect(() => {
    void sendWaitingReports();
  }, []);
  return (
    <AuthShell title={t('auth.emailTitle')} hint={t('auth.emailHint')}>
      {/* this phone signs in with the fingerprint: one tap */}
      <BiometricButton />
      <EmailSignIn />
      {/* no email? the mobile your manager added, with a code on WhatsApp */}
      <Button label={t('auth.usePhone')} variant="outline" onPress={() => router.push('/phone' as Href)} />
      {__DEV__ && <DemoPersonas />}
    </AuthShell>
  );
}

function BiometricButton() {
  const { t } = useTranslation();
  const set = useBiometricSignIn();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!set) return null;
  return (
    <>
      <Button
        label={t('auth.bioSignIn')}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            if (await signInWithBiometric(t('auth.bioPrompt'))) router.replace('/' as Href);
          } catch (e) {
            setError(signInFailure(t, 'biometric', e));
          } finally {
            setBusy(false);
          }
        }}
      />
      {!!error && (
        <AppText variant="small" color="red">
          {error}
        </AppText>
      )}
    </>
  );
}

function EmailSignIn() {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const { control, handleSubmit, formState, watch } = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  });
  // the super admin types their username instead of an email: password next, then a code on their email
  const admin = isAdminUsername(watch('email') ?? '');

  const onSubmit = handleSubmit(async ({ email }) => {
    setServerError(null);
    if (isAdminUsername(email)) {
      if (!password) return void setServerError(t('auth.passwordNeeded'));
      const { data, status } = await startAdminLogin(email, password);
      if (!data) {
        const failed = signInFailureRef(t, 'admin', { name: 'AdminLogin', status, message: `admin-login start ${status ?? ''}` });
        return void setServerError(status === 401 ? t('auth.wrongPasswordRef', { ref: failed.ref }) : failed.text);
      }
      setPassword('');
      setPendingLogin({ admin: email, to: data.to });
      router.push('/verify');
      return;
    }
    let error: unknown = null;
    try {
      ({ error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: emailRedirectTo() } }));
    } catch (e) {
      error = e;
    }
    // no internet / our server unreachable: say so here (Apple, 11 Nov: the iPad showed only "an error")
    if (error && kindOf('send_code', error) === 'network') return void setServerError(signInFailure(t, 'send_code', error, email));
    // the email may not be deliverable yet (no verified domain) or codes may be rate-limited: go on to the code
    // screen anyway (the review login's fixed code works there), and keep the reason in our log
    if (error) signInFailure(t, 'send_code', error, email);
    setPendingLogin({ email });
    router.push('/verify');
  });

  return (
    <>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label={t('auth.emailLabel')}
            placeholder="name@example.com"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            ltr
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={() => onSubmit()}
            error={formState.errors.email?.message ? t(formState.errors.email.message) : admin ? undefined : serverError ?? undefined}
          />
        )}
      />
      {admin && (
        <TextField
          label={t('auth.passwordLabel')}
          secureTextEntry
          textContentType="password"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          ltr
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={() => onSubmit()}
          error={serverError ?? undefined}
        />
      )}
      <Button label={admin ? t('auth.verify') : t('auth.continue')} onPress={onSubmit} loading={formState.isSubmitting} />
    </>
  );
}

/** Dev-only: one tap signs in as a demo persona (Supabase test phone numbers with a fixed code: no SMS is ever sent). */
function DemoPersonas() {
  const { t } = useTranslation();
  const { lang } = useDirection();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (p: DemoPersona) => {
    setBusy(p.phone);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: p.phone });
    setBusy(null);
    if (err) return setError(signInFailure(t, 'send_code', err));
    setPendingLogin({ phone: p.phone });
    router.push('/verify');
  };

  return (
    <Card>
      <View style={{ gap: 4 }}>
        <AppText variant="cardTitle" color="primary">
          {t('auth.demoTitle')}
        </AppText>
        <AppText variant="caption" color="textSoft">
          {t('auth.demoHint')}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {DEMO_PERSONAS.map((p) => (
          <Pressable
            key={p.phone}
            onPress={() => pick(p)}
            disabled={!!busy}
            accessibilityRole="button"
            accessibilityLabel={lang === 'ar' ? p.nameAr : p.name}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              minHeight: sizes.touch,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: p.role === 'manager' ? colors.primary : colors.purpleBorder,
              opacity: busy && busy !== p.phone ? 0.5 : pressed ? 0.8 : 1,
            })}
          >
            <Avatar name={p.name} size={26} gradient={p.role === 'manager' ? 'avatarOrange' : avatarGradientFor(p.name)} />
            <AppText variant="small" weight="semibold">
              {lang === 'ar' ? p.nameAr : p.name}
            </AppText>
          </Pressable>
        ))}
      </View>
      {error && (
        <AppText variant="caption" color="red">
          {error}
        </AppText>
      )}
    </Card>
  );
}
