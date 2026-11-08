// People found in your mail, decided one by one (owner, 8 Nov: "Let's approve or reject one by one and keep emails out
// of the company domain and manager confirm or reject"). Option 1 of design/examples/team-review-one-by-one.png:
// every person has Add / No; decided people fold to one line with Undo; people outside your company's email domain sit
// in their own section and are only added on an Add. Nobody is added or remembered as "No" without a tap.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Check, Pencil, X } from 'lucide-react-native';
import { AppText, Avatar, Chip } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import type { DraftPerson } from './api';
import { TEAM_IMPORT_NS } from './strings';

type Boss = { id: string; name: string };

export function MailReview({
  people,
  team,
  meName,
  onChange,
}: {
  people: DraftPerson[];
  team: Boss[];
  meName: string;
  onChange: (ref: string, patch: Partial<DraftPerson>) => void;
}) {
  const { t } = useScreenT(TEAM_IMPORT_NS);
  // the "under whom?" sheet; adding = it opened from Add (owner, 8 Nov: "Once added, let's choose under whom"): picking
  // someone adds the person there, closing it adds nobody
  const [picking, setPicking] = useState<DraftPerson | null>(null);
  const [adding, setAdding] = useState(false);
  const pick = (boss: string | null) => {
    if (picking) onChange(picking.ref, { manager_id: boss, manager_ref: null, ...(adding ? { decided: 'yes' as const, ...(picking.maybe?.length ? { is_new: true } : null) } : null) });
    setPicking(null);
    setAdding(false);
  };
  const close = () => {
    setPicking(null);
    setAdding(false);
  };
  const inside = people.filter((p) => !p.outside);
  const outside = people.filter((p) => p.outside);
  const bossName = (p: DraftPerson) => (p.manager_id ? (team.find((b) => b.id === p.manager_id)?.name ?? '…') : meName);

  const row = (p: DraftPerson) =>
    p.decided ? (
      <View
        key={p.ref}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.touch, paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}
      >
        <Avatar name={p.full_name} size={28} />
        <AppText variant="small" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="small" weight="bold">
            {p.full_name}
          </AppText>
          {p.decided === 'yes' ? ` · ${t('mailUnder')} ${bossName(p)}` : ''}
        </AppText>
        <AppText variant="small" weight="bold" color={p.decided === 'yes' ? 'greenText' : 'red'}>
          {p.decided === 'yes' ? `✓ ${t('mailAdding')}` : `✕ ${t('mailNot')}`}
        </AppText>
        <Pressable onPress={() => onChange(p.ref, { decided: undefined })} accessibilityRole="button" hitSlop={10} style={{ minHeight: sizes.touch, justifyContent: 'center', paddingHorizontal: 4 }}>
          <AppText variant="small" weight="bold" color="primary">
            {t('mailUndo')}
          </AppText>
        </Pressable>
      </View>
    ) : (
      <View key={p.ref} style={{ backgroundColor: colors.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Avatar name={p.full_name} size={40} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <AppText weight="bold" numberOfLines={2}>
              {p.full_name}
            </AppText>
            {!!p.email && (
              <AppText variant="caption" color="textMuted" numberOfLines={1}>
                {p.email}
              </AppText>
            )}
            {!!p.maybe?.length && (
              <AppText variant="caption" color="amberText" numberOfLines={1}>
                {t('mailLooksLike', { name: p.maybe[0].name })}
              </AppText>
            )}
            <Pressable onPress={() => setPicking(p)} accessibilityRole="button" accessibilityLabel={t('mailPickBoss')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 }}>
              <AppText variant="caption" color="textMuted">
                {t('mailUnder')}
              </AppText>
              <AppText variant="caption" weight="bold" color="primary" numberOfLines={1} style={{ flexShrink: 1 }}>
                {bossName(p)}
              </AppText>
              <Pencil color={colors.primary} size={12} strokeWidth={2.2} />
            </Pressable>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable
            onPress={() => {
              setAdding(true);
              setPicking(p);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${t('mailYes')} ${p.full_name}`}
            style={({ pressed }) => ({ flex: 1, minHeight: sizes.touch, borderRadius: radius.pill, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.85 : 1 })}
          >
            <Check color={colors.onDark} size={16} strokeWidth={2.6} />
            <AppText weight="bold" color="onDark">
              {t('mailYes')}
            </AppText>
          </Pressable>
          <Pressable
            onPress={() => onChange(p.ref, { decided: 'no' })}
            accessibilityRole="button"
            accessibilityLabel={`${t('mailNo')} ${p.full_name}`}
            style={({ pressed }) => ({ flex: 1, minHeight: sizes.touch, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.85 : 1 })}
          >
            <X color={colors.textMuted} size={16} strokeWidth={2.4} />
            <AppText weight="bold" color="textMuted">
              {t('mailNo')}
            </AppText>
          </Pressable>
        </View>
      </View>
    );

  return (
    <View style={{ gap: spacing.sm }}>
      {!!inside.length && (
        <AppText weight="bold" style={{ marginTop: spacing.sm }}>
          {t('mailInside')}
        </AppText>
      )}
      {inside.map(row)}
      {!!outside.length && (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
          <AppText weight="bold">{t('mailOutside')}</AppText>
          <Chip label={t('mailOutsideNote')} tone="amber" />
        </View>
      )}
      {outside.map(row)}

      {/* who they'll be under: you or someone in your team */}
      <Modal visible={!!picking} transparent animationType="fade" onRequestClose={close}>
        <Pressable onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.screen, gap: spacing.md, maxHeight: '70%' }}>
            <AppText weight="bold">{adding && picking ? t('mailAddUnder', { name: picking.full_name }) : t('mailPickBoss')}</AppText>
            <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.lg }}>
              <Chip label={meName} selected={!adding && !picking?.manager_id} onPress={() => pick(null)} />
              {team.map((b) => (
                <Chip key={b.id} label={b.name} selected={!adding && picking?.manager_id === b.id} onPress={() => pick(b.id)} />
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
