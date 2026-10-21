// Screen 12 · Sources — see design/v2/html/Sources.dc.html (Arabic: SourcesAR.dc.html); now "Connect your tools".
// Real connections (table connections + Edge Function `connect`): Connect opens the tool's own sign-in page, which
// sends the person back here (?connected=… / ?error=…). Every 10 minutes sync-sources reads what's new and passes it
// to Muntej's intake (sure tasks are added, the rest wait in Incoming). Check now / Disconnect per tool.
// Tools that aren't built yet show "Coming soon"; built ones without the server's app credentials, "Needs admin setup".
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Inbox, Lock } from 'lucide-react-native';
import { AppText, Button, Card, IconBadge, IconButton, TextField } from '@/components/ui';
import { colors, radius, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { PROVIDER_IDS, useConnectionActions, useConnections, useProviders, type Connection, type ProviderId } from '@/features/sources/connections';
import { CONN_NS } from '@/features/sources/connStrings';

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
  const [note, setNote] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  // back from a tool's sign-in page
  useEffect(() => {
    if (params.connected) {
      setNote({ tone: 'green', text: t('doneConnected', { name: t(`n_${params.connected}`) }) });
      actions.refresh();
    } else if (params.error) setNote({ tone: 'red', text: t('doneError') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.connected, params.error]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const byId = new Map((conns.data ?? []).map((c) => [c.provider, c]));
  const info = new Map((providers.data ?? []).map((p) => [p.id, p]));
  // connected first, then the ones you can connect, then the rest
  const order = [...PROVIDER_IDS].sort((a, b) => rank(a) - rank(b));
  function rank(id: ProviderId) {
    if (byId.has(id)) return 0;
    if (info.get(id)?.configured) return 1;
    if (info.get(id)?.available) return 2;
    return 3;
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.screen, paddingTop: 20, gap: spacing.lg, paddingBottom: 40 }}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
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

        {order.map((id) => (
          <ToolRow
            key={id}
            id={id}
            conn={byId.get(id)}
            available={!!info.get(id)?.available}
            configured={!!info.get(id)?.configured}
            token={!!info.get(id)?.token}
            onNote={setNote}
          />
        ))}

        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Inbox color={colors.primary} size={18} strokeWidth={2} />
            <AppText weight="bold">{t('howTitle')}</AppText>
          </View>
          <AppText variant="small" color="textSoft">
            {t('how')}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
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
  onNote,
}: {
  id: ProviderId;
  conn: Connection | undefined;
  available: boolean;
  configured: boolean;
  token: boolean;
  onNote: (n: { tone: 'green' | 'red'; text: string } | null) => void;
}) {
  const { t } = useScreenT(CONN_NS);
  const { lang } = useDirection();
  const actions = useConnectionActions();
  const [busy, setBusy] = useState<null | 'connect' | 'sync' | 'disconnect' | 'token'>(null);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenText, setTokenText] = useState('');
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
      const r = await actions.connectWithToken(id, tokenText);
      setTokenText('');
      setTokenOpen(false);
      onNote({ tone: 'green', text: t('tokenDone', { name, tasks: n(r.tasks) }) });
    });
  const sync = () =>
    run('sync', async () => {
      const r = await actions.syncNow(id);
      onNote(r.error ? { tone: 'red', text: t('problem', { msg: r.error }) } : { tone: 'green', text: t('checkedResult', { read: n(r.read), tasks: n(r.tasks) }) });
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
      : [t('connectedAs', { who: conn.account_label ?? name }), conn.last_sync_at ? t('checked', { when: ago(conn.last_sync_at) }) : t('never'), found ? t('foundToday', { count: found, n: n(found) }) : null]
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
          <View style={{ paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.chip }}>
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

      {conn ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {conn.status === 'error' ? (
            <Button label={t('reconnect')} size="md" loading={busy === 'connect'} onPress={connect} style={{ flex: 1 }} />
          ) : (
            <Button label={t('checkNow')} size="md" loading={busy === 'sync'} onPress={sync} style={{ flex: 1 }} />
          )}
          <Button label={t('disconnect')} variant="outline" size="md" loading={busy === 'disconnect'} onPress={disconnect} style={{ flex: 1 }} />
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
              <TextField
                label={t('tokenLabel')}
                value={tokenText}
                onChangeText={setTokenText}
                placeholder={t('tokenPlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                ltr
              />
              <AppText variant="caption" color="textMuted">
                {t('tokenSafe')}
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button label={t('cancel')} variant="outline" size="md" onPress={() => setTokenOpen(false)} style={{ flex: 1 }} />
                <Button label={t('tokenSave')} size="md" loading={busy === 'token'} disabled={tokenText.trim().length < 10} onPress={saveToken} style={{ flex: 1 }} />
              </View>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}
