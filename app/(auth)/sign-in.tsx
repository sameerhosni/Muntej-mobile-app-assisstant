// Screen · Sign in (phone or email) — no mockup; v2 light style per design/TOKENS.md
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { AppText, Avatar, avatarGradientFor, Button, Card, TextField } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { emailRedirectTo, supabase } from '@/lib/supabase';
import { AuthShell } from '@/features/auth/AuthShell';
import { DEMO_PERSONAS, type DemoPersona } from '@/features/auth/demoPersonas';
import { setPendingLogin } from '@/features/auth/pending';
import {
  emailSchema,
  normalizeSaudiPhone,
  phoneSchema,
  type EmailForm,
  type PhoneForm,
} from '@/features/auth/validation';

type Mode = 'phone' | 'email';

export default function SignInScreen() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('phone');

  return (
    <AuthShell
      title={t(mode === 'phone' ? 'auth.phoneTitle' : 'auth.emailTitle')}
      hint={t(mode === 'phone' ? 'auth.phoneHint' : 'auth.emailHint')}
    >
      <ModeSwitch mode={mode} onChange={setMode} />
      {mode === 'phone' ? <PhoneSignIn /> : <EmailSignIn />}
      {__DEV__ && <DemoPersonas />}
    </AuthShell>
  );
}

function errorText(t: (k: string) => string, status?: number) {
  return status === 429 ? t('auth.rateLimited') : t('auth.genericError');
}

function PhoneSignIn() {
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
    if (error) return setServerError(errorText(t, error.status));
    setPendingLogin({ phone: e164 });
    router.push('/verify');
  });

  return (
    <>
      <Controller
        control={control}
        name="phone"
        render={({ field }) => (
          <TextField
            label={t('auth.phoneLabel')}
            prefix="+966"
            placeholder="5X XXX XXXX"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
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
    </>
  );
}

function EmailSignIn() {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setServerError(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: emailRedirectTo() } });
    if (error) return setServerError(errorText(t, error.status));
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
            placeholder="name@company.sa"
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
            error={formState.errors.email?.message ? t(formState.errors.email.message) : serverError ?? undefined}
          />
        )}
      />
      <Button label={t('auth.continue')} onPress={onSubmit} loading={formState.isSubmitting} />
    </>
  );
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{ flexDirection: 'row', backgroundColor: colors.track, borderRadius: radius.pill, padding: 4 }}
    >
      {(['phone', 'email'] as Mode[]).map((m) => {
        const active = mode === m;
        return (
          <Pressable
            key={m}
            onPress={() => onChange(m)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              minHeight: sizes.touch,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? colors.surface : colors.transparent,
              boxShadow: active ? shadows.tile : undefined,
            }}
          >
            <AppText weight="bold" color={active ? 'primary' : 'textMuted'}>
              {t(m === 'phone' ? 'auth.modePhone' : 'auth.modeEmail')}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Dev-only: one tap signs in as a demo persona (fixed code, no SMS). */
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
    if (err) return setError(errorText(t, err.status));
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
