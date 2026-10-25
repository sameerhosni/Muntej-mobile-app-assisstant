// Screen 12 · Sources — see design/v2/html/Sources.dc.html (Arabic: SourcesAR.dc.html); now "Connect your tools".
// Real connections (table connections + Edge Function `connect`): Connect opens the tool's own sign-in page, which
// sends the person back here (?connected=… / ?error=…). Every 10 minutes sync-sources reads what's new and passes it
// to Muntej's intake (sure tasks are added, the rest wait in Incoming). A connected tool opens its own page (screen 55:
// its tasks, Read now, settings, Disconnect); Google opens a page per part (Gmail · Meet · Chat · Calendar).
// Only the tools you've connected are listed, plus WhatsApp (owner: no "coming soon" sections). Connect email from
// Your tools (screen 42).
import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Inbox, Lock } from 'lucide-react-native';
import { AppText, Button, Card, IconBadge, IconButton, TextField } from '@/components/ui';
import { colors, radius, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { TourTarget } from '@/features/walkthrough/TourTarget';
import {
  PROVIDER_IDS,
  useConnectionActions,
  useConnections,
  useProviders,
  type Connection,
  type ProviderId,
} from '@/features/sources/connections';
import { CONN_NS } from '@/features/sources/connStrings';
import { featureUsed } from '@/features/launch/launch';
import { Spotlight } from '@/features/launch/Spotlight';
import { TOOL_NS } from '@/features/tools/strings';

const openTool = (tool: string) => router.push({ pathname: '/55-tool', params: { tool } } as unknown as Href);

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
  const { t: tt } = useScreenT(TOOL_NS);
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
  const order = [...PROVIDER_IDS].sort((a, b) => rank(a) - rank(b));
  // owner: only the tools you've connected (plus WhatsApp, Muntej's own number); nothing "coming soon"
  const firstGroup = order.filter((id) => byId.has(id));
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

        {/* Muntej's own WhatsApp number: voice notes → tasks */}
        <TourTarget id="sources.whatsapp">
          <Card onPress={() => openTool('whatsapp')} accessibilityLabel={tt('t_whatsapp')} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconBadge size={40} bg="greenTint">
              <AppText weight="extrabold" style={{ color: colors.green, fontSize: 18 }}>
                W
              </AppText>
            </IconBadge>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText weight="bold">{tt('t_whatsapp')}</AppText>
              <AppText variant="caption" color="textMuted">
                {tt('alwaysOn')}
              </AppText>
            </View>
            <Button label={tt('open')} size="md" onPress={() => openTool('whatsapp')} />
          </Card>
        </TourTarget>

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
  const { t: tt } = useScreenT(TOOL_NS);
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

      {/* connected: everything about it lives on its own page (Google: a page per part) */}
      {conn ? (
        id === 'google' ? (
          <TourTarget id="sources.google">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {(['gmail', 'meet', 'google_chat', 'calendar'] as const).map((k) => (
                <Button key={k} label={tt(`t_${k}`)} variant="outline" size="md" onPress={() => openTool(k)} />
              ))}
            </View>
          </TourTarget>
        ) : (
          <Button label={tt('open')} size="md" onPress={() => openTool(id)} />
        )
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

