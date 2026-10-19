import { useState } from 'react';
import { View } from 'react-native';
import { CircleAlert, CircleCheck, UserPlus } from 'lucide-react-native';
import { AppText, Avatar } from '@/components/ui';
import { colors, radius, spacing, type ColorToken } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import type { OrgProposal } from './api';
import { contentDirection } from './Bubbles';
import { CardButton } from './TaskCard';
import { NS } from './strings';

/** open = can be confirmed now; done = saved; rejected = "Not now"; stale = never confirmed */
export type OrgProposalState = 'open' | 'done' | 'rejected' | 'stale';

/** A team change Muntej proposes (add / move / role / hours / skills / left): nothing is saved until Confirm. */
export function OrgProposalCard({
  proposal,
  state,
  onConfirm,
  onReject,
}: {
  proposal: OrgProposal;
  state: OrgProposalState;
  /** throws with a readable reason when the change can't be saved */
  onConfirm: () => Promise<void>;
  onReject: () => void;
}) {
  const { t } = useScreenT(NS);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = state === 'open';
  const isAdd = proposal.op === 'add';

  const confirm = async () => {
    setWorking(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(t('orgFailed', { reason: (e as Error).message || t('confirmFailed') }));
    } finally {
      setWorking(false);
    }
  };

  const label =
    state === 'done' ? t('orgSaved') : state === 'rejected' || state === 'stale' ? t('orgSkipped') : isAdd ? t('orgAdd') : t('orgProposed');
  const labelColor: ColorToken = open ? 'amberStrong' : state === 'done' ? 'greenText' : 'textMuted';

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
        ) : isAdd ? (
          <UserPlus color={open ? colors.amberStrong : colors.textMuted} size={13} strokeWidth={2.4} />
        ) : (
          <CircleAlert color={open ? colors.amberStrong : colors.textMuted} size={13} strokeWidth={2.4} />
        )}
        <AppText variant="micro" weight="bold" color={labelColor}>
          {label}
        </AppText>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Avatar name={proposal.person_name} size={28} />
        <AppText
          variant="cardTitle"
          weight="bold"
          color={open ? 'text' : 'textMuted'}
          numberOfLines={1}
          style={{ flex: 1, writingDirection: contentDirection(proposal.person_name) }}
        >
          {proposal.person_name}
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
          <CardButton label={t('orgNotNow')} onPress={onReject} />
          <CardButton label={t('confirm')} onPress={confirm} busy={working} tone="green" />
        </View>
      )}
    </View>
  );
}
