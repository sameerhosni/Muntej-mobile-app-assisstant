// Screen 53 · My profile — no mockup; v2 light style per design/TOKENS.md
// Everything Muntej knows about you in the account you're working in, in one place (owner: "show all profile info
// details somewhere"). Opened by tapping your card at the top of Settings. "Edit" opens your entry on the Team screen.
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { AppText, Avatar, Button, Card, IconButton } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTeam } from '@/lib/api';
import { useMyAccounts } from '@/features/accounts/api';
import { useMySector } from '@/features/sectors/sectors';
import { EmployeeSteps } from '@/features/ladder/Journey';
import { SECTOR_NS } from '@/features/sectors/SectorPicker';

const en = {
  title: 'My profile',
  back: 'Back',
  edit: 'Edit my details',
  who: 'Who you are',
  work: 'Your work',
  reach: 'How Muntej reaches you',
  accounts: 'Your accounts',
  name: 'Name',
  nameAr: 'Name (Arabic)',
  email: 'Email (you sign in with it)',
  phone: 'Mobile',
  role: 'Role',
  r_employee: 'Employee',
  r_manager: 'Manager',
  r_admin: 'Admin',
  r_super_admin: 'Super admin',
  jobTitle: 'Job title',
  jobTitleAr: 'Job title (Arabic)',
  manager: 'Reports to',
  team: 'Reports to you',
  team_one: '{{count}} person',
  team_other: '{{count}} people',
  sector: 'Field of work',
  capacity: 'Hours a week',
  experience: 'Years of experience',
  skills: 'Skills',
  language: 'Language',
  ar: 'Arabic',
  en: 'English',
  whatsapp: 'WhatsApp',
  connected: 'Connected ✓',
  notConnected: 'Not connected',
  since: 'In Muntej since',
  working: 'working in it now',
  people_one: '{{count}} person',
  people_other: '{{count}} people',
  none: 'Not set',
};
const ar: typeof en & Record<string, string> = {
  title: 'ملفي',
  back: 'رجوع',
  edit: 'عدّل بياناتي',
  who: 'مين أنت',
  work: 'شغلك',
  reach: 'كيف يوصلك منتج',
  accounts: 'حساباتك',
  name: 'الاسم',
  nameAr: 'الاسم (عربي)',
  email: 'الإيميل (تدخل فيه)',
  phone: 'الجوال',
  role: 'الدور',
  r_employee: 'موظف',
  r_manager: 'مدير',
  r_admin: 'مسؤول',
  r_super_admin: 'مسؤول عام',
  jobTitle: 'المسمى الوظيفي',
  jobTitleAr: 'المسمى الوظيفي (عربي)',
  manager: 'يتبع لـ',
  team: 'يتبعون لك',
  team_one: 'شخص واحد',
  team_other: '{{count}} أشخاص',
  team_two: 'شخصين',
  team_few: '{{count}} أشخاص',
  team_many: '{{count}} شخص',
  sector: 'مجال الشغل',
  capacity: 'ساعات الأسبوع',
  experience: 'سنين الخبرة',
  skills: 'المهارات',
  language: 'اللغة',
  ar: 'العربية',
  en: 'الإنجليزية',
  whatsapp: 'واتساب',
  connected: 'مربوط ✓',
  notConnected: 'مو مربوط',
  since: 'في منتج من',
  working: 'شغّال فيه الحين',
  people_one: 'شخص واحد',
  people_other: '{{count}} أشخاص',
  people_two: 'شخصين',
  people_few: '{{count}} أشخاص',
  people_many: '{{count}} شخص',
  none: 'ما انضاف',
};
const NS = registerStrings('myProfile', { en, ar });

export default function MyProfileScreen() {
  const { t } = useScreenT(NS);
  const { t: ts } = useScreenT(SECTOR_NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const me = useMyProfile();
  const team = useTeam();
  const accounts = useMyAccounts();
  const sector = useMySector();
  const p = me.data;
  const isAr = lang === 'ar';
  const people = team.data ?? [];
  const nameOf = (id: string | null | undefined) => {
    const x = people.find((q) => q.id === id);
    return x ? (isAr && x.full_name_ar) || x.full_name : null;
  };
  const reports = people.filter((x) => x.manager_id === p?.id && x.status !== 'deleted').length;
  const role = (p as { actual_role?: string } | undefined)?.actual_role ?? p?.role;
  const skills = (p?.skills ?? []) as string[];
  const since = p?.created_at
    ? new Intl.DateTimeFormat(isAr ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(p.created_at))
    : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.screen, paddingBottom: 40, gap: spacing.lg }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconButton label={t('back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}>
          <ChevronLeft color={colors.text} size={20} strokeWidth={1.9} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </IconButton>
        <AppText variant="title" style={{ flex: 1 }}>
          {t('title')}
        </AppText>
      </View>

      {p && (
        <>
          <Card style={{ alignItems: 'center', gap: spacing.sm }}>
            <Avatar name={p.full_name} size={72} gradient={p.role === 'employee' ? 'avatarBlue' : 'avatarOrange'} />
            <AppText variant="title" align="center">
              {(isAr && p.full_name_ar) || p.full_name}
            </AppText>
            <AppText color="textMuted" align="center">
              {[role ? t(`r_${role}`) : null, (isAr && p.title_ar) || p.title].filter(Boolean).join(' · ')}
            </AppText>
            <Button label={t('edit')} variant="outline" size="md" onPress={() => router.push('/39-team?me=1')} />
          </Card>

          <Section title={t('who')}>
            <Row k={t('name')} v={p.full_name} />
            <Row k={t('nameAr')} v={p.full_name_ar} none={t('none')} />
            <Row k={t('email')} v={p.email} none={t('none')} />
            <Row k={t('phone')} v={p.phone} none={t('none')} />
            <Row k={t('language')} v={p.locale === 'ar' ? t('ar') : t('en')} />
          </Section>

          <Section title={t('work')}>
            <Row k={t('role')} v={role ? t(`r_${role}`) : null} none={t('none')} />
            <Row k={t('jobTitle')} v={p.title} none={t('none')} />
            <Row k={t('jobTitleAr')} v={p.title_ar} none={t('none')} />
            <Row k={t('manager')} v={nameOf(p.manager_id)} none={t('none')} />
            {reports > 0 && <Row k={t('team')} v={t('team', { count: reports })} />}
            <Row k={t('sector')} v={sector ? ts(`s_${sector}`) : null} none={t('none')} />
            <Row k={t('capacity')} v={p.weekly_capacity_hours ? String(p.weekly_capacity_hours) : null} none={t('none')} />
            <Row k={t('experience')} v={p.years_experience != null ? String(p.years_experience) : null} none={t('none')} />
            <Row k={t('skills')} v={skills.length ? skills.join(isAr ? '، ' : ', ') : null} none={t('none')} />
          </Section>

          <Section title={t('reach')}>
            <Row k={t('whatsapp')} v={p.whatsapp_connected ? t('connected') : t('notConnected')} />
            {!!since && <Row k={t('since')} v={since} />}
          </Section>

          {!!accounts.data?.length && (
            <Section title={t('accounts')}>
              {accounts.data
                .filter((a) => a.member)
                .map((a) => (
                  <Row
                    key={a.id}
                    k={(isAr && a.name_ar) || a.name}
                    v={[t('people', { count: a.people }), a.active ? t('working') : null].filter(Boolean).join(' · ')}
                  />
                ))}
            </Section>
          )}
        </>
      )}
      {/* employees: their steps in Muntej (value ladder E1–E3) */}
      <EmployeeSteps />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card padding={spacing.lg} style={{ gap: 0 }}>
      <AppText weight="extrabold" style={{ fontSize: 16, marginBottom: spacing.xs }}>
        {title}
      </AppText>
      {children}
    </Card>
  );
}

function Row({ k, v, none }: { k: string; v: string | null | undefined; none?: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <AppText variant="small" color="textMuted" style={{ width: 120 }}>
        {k}
      </AppText>
      <AppText variant="small" weight="semibold" color={v ? 'text' : 'textFaint'} style={{ flex: 1 }}>
        {v || none || '—'}
      </AppText>
    </View>
  );
}
