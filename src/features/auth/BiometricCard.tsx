// Security: "Sign in with your fingerprint / face" on or off for this phone (deviceKey.ts). Hidden on builds without
// the native modules and on phones with no fingerprint / face set up.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Fingerprint } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Card, IconBadge, Toggle } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { biometricBuild, biometricReady, deviceUser, disableBiometric, enableBiometric } from './deviceKey';

export function BiometricCard() {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    biometricReady().then(setReady);
    deviceUser().then((u) => setOn(!!u));
  }, []);
  if (!biometricBuild || !ready) return null;

  const toggle = async (v: boolean) => {
    setBusy(true);
    setNote(null);
    try {
      if (v) setOn(await enableBiometric(t('auth.bioPrompt')));
      else {
        await disableBiometric();
        setOn(false);
      }
    } catch {
      setNote(t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconBadge size={44} bg={on ? 'greenTint' : 'primaryTint'}>
          <Fingerprint color={on ? colors.green : colors.primary} size={22} strokeWidth={2} />
        </IconBadge>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="cardTitle">{t('auth.bioTitle')}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('auth.bioSub')}
          </AppText>
        </View>
        <Toggle value={on} onValueChange={toggle} disabled={busy} accessibilityLabel={t('auth.bioTitle')} />
      </View>
      {!!note && (
        <AppText variant="caption" color="red">
          {note}
        </AppText>
      )}
    </Card>
  );
}

/** sign-in screen: one tap with the fingerprint when this phone is set up */
export function useBiometricSignIn() {
  const [user, setUser] = useState<string | null>(null);
  useEffect(() => {
    deviceUser().then(setUser);
  }, []);
  return !!user;
}
