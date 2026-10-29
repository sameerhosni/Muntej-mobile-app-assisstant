// Screen · Settings — profile, language, sign out, all-screens dev index; no mockup, v2 style per design/TOKENS.md
// The prototype tour, the all-screens list and the Manager/Employee "View as" switch are for admins only.
import { Pressable, View } from 'react-native';
import { SectorSetting } from '@/features/sectors/SectorPicker';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Bell, BellRing, ChevronLeft, ChevronRight, LayoutGrid, ListTodo, Network, ShieldCheck, Sparkles, Users } from 'lucide-react-native';
import Constants from 'expo-constants';
import {
  AppText,
  Avatar,
  BrandSymbol,
  BrandWordmark,
  Button,
  Card,
  Chip,
  IconBadge,
  IconButton,
  Screen,
  SectionTitle,
  Toggle,
} from '@/components/ui';
import { useScreenT } from '@/lib/i18n/register';
import { MORE_NS } from '@/features/more/strings';
import { BACKLOG_NS } from '@/features/backlog/strings';
import { AccountSwitcher } from '@/features/accounts/AccountSwitcher';
import { DeleteAccount } from '@/features/accounts/DeleteAccount';
import { PROTO_NS } from '@/features/prototype/strings';
import { useMyProfile, useSignOut } from '@/lib/api';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { setLanguage, useDirection, type Language } from '@/lib/i18n';
import { SCREENS, homeRouteFor } from '@/features/screens/registry';
import { canSwitchView, useViewAs, viewAs, type ViewAs } from '@/features/view-as/store';
import { featureUsed } from '@/features/launch/launch';
import { Spotlight } from '@/features/launch/Spotlight';
import { LAUNCH_NS } from '@/features/launch/strings';
import { sendTestPush, usePushStatus } from '@/features/notifications/push';
import { NS as TEAM_NS } from '@/features/org/strings';
import { Munti } from '@/features/munti/Munti';
import { munti, useMunti } from '@/features/munti/store';
import { MUNTI_NS } from '@/features/munti/tips';
import { SupportRow } from '@/features/support/SupportRow';
import { HomeSectionsRow } from '@/features/prefs/HomeSectionsRow';
import { IdeasRow } from '@/features/ideas/IdeasRow';
import { NS as ALERTS_NS } from '@/features/alerts/strings';
import { ReachMe } from '@/features/alerts/ReachMe';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { lang, isRTL } = useDirection();
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const { data: me } = useMyProfile();
  const signOut = useSignOut();
  const { t: tp } = useScreenT(PROTO_NS);
  const { t: tt } = useScreenT(TEAM_NS);
  const { t: tmore } = useScreenT(MORE_NS);
  const { t: tb } = useScreenT(BACKLOG_NS);
  const { t: tm } = useScreenT(MUNTI_NS);
  const { t: ta } = useScreenT(ALERTS_NS);
  const { t: tl } = useScreenT(LAUNCH_NS);
  const muntiState = useMunti();
  // the real role (not the "View as" one) decides admin-only things
  const realRole = me?.actual_role ?? me?.role;
  const isAdmin = canSwitchView(realRole);
  const view = useViewAs();
  const switchView = (v: ViewAs) => {
    if (v === view) return;
    viewAs.set(v);
    featureUsed('view_as');
    router.replace(homeRouteFor(v === 'employee' ? 'employee' : realRole));
  };
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

      {isAdmin && (
        <Card onPress={() => router.push('/prototype')} accessibilityLabel={tp('open')} style={{ flexDirection: 'row', alignItems: 'center' }}>
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
      )}

      {me && (
        <Card>
          <Pressable
            onPress={() => router.push('/53-profile' as Href)}
            accessibilityRole="button"
            accessibilityLabel={tb('profileRow')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}
          >
            <Avatar name={me.full_name} size={48} gradient={me.role === 'employee' ? 'avatarBlue' : 'avatarOrange'} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="caption" color="textMuted">
                {t('settings.signedInAs')}
              </AppText>
              <AppText variant="cardTitle">{lang === 'ar' && me.full_name_ar ? me.full_name_ar : me.full_name}</AppText>
              <AppText variant="caption" color="textMuted">
                {t(`settings.role_${realRole}`)}
                {isAdmin ? ` · ${t('settings.viewingAs', { view: t(view === 'employee' ? 'settings.viewEmployee' : 'settings.viewManager') })}` : ''}
                {(lang === 'ar' ? me.title_ar : me.title) ? ` · ${lang === 'ar' ? me.title_ar : me.title}` : ''}
              </AppText>
              <AppText variant="caption" weight="bold" color="primary">
                {tb('profileRow')}
              </AppText>
            </View>
            <ChevronRight color={colors.textFaint} size={18} strokeWidth={2} style={flip} />
          </Pressable>
          <Button label={t('settings.signOut')} variant="outline" size="md" loading={signOut.isPending} onPress={() => signOut.mutate()} />
        </Card>
      )}

      {/* admins: use the app as a manager or as an employee */}
      {isAdmin && (
        <Spotlight id="settings.viewAs">
          <Card>
            <View style={{ gap: 4 }}>
              <AppText variant="cardTitle">{t('settings.viewAs')}</AppText>
              <AppText variant="caption" color="textMuted">
                {t('settings.viewAsHint')}
              </AppText>
            </View>
            <View
              accessibilityRole="radiogroup"
              style={{ flexDirection: 'row', backgroundColor: colors.track, borderRadius: radius.pill, padding: 4 }}
            >
              {(['manager', 'employee'] as ViewAs[]).map((v) => {
                const active = view === v;
                return (
                  <Pressable
                    key={v}
                    onPress={() => switchView(v)}
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
                    <AppText weight="bold" style={{ color: active ? (v === 'employee' ? colors.purple : colors.primary) : colors.textMuted }}>
                      {t(v === 'employee' ? 'settings.viewEmployee' : 'settings.viewManager')}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        </Spotlight>
      )}

      {/* admins: who uses what's new (screen 43) */}
      {isAdmin && (
        <Card
          onPress={() => router.push('/43-adoption')}
          accessibilityLabel={tl('settingsRow')}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          <IconBadge size={44} bg="greenTint">
            <Sparkles color={colors.green} size={20} strokeWidth={2} />
          </IconBadge>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="cardTitle">{tl('settingsRow')}</AppText>
            <AppText variant="caption" color="textMuted">
              {tl('settingsHint')}
            </AppText>
          </View>
          <ChevronRight color={colors.textFaint} size={18} strokeWidth={2} style={flip} />
        </Card>
      )}

      {/* which account you're in; switch when you have more than one (super admin: all) */}
      <AccountSwitcher />

      {/* super admin: everything not finished yet (docs/BACKLOG.md) */}
      {realRole === 'super_admin' && (
        <Card
          onPress={() => router.push('/49-backlog' as Href)}
          accessibilityLabel={tb('settingsRow')}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          <IconBadge size={44} bg="amberTint">
            <ListTodo color={colors.amberText} size={20} strokeWidth={2} />
          </IconBadge>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="cardTitle">{tb('settingsRow')}</AppText>
            <AppText variant="caption" color="textMuted" numberOfLines={2}>
              {tb('settingsSub')}
            </AppText>
          </View>
        </Card>
      )}

      {/* your field of work: which tools come first on Connect your tools */}
      <SectorSetting />

      {/* super admin: the system design (HLD + LLD), the full design image and the integration API (PDFs) */}
      {realRole === 'super_admin' && (
        <Card
          onPress={() => router.push('/52-design' as Href)}
          accessibilityLabel={tb('designRow')}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          <IconBadge size={44} bg="primaryTint">
            <Network color={colors.primary} size={20} strokeWidth={2} />
          </IconBadge>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="cardTitle">{tb('designRow')}</AppText>
            <AppText variant="caption" color="textMuted" numberOfLines={2}>
              {tb('designSub')}
            </AppText>
          </View>
        </Card>
      )}

      {/* every deeper screen in one place (screen 44) */}
      <Card
        onPress={() => router.push('/44-more')}
        accessibilityLabel={`${tmore('title')} · ${tmore('sub')}`}
        style={{ flexDirection: 'row', alignItems: 'center' }}
      >
        <IconBadge size={44} bg="purpleTint">
          <LayoutGrid color={colors.purple} size={20} strokeWidth={2} />
        </IconBadge>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="cardTitle">{tmore('title')}</AppText>
          <AppText variant="caption" color="textMuted" numberOfLines={2}>
            {tmore('sub')}
          </AppText>
        </View>
        <ChevronRight color={colors.textFaint} size={18} strokeWidth={2} style={flip} />
      </Card>

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

      <Card onPress={() => router.push('/security')} accessibilityLabel={t('security.row')} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconBadge size={44} bg="primaryTint">
          <ShieldCheck color={colors.primary} size={20} strokeWidth={2} />
        </IconBadge>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="cardTitle">{t('security.row')}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('security.rowSub')}
          </AppText>
        </View>
        <ChevronRight color={colors.textFaint} size={18} strokeWidth={2} style={flip} />
      </Card>

      <HomeSectionsRow />

      {/* push, WhatsApp or both: the quick choice; Alerts below has the detail */}
      <ReachMe />

      <Card
        onPress={() => router.push('/18-alerts')}
        accessibilityLabel={`${ta('settingsRow')} · ${ta('settingsHint')}`}
        style={{ flexDirection: 'row', alignItems: 'center' }}
      >
        <IconBadge size={44} bg="primaryTint">
          <BellRing color={colors.primary} size={20} strokeWidth={2} />
        </IconBadge>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="cardTitle">{ta('settingsRow')}</AppText>
          <AppText variant="caption" color="textMuted">
            {ta('settingsHint')}
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
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', backgroundColor: colors.track, borderRadius: radius.pill, padding: 4 }}>
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

      {isAdmin && (
        <>
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
        </>
      )}

      {/* members can delete their own account (admins / super admin: hidden, and the server refuses) */}
      <DeleteAccount role={realRole} />

      {/* about: the brand + version */}
      <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, direction: 'ltr' }}>
          <BrandSymbol size={34} />
          <BrandWordmark width={92} style={{ marginTop: 3 }} />
        </View>
        <AppText variant="caption" color="textMuted" align="center">
          {t('settings.aboutTagline')}
        </AppText>
        <AppText variant="micro" color="textFaint">
          {t('settings.version', { v: Constants.expoConfig?.version ?? '' })}
        </AppText>
      </View>
      {/* a real person: support chat with the Muntej team */}
      <SupportRow />
      <IdeasRow />
    </Screen>
  );
}
