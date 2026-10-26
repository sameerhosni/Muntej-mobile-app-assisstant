// Screen · Sign in with your mobile — no mockup; v2 light style per design/TOKENS.md. Owner, 26 Oct: "login with mobile
// number". No SMS: one tap opens WhatsApp with «رمز الدخول» ready to send to Muntej's number; Saree3 answers with a
// 6-digit code (WhatsApp itself proves the number), typed here → phone-auth verify_code → session.
import { useEffect, useState } from 'react';
import { Linking, Pressable } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText, Button, TextField } from '@/components/ui';
import { sizes, spacing } from '@/theme/tokens';
import { supabase } from '@/lib/supabase';
import { AuthShell } from '@/features/auth/AuthShell';
import { track } from '@/lib/analytics';

export default function PhoneSignInScreen() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [number, setNumber] = useState('966115209855');

  useEffect(() => {
    supabase.functions
      .invoke<{ number: string }>('phone-auth', { body: { action: 'wa_number' } })
      .then(({ data }) => data?.number && setNumber(data.number))
      .catch(() => {});
  }, []);

  const ask = async () => {
    setError(null);
    setAsked(true);
    track('phone_code_asked');
    await Linking.openURL(`https://wa.me/${number}?text=${encodeURIComponent(t('auth.codeRequest'))}`).catch(() => setError(t('auth.noWhatsApp')));
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.functions.invoke<{ token_hash: string }>('phone-auth', { body: { action: 'verify_code', phone, code } });
    if (e || !data?.token_hash) {
      setBusy(false);
      let msg = t('auth.wrongCode');
      try {
        const body = await (e as { context?: Response })?.context?.json();
        if (body?.error) msg = body.error;
      } catch {
        // keep the general message
      }
      return setError(msg);
    }
    const { error: e2 } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
    setBusy(false);
    if (e2) return setError(t('auth.genericError'));
    track('signed_in_phone');
    router.replace('/' as Href);
  };

  return (
    <AuthShell title={t('auth.phoneTitle')} hint={t('auth.phoneHint')}>
      <TextField label={t('auth.phoneLabel')} prefix="+966" placeholder="5XXXXXXXX" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <Button label={t('auth.getCode')} variant={asked ? 'outline' : 'primary'} onPress={ask} disabled={phone.replace(/\D/g, '').length < 9} />
      {asked && (
        <>
          <AppText variant="caption" color="textSoft">
            {t('auth.codeFromWhatsApp')}
          </AppText>
          <TextField label={t('auth.codeLabel')} code keyboardType="number-pad" maxLength={6} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} />
          <Button label={t('auth.verify')} onPress={verify} loading={busy} disabled={code.length !== 6} />
        </>
      )}
      {!!error && (
        <AppText variant="small" color="red">
          {error}
        </AppText>
      )}
      <Pressable onPress={() => router.replace('/sign-in' as Href)} accessibilityRole="button" style={{ minHeight: sizes.touch, justifyContent: 'center', paddingHorizontal: spacing.xs }}>
        <AppText variant="small" color="primary" weight="bold">
          {t('auth.useEmail')}
        </AppText>
      </Pressable>
    </AuthShell>
  );
}
