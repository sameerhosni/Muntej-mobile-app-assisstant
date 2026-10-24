// Screen 12 · Sources — see design/v2/html/Sources.dc.html (Arabic: SourcesAR.dc.html); now "Connect your tools".
// Real connections (table connections + Edge Function `connect`): Connect opens the tool's own sign-in page, which
// sends the person back here (?connected=… / ?error=…). Every 10 minutes sync-sources reads what's new and passes it
// to Muntej's intake (sure tasks are added, the rest wait in Incoming). Check now / Disconnect per tool.
// Tools that aren't built yet show "Coming soon"; built ones without the server's app credentials, "Needs admin setup".
// Sectors: your field's tools come first (its coming-soon tools too); the rest wait under "More tools". No sector yet →
// Saree3 asks for it at the top.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Inbox, Lock } from 'lucide-react-native';
import { AppText, Button, Card, IconBadge, IconButton, TextField, Toggle } from '@/components/ui';
import { colors, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { WhatsAppCard } from '@/features/sources/WhatsAppCard';
import { TourTarget } from '@/features/walkthrough/TourTarget';
import {
  PROVIDER_IDS,
  useConnectionActions,
  useConnections,
  useProviders,
  type Connection,
  type ProviderId,
  type Target,
} from '@/features/sources/connections';
import { CONN_NS } from '@/features/sources/connStrings';
import { featureUsed } from '@/features/launch/launch';
import { Spotlight } from '@/features/launch/Spotlight';
import { SECTOR_TOOLS, SOON_TOOLS, useMySector, type SoonTool, type ToolId } from '@/features/sectors/sectors';
import { SectorPicker, SECTOR_NS } from '@/features/sectors/SectorPicker';

/** letter badge per tool (brand logos aren't in the app; colours from the theme) */
const BADGE: Record<ProviderId, { letter: string; bg: ColorToken; fg: string }> = {
  microsoft: { letter: 'M', bg: 'primaryTint', fg: colors.primary },
  google: { letter: 'G', bg: 'redTint', fg: colors.red },
  slack: { letter: 'S', bg: 'purpleTint', fg: colors.purple },
  jira: { letter: 'J', bg: 'primaryTint', fg: colors.primary },
  clickup: { letter: 'C', bg: 'purpleTint', fg: colors.purple },
  trello: { letter: 'T', bg: 'primaryTint', fg: colors.primary },
  notion: { letter: 'N', bg: 'chip', fg: colors.text },
  azure_devops: { letter: 'A', bg: 'primaryTint', fg: colors.primary },
};

export default function SourcesScreen() {
  const { t } = useScreenT(CONN_NS);
  const { isRTL } = useDirection();
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const conns = useConnections();
  const providers = useProviders();
  const actions = useConnectionActions();
  const params = useLocalSearchParams<{ connected?: string; error?: string }>();
  const [note, setNote] = useState<{
    tone: 'green' | 'red';
    text: string;
  } | null>(null);

  // back from a tool's sign-in page
  useEffect(() => {
    if (params.connected) {
      featureUsed('tools');
      setNote({
        tone: 'green',
        text: t('doneConnected', { name: t(`n_${params.connected}`) }),
      });
      actions.refresh();
    } else if (params.error) setNote({ tone: 'red', text: t('doneError') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.connected, params.error]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const byId = new Map((conns.data ?? []).map((c) => [c.provider, c]));
  const info = new Map((providers.data ?? []).map((p) => [p.id, p]));
  // connected first, then the ones you can connect, then the rest
  const sector = useMySector();
  const { t: ts } = useScreenT(SECTOR_NS);
  const [moreOpen, setMoreOpen] = useState(false);
  const mine: ToolId[] | null = sector ? SECTOR_TOOLS[sector] : null;
  const inMine = (id: ToolId) => !mine || mine.includes(id) || byId.has(id as ProviderId);
  // within your sector: connected first, then in the sector's order
  const order = [...PROVIDER_IDS].sort((a, b) => rank(a) - rank(b) || (mine ? mine.indexOf(a) - mine.indexOf(b) : 0));
  const firstGroup = order.filter(inMine);
  const moreGroup = order.filter((id) => !inMine(id));
  const soon = (mine ?? []).filter((id): id is SoonTool => (SOON_TOOLS as readonly string[]).includes(id));
  const firstConnectable = order.find((id) => !byId.has(id) && (info.get(id)?.token || info.get(id)?.configured));
  function rank(id: ProviderId) {
    if (byId.has(id)) return 0;
    if (info.get(id)?.configured) return 1;
    if (info.get(id)?.available) return 2;
    return 3;
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.screen,
          paddingTop: 20,
          gap: spacing.lg,
          paddingBottom: 40,
        }}
        refreshControl={
          <RefreshControl
            refreshing={conns.isRefetching}
            onRefresh={() => {
              conns.refetch();
              providers.refetch();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
          }}
        >
          <IconButton label={t('back')} onPress={back}>
            <ChevronLeft color={colors.text} size={22} strokeWidth={2} style={flip} />
          </IconButton>
          <AppText variant="titleLg" style={{ flex: 1 }}>
            {t('title')}
          </AppText>
        </View>
        <AppText color="textMuted">{t('subtitle')}</AppText>

        {note && (
          <Card tone={note.tone} padding={spacing.lg}>
            <AppText variant="small" weight="semibold" color={note.tone === 'green' ? 'greenText' : 'red'}>
              {note.text}
            </AppText>
          </Card>
        )}

        {(conns.isLoading || providers.isLoading) && <ActivityIndicator color={colors.primary} />}

        {/* no field picked yet: Saree3 asks, so the long tool list starts with what you use */}
        {!sector && (
          <TourTarget id="sources.sector">
            <Card padding={spacing.lg}>
              <SectorPicker />
            </Card>
          </TourTarget>
        )}
        {!!sector && (
          <TourTarget id="sources.sector">
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <AppText variant="section">{ts('yourTools', { sector: ts(`s_${sector}`) })}</AppText>
              <AppText variant="small" weight="bold" color="primary" onPress={() => router.push('/settings')}>
                {ts('change')}
              </AppText>
            </View>
          </TourTarget>
        )}

        {/* Muntej's own WhatsApp number: voice notes → tasks */}
        {inMine('whatsapp') && (
          <TourTarget id="sources.whatsapp">
            <WhatsAppCard />
          </TourTarget>
        )}

        {firstGroup.map((id) => {
          const row = (
            <ToolRow
              key={id}
              id={id}
              conn={byId.get(id)}
              available={!!info.get(id)?.available}
              configured={!!info.get(id)?.configured}
              token={!!info.get(id)?.token}
              tokenFields={info.get(id)?.tokenFields ?? ['token']}
              twoWay={!!info.get(id)?.twoWay}
              onNote={setNote}
            />
          );
          // "Show me" from the launch card lights up the first tool you can connect yourself
          return id === firstConnectable ? (
            <Spotlight key={id} id="sources.list">
              {row}
            </Spotlight>
          ) : (
            row
          );
        })}

        {/* your field's tools Muntej doesn't connect to yet */}
        {soon.map((id) => (
          <Card
            key={id}
            padding={spacing.lg}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              opacity: 0.75,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.chip,
              }}
            >
              <AppText weight="extrabold" style={{ fontSize: 18 }}>
                {ts(`tool_${id}`).slice(0, 1)}
              </AppText>
            </View>
            <AppText weight="bold" style={{ flex: 1 }}>
              {ts(`tool_${id}`)}
            </AppText>
            <AppText variant="caption" weight="bold" color="textMuted">
              {t('soon')}
            </AppText>
          </Card>
        ))}

        {/* everything else, one tap away */}
        {!!sector && (moreGroup.length > 0 || !inMine('whatsapp')) && (
          <>
            <Pressable
              onPress={() => setMoreOpen((v) => !v)}
              accessibilityRole="button"
              style={{ minHeight: sizes.touch, justifyContent: 'center' }}
            >
              <AppText weight="bold" color="primary">
                {moreOpen
                  ? ts('lessTools')
                  : ts('moreTools', {
                      n: moreGroup.length + (inMine('whatsapp') ? 0 : 1),
                    })}
              </AppText>
            </Pressable>
            {moreOpen && !inMine('whatsapp') && <WhatsAppCard />}
            {moreOpen &&
              moreGroup.map((id) => (
                <ToolRow
                  key={id}
                  id={id}
                  conn={byId.get(id)}
                  available={!!info.get(id)?.available}
                  configured={!!info.get(id)?.configured}
                  token={!!info.get(id)?.token}
                  tokenFields={info.get(id)?.tokenFields ?? ['token']}
                  twoWay={!!info.get(id)?.twoWay}
                  onNote={setNote}
                />
              ))}
          </>
        )}

        <Card style={{ gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
            }}
          >
            <Inbox color={colors.primary} size={18} strokeWidth={2} />
            <AppText weight="bold">{t('howTitle')}</AppText>
          </View>
          <AppText variant="small" color="textSoft">
            {t('how')}
          </AppText>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: spacing.sm,
            }}
          >
            <Lock color={colors.textMuted} size={14} strokeWidth={2} style={{ marginTop: 3 }} />
            <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
              {t('privacy')}
            </AppText>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToolRow({
  id,
  conn,
  available,
  configured,
  token,
  tokenFields,
  twoWay,
  onNote,
}: {
  id: ProviderId;
  conn: Connection | undefined;
  available: boolean;
  configured: boolean;
  token: boolean;
  tokenFields: string[];
  twoWay: boolean;
  onNote: (n: { tone: 'green' | 'red'; text: string } | null) => void;
}) {
  const { t } = useScreenT(CONN_NS);
  const { lang } = useDirection();
  const actions = useConnectionActions();
  const [busy, setBusy] = useState<null | 'connect' | 'sync' | 'disconnect' | 'token'>(null);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const filled = tokenFields.every((f) => (creds[f] ?? '').trim().length >= (f === 'token' ? 10 : 2));
  const b = BADGE[id];
  const name = t(`n_${id}`);
  const n = (v: number) => formatNumber(v, lang);
  const ago = (iso: string) => {
    const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
    return m < 1 ? t('justNow') : m < 60 ? t('minAgo', { n: n(m) }) : t('hAgo', { n: n(Math.round(m / 60)) });
  };
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const found = conn && conn.found_day === today ? conn.found_today : 0;

  const run = async (kind: 'connect' | 'sync' | 'disconnect' | 'token', fn: () => Promise<void>) => {
    setBusy(kind);
    onNote(null);
    try {
      await fn();
    } catch (e) {
      onNote({ tone: 'red', text: (e as Error).message || t('error') });
    } finally {
      setBusy(null);
    }
  };
  const connect = () => run('connect', () => actions.connect(id));
  const saveToken = () =>
    run('token', async () => {
      const r = await actions.connectWithToken(id, creds);
      setCreds({});
      setTokenOpen(false);
      onNote({
        tone: 'green',
        text: t('tokenDone', { name, tasks: n(r.tasks) }),
      });
    });
  const sync = () =>
    run('sync', async () => {
      const r = await actions.syncNow(id);
      onNote(
        r.error
          ? { tone: 'red', text: t('problem', { msg: r.error }) }
          : {
              tone: 'green',
              text: t('checkedResult2', {
                tasks: n(r.tasks),
                sent: n(r.sent ?? 0),
                closed: n((r.closedHere ?? 0) + (r.closedThere ?? 0)),
              }),
            },
      );
    });
  const disconnect = () => {
    const go = () => run('disconnect', () => actions.disconnect(id));
    if (Platform.OS === 'web') {
      if (window.confirm(t('confirmDisconnect', { name }))) go();
      return;
    }
    Alert.alert(name, t('confirmDisconnect', { name }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('disconnect'), style: 'destructive', onPress: go },
    ]);
  };

  const status = conn
    ? conn.status === 'error'
      ? t('problem', { msg: conn.last_error ?? '' })
      : [
          t('connectedAs', { who: conn.account_label ?? name }),
          conn.last_sync_at ? t('checked', { when: ago(conn.last_sync_at) }) : t('never'),
          found ? t('foundToday', { count: found, n: n(found) }) : null,
        ]
          .filter(Boolean)
          .join(' · ')
    : null;

  return (
    <Card style={{ gap: spacing.md, opacity: !conn && !configured ? 0.7 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconBadge size={40} bg={b.bg}>
          <AppText weight="extrabold" style={{ color: b.fg, fontSize: 18 }}>
            {b.letter}
          </AppText>
        </IconBadge>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText weight="bold">{name}</AppText>
          <AppText variant="caption" color="textMuted">
            {t(`r_${id}`)}
          </AppText>
        </View>
        {!conn && !configured && !token && (
          <View
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: 4,
              borderRadius: radius.pill,
              backgroundColor: colors.chip,
            }}
          >
            <AppText variant="micro" weight="bold" color="textMuted">
              {!available ? t('soon') : t('needsSetup')}
            </AppText>
          </View>
        )}
      </View>

      {status && (
        <AppText variant="small" weight="semibold" color={conn?.status === 'error' ? 'red' : 'greenText'}>
          {status}
        </AppText>
      )}

      {conn && <Directions id={id} conn={conn} twoWay={twoWay} onNote={onNote} />}
      {/* Google: switch Gmail / Calendar / Meet on or off for each linked account */}
      {conn && id === 'google' && (
        <TourTarget id="sources.google">
          <GoogleParts onNote={onNote} />
        </TourTarget>
      )}

      {conn ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {conn.status === 'error' ? (
            <Button label={t('reconnect')} size="md" loading={busy === 'connect'} onPress={connect} style={{ flex: 1 }} />
          ) : (
            <Button label={t('checkNow')} size="md" loading={busy === 'sync'} onPress={sync} style={{ flex: 1 }} />
          )}
          <Button
            label={t('disconnect')}
            variant="outline"
            size="md"
            loading={busy === 'disconnect'}
            onPress={disconnect}
            style={{ flex: 1 }}
          />
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {configured && <Button label={t('connect')} size="md" loading={busy === 'connect'} onPress={connect} />}
          {token && !tokenOpen && (
            <Button label={t('withToken')} variant={configured ? 'outline' : 'primary'} size="md" onPress={() => setTokenOpen(true)} />
          )}
          {token && tokenOpen && (
            // the person's own token: where to find it, paste, connect (the server checks it before saving)
            <View style={{ gap: spacing.sm }}>
              <AppText variant="small" color="textSoft">
                {t(`tokenHelp_${id}`, { defaultValue: '' })}
              </AppText>
              {tokenFields.map((f) => (
                <TextField
                  key={f}
                  label={t(`field_${f}`, { defaultValue: f })}
                  value={creds[f] ?? ''}
                  onChangeText={(v) => setCreds((c) => ({ ...c, [f]: v }))}
                  placeholder={t(`field_${f}_ph`, {
                    defaultValue: t('tokenPlaceholder'),
                  })}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={f === 'email' ? 'email-address' : 'default'}
                  secureTextEntry={f === 'token' || f === 'key'}
                  ltr
                />
              ))}
              <AppText variant="caption" color="textMuted">
                {t('tokenSafe')}
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button label={t('cancel')} variant="outline" size="md" onPress={() => setTokenOpen(false)} style={{ flex: 1 }} />
                <Button
                  label={t('tokenSave')}
                  size="md"
                  loading={busy === 'token'}
                  disabled={!filled}
                  onPress={saveToken}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

/** The two directions for a connected tool: bring tasks in / send my tasks out (+ where they go). */
function Directions({
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
function GoogleParts({ onNote }: { onNote: (n: { tone: 'green' | 'red'; text: string } | null) => void }) {
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
          {(['gmail', 'calendar', 'meet', 'chat'] as const).map((part) => {
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
