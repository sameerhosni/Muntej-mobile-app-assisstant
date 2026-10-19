// Screen · Settings — profile, language, sign out, all-screens dev index; no mockup, v2 style per design/TOKENS.md
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Bell, ChevronLeft, ChevronRight, LayoutGrid, ShieldCheck, Users } from 'lucide-react-native';
import { AppText, Avatar, Button, Card, Chip, IconBadge, IconButton, Screen, SectionTitle, Toggle } from '@/components/ui';
import { useScreenT } from '@/lib/i18n/register';
import { PROTO_NS } from '@/features/prototype/strings';
import { useMyProfile, useSignOut } from '@/lib/api';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { setLanguage, useDirection, type Language } from '@/lib/i18n';
import { SCREENS } from '@/features/screens/registry';
import { useTotpFactor } from '@/features/auth/useTotpFactor';
import { sendTestPush, usePushStatus } from '@/features/notifications/push';
import { NS as TEAM_NS } from '@/features/org/strings';
import { Munti } from '@/features/munti/Munti';
import { munti, useMunti } from '@/features/munti/store';
import { MUNTI_NS } from '@/features/munti/tips';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { lang, isRTL } = useDirection();
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const { data: me } = useMyProfile();
  const signOut = useSignOut();
  const { t: tp } = useScreenT(PROTO_NS);
  const { t: tt } = useScreenT(TEAM_NS);
  const { t: tm } = useScreenT(MUNTI_NS);
  const muntiState = useMunti();
  const twoStep = useTotpFactor();
  const push = usePushStatus();
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<string | null>(null);
  const test = async () => {
    setTesting(true);
    setTestNote(null);
    try {
      setTestNote(t((await sendTestPush()) > 0 ? 'push.testSent' : 'push.testNone'));
    } catch {
      setTestNote(t('push.error'));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <ChevronLeft color={colors.text} size={22} strokeWidth={2} style={flip} />
        </IconButton>
        <AppText variant="titleLg">{t('settings.title')}</AppText>
      </View>

      <Card
        onPress={() => router.push('/prototype')}
        accessibilityLabel={tp('open')}
        style={{ flexDirection: 'row', alignItems: 'center' }}
      >
        <IconBadge size={44} gradient="heroManager">
          <LayoutGrid color={colors.onDark} size={20} strokeWidth={2} />
        </IconBadge>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="cardTitle">{tp('open')}</AppText>
          <AppText variant="caption" color="textMuted">
            {tp('openHint')}
          </AppText>
        </View>
        <ChevronRight color={colors.textFaint} size={18} strokeWidth={2} style={flip} />
      </Card>

      {me && (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <Avatar name={me.full_name} size={48} gradient={me.role === 'employee' ? 'avatarBlue' : 'avatarOrange'} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="caption" color="textMuted">
                {t('settings.signedInAs')}
              </AppText>
              <AppText variant="cardTitle">{lang === 'ar' && me.full_name_ar ? me.full_name_ar : me.full_name}</AppText>
              <AppText variant="caption" color="textMuted">
                {t(`settings.role_${me.role}`)}
                {(lang === 'ar' ? me.title_ar : me.title) ? ` · ${lang === 'ar' ? me.title_ar : me.title}` : ''}
              </AppText>
            </View>
          </View>
          <Button
            label={t('settings.signOut')}
            variant="outline"
            size="md"
            loading={signOut.isPending}
            onPress={() => signOut.mutate()}
          />
        </Card>
      )}

      <Card
        onPress={() => router.push('/39-team')}
        accessibilityLabel={`${tt('title')} · ${tt('linkSub')}`}
        style={{ flexDirection: 'row', alignItems: 'center' }}
      >
        <IconBadge size={44} bg="primaryTint">
          <Users color={colors.primary} size={20} strokeWidth={2} />
        </IconBadge>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="cardTitle">{tt('title')}</AppText>
          <AppText variant="caption" color="textMuted">
            {tt('linkSub')}
          </AppText>
        </View>
        <ChevronRight color={colors.textFaint} size={18} strokeWidth={2} style={flip} />
      </Card>

      <Card
        onPress={() => router.push('/security')}
        accessibilityLabel={t('security.row')}
        style={{ flexDirection: 'row', alignItems: 'center' }}
      >
        <IconBadge size={44} bg={twoStep.data ? 'greenTint' : 'primaryTint'}>
          <ShieldCheck color={twoStep.data ? colors.green : colors.primary} size={20} strokeWidth={2} />
        </IconBadge>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="cardTitle">{t('security.row')}</AppText>
          <AppText variant="caption" color={twoStep.data ? 'greenText' : 'textMuted'}>
            {t(twoStep.data ? 'security.rowOn' : 'security.rowOff')}
          </AppText>
        </View>
        <ChevronRight color={colors.textFaint} size={18} strokeWidth={2} style={flip} />
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <IconBadge size={44} bg={push === 'on' ? 'greenTint' : 'primaryTint'}>
            <Bell color={push === 'on' ? colors.green : colors.primary} size={20} strokeWidth={2} />
          </IconBadge>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="cardTitle">{t('push.row')}</AppText>
            <AppText variant="caption" color={push === 'on' ? 'greenText' : 'textMuted'}>
              {t(`push.${push}`)}
            </AppText>
          </View>
        </View>
        {push === 'on' && <Button label={t('push.test')} variant="outline" size="md" loading={testing} onPress={test} />}
        {testNote && (
          <AppText variant="caption" color="textMuted">
            {testNote}
          </AppText>
        )}
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <Munti size="md" mood={muntiState.enabled ? 'wave' : 'sleep'} settleAfter={muntiState.enabled ? 2000 : undefined} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="cardTitle">{tm('settingTitle')}</AppText>
            <AppText variant="caption" color="textMuted">
              {tm('settingHint')}
            </AppText>
          </View>
          <Toggle value={muntiState.enabled} onValueChange={munti.setEnabled} accessibilityLabel={tm('settingTitle')} />
        </View>
      </Card>

      <Card>
        <View style={{ gap: 4 }}>
          <AppText variant="cardTitle">{t('settings.language')}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('settings.languageHint')}
          </AppText>
        </View>
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: 'row', backgroundColor: colors.track, borderRadius: radius.pill, padding: 4 }}
        >
          {(['en', 'ar'] as Language[]).map((l) => {
            const active = lang === l;
            return (
              <Pressable
                key={l}
                onPress={() => setLanguage(l)}
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
                  {l === 'en' ? t('settings.english') : t('settings.arabic')}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <SectionTitle title={t('settings.allScreens')} />
      <AppText variant="caption" color="textMuted">
        {t('settings.allScreensHint')}
      </AppText>
      <Card style={{ gap: 0, paddingVertical: spacing.sm }}>
        {SCREENS.map((s, i) => (
          <Pressable
            key={s.num}
            onPress={() => router.push(s.route as Href)}
            accessibilityRole="link"
            style={{
              minHeight: sizes.touch + 4,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.lg,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <AppText weight="extrabold" color="primary" style={{ width: 28 }}>
              {s.num}
            </AppText>
            <AppText style={{ flex: 1 }}>{t(`screens.${s.num}`)}</AppText>
            <Chip label={`S${s.sprint}`} tone={s.tab === 'employee' ? 'purple' : 'neutral'} style={{ alignSelf: 'center' }} />
            <ChevronRight color={colors.textFaint} size={18} strokeWidth={2} style={flip} />
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}
