// Screen 27 · Points control — see design/v2/html/PointsControl.dc.html (Arabic: PointsControlAR.dc.html)
// Demo data (no points backend yet): budget, earning rules, reward requests, fairness check. 10 pts = SAR 1.
import { useState, type ComponentType, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  ArrowRight,
  Banknote,
  ChevronLeft,
  Clock,
  Heart,
  Minus,
  Paperclip,
  Plus,
  Sparkles,
  Star,
  Zap,
  type LucideProps,
} from 'lucide-react-native';
import { AppText, Avatar, Card, Gradient, Hero, IconBadge, IconButton, PointsCoin, ProgressBar, Toggle } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { person, personLabel } from '@/features/demo/team';
import { NS } from '@/features/points-control/strings';
import {
  BUDGET,
  FAIRNESS,
  PTS_MAX,
  PTS_MIN,
  PTS_PER_SAR,
  PTS_STEP,
  REQUESTS,
  RULES,
  type RequestId,
  type RuleId,
} from '@/features/points-control/demo';

const RULE_ICON: Record<RuleId, ComponentType<LucideProps>> = {
  ontime: Clock,
  early: Zap,
  proof: Paperclip,
  star: Star,
  help: Heart,
};

export default function PointsControlScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const [rules, setRules] = useState(RULES);
  const [editing, setEditing] = useState<RuleId | null>(null);
  const [approved, setApproved] = useState<Partial<Record<RequestId, boolean>>>({});

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };

  const used = BUDGET.used + REQUESTS.reduce((s, r) => s + (approved[r.id] ? r.cost : 0), 0);
  const month = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-ca-gregory-nu-latn' : 'en-US', { month: 'long' }).format(new Date());

  const setRule = (id: RuleId, patch: Partial<(typeof RULES)[number]>) =>
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Hero overlap={20}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <IconButton variant="glass" label={t('back')} onPress={back}>
              <ChevronLeft color={colors.onDark} size={20} strokeWidth={2} style={flip} />
            </IconButton>
            <View style={{ flex: 1 }}>
              <AppText variant="big" display color="onDark">
                {t('title')}
              </AppText>
              <AppText variant="small" color="onDarkMuted">
                {t('subtitle')}
              </AppText>
            </View>
          </View>

          <View style={{ backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.button, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, gap: spacing.sm, marginTop: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 }}>
                <PointsCoin size={22} />
                <AppText variant="small" color="onDarkMuted" numberOfLines={1}>
                  {t('budget', { month })}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <AppText variant="big" color="onDark">
                  {formatNumber(used, lang)}
                </AppText>
                <AppText variant="small" color="onDarkMuted">
                  {t('budgetOf', { total: formatNumber(BUDGET.total, lang) })}
                </AppText>
              </View>
            </View>
            <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.glass, overflow: 'hidden', flexDirection: 'row' }}>
              <Gradient name="points" direction="horizontal" style={{ width: `${Math.min(100, (used / BUDGET.total) * 100)}%`, borderRadius: 5 }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <GlassPill bg="green" icon={<Banknote color={colors.onDark} size={12} strokeWidth={2.4} />} label={t('budgetSar', { sar: formatNumber(used / PTS_PER_SAR, lang) })} />
              <ArrowRight color={colors.onDarkMuted} size={14} strokeWidth={2.4} style={flip} />
              <GlassPill bg="primaryLight" icon={<Clock color={colors.onDark} size={12} strokeWidth={2.4} />} label={t('budgetHours', { h: formatNumber(BUDGET.onTimeHours, lang) })} />
            </View>
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -20, gap: spacing.xl }}>
          <Card elevation="raised" padding={0} style={{ paddingHorizontal: spacing.xl, paddingVertical: 4, gap: 0 }}>
            {rules.map((r, i) => {
              const Icon = RULE_ICON[r.id];
              const name = t(`rules.${r.id}`);
              const open = editing === r.id;
              return (
                <View key={r.id} style={{ borderBottomWidth: i === rules.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
                  <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: r.on ? 1 : 0.55 }}>
                    <IconBadge size={36} bg={r.bg}>
                      <Icon color={colors[r.fg]} size={18} strokeWidth={1.9} />
                    </IconBadge>
                    <AppText weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                      {name}
                    </AppText>
                    <Pressable
                      onPress={() => setEditing(open ? null : r.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${name} ${t('ptsPlus', { n: r.pts })}`}
                      accessibilityHint={t('rulesHint')}
                      hitSlop={{ top: 9, bottom: 9 }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, minWidth: 62, paddingStart: 4, paddingEnd: 9, borderRadius: radius.pill, backgroundColor: colors.orangeTint, borderWidth: 1, borderColor: open ? colors.orange : colors.orangeTint }}
                    >
                      <PointsCoin size={18} />
                      <AppText variant="small" weight="extrabold" color="orangeText">
                        {t('ptsPlus', { n: formatNumber(r.pts, lang) })}
                      </AppText>
                    </Pressable>
                    <Toggle value={r.on} onValueChange={(on) => setRule(r.id, { on })} accessibilityLabel={name} />
                  </View>
                  {open && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm, paddingBottom: spacing.md }}>
                      <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
                        {t('budgetSar', { sar: formatNumber(r.pts / PTS_PER_SAR, lang, 1) })}
                      </AppText>
                      <StepButton label={t('ptsLess', { name })} disabled={r.pts <= PTS_MIN} onPress={() => setRule(r.id, { pts: Math.max(PTS_MIN, r.pts - PTS_STEP) })}>
                        <Minus color={colors.primary} size={18} strokeWidth={2.4} />
                      </StepButton>
                      <AppText variant="cardTitle" weight="extrabold" style={{ minWidth: 36 }} align="center">
                        {formatNumber(r.pts, lang)}
                      </AppText>
                      <StepButton label={t('ptsMore', { name })} disabled={r.pts >= PTS_MAX} onPress={() => setRule(r.id, { pts: Math.min(PTS_MAX, r.pts + PTS_STEP) })}>
                        <Plus color={colors.primary} size={18} strokeWidth={2.4} />
                      </StepButton>
                    </View>
                  )}
                </View>
              );
            })}
          </Card>

          <View style={{ gap: spacing.sm }}>
            <AppText variant="section">{t('requests')}</AppText>
            {REQUESTS.map((q) => {
              const p = person(q.personId);
              const who = personLabel(p, lang);
              const done = !!approved[q.id];
              return (
                <Card key={q.id} padding={0} style={{ borderRadius: radius.button, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <Avatar name={who} gradient={p.gradient} size={40} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <AppText weight="bold" numberOfLines={1}>
                      {t(`reqs.${q.id}`)}
                    </AppText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <AppText variant="caption" color="textMuted">
                        {who} ·
                      </AppText>
                      <PointsCoin size={14} />
                      <AppText variant="caption" weight="bold" color="orangeText">
                        {t('cost', { n: formatNumber(q.cost, lang) })}
                      </AppText>
                      <AppText variant="caption" color="textMuted">
                        ·
                      </AppText>
                      <AppText variant="caption" weight="bold" color="green">
                        {t('sar', { n: formatNumber(q.cost / PTS_PER_SAR, lang) })}
                      </AppText>
                    </View>
                  </View>
                  {done ? (
                    <View style={{ backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 }}>
                      <AppText variant="caption" weight="bold" color="green">
                        {t('approved')}
                      </AppText>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => setApproved((a) => ({ ...a, [q.id]: true }))}
                      accessibilityRole="button"
                      accessibilityLabel={`${t('approve')} · ${t(`reqs.${q.id}`)} · ${who}`}
                      hitSlop={{ top: 3, bottom: 3 }}
                      style={({ pressed }) => ({ borderRadius: radius.pill, boxShadow: shadows.primary, opacity: pressed ? 0.88 : 1 })}
                    >
                      <Gradient name="primary" style={{ height: 38, paddingHorizontal: spacing.xxl, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }}>
                        <AppText variant="small" weight="bold" color="onDark">
                          {t('approve')}
                        </AppText>
                      </Gradient>
                    </Pressable>
                  )}
                </Card>
              );
            })}
          </View>

          <FairnessRow
            title={t('fairTitle', { name: personLabel(person(FAIRNESS.personId), lang) })}
            sub={t('fairSub', { n: formatNumber(FAIRNESS.tasksDone, lang) })}
            action={t('sendKudos')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function GlassPill({ bg, icon, label }: { bg: 'green' | 'primaryLight'; icon: ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.glass, borderRadius: radius.pill, paddingVertical: 4, paddingStart: 4, paddingEnd: 9 }}>
      <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: colors[bg], alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <AppText variant="caption" weight="bold" color="onDark">
        {label}
      </AppText>
    </View>
  );
}

function StepButton({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        width: sizes.touch,
        height: sizes.touch,
        borderRadius: sizes.touch / 2,
        borderWidth: 1,
        borderColor: colors.borderBlue,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

function FairnessRow({ title, sub, action }: { title: string; sub: string; action: string }) {
  return (
    <Pressable
      onPress={() => router.push('/28-kudos')}
      accessibilityRole="button"
      accessibilityLabel={`${title} · ${sub} · ${action}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
        backgroundColor: colors.amberTint,
        borderWidth: 1,
        borderColor: colors.gold,
        borderRadius: radius.button,
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.xl,
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <IconBadge size={40} gradient="warning">
        <Sparkles color={colors.onDark} fill={colors.onDark} size={20} strokeWidth={1.6} />
      </IconBadge>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="bold" color="amberStrong">
          {title}
        </AppText>
        <AppText variant="caption" color="amberStrong">
          {sub}
        </AppText>
      </View>
      <View style={{ minHeight: 34, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.gold, justifyContent: 'center' }}>
        <AppText variant="caption" weight="extrabold" color="amberStrong">
          {action}
        </AppText>
      </View>
    </Pressable>
  );
}
