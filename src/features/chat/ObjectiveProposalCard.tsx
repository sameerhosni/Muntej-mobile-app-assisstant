import { useState } from 'react';
import { View } from 'react-native';
import { CalendarRange, CircleCheck, CircleX, Target } from 'lucide-react-native';
import { AppText } from '@/components/ui';
import { colors, radius, spacing, type ColorToken } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import type { ObjectiveProposal } from './api';
import { contentDirection } from './Bubbles';
import { CardButton } from './TaskCard';
import { NS } from './strings';

/** open = can be confirmed now; done = saved; rejected = "Not now"; stale = never confirmed */
export type ObjectiveProposalState = 'open' | 'done' | 'rejected' | 'stale';

/** An objective change Muntej proposes (create / update / cancel / distribute): nothing is saved until Confirm. */
export function ObjectiveProposalCard({
  proposal,
  state,
  onConfirm,
  onReject,
}: {
  proposal: ObjectiveProposal;
  state: ObjectiveProposalState;
  /** throws with a readable reason when the change can't be saved */
  onConfirm: () => Promise<void>;
  onReject: () => void;
}) {
  const { t } = useScreenT(NS);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = state === 'open';
  const isCancel = proposal.op === 'cancel';

  const confirm = async () => {
    setWorking(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(t('objFailed', { reason: (e as Error).message || t('confirmFailed') }));
    } finally {
      setWorking(false);
    }
  };

  const opLabel = {
    create: t('objNew'),
    update: t('objUpdate'),
    cancel: t('objCancel'),
    distribute: t('objDistribute'),
  }[proposal.op];
  const doneLabel = isCancel ? t('objCancelled') : proposal.op === 'distribute' ? t('objSpread') : t('objSaved');
  const label = state === 'done' ? doneLabel : state === 'rejected' || state === 'stale' ? t('objSkipped') : opLabel;
  const labelColor: ColorToken = open ? 'amberStrong' : state === 'done' ? 'greenText' : 'textMuted';
  const iconColor = open ? colors.amberStrong : colors.textMuted;
  const Icon = isCancel ? CircleX : proposal.op === 'distribute' ? CalendarRange : Target;

  return (
    <View
      style={{
        maxWidth: '94%',
        alignSelf: 'stretch',
        backgroundColor: open ? colors.surface : colors.surfaceMuted,
        borderRadius: radius.tile,
        borderWidth: 1,
        borderColor: open ? colors.amber : colors.border,
        borderStartWidth: 4,
        borderStartColor: open ? colors.amber : state === 'done' ? colors.green : colors.textFaint,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {state === 'done' ? (
          <CircleCheck color={colors.greenText} size={13} strokeWidth={2.4} />
        ) : (
          <Icon color={iconColor} size={13} strokeWidth={2.4} />
        )}
        <AppText variant="micro" weight="bold" color={labelColor}>
          {label}
        </AppText>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Target color={open ? colors.text : colors.textMuted} size={20} strokeWidth={2} />
        <AppText
          variant="cardTitle"
          weight="bold"
          color={open ? 'text' : 'textMuted'}
          numberOfLines={2}
          style={{ flex: 1, writingDirection: contentDirection(proposal.title) }}
        >
          {proposal.title}
        </AppText>
      </View>

      {state !== 'rejected' && proposal.summary_lines.length > 0 && (
        <View style={{ gap: 6 }}>
          {proposal.summary_lines.map((line, i) => (
            <AppText
              key={i}
              variant="small"
              color={open ? 'textSoft' : 'textMuted'}
              style={{ writingDirection: contentDirection(line) }}
            >
              {line}
            </AppText>
          ))}
        </View>
      )}

      {!!error && (
        <View style={{ backgroundColor: colors.redTint, borderRadius: radius.md, padding: spacing.md }}>
          <AppText variant="small" weight="bold" color="red" style={{ writingDirection: contentDirection(error) }}>
            {error}
          </AppText>
        </View>
      )}

      {open && (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <CardButton label={t('objNotNow')} onPress={onReject} />
          {isCancel ? (
            <CardButton label={t('objYesCancel')} onPress={confirm} busy={working} danger />
          ) : (
            <CardButton label={t('confirm')} onPress={confirm} busy={working} tone="green" />
          )}
        </View>
      )}
    </View>
  );
}
