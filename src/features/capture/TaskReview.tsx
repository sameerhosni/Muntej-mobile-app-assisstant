import type { ComponentType, ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Banknote,
  Calendar,
  CircleCheck,
  Clock,
  Flag,
  Hand,
  MessageCircle,
  Mic,
  Search,
  Send,
  Sparkles,
  Target,
  type LucideProps,
} from 'lucide-react-native';
import { AppText, Avatar, Card, Gradient, IconBadge, PointsCoin, StatTile } from '@/components/ui';
import { useScreenT } from '@/lib/i18n/register';
import { formatClock, taskPointsReward } from './points';
import { NS } from './strings';
import { colors, radius, shadows, spacing, type ColorToken, type GradientToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import type { Profile } from '@/lib/api';
import { formatNumber, taskSavings } from '@/features/home/value';
import type { FollowupStep, ParsedTask } from './api';
import { formatDue, formatStep } from './format';
import { Waveform } from './Waveform';

const priorityColor: Record<ParsedTask['priority'], ColorToken> = {
  low: 'textSoft',
  medium: 'primary',
  high: 'amberStrong',
  urgent: 'red',
};

export function personName(p: Profile | undefined, lang: string) {
  if (!p) return '';
  return lang === 'ar' && p.full_name_ar ? p.full_name_ar : p.full_name;
}

/** Transcript + savings + "Muntej understood" + auto plan (design/v2/html/Capture.dc.html). */
export function TaskReview({ task, team, durationMs }: { task: ParsedTask; team: Profile[]; durationMs?: number }) {
  const { t } = useTranslation();
  const { t: ts } = useScreenT(NS);
  const { lang } = useDirection();
  const reward = taskPointsReward();
  const owner = team.find((p) => p.id === task.owner_id);
  const helper = team.find((p) => p.id === task.helper_id);
  const firstName = (p?: Profile) => personName(p, lang).split(' ')[0];
  // AI-written text follows the language the manager spoke, not the UI language
  const contentDir = task.language === 'ar' ? 'rtl' : 'ltr';
  const savings = taskSavings(owner ? task.followup_plan.length : 0);

  return (
    <View style={{ gap: spacing.xxl }}>
      <View style={{ borderRadius: radius.cardLg, overflow: 'hidden', boxShadow: shadows.primary }}>
        <Gradient name="heroManager" style={{ paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <IconBadge size={36} bg="glass" round>
              <Mic color={colors.onDark} size={16} strokeWidth={2} />
            </IconBadge>
            <Waveform onDark />
            {durationMs !== undefined && (
              <AppText
                variant="caption"
                weight="bold"
                color="onDarkMuted"
                style={{ marginStart: 'auto' }}
                accessibilityLabel={ts('recordingLength', { time: formatClock(durationMs) })}
              >
                {formatClock(durationMs)}
              </AppText>
            )}
          </View>
          <AppText color="onDark" style={{ lineHeight: 21, writingDirection: contentDir }}>
            “{task.transcript}”
          </AppText>
        </Gradient>
      </View>

      {owner && (
        <View style={{ flexDirection: 'row', gap: spacing.sm }} accessibilityLabel={t('capture.saves')}>
          <StatTile iconBg="primaryTint" icon={<Clock color={colors.primary} size={15} strokeWidth={2.1} />}
            value={formatNumber(savings.minutes, lang)} label={t('capture.minSaved')} />
          <StatTile iconBg="greenTint" icon={<Banknote color={colors.green} size={15} strokeWidth={2.1} />}
            value={formatNumber(savings.sar, lang)} label={t('capture.sarSaved')} />
          <StatTile iconBg="orangeTint" icon={<Hand color={colors.orange} size={15} strokeWidth={2.1} />}
            value={formatNumber(savings.followups, lang)} label={t('capture.followupsSaved')} />
        </View>
      )}

      <Card padding={spacing.xl} style={{ overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: 0, bottom: 0, start: 0, width: 4, overflow: 'hidden' }}>
          <Gradient name="avatarBlue" style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <IconBadge size={22} gradient="avatarBlue">
            <Sparkles color={colors.onDark} size={13} strokeWidth={2.1} />
          </IconBadge>
          <AppText variant="small" weight="bold" color="primary">
            {t('capture.hereIsWhat')}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.xl }}>
          <Field label={t('capture.owner')} icon={owner ? <Avatar name={owner.full_name} size={34} gradient="avatarBlue" /> : undefined}
            Icon={owner ? undefined : Hand} iconBg="amberTint" iconColor="amberText">
            <AppText weight="bold" color={owner ? 'text' : 'amberText'} numberOfLines={1}>
              {owner ? firstName(owner) : t('capture.notSet')}
            </AppText>
          </Field>
          <Field label={t('capture.due')} Icon={Calendar} iconBg="primaryTint" iconColor="primary">
            <AppText weight="bold" color={task.due_at ? 'text' : 'amberText'} numberOfLines={1}>
              {task.due_at ? formatDue(task.due_at, lang) : t('capture.notSet')}
            </AppText>
          </Field>
          <Field label={t('capture.priority')} Icon={Flag} iconBg="amberTint" iconColor="amberText">
            <AppText weight="bold" color={priorityColor[task.priority]}>
              {t(`capture.p_${task.priority}`)}
            </AppText>
          </Field>
          {helper && (
            <Field
              label={task.helper_reason ? `${t('capture.support')} · ${task.helper_reason}` : t('capture.support')}
              icon={<Avatar name={helper.full_name} size={34} gradient="avatarPurple" />}
            >
              <AppText weight="bold" numberOfLines={1}>
                {firstName(helper)}
              </AppText>
            </Field>
          )}
          {task.goal && (
            <Field label={t('capture.goal')} Icon={Target} iconBg="purpleTint" iconColor="purple">
              <AppText weight="bold" color="purpleText" numberOfLines={1} style={{ writingDirection: contentDir }}>
                {task.goal}
              </AppText>
            </Field>
          )}
          <Field
            label={ts('pointsEarly', { n: formatNumber(reward.early, lang) })}
            icon={
              <IconBadge size={34} bg="orangeTint">
                <PointsCoin size={20} />
              </IconBadge>
            }
          >
            <AppText weight="extrabold" color="orangeText" numberOfLines={1}>
              {ts('pointsValue', { n: formatNumber(reward.total, lang) })}
            </AppText>
          </Field>
        </View>
      </Card>

      {owner && task.followup_plan.length > 0 && <AutoPlan steps={task.followup_plan} />}
      {!owner && (
        <Card tone="amber">
          <AppText variant="small" color="amberStrong">
            {t('capture.noOwnerWarn')}
          </AppText>
        </Card>
      )}
    </View>
  );
}

function Field({
  label,
  children,
  icon,
  Icon,
  iconBg = 'primaryTint',
  iconColor = 'primary',
}: {
  label: string;
  children: ReactNode;
  icon?: ReactNode;
  Icon?: ComponentType<LucideProps>;
  iconBg?: ColorToken;
  iconColor?: ColorToken;
}) {
  return (
    <View style={{ width: '50%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingEnd: spacing.sm }}>
      {icon ??
        (Icon && (
          <IconBadge size={34} bg={iconBg}>
            <Icon color={colors[iconColor]} size={17} strokeWidth={1.9} />
          </IconBadge>
        ))}
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="micro" color="textMuted" numberOfLines={1}>
          {label}
        </AppText>
        {children}
      </View>
    </View>
  );
}

const STEP_STYLE: Record<FollowupStep['kind'], { Icon: ComponentType<LucideProps>; gradient?: GradientToken; bg: ColorToken; fg: ColorToken }> = {
  brief: { Icon: MessageCircle, gradient: 'primary', bg: 'primaryTint', fg: 'onDark' },
  check: { Icon: Search, bg: 'purpleTint', fg: 'purple' },
  risk: { Icon: AlertTriangle, bg: 'amberTint', fg: 'amberText' },
  collect: { Icon: Send, bg: 'greenTint', fg: 'green' },
};

function AutoPlan({ steps }: { steps: FollowupStep[] }) {
  const { t } = useTranslation();
  const { lang } = useDirection();
  return (
    <Card padding={spacing.lg} style={{ paddingVertical: spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="small" weight="bold">
          {t('capture.planTitle')}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
          <CircleCheck color={colors.greenText} size={11} strokeWidth={3} />
          <AppText variant="micro" weight="bold" color="greenText">
            {t('capture.zeroChases')}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ position: 'absolute', top: 19, start: '12%', end: '12%', height: 2, backgroundColor: colors.border }} />
        {steps.map((s, i) => {
          const st = STEP_STYLE[s.kind];
          return (
            <View key={`${s.at}-${i}`} style={{ flex: 1, alignItems: 'center', gap: 5, paddingHorizontal: 2 }}>
              {st.gradient && i === 0 ? (
                <View style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', boxShadow: '0px 0px 0px 4px #E8F0FE' }}>
                  <Gradient name={st.gradient} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <st.Icon color={colors.onDark} size={18} strokeWidth={2} />
                  </Gradient>
                </View>
              ) : (
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors[st.bg], borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <st.Icon color={colors[st.fg === 'onDark' ? 'primary' : st.fg]} size={18} strokeWidth={2} />
                </View>
              )}
              <AppText variant="caption" weight="extrabold" color={i === 0 ? 'primary' : 'text'} align="center" numberOfLines={1}>
                {formatStep(s.at, lang, t('capture.now'))}
              </AppText>
              <AppText variant="micro" color="textMuted" align="center" numberOfLines={2} style={{ lineHeight: 14 }}>
                {s.summary}
              </AppText>
            </View>
          );
        })}
      </View>
    </Card>
  );
}
