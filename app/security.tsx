// Screen · Two-step verification (authenticator app) — no mockup; v2 light style per design/TOKENS.md
// Supabase Auth TOTP: enroll → scan QR → confirm first code (challengeAndVerify) → next sign-ins ask for it.
import { useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { SvgXml } from 'react-native-svg';
import { ChevronLeft, ShieldCheck } from 'lucide-react-native';
import { AppText, Button, Card, IconBadge, IconButton, Screen, TextField } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { MFA_FACTORS_KEY, useTotpFactor } from '@/features/auth/useTotpFactor';
import { useAuth } from '@/features/auth/AuthProvider';

type Enrollment = { factorId: string; qrSvg: string; secret: string; uri: string };

/** Supabase returns the QR as a data URI ("data:image/svg+xml;utf-8,<svg…>"); SvgXml needs the raw markup. */
function svgFromDataUri(dataUri: string) {
  const raw = dataUri.slice(dataUri.indexOf(',') + 1);
  return raw.trimStart().startsWith('<') ? raw : decodeURIComponent(raw);
}

export default function SecurityScreen() {
  const { t } = useTranslation();
  const { lang, isRTL } = useDirection();
  const qc = useQueryClient();
  const factor = useTotpFactor();
  // the authenticator QR is labelled with the account email, so phone-only (demo) accounts can't enroll
  const hasEmail = !!useAuth().session?.user.email;
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // leaving mid-setup → remove the half-made factor so it doesn't block the next attempt
  const pending = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (pending.current) supabase.auth.mfa.unenroll({ factorId: pending.current });
    },
    [],
  );

  const refresh = () => qc.invalidateQueries({ queryKey: MFA_FACTORS_KEY });

  const start = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    // clear leftovers from an earlier unfinished setup
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) {
      if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Muntej' });
    setBusy(false);
    if (err || !data) return setError(t('security.error'));
    pending.current = data.id;
    setEnrollment({ factorId: data.id, qrSvg: svgFromDataUri(data.totp.qr_code), secret: data.totp.secret, uri: data.totp.uri });
  };

  const confirm = async (value = code) => {
    if (!enrollment || value.length !== 6) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code: value });
    setBusy(false);
    if (err) {
      setCode('');
      return setError(t('auth.mfaWrong'));
    }
    pending.current = null;
    setEnrollment(null);
    setCode('');
    setNotice(t('security.turnedOn'));
    refresh();
  };

  const cancel = async () => {
    if (enrollment) await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId });
    pending.current = null;
    setEnrollment(null);
    setCode('');
    setError(null);
  };

  const turnOff = async () => {
    if (!factor.data) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId: factor.data.id });
    setBusy(false);
    if (err) return setError(t('security.error'));
    setNotice(t('security.turnedOff'));
    refresh();
  };

  const since = factor.data
    ? new Date(factor.data.updated_at ?? factor.data.created_at).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}>
          <ChevronLeft color={colors.text} size={22} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </IconButton>
        <AppText variant="titleLg">{t('security.title')}</AppText>
      </View>

      <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconBadge size={44} bg={factor.data ? 'greenTint' : 'primaryTint'}>
          <ShieldCheck color={factor.data ? colors.green : colors.primary} size={22} strokeWidth={2} />
        </IconBadge>
        <AppText variant="small" color="textSoft" style={{ flex: 1 }}>
          {t('security.intro')}
        </AppText>
      </Card>

      {factor.data && !enrollment ? (
        <Card>
          <View style={{ gap: 2 }}>
            <AppText variant="cardTitle" color="greenText">
              {t('security.onTitle')}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {t('security.onSince', { date: since })}
            </AppText>
          </View>
          <Button label={t('security.turnOff')} variant="outline" size="md" loading={busy} onPress={turnOff} />
        </Card>
      ) : enrollment ? (
        <Card>
          <AppText variant="cardTitle">{t('security.step1')}</AppText>
          <View
            style={{
              alignSelf: 'center',
              padding: spacing.md,
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <SvgXml xml={enrollment.qrSvg} width={190} height={190} />
          </View>
          <View style={{ gap: 4 }}>
            <AppText variant="caption" color="textMuted">
              {t('security.secretLabel')}
            </AppText>
            {/* selectable so it can be long-pressed and copied into the authenticator app */}
            <AppText selectable weight="bold" style={{ letterSpacing: 1.5, writingDirection: 'ltr', textAlign: 'center' }}>
              {enrollment.secret.replace(/(.{4})/g, '$1 ').trim()}
            </AppText>
          </View>
          <Button label={t('security.openApp')} variant="outline" size="md" onPress={() => Linking.openURL(enrollment.uri).catch(() => {})} />
          <AppText variant="cardTitle">{t('security.step2')}</AppText>
          <TextField
            label={t('auth.codeLabel')}
            code
            placeholder="••••••"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            maxLength={6}
            style={{ letterSpacing: 8 }}
            value={code}
            onChangeText={(v) => {
              setCode(v);
              if (v.length === 6) confirm(v);
            }}
            onSubmitEditing={() => confirm()}
            error={error ?? undefined}
          />
          <Button label={t('security.confirm')} loading={busy} disabled={code.length !== 6} onPress={() => confirm()} />
          <Button label={t('security.cancel')} variant="outline" size="md" onPress={cancel} />
        </Card>
      ) : !hasEmail ? (
        <AppText variant="small" color="textMuted">
          {t('security.needsEmail')}
        </AppText>
      ) : (
        <Button label={t('security.turnOn')} loading={busy || factor.isLoading} onPress={start} />
      )}

      {notice && (
        <AppText variant="small" color="greenText">
          {notice}
        </AppText>
      )}
      {error && !enrollment && (
        <AppText variant="small" color="red">
          {error}
        </AppText>
      )}
    </Screen>
  );
}
