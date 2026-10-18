// Screen 28 · Kudos — see design/v2/html/Kudos.dc.html (Arabic: KudosAR.dc.html)
// Manager screen. People: live team employees (useTeam), demo team otherwise. Draft: built from the person's
// latest done task (useTasks), else the design's drafts. No kudos table yet → the Team wall is demo + local sends.
// Points go to the demo wallet only when the recipient is the signed-in user.
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Banknote, Check, ChevronLeft, Clock, Hand, Sparkles, ThumbsUp } from 'lucide-react-native';
import { AppText, Avatar, Button, Card, Hero, IconBadge, IconButton, PointsCoin } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTasks, useTeam } from '@/lib/api';
import { formatNumber } from '@/features/home/value';
import { PTS_PER_SAR, wallet } from '@/features/rewards/wallet';
import {
  AMOUNTS,
  demoPeople,
  demoWall,
  draftFor,
  firstSentence,
  latestDoneByOwner,
  livePeople,
  VALUES,
  type KudosValue,
} from '@/features/kudos/model';
import { NS } from '@/features/kudos/strings';

type Sent = { id: string; from: string; to: string; valueKey: KudosValue; msg: string; pts: number };

const HIT = { top: (sizes.touch - 34) / 2, bottom: (sizes.touch - 34) / 2 };

export default function KudosScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const me = useMyProfile();
  const team = useTeam();
  const done = useTasks({ statuses: ['done'] });

  const people = useMemo(() => {
    const live = livePeople(team.data ?? [], lang);
    return live.length > 0 ? live : demoPeople(lang);
  }, [team.data, lang]);
  const latest = useMemo(() => latestDoneByOwner(done.data ?? []), [done.data]);

  const [who, setWho] = useState<string | null>(null);
  const [val, setVal] = useState<KudosValue>('ownership');
  const [amt, setAmt] = useState<number>(25);
  const [sent, setSent] = useState<Sent[]>([]);
  const [justSent, setJustSent] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const n = (v: number, d = 0) => formatNumber(v, lang, d);

  const sel = people.find((p) => p.id === who) ?? people[0];
  const draft = sel ? draftFor(sel, val, latest[sel.id], t) : '';
  const myName = me.data ? ((lang === 'ar' && me.data.full_name_ar ? me.data.full_name_ar : me.data.full_name).split(' ')[0] ?? '') : t('me');

  const pick = (fn: () => void) => () => {
    fn();
    setJustSent(false);
  };

  const send = () => {
    if (!sel) return;
    setSent((s) => [{ id: `${Date.now()}`, from: myName, to: sel.name, valueKey: val, msg: t('justNow', { msg: firstSentence(draft) }), pts: amt }, ...s]);
    if (me.data && sel.id === me.data.id) wallet.earn(`kudos:${Date.now()}`, amt);
    setJustSent(true);
  };

  const wall = [
    ...sent.map((s) => ({ id: s.id, from: s.from, to: s.to, value: t(`values.${s.valueKey}`), msg: s.msg, pts: s.pts })),
    ...demoWall(t),
  ].slice(0, 3);

  const sar = amt / PTS_PER_SAR;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xxl }} showsVerticalScrollIndicator={false}>
        <Hero overlap={38}>
          {/* confetti from the design */}
          <Svg width={12} height={12} viewBox="0 0 12 12" pointerEvents="none" style={{ position: 'absolute', top: insets.top + 6, end: 60 }}>
            <Path d="M6 0l6 6-6 6-6-6z" fill={colors.mint} />
          </Svg>
          <Svg width={12} height={12} viewBox="0 0 12 12" pointerEvents="none" style={{ position: 'absolute', top: insets.top + 48, end: 26 }}>
            <Path d="M6 1l5 10H1z" fill={colors.purpleLight} />
          </Svg>
          <Svg width={8} height={8} viewBox="0 0 8 8" pointerEvents="none" style={{ position: 'absolute', top: insets.top + 68, end: 56 }}>
            <Circle cx={4} cy={4} r={4} fill={colors.gold} />
          </Svg>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <IconButton variant="glass" label={t('back')} onPress={back}>
              <ChevronLeft color={colors.onDark} size={20} strokeWidth={2} style={flip} />
            </IconButton>
            <View style={{ flex: 1 }}>
              <AppText variant="big" display color="onDark">
                {t('title')}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Clock color={colors.onDark} size={14} strokeWidth={2.2} />
                <AppText variant="small" color="onDarkMuted">
                  {t('subtitle')}
                </AppText>
              </View>
            </View>
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -38, gap: spacing.lg }}>
          <Card elevation="raised" padding={spacing.xxl} style={{ borderRadius: radius.cardLg, gap: spacing.lg }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              accessibilityRole="radiogroup"
              accessibilityLabel={t('who')}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between', gap: spacing.sm }}
            >
              {people.map((p) => {
                const on = p.id === sel?.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={pick(() => setWho(p.id))}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={p.name}
                    style={{ width: 56, alignItems: 'center', gap: 5 }}
                  >
                    <View style={{ width: 53, height: 53, borderRadius: 27, borderWidth: 2.5, borderColor: on ? colors.primary : colors.transparent, alignItems: 'center', justifyContent: 'center' }}>
                      <Avatar name={p.name} size={48} gradient={p.gradient} ring />
                    </View>
                    <AppText variant="caption" weight={on ? 'bold' : 'medium'} color={on ? 'text' : 'textMuted'} numberOfLines={1}>
                      {p.name}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View accessibilityLabel={t('value')} style={{ flexDirection: 'row', gap: 6 }}>
              {VALUES.map((v) => {
                const on = v === val;
                return (
                  <Pressable
                    key={v}
                    onPress={pick(() => setVal(v))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    hitSlop={HIT}
                    style={({ pressed }) => ({
                      flexGrow: 1,
                      height: 34,
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: on ? colors.primary : colors.border,
                      backgroundColor: on ? colors.primary : colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <AppText variant="caption" weight="bold" color={on ? 'onDark' : 'text'} numberOfLines={1}>
                      {t(`values.${v}`)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppText variant="caption" weight="semibold" color="textMuted" style={{ marginEnd: 4 }}>
                {t('points')}
              </AppText>
              {AMOUNTS.map((a) => {
                const on = a === amt;
                return (
                  <Pressable
                    key={a}
                    onPress={pick(() => setAmt(a))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={t('pointsA11y', { n: n(a) })}
                    hitSlop={HIT}
                    style={({ pressed }) => ({
                      height: 34,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingStart: 6,
                      paddingEnd: spacing.lg,
                      borderRadius: radius.pill,
                      borderWidth: on ? 1.5 : 1,
                      borderColor: on ? colors.orange : colors.border,
                      backgroundColor: on ? colors.orangeTint : colors.surface,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <PointsCoin size={20} />
                    <AppText variant="small" weight="extrabold" color={on ? 'orangeText' : 'text'}>
                      {t('plus', { n: n(a) })}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ backgroundColor: colors.purpleTint, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Sparkles color={colors.purple} fill={colors.purple} size={12} strokeWidth={1.5} />
                <AppText variant="micro" weight="bold" color="purple">
                  {t('drafted')}
                </AppText>
              </View>
              <AppText variant="small" color="textSoft" style={{ lineHeight: 20 }}>
                {draft}
              </AppText>
            </View>

            {justSent && sel ? (
              <View style={{ minHeight: sizes.buttonHeight, borderRadius: radius.pill, backgroundColor: colors.greenTint, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
                <Check color={colors.green} size={18} strokeWidth={2.4} />
                <AppText variant="lead" weight="bold" color="greenText">
                  {t('sentTo', { name: sel.name })}
                </AppText>
              </View>
            ) : (
              <Button label={t('send', { n: n(amt) })} onPress={send} disabled={!sel} />
            )}
          </Card>

          <View style={{ gap: spacing.sm }}>
            <AppText variant="section">{t('wall')}</AppText>
            {wall.map((f) => (
              <Card key={f.id} padding={0} style={{ borderRadius: radius.button, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <IconBadge size={40} bg="orangeTint">
                  <ThumbsUp color={colors.orange} size={20} strokeWidth={1.8} />
                </IconBadge>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <AppText variant="small" numberOfLines={1}>
                    <AppText variant="small" weight="bold">
                      {f.from}
                    </AppText>
                    {` ${t('arrow')} `}
                    <AppText variant="small" weight="bold">
                      {f.to}
                    </AppText>
                    {' · '}
                    <AppText variant="small" weight="bold" color="purple">
                      {f.value}
                    </AppText>
                  </AppText>
                  <AppText variant="caption" color="textMuted" style={{ lineHeight: 17 }}>
                    {f.msg}
                  </AppText>
                </View>
                <View style={{ height: 26, minWidth: 60, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.orangeTint, borderRadius: radius.pill, paddingStart: 4, paddingEnd: 9 }}>
                  <PointsCoin size={18} />
                  <AppText variant="small" weight="extrabold" color="orangeText">
                    {t('plus', { n: n(f.pts) })}
                  </AppText>
                </View>
              </Card>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <ValueTile bg="primaryTint" icon={<Clock color={colors.primary} size={16} strokeWidth={2} />} value={t('fiveSec')} label={t('perKudos')} />
            <ValueTile bg="greenTint" icon={<Banknote color={colors.green} size={16} strokeWidth={2} />}
              value={t('sar', { n: n(sar, amt % PTS_PER_SAR ? 1 : 0) })} label={t('realReward')} />
            <ValueTile bg="orangeTint" icon={<Hand color={colors.orange} size={16} strokeWidth={2} />} value={n(0)} label={t('forms')} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ValueTile({ bg, icon, value, label }: { bg: ColorToken; icon: ReactNode; value: string; label: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: colors.surface, borderRadius: radius.tile, paddingVertical: 9, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, boxShadow: shadows.card }}>
      <IconBadge size={30} bg={bg}>
        {icon}
      </IconBadge>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="cardTitle" weight="extrabold" numberOfLines={1}>
          {value}
        </AppText>
        <AppText variant="micro" color="textMuted" numberOfLines={1}>
          {label}
        </AppText>
      </View>
    </View>
  );
}
