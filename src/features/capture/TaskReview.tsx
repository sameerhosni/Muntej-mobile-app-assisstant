import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Avatar, Card } from '@/components/ui';
import { colors, radius, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import type { Profile } from '@/lib/api';
import type { FollowupStep, ParsedTask } from './api';
import { formatDue, formatStep } from './format';

const priorityColor: Record<ParsedTask['priority'], ColorToken> = {
  low: 'textSoft',
  medium: 'text',
  high: 'amber',
  urgent: 'red',
};

export function personName(p: Profile | undefined, lang: string) {
  if (!p) return '';
  return lang === 'ar' && p.full_name_ar ? p.full_name_ar : p.full_name;
}

/** Quote + "Here's what I got" card + follow-up plan (Capture mockup). */
export function TaskReview({ task, team }: { task: ParsedTask; team: Profile[] }) {
  const { t } = useTranslation();
  const { lang } = useDirection();
  const owner = team.find((p) => p.id === task.owner_id);
  const helper = team.find((p) => p.id === task.helper_id);
  const firstName = (p?: Profile) => personName(p, lang).split(' ')[0];
  // AI-written text follows the language the manager spoke, not the UI language
  const contentDir = task.language === 'ar' ? 'rtl' : 'ltr';

  return (
    <View style={{ gap: spacing.xl }}>
      <Card size="md" style={{ borderRadius: radius.card }}>
        <AppText style={{ fontSize: 16, lineHeight: 27, writingDirection: contentDir }} color="textSoft">
          “{task.transcript}”
        </AppText>
      </Card>

      <Card size="md" style={{ gap: spacing.lg, borderRadius: 20 }}>
        <AppText variant="small" color="textMuted">
          {t('capture.hereIsWhat')}
        </AppText>
        <Row label={t('capture.owner')}>
          {owner ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Avatar name={owner.full_name} size={26} bg="tealDeep" fg="text" />
              <AppText weight="bold">{personName(owner, lang)}</AppText>
            </View>
          ) : (
            <AppText weight="bold" color="amber">
              {t('capture.notSet')}
            </AppText>
          )}
        </Row>
        <Row label={t('capture.due')}>
          <AppText weight="bold" color={task.due_at ? 'text' : 'amber'}>
            {task.due_at ? formatDue(task.due_at, lang) : t('capture.notSet')}
          </AppText>
        </Row>
        <Row label={t('capture.priority')}>
          <AppText weight="bold" color={priorityColor[task.priority]}>
            {t(`capture.p_${task.priority}`)}
          </AppText>
        </Row>
        {helper && (
          <Row label={t('capture.support')}>
            <AppText weight="bold">
              {firstName(helper)}
              {task.helper_reason ? ` — ${task.helper_reason}` : ''}
            </AppText>
          </Row>
        )}
        {task.goal && (
          <Row label={t('capture.goal')}>
            <AppText weight="bold">{task.goal}</AppText>
          </Row>
        )}
      </Card>

      {owner && task.followup_plan.length > 0 && <PlanTimeline steps={task.followup_plan} contentDir={contentDir} />}
      {!owner && (
        <AppText variant="small" color="amber">
          {t('capture.noOwnerWarn')}
        </AppText>
      )}
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.lg }}>
      <AppText color="textMuted">{label}</AppText>
      <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>{children}</View>
    </View>
  );
}

function PlanTimeline({ steps, contentDir }: { steps: FollowupStep[]; contentDir: 'rtl' | 'ltr' }) {
  const { t } = useTranslation();
  const { lang } = useDirection();
  return (
    <View>
      <AppText variant="small" color="textMuted" style={{ marginBottom: spacing.md }}>
        {t('capture.planTitle')}
      </AppText>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const accent = s.kind === 'risk' ? colors.amber : colors.teal;
        return (
          <View key={`${s.at}-${i}`} style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ alignItems: 'center', paddingTop: 5 }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: i === 0 ? accent : colors.transparent,
                  borderWidth: i === 0 ? 0 : 2,
                  borderColor: accent,
                }}
              />
              {!last && <View style={{ width: 2, flex: 1, backgroundColor: colors.timelineLine }} />}
            </View>
            <AppText style={{ flex: 1, paddingBottom: last ? 0 : spacing.lg }}>
              <AppText weight="bold">{formatStep(s.at, lang, t('capture.now'))}</AppText> —{' '}
              <AppText style={{ writingDirection: contentDir }}>{s.summary}</AppText>
            </AppText>
          </View>
        );
      })}
    </View>
  );
}
