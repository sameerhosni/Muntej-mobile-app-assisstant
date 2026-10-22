// Screen 34 · Add your team — see design/v2/html/AddTeam.dc.html (Arabic: AddTeamAR.dc.html)
// Demo data: parsed staff list + contacts (src/features/addTeam/demo.ts). Group link uses the native Share sheet.
import { useMemo, useState, type ComponentType } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';
import {
  Camera,
  Check,
  CircleCheck,
  Clock,
  Hand,
  Link,
  MessageCircle,
  Sparkles,
  UserPlus,
  UserX,
  type LucideProps,
} from 'lucide-react-native';
import { AppText, Avatar, Button, Card, Gradient, IconBadge, StatTile, TextField } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { NS } from '@/features/addTeam/strings';
import { DEMO_CONTACTS, JOIN_LINK, PARSED_STAFF, type ParsedPerson } from '@/features/addTeam/demo';
import { LightHeader } from '@/features/addTeam/LightHeader';

type Way = 'snap' | 'contacts' | 'group';
const WAYS: { id: Way; Icon: ComponentType<LucideProps> }[] = [
  { id: 'snap', Icon: Camera },
  { id: 'contacts', Icon: UserPlus },
  { id: 'group', Icon: Link },
];

const FOOTER_SPACE = 190;

/** The original design demo, kept for reference (not routed). */
export function AddTeamScreenDemo() {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const insets = useSafeAreaInsets();
  const [way, setWay] = useState<Way>('snap');
  // Everyone the AI read starts ticked; the prototype tip asks to untick Maha before inviting.
  const [offStaff, setOffStaff] = useState<Record<string, boolean>>({});
  const [onContacts, setOnContacts] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [sent, setSent] = useState(false);

  const nameOf = (p: ParsedPerson) => (lang === 'ar' ? p.nameAr : p.name);
  const roleOf = (p: ParsedPerson) => (lang === 'ar' ? p.roleAr : p.role);

  const staffCount = PARSED_STAFF.filter((p) => !offStaff[p.id]).length;
  const toCheck = PARSED_STAFF.filter((p) => !p.phone).length;
  const contactCount = DEMO_CONTACTS.filter((p) => onContacts[p.id]).length;

  const contacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DEMO_CONTACTS;
    const digits = q.replace(/\D/g, '');
    return DEMO_CONTACTS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.nameAr.includes(q) ||
        (!!digits && !!p.phone && p.phone.replace(/\D/g, '').includes(digits)),
    );
  }, [query]);

  const pick = (w: Way) => {
    setWay(w);
    setSent(false);
  };

  const inviteLabel = (n: number) =>
    n === 0 ? t('pickSomeone') : n === 1 ? t('invite1') : n === 2 ? t('invite2') : t('inviteN', { n: formatNumber(n, lang) });

  const shareLink = async () => {
    try {
      const res = await Share.share({ message: t('shareMessage', { link: `https://${JOIN_LINK}` }) });
      if (res.action !== Share.dismissedAction) setSent(true);
    } catch {
      // Share sheet unavailable (e.g. some web browsers) — nothing to do.
    }
  };

  const cta =
    way === 'group'
      ? { label: t('shareCta'), onPress: shareLink, disabled: false }
      : way === 'snap'
        ? { label: inviteLabel(staffCount), onPress: () => setSent(true), disabled: staffCount === 0 }
        : {
            label: contactCount === 0 ? t('pickSomeone') : t('inviteSelected', { n: formatNumber(contactCount, lang) }),
            onPress: () => setSent(true),
            disabled: contactCount === 0,
          };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.screen, paddingBottom: FOOTER_SPACE + insets.bottom, gap: spacing.xl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <LightHeader
          title={t('title')}
          backLabel={t('back')}
          bandHeight={190}
          pills={[
            { label: t('fast'), Icon: Clock, color: 'primary' },
            { label: t('noTyping'), Icon: Check, color: 'orange' },
          ]}
        />

        {/* Three ways to add */}
        <View accessibilityRole="tablist" accessibilityLabel={t('waysLabel')} style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 4 }}>
          {WAYS.map(({ id, Icon }) => {
            const on = way === id;
            const inner = (
              <>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: radius.sm,
                    backgroundColor: on ? colors.glass : colors.primaryTint,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon color={on ? colors.onDark : colors.primary} size={18} strokeWidth={1.9} />
                </View>
                <AppText variant="small" weight="bold" color={on ? 'onDark' : 'primary'} numberOfLines={1}>
                  {t(`ways.${id}`)}
                </AppText>
              </>
            );
            const box = { height: 76, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', gap: 6 } as const;
            return (
              <Pressable
                key={id}
                onPress={() => pick(id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => ({ flex: 1, borderRadius: radius.button, boxShadow: shadows.tile, opacity: pressed ? 0.88 : 1 })}
              >
                {on ? (
                  <Gradient name="heroManager" style={box}>
                    {inner}
                  </Gradient>
                ) : (
                  <View style={[box, { backgroundColor: colors.surface }]}>{inner}</View>
                )}
              </Pressable>
            );
          })}
        </View>

        {way === 'snap' && (
          <View style={{ gap: spacing.md }}>
            <Card padding={spacing.lg} style={{ flexDirection: 'row', alignItems: 'center', borderStartWidth: 4, borderStartColor: colors.green }}>
              <View style={{ width: 42, height: 52 }}>
                <View
                  style={{
                    flex: 1,
                    borderRadius: 9,
                    borderWidth: 1,
                    borderColor: colors.borderBlue,
                    backgroundColor: colors.surface,
                    paddingVertical: 6,
                    paddingHorizontal: 6,
                    gap: 5,
                    overflow: 'hidden',
                  }}
                >
                  {[0, 1, 2, 3, 4].map((i) => (
                    <View key={i} style={{ height: 3, borderRadius: 2, backgroundColor: colors.borderBlue }} />
                  ))}
                </View>
                <View style={{ position: 'absolute', end: -6, bottom: -6, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
                  <Check color={colors.onDark} size={10} strokeWidth={3.5} />
                </View>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText weight="bold">{t('file')}</AppText>
                <AppText variant="caption" weight="semibold" color="green">
                  {toCheck > 0
                    ? t('found', { n: formatNumber(PARSED_STAFF.length, lang), c: formatNumber(toCheck, lang) })
                    : t('foundClean', { n: formatNumber(PARSED_STAFF.length, lang) })}
                </AppText>
              </View>
            </Card>
            <Card padding={spacing.xl} style={{ paddingVertical: 2, gap: 0 }}>
              {PARSED_STAFF.map((p, i) => (
                <PersonRow
                  key={p.id}
                  name={nameOf(p)}
                  sub={`${roleOf(p)} · ${p.phone ?? t('checkNumber')}`}
                  warn={!p.phone}
                  gradient={p.gradient}
                  checked={!offStaff[p.id]}
                  last={i === PARSED_STAFF.length - 1}
                  label={t('select', { name: nameOf(p) })}
                  onToggle={() => {
                    setOffStaff((s) => ({ ...s, [p.id]: !s[p.id] }));
                    setSent(false);
                  }}
                />
              ))}
            </Card>
          </View>
        )}

        {way === 'contacts' && (
          <Card padding={spacing.xxl} style={{ gap: spacing.md }}>
            <TextField
              label={t('searchLabel')}
              placeholder={t('searchPlaceholder')}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              accessibilityLabel={t('searchLabel')}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.primaryTint, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg }}>
              <IconBadge size={28} bg="surface">
                <Sparkles color={colors.primary} size={16} strokeWidth={1.8} />
              </IconBadge>
              <AppText variant="small" weight="bold" color="navy" style={{ flex: 1 }}>
                {t('topContacts')}
              </AppText>
            </View>
            {contacts.length === 0 ? (
              <AppText variant="small" color="textMuted">
                {t('noContacts')}
              </AppText>
            ) : (
              <View>
                {contacts.map((p, i) => (
                  <PersonRow
                    key={p.id}
                    name={nameOf(p)}
                    sub={`${roleOf(p)} · ${p.phone ?? ''}`}
                    gradient={p.gradient}
                    checked={!!onContacts[p.id]}
                    last={i === contacts.length - 1}
                    label={t('select', { name: nameOf(p) })}
                    onToggle={() => {
                      setOnContacts((s) => ({ ...s, [p.id]: !s[p.id] }));
                      setSent(false);
                    }}
                  />
                ))}
              </View>
            )}
          </Card>
        )}

        {way === 'group' && (
          <Card padding={spacing.xxl} style={{ alignItems: 'center', gap: spacing.lg, paddingVertical: 18 }}>
            <Gradient name="avatarBlue" style={{ padding: spacing.sm, borderRadius: radius.card }}>
              <Svg width={120} height={120} viewBox="0 0 120 120" accessibilityLabel={t('qrLabel')} accessibilityRole="image">
                <Rect width={120} height={120} rx={12} fill={colors.surface} />
                {[
                  [14, 14],
                  [76, 14],
                  [14, 76],
                ].map(([x, y]) => (
                  <Rect key={`${x}-${y}`} x={x} y={y} width={30} height={30} rx={4} fill={colors.navy} />
                ))}
                {[
                  [20, 20],
                  [82, 20],
                  [20, 82],
                ].map(([x, y]) => (
                  <Rect key={`i${x}-${y}`} x={x} y={y} width={18} height={18} rx={2} fill={colors.surface} />
                ))}
                <Rect x={54} y={54} width={10} height={10} fill={colors.primary} />
                <Rect x={70} y={60} width={8} height={8} fill={colors.navy} />
                <Rect x={86} y={74} width={10} height={10} fill={colors.primary} />
                <Rect x={58} y={80} width={8} height={8} fill={colors.navy} />
                <Rect x={74} y={92} width={10} height={10} fill={colors.navy} />
                <Rect x={54} y={20} width={8} height={8} fill={colors.primary} />
              </Svg>
            </Gradient>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 }}>
                <MessageCircle color={colors.green} size={12} strokeWidth={2.4} />
                <AppText variant="caption" weight="bold" color="greenText">
                  {t('postInGroup')}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.purpleTint, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 }}>
                <Check color={colors.purple} size={12} strokeWidth={2.4} />
                <AppText variant="caption" weight="bold" color="purpleText">
                  {t('oneTap')}
                </AppText>
              </View>
            </View>
            <View style={{ backgroundColor: colors.primaryTint, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 6 }}>
              <AppText weight="extrabold" color="primary" style={{ writingDirection: 'ltr' }}>
                {JOIN_LINK}
              </AppText>
            </View>
          </Card>
        )}
      </ScrollView>

      {/* Sticky footer: value tiles + action */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: spacing.screen,
          paddingTop: spacing.md,
          paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.sm,
          backgroundColor: colors.bg,
          gap: spacing.md,
        }}
      >
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <StatTile icon={<Clock color={colors.primary} size={15} strokeWidth={2} />} iconBg="primaryTint" value={t('minValue', { n: formatNumber(1, lang) })} label={t('forTen')} />
          <StatTile icon={<Hand color={colors.orange} size={15} strokeWidth={2} />} iconBg="orangeTint" value={formatNumber(0, lang)} label={t('typing')} />
          <StatTile icon={<UserX color={colors.purple} size={15} strokeWidth={2} />} iconBg="purpleTint" value={formatNumber(0, lang)} label={t('signups')} />
        </View>
        {sent ? (
          <Pressable
            onPress={() => router.push('/31-team-launch')}
            accessibilityRole="link"
            accessibilityLabel={t('sent')}
            style={({ pressed }) => ({
              minHeight: sizes.buttonHeight,
              borderRadius: radius.pill,
              backgroundColor: colors.greenTint,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.sm,
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <CircleCheck color={colors.green} size={22} strokeWidth={2.4} />
            <AppText variant="cardTitle" weight="bold" color="greenText">
              {t('sent')}
            </AppText>
          </Pressable>
        ) : (
          <Button label={cta.label} onPress={cta.onPress} disabled={cta.disabled} />
        )}
      </View>
    </View>
  );
}

type RowProps = {
  name: string;
  sub: string;
  warn?: boolean;
  gradient: ParsedPerson['gradient'];
  checked: boolean;
  last: boolean;
  label: string;
  onToggle: () => void;
};

function PersonRow({ name, sub, warn, gradient, checked, last, label, onToggle }: RowProps) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      style={({ pressed }) => ({
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: checked ? colors.primary : colors.borderBlue,
          backgroundColor: checked ? colors.primary : colors.transparent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked && <Check color={colors.onDark} size={13} strokeWidth={3.2} />}
      </View>
      <Avatar name={name} size={32} gradient={gradient} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText weight="bold" numberOfLines={1}>
          {name}
        </AppText>
        <AppText variant="caption" color={warn ? 'amberText' : 'textMuted'} numberOfLines={1}>
          {sub}
        </AppText>
      </View>
    </Pressable>
  );
}

/** Adding people happens on the real Team screen (opens the add form). */
export default function AddTeamScreen() {
  return <Redirect href="/39-team?add=1" />;
}
