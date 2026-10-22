// Screen · Verify code (OTP) — no mockup; dark style per design/TOKENS.md
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { AppText, Button, TextField } from '@/components/ui';
import { sizes, spacing } from '@/theme/tokens';
import { emailRedirectTo, supabase } from '@/lib/supabase';
import { AuthShell } from '@/features/auth/AuthShell';
import { otpSchema, type OtpForm } from '@/features/auth/validation';
import { DEMO_CODE, isDemoPhone } from '@/features/auth/demoPersonas';
import { getPendingLogin, takePendingInvite } from '@/features/auth/pending';
import { redeemCode } from '@/features/invite/api';

// "Paste code" needs expo-clipboard (in builds after 1.1): hidden where the native part is missing
const canPaste = Platform.OS === 'web' || !!requireOptionalNativeModule('ExpoClipboard');

export default function VerifyScreen() {
  const { t } = useTranslation();
  const pending = getPendingLogin();
  const phone = pending?.phone ?? '';
  const email = pending?.email ?? '';
  const demo = __DEV__ && !!phone && isDemoPhone(phone);

  // opened without a pending sign-in (e.g. app reloaded on this screen) → start over
  useEffect(() => {
    if (!phone && !email) router.replace('/sign-in');
  }, [phone, email]);
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { control, handleSubmit, formState, setValue } = useForm<OtpForm>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: demo ? DEMO_CODE : '' },
  });

  // signed in with an invite code: join that team (a brand-new login is already in it; this also tells the inviter)
  const joinInvite = async () => {
    const invite = takePendingInvite();
    if (invite) await redeemCode(qc, invite).catch(() => {});
  };

  const onSubmit = handleSubmit(async ({ code }) => {
    setServerError(null);
    const { error } = phone
      ? await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' })
      : await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (!error) return joinInvite();
    // TEMPORARY: not the emailed code → try the shared code (while sign-in emails don't reach everyone);
    // quick-login turns it into a one-time sign-in token
    if (email) {
      const { data, error: fnError } = await supabase.functions.invoke<{ token_hash: string }>('quick-login', { body: { email, code } });
      const res = data?.token_hash ? await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' }) : null;
      if (!fnError && res && !res.error) return joinInvite();
    }
    setServerError(t('auth.genericError'));
    // on success the auth guard in app/_layout.tsx swaps to the app automatically
  });

  // demo personas: the code is fixed, so sign straight in
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (demo && !autoSubmitted.current) {
      autoSubmitted.current = true;
      onSubmit();
    }
  }, [demo, onSubmit]);

  const resend = async () => {
    setServerError(null);
    const { error } = phone
      ? await supabase.auth.signInWithOtp({ phone })
      : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: emailRedirectTo() } });
    if (error) setServerError(error.status === 429 ? t('auth.rateLimited') : t('auth.genericError'));
    else setNotice(t('auth.resent'));
  };

  return (
    <AuthShell
      title={t('auth.codeTitle')}
      hint={demo ? t('auth.demoCodeHint') : t('auth.codeHint', { to: `⁦${phone || email}⁩` })}
    >
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
      {/* copied the code from the email: one tap fills it in and signs in */}
      {canPaste && (
        <Button
          label={t('auth.pasteCode')}
          variant="outline"
          onPress={async () => {
            const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
            const digits = ((await Clipboard.getStringAsync()) || '').match(/\d{6}/)?.[0];
            if (!digits) return;
            setValue('code', digits);
            onSubmit();
          }}
        />
      )}
      <Button label={t('auth.verify')} onPress={onSubmit} loading={formState.isSubmitting} />
      {notice && (
        <AppText variant="caption" color="green">
          {notice}
        </AppText>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <LinkButton label={t('auth.changeEmail')} onPress={() => router.back()} />
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
      <AppText variant="small" color="primary" weight="bold">
        {label}
      </AppText>
    </Pressable>
  );
}
