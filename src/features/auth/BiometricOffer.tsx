// Home: "Open Muntej with your fingerprint" offered once, right after signing in on a phone that can (owner, 27 Oct:
// "didn't see this" — it only lived in Security). Turn it on here, or "Not now" (remembered on this phone; Security
// still has the switch). Hidden on builds without the native modules and on phones with no fingerprint / face set up.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Fingerprint } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Card, IconBadge } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { track } from '@/lib/analytics';
import { biometricBuild, biometricReady, deviceUser, enableBiometric } from './deviceKey';

const SEEN = 'muntej_bio_offer_seen';

export function BiometricOffer() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!biometricBuild) return;
    (async () => {
      const seen = await AsyncStorage.getItem(SEEN).catch(() => '1');
      if (seen || (await deviceUser()) || !(await biometricReady())) return;
      setShow(true);
    })();
  }, []);
  if (!show) return null;

  const close = () => {
    AsyncStorage.setItem(SEEN, '1').catch(() => {});
    setShow(false);
  };
  const turnOn = async () => {
    setBusy(true);
    setNote(null);
    try {
      if (await enableBiometric(t('auth.bioPrompt'))) {
        AsyncStorage.setItem(SEEN, '1').catch(() => {});
        setDone(true);
        setTimeout(() => setShow(false), 2500);
      }
    } catch {
      setNote(t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconBadge size={44} bg={done ? 'greenTint' : 'primaryTint'}>
          <Fingerprint color={done ? colors.green : colors.primary} size={22} strokeWidth={2} />
        </IconBadge>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="cardTitle">{done ? t('auth.bioOfferDone') : t('auth.bioOfferTitle')}</AppText>
          {!done && (
            <AppText variant="caption" color="textMuted">
              {t('auth.bioSub')}
            </AppText>
          )}
        </View>
      </View>
      {!!note && (
        <AppText variant="caption" color="red">
          {note}
        </AppText>
      )}
      {!done && (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            label={t('auth.bioOfferNo')}
            variant="outline"
            size="md"
            style={{ flex: 1 }}
            onPress={() => {
              track('biometric_offer_dismissed');
              close();
            }}
          />
          <Button label={t('auth.bioOfferYes')} size="md" style={{ flex: 1 }} loading={busy} onPress={turnOn} />
        </View>
      )}
    </Card>
  );
}
