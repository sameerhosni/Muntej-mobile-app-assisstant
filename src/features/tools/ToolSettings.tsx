// A connected tool's settings, shared by its own page (screen 55): the two directions (bring tasks in / send my
// tasks out, and where to) and, for Google, what each linked account may read (one part, or all of them).
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { AppText, Button, Toggle } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { useConnectionActions, useConnections, type Connection, type ProviderId, type Target } from '@/features/sources/connections';
import { CONN_NS } from '@/features/sources/connStrings';

export const GOOGLE_PARTS = ['gmail', 'calendar', 'meet', 'chat'] as const;
export type GooglePart = (typeof GOOGLE_PARTS)[number];

/** The two directions for a connected tool: bring tasks in / send my tasks out (+ where they go). */
export function Directions({
  id,
  conn,
  twoWay,
  onNote,
}: {
  id: ProviderId;
  conn: Connection;
  twoWay: boolean;
  onNote: (n: { tone: 'green' | 'red'; text: string } | null) => void;
}) {
  const { t } = useScreenT(CONN_NS);
  const actions = useConnectionActions();
  const [picking, setPicking] = useState(false);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (patch: { import_on?: boolean; export_on?: boolean; export_target?: Target | null }) => {
    setSaving(true);
    onNote(null);
    try {
      await actions.settings(id, patch);
    } catch (e) {
      onNote({ tone: 'red', text: (e as Error).message || t('error') });
    } finally {
      setSaving(false);
    }
  };
  const openPicker = async () => {
    setPicking(true);
    setTargets(null);
    try {
      setTargets(await actions.targets(id));
    } catch (e) {
      setPicking(false);
      onNote({ tone: 'red', text: (e as Error).message || t('error') });
    }
  };
  const toggleOut = (on: boolean) => {
    if (on && !conn.export_target) return openPicker(); // choose where first, then it switches on
    save({ export_on: on });
  };

  const row = (label: string, hint: string, value: boolean, onChange: (v: boolean) => void) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: 52,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText weight="bold">{label}</AppText>
        <AppText variant="caption" color="textMuted">
          {hint}
        </AppText>
      </View>
      <Toggle value={value} onValueChange={onChange} disabled={saving} accessibilityLabel={label} />
    </View>
  );

  return (
    <View
      style={{
        gap: spacing.xs,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: spacing.sm,
      }}
    >
      {row(`⬇ ${t('dirIn')}`, t('dirInHint'), conn.import_on, (v) => save({ import_on: v }))}
      {twoWay && (
        <>
          {row(`⬆ ${t('dirOut')}`, t('dirOutHint'), conn.export_on, toggleOut)}
          <Pressable
            onPress={openPicker}
            accessibilityRole="button"
            style={{
              minHeight: sizes.touch,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
            }}
          >
            <AppText
              variant="small"
              weight="semibold"
              color={conn.export_target ? 'text' : 'primary'}
              style={{ flex: 1 }}
              numberOfLines={2}
            >
              {conn.export_target ? t('where', { name: conn.export_target.name }) : t('pickWhere')}
            </AppText>
            {conn.export_target && (
              <AppText variant="small" weight="bold" color="primary">
                {t('change')}
              </AppText>
            )}
          </Pressable>
          <AppText variant="caption" color="textMuted">
            {t('inStep')}
          </AppText>
        </>
      )}

      <Modal visible={picking} transparent animationType="slide" onRequestClose={() => setPicking(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(11,26,51,0.35)' }}
          onPress={() => setPicking(false)}
          accessibilityLabel={t('cancel')}
        />
        <View
          style={{
            maxHeight: '70%',
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.cardLg,
            borderTopRightRadius: radius.cardLg,
            padding: spacing.screen,
            gap: spacing.md,
          }}
        >
          <AppText variant="section">{t('pickTitle')}</AppText>
          {!targets ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
              }}
            >
              <ActivityIndicator color={colors.primary} />
              <AppText color="textMuted">{t('pickLoading')}</AppText>
            </View>
          ) : targets.length === 0 ? (
            <AppText color="textMuted">{t('pickEmpty')}</AppText>
          ) : (
            <ScrollView style={{ maxHeight: 420 }}>
              {targets.map((x) => (
                <Pressable
                  key={x.id}
                  onPress={async () => {
                    setPicking(false);
                    await save({ export_target: x, export_on: true });
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    minHeight: sizes.touch + 4,
                    justifyContent: 'center',
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    backgroundColor: pressed || conn.export_target?.id === x.id ? colors.primaryTint : colors.transparent,
                    paddingHorizontal: spacing.sm,
                  })}
                >
                  <AppText weight={conn.export_target?.id === x.id ? 'bold' : 'regular'}>{x.name}</AppText>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <Button label={t('cancel')} variant="outline" size="md" onPress={() => setPicking(false)} />
        </View>
      </Modal>
    </View>
  );
}

/** Google: what each linked account may read (Gmail, Calendar, Google Meet transcripts), each with its own switch.
 *  Meet needs the newer sign-in (meetings access): older connections get "Allow Google Meet" instead of a switch. */
export function GoogleParts({ onNote, part: only }: { onNote: (n: { tone: 'green' | 'red'; text: string } | null) => void; part?: GooglePart }) {
  const { t } = useScreenT(CONN_NS);
  const conns = useConnections();
  const actions = useConnectionActions();
  const [saving, setSaving] = useState<string | null>(null);
  const google = (conns.data ?? []).filter((c) => c.provider === 'google');
  const set = async (c: Connection, part: string, on: boolean) => {
    setSaving(`${c.id}:${part}`);
    onNote(null);
    try {
      await actions.settings('google', { features: { [part]: on } }, c.id);
    } catch (e) {
      onNote({ tone: 'red', text: (e as Error).message || t('error') });
    } finally {
      setSaving(null);
    }
  };
  return (
    <View
      style={{
        gap: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: spacing.sm,
      }}
    >
      {google.map((c) => (
        <View key={c.id} style={{ gap: spacing.xs }}>
          {google.length > 1 && (
            <AppText variant="caption" weight="bold" color="textMuted">
              {c.account_label}
            </AppText>
          )}
          {GOOGLE_PARTS.filter((p) => !only || p === only).map((part) => {
            // Meet and Chat need permissions older sign-ins didn't ask for: "Allow" signs in again
            const allowed =
              (part !== 'meet' || (c.cursor?.meet_ok === true && c.cursor?.tx_ok === true)) && (part !== 'chat' || c.cursor?.chat_ok === true);
            // Google refuses Chat for personal accounts (Workspace only)
            const chatRefused = part === 'chat' && allowed && c.features?.chat !== false && !!c.cursor?.chat_error;
            // Google refused to switch on automatic transcripts (usually a plan without transcripts)
            const txRefused = part === 'meet' && allowed && c.features?.meet !== false && !!c.cursor?.tx_error;
            return (
              <View
                key={part}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  minHeight: 52,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText weight="bold">{t(`part_${part}`)}</AppText>
                  <AppText variant="caption" color="textMuted">
                    {chatRefused
                      ? t('chatWorkspaceOnly')
                      : txRefused
                        ? t('txPlan')
                      : allowed
                        ? t(`part_${part}Hint`)
                        : t(part === 'chat' ? 'chatAllowHint' : 'meetAllowHint')}
                  </AppText>
                </View>
                {allowed ? (
                  <Toggle
                    value={c.features?.[part] !== false}
                    onValueChange={(v) => set(c, part, v)}
                    disabled={saving === `${c.id}:${part}`}
                    accessibilityLabel={t(`part_${part}`)}
                  />
                ) : (
                  <Button label={t('meetAllow')} size="md" onPress={() => actions.connect('google').catch(() => {})} />
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
