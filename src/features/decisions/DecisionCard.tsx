// One decision card on screen 04 (design/v2/html/Decisions.dc.html).
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AlertTriangle, Check, Clock, Hand, Inbox, Mic, Sparkles } from 'lucide-react-native';
import { AppText, Avatar, Button, Card, Gradient, IconBadge, ProgressBar } from '@/components/ui';
import { colors, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { useDirection } from '@/lib/i18n';
import { formatNumber } from '@/features/home/value';
import { ageParts, shortName } from './people';
import type { CardVM, ChipVM, Outcome, Person } from './model';
import { NS } from './strings';

type Props = {
  card: CardVM;
  outcome: Outcome | undefined;
  busy: boolean;
  raised?: boolean;
  /** Teammates the task can move to (live: team employees; sample: demo team). */
  candidates: Person[];
  onResolve: (outcome: Outcome, moveTo?: Person) => void;
};

const chipTone: Record<ChipVM['tone'], { bg: ColorToken; fg: ColorToken }> = {
  neutral: { bg: 'bg', fg: 'textSoft' },
  orange: { bg: 'orangeTint', fg: 'orangeText' },
  red: { bg: 'redTint', fg: 'red' },
  green: { bg: 'greenTint', fg: 'greenText' },
};

const badgeTone = {
  amber: { bg: 'amberTint', fg: 'amberStrong' },
  red: { bg: 'redTint', fg: 'red' },
  primary: { bg: 'primaryTint', fg: 'primary' },
} as const;

export function DecisionCard({ card, outcome, busy, raised, candidates, onResolve }: Props) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const [voiceHint, setVoiceHint] = useState(false);
  const [picking, setPicking] = useState(false);
  const age = ageParts(card.createdAt);
  const bt = badgeTone[card.badge.tone];
  const accent = card.type === 'delay_risk' ? 'red' : card.badge.tone === 'amber' ? 'amber' : 'primary';
  const ownerName = card.owner ? shortName(card.owner, lang) : '';
  const showPicker = card.reassign && !outcome && (picking || !card.suggested);
  const others = candidates.filter((p) => p.id !== card.owner?.id);

  const doneLabel = (() => {
    switch (outcome) {
      case 'approved':
        return card.requesterShort ? t('doneApproved', { name: card.requesterShort }) : t('doneApprovedPlain');
      case 'declined':
        return card.requesterShort ? t('doneDeclined', { name: card.requesterShort }) : t('doneDeclinedPlain');
      case 'moved':
        return t('doneMoved');
      case 'kept':
        return t('doneKept', { name: ownerName });
      default:
        return '';
    }
  })();

  return (
    <Card
      elevation={raised ? 'raised' : 'card'}
      padding={0}
      style={{ overflow: 'hidden', paddingVertical: spacing.xl, paddingHorizontal: spacing.xxl, gap: spacing.md }}
    >
      {accent === 'amber' ? (
        <Gradient name="warning" style={{ position: 'absolute', start: 0, top: 0, bottom: 0, width: 4 }} />
      ) : (
        <View style={{ position: 'absolute', start: 0, top: 0, bottom: 0, width: 4, backgroundColor: accent === 'red' ? colors.red : colors.primary }} />
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 }}>
          {card.avatarName ? (
            <Avatar name={card.avatarName} size={32} gradient="avatarPurple" />
          ) : (
            <IconBadge size={32} bg="redTint">
              <AlertTriangle color={colors.red} size={16} strokeWidth={1.9} />
            </IconBadge>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors[bt.bg], borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 }}>
            {card.badge.clock && <Clock color={colors[bt.fg]} size={12} strokeWidth={2.4} />}
            <AppText variant="caption" weight="bold" color={bt.fg}>
              {card.badge.label}
            </AppText>
          </View>
          {card.sample && (
            <View style={{ backgroundColor: colors.chip, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
              <AppText variant="micro" weight="bold" color="textMuted">
                {t('sample')}
              </AppText>
            </View>
          )}
        </View>
        {card.risk !== null ? (
          <View accessibilityLabel={t('risk', { n: card.risk })} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 54 }}>
              <ProgressBar value={card.risk / 100} gradient="points" height={6} />
            </View>
            <AppText variant="small" weight="extrabold" color="red">
              {formatNumber(card.risk, lang)}%
            </AppText>
          </View>
        ) : (
          <AppText variant="caption" color="textFaint">
            {t(age.key, { n: formatNumber(age.n, lang) })}
          </AppText>
        )}
      </View>

      <AppText variant="lead" weight="bold" style={{ lineHeight: 22 }}>
        {card.title}
      </AppText>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {card.chips.map((c, i) => {
          const tone = chipTone[c.tone];
          return (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                maxWidth: '100%',
                backgroundColor: colors[tone.bg],
                borderRadius: radius.pill,
                paddingVertical: c.avatar ? 3 : 4,
                paddingStart: c.avatar ? 3 : 6,
                paddingEnd: spacing.md,
              }}
            >
              {c.avatar && <Avatar name={c.avatar} size={20} />}
              {c.icon === 'inbox' && <Inbox color={colors.textMuted} size={14} strokeWidth={2} />}
              {c.icon === 'hand' && <Hand color={colors[tone.fg]} size={14} strokeWidth={2} />}
              <AppText variant="caption" weight={c.tone === 'neutral' ? 'semibold' : 'bold'} color={tone.fg} numberOfLines={1} style={{ flexShrink: 1 }}>
                {c.label}
              </AppText>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.borderBlue, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
        <IconBadge size={28} gradient="avatarBlue">
          <Sparkles color={colors.onDark} size={15} strokeWidth={2.1} />
        </IconBadge>
        <AppText variant="small" color="navy" style={{ flex: 1, lineHeight: 18 }} numberOfLines={3}>
          <AppText variant="small" weight="bold" color="primary">
            {card.recAction}
          </AppText>
          {card.recWhy ? ` · ${card.recWhy}` : ''}
        </AppText>
      </View>

      {outcome ? (
        <View style={{ minHeight: 48, borderRadius: radius.pill, backgroundColor: outcome === 'declined' ? colors.chip : colors.greenTint, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg }}>
          <Check color={outcome === 'declined' ? colors.textMuted : colors.green} size={18} strokeWidth={2.2} />
          <AppText variant="cardTitle" weight="bold" color={outcome === 'declined' ? 'textMuted' : 'greenText'} numberOfLines={1}>
            {doneLabel}
          </AppText>
        </View>
      ) : busy ? (
        <View style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : card.reassign ? (
        <View style={{ gap: spacing.sm }}>
          {showPicker ? (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="small" weight="bold" color="textMuted">
                {t('pickWho')}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {others.map((p) => {
                  const name = shortName(p, lang);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => onResolve('moved', p)}
                      accessibilityRole="button"
                      accessibilityLabel={t('moveTo', { name })}
                      style={({ pressed }) => ({ minHeight: sizes.touch, flexDirection: 'row', alignItems: 'center', gap: 6, paddingStart: 4, paddingEnd: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderBlue, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 })}
                    >
                      <Avatar name={name} size={30} />
                      <AppText variant="small" weight="bold">
                        {name}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {card.suggested && <Button size="md" variant="ghost" label={t('cancel')} onPress={() => setPicking(false)} style={{ flex: 1 }} />}
                {card.owner && <Button size="md" variant="outline" label={t('keep', { name: ownerName })} onPress={() => onResolve('kept')} style={{ flex: 1 }} />}
              </View>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button
                  size="md"
                  label={t('moveTo', { name: shortName(card.suggested, lang) })}
                  icon={<Avatar name={shortName(card.suggested, lang)} size={22} ring gradient="avatarOrange" />}
                  onPress={() => onResolve('moved', card.suggested!)}
                  style={{ flex: 1, minHeight: 48 }}
                />
                <Button size="md" variant="outline" label={t('keep', { name: ownerName })} onPress={() => onResolve('kept')} style={{ flex: 1, minHeight: 48 }} />
              </View>
              {others.length > 1 && (
                <Pressable onPress={() => setPicking(true)} accessibilityRole="button" style={{ minHeight: sizes.touch, alignItems: 'center', justifyContent: 'center', marginVertical: -spacing.sm }}>
                  <AppText variant="caption" weight="bold" color="primary">
                    {t('someoneElse')}
                  </AppText>
                </Pressable>
              )}
            </>
          )}
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button size="md" label={t('approve')} onPress={() => onResolve('approved')} style={{ flex: 1, minHeight: 48 }} />
            <Button size="md" variant="outline" label={t('decline')} onPress={() => onResolve('declined')} style={{ flex: 1, minHeight: 48 }} />
            <Pressable
              onPress={() => setVoiceHint((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={t('voice')}
              style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
            >
              <Mic color={colors.primary} size={20} strokeWidth={1.9} />
            </Pressable>
          </View>
          {voiceHint && (
            <AppText variant="caption" color="textMuted" align="center">
              {t('voiceSoon')}
            </AppText>
          )}
        </View>
      )}
    </Card>
  );
}
