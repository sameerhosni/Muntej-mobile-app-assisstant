// Screen 20 · New workspace — see design/v2/html/NewWorkspace.dc.html (Arabic: NewWorkspaceAR.dc.html)
// Describe it in one sentence → name, deadline, roles and members with match % + reason.
// Suggestions are computed LOCALLY for now (keyword match vs live profiles' skills/titles + live task load);
// no AI call yet. Create = LIVE insert into workspaces + workspace_members + activity_log, then back to /19.
// The three value tiles (10 sec / 400 SAR / 0 meetings) are the design's estimates.
// Prototype tip t20: tap people to add / remove, then create.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banknote, CalendarDays, Check, ChevronLeft, Clock, Hand, Mic, Sparkles, Tag, Users } from 'lucide-react-native';
import { AppText, Avatar, Button, Gradient, IconBadge, IconButton, Screen } from '@/components/ui';
import { colors, fontFamily, fontSize, radius, shadows, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTasks, useTeam } from '@/lib/api';
import { formatNumber } from '@/features/home/value';
import { firstName, personName } from '@/features/dashboard/metrics';
import { useWorkspaces } from '@/features/workspaces/useWorkspaces';
import { nextWorkspaceColor } from '@/features/workspaces/color';
import { detectRoles, preselect, suggestDeadline, suggestName, suggestTeam, type Candidate } from '@/features/new-workspace/suggest';
import { useCreateWorkspace } from '@/features/new-workspace/useCreateWorkspace';
import { NS } from '@/features/new-workspace/strings';

const ROLE_LABEL_EN: Record<string, string> = {
  design: 'Design', mobile: 'Mobile', marketing: 'Marketing', sales: 'Sales', finance: 'Finance', product: 'Product',
};

export default function NewWorkspaceScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const me = useMyProfile();
  const team = useTeam();
  const tasks = useTasks();
  const workspaces = useWorkspaces();
  const create = useCreateWorkspace();

  const [sentence, setSentence] = useState(() => t('sample'));
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [created, setCreated] = useState<string | null>(null);

  const name = useMemo(() => suggestName(sentence), [sentence]);
  const deadline = useMemo(() => suggestDeadline(sentence), [sentence]);
  const roles = useMemo(() => detectRoles(sentence), [sentence]);
  const people = useMemo(
    () => suggestTeam(sentence, team.data ?? [], tasks.data ?? [], me.data?.id),
    [sentence, team.data, tasks.data, me.data?.id],
  );
  const isOn = (c: Candidate) => overrides[c.person.id] ?? preselect(c);
  const selected = people.filter(isOn);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  useEffect(() => {
    if (!created) return;
    const id = setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/19-workspaces')), 1400);
    return () => clearTimeout(id);
  }, [created]);

  const dateFmt = (d: Date) =>
    new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US', { month: 'short', day: 'numeric' }).format(d);

  const why = (c: Candidate) => {
    const parts: string[] = [];
    if (c.skills.length) parts.push(c.skills.join(', '));
    if (c.doneCount > 0) parts.push(t('why.done', { n: formatNumber(c.doneCount, lang) }));
    parts.push(c.loadPct > 100 ? t('why.overloaded', { n: formatNumber(c.loadPct, lang) }) : t('why.free', { h: formatNumber(c.freeHours, lang) }));
    return parts.join(' · ');
  };

  const onCreate = () => {
    if (!me.data) return;
    const isAr = /[؀-ۿ]/.test(name);
    create.mutate(
      {
        meId: me.data.id,
        name,
        nameAr: isAr ? name : null,
        goal: sentence.trim(),
        color: nextWorkspaceColor((workspaces.data ?? []).map((w) => w.color)),
        members: selected.map((c) => ({ profileId: c.person.id, role: c.role ? ROLE_LABEL_EN[c.role] : c.person.title })),
      },
      { onSuccess: () => setCreated(name) },
    );
  };

  const errorText = create.isError
    ? t('error', { msg: create.error instanceof Error ? create.error.message : '' })
    : !me.data && me.isFetched
      ? t('noProfile')
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen bottomInset={190} contentStyle={{ paddingTop: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <IconButton label={t('back')} onPress={back}>
            <ChevronLeft color={colors.text} size={20} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </IconButton>
          <AppText variant="titleLg" style={{ fontSize: 24, flex: 1 }} numberOfLines={1}>
            {t('title')}
          </AppText>
        </View>

        {/* Sentence */}
        <View
          style={{
            marginTop: spacing.xs, backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.xl,
            flexDirection: 'row', alignItems: 'center', gap: spacing.lg, boxShadow: shadows.card,
            borderStartWidth: 4, borderStartColor: colors.primary,
          }}
        >
          <Gradient name="heroManager" style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', boxShadow: shadows.primary }}>
            <Mic color={colors.onDark} size={18} strokeWidth={1.9} />
          </Gradient>
          <TextInput
            value={sentence}
            onChangeText={setSentence}
            multiline
            placeholder={t('placeholder')}
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.primary}
            accessibilityLabel={t('inputLabel')}
            editable={!created}
            style={{
              flex: 1, minHeight: sizes.touch, color: colors.textSoft, fontSize: fontSize.cardTitle, lineHeight: 22,
              fontFamily: fontFamily[lang].regular, textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr',
              paddingVertical: 0, textAlignVertical: 'center',
            }}
          />
        </View>

        {/* Extracted chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {!!name && <InfoChip bg="primaryTint" fg="primaryDark" icon={<Tag color={colors.primaryDark} size={13} strokeWidth={2.2} />} label={name} />}
          <InfoChip
            bg="amberTint" fg="amberStrong" icon={<CalendarDays color={colors.amberStrong} size={13} strokeWidth={2.2} />}
            label={deadline ? dateFmt(deadline) : t('noDeadline')}
          />
          <InfoChip bg="purpleTint" fg="purpleText" icon={<Users color={colors.purpleText} size={13} strokeWidth={2.2} />} label={t('roles', { n: formatNumber(roles.length, lang) })} />
        </View>

        {/* Picked team */}
        <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <IconBadge size={26} bg="primaryTint">
              <Sparkles color={colors.primary} size={15} strokeWidth={2} />
            </IconBadge>
            <AppText weight="bold" color="primary" style={{ flex: 1 }} numberOfLines={1}>
              {t('picked')}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 }}>
              <Clock color={colors.green} size={12} strokeWidth={2.4} />
              <AppText variant="caption" weight="bold" color="green">{t('inSec')}</AppText>
            </View>
          </View>

          {people.length === 0 && !team.isLoading && <AppText variant="small" color="textMuted">{t('noPeople')}</AppText>}
          {people.map((c) => {
            const on = isOn(c);
            const pName = firstName(personName(c.person, lang));
            const role = c.role ? t(`role.${c.role}`) : (lang === 'ar' && c.person.title_ar ? c.person.title_ar : c.person.title ?? '');
            const reason = why(c);
            return (
              <Pressable
                key={c.person.id}
                onPress={() => setOverrides((o) => ({ ...o, [c.person.id]: !on }))}
                disabled={!!created}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={t('personA11y', { name: pName, role, match: t('pct', { n: formatNumber(c.match, lang) }), why: reason })}
                style={({ pressed }) => ({
                  minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.button,
                  backgroundColor: on ? colors.surface : colors.surfaceMuted,
                  borderWidth: 1.5, borderColor: on ? colors.primary : colors.borderBlue, borderStyle: on ? 'solid' : 'dashed',
                  opacity: on ? (pressed ? 0.9 : 1) : 0.6, boxShadow: shadows.tile,
                })}
              >
                <Avatar name={pName} size={40} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <AppText weight="bold" numberOfLines={1}>
                    {pName}
                    {!!role && <AppText weight="medium" color="textMuted">{` · ${role}`}</AppText>}
                  </AppText>
                  <AppText variant="caption" color="textSoft" numberOfLines={1}>{reason}</AppText>
                </View>
                <View style={{ alignItems: 'center', minWidth: 44 }}>
                  <AppText weight="extrabold" color={c.match >= 80 ? 'green' : 'amberText'} style={{ fontSize: 16 }}>
                    {t('pct', { n: formatNumber(c.match, lang) })}
                  </AppText>
                  <AppText variant="micro" color="textFaint">{t('match')}</AppText>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Value tiles (design estimates) */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <ValueTile bg="primaryTint" icon={<Clock color={colors.primary} size={16} strokeWidth={2} />} value={t('secVal')} label={t('teamPicked')} />
          <ValueTile bg="greenTint" icon={<Banknote color={colors.green} size={16} strokeWidth={2} />} value={t('sarVal')} label={t('sarSaved')} />
          <ValueTile bg="orangeTint" icon={<Hand color={colors.orange} size={16} strokeWidth={2} />} value={formatNumber(0, lang)} label={t('meetings')} />
        </View>
      </Screen>

      {/* Sticky bottom: hint + create, or the success card */}
      <View
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.screen, paddingTop: spacing.md,
          paddingBottom: Math.max(insets.bottom, spacing.xxl) + 14, backgroundColor: colors.bg, gap: spacing.sm,
        }}
      >
        {created ? (
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg, backgroundColor: colors.greenTint, borderRadius: radius.card, paddingVertical: spacing.xl, paddingHorizontal: spacing.xxl }}>
            <Gradient name="success" style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
              <Check color={colors.onDark} size={18} strokeWidth={2.6} />
            </Gradient>
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="section" color="greenText" style={{ fontSize: 18 }}>{t('doneTitle')}</AppText>
              <AppText variant="small" color="greenText" style={{ lineHeight: 20 }}>{t('doneBody', { name: created })}</AppText>
            </View>
          </View>
        ) : (
          <>
            {errorText && (
              <AppText variant="caption" color="red" align="center" accessibilityLiveRegion="polite">{errorText}</AppText>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Hand color={colors.textMuted} size={13} strokeWidth={2.2} />
              <AppText variant="caption" color="textMuted">{t('hint')}</AppText>
            </View>
            <Button
              label={name ? t('create', { name, n: formatNumber(selected.length, lang) }) : t('needName')}
              onPress={onCreate}
              loading={create.isPending}
              disabled={!name || !me.data}
            />
          </>
        )}
      </View>
    </View>
  );
}

function InfoChip({ icon, label, bg, fg }: { icon: ReactNode; label: string; bg: ColorToken; fg: ColorToken }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors[bg], borderRadius: radius.pill, paddingVertical: 6, paddingStart: 9, paddingEnd: 11 }}>
      {icon}
      <AppText variant="small" weight="bold" color={fg} numberOfLines={1}>{label}</AppText>
    </View>
  );
}

function ValueTile({ icon, value, label, bg }: { icon: ReactNode; value: string; label: string; bg: ColorToken }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.tile, paddingVertical: 9, paddingHorizontal: spacing.md, gap: 3, boxShadow: shadows.tile }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <IconBadge size={28} bg={bg}>{icon}</IconBadge>
        <AppText variant="stat" numberOfLines={1} style={{ flexShrink: 1 }}>{value}</AppText>
      </View>
      <AppText variant="micro" color="textMuted" numberOfLines={1}>{label}</AppText>
    </View>
  );
}
