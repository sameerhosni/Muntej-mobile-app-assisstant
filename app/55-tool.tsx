// Screen 55 · Tool — no mockup; v2 light style per design/TOKENS.md
// One page per tool (?tool=whatsapp | gmail | meet | google_chat | calendar | microsoft | jira … | pasted | api):
// its status (and "Sign in again" when it needs you), the tasks waiting from it (Add / Edit / Ignore, Add all /
// Reject all for this tool only), the tasks already added from it, its settings (Read now · How often · directions ·
// the Google part · WhatsApp number · paste box · Disconnect) and how it works. Hub: Your tools (screen 42).
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCircle, CheckCircle2, ChevronLeft, Lock } from 'lucide-react-native';
import { AppText, Button, Card, Chip, IconBadge, IconButton } from '@/components/ui';
import { colors, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useTeam } from '@/lib/api';
import { formatDue } from '@/features/capture/format';
import { useIncomingActions } from '@/features/incoming/api';
import { ItemCard } from '@/features/incoming/ItemCard';
import { PasteBox } from '@/features/incoming/PasteBox';
import { ToolCard } from '@/features/incoming/ToolCards';
import { WhatsAppCard } from '@/features/sources/WhatsAppCard';
import { useConnectionActions, useConnections, useProviders, type Connection } from '@/features/sources/connections';
import { Directions, GoogleParts } from '@/features/tools/ToolSettings';
import { ReadBar } from '@/features/tools/ReadBar';
import { connectionsFor, problemOf, toolOf, useToolItems, useToolTasks } from '@/features/tools/tools';
import { TOOL_NS } from '@/features/tools/strings';
import { TourTarget } from '@/features/walkthrough/TourTarget';

const SHOWN = 5;

export default function ToolScreen() {
  const { t } = useScreenT(TOOL_NS);
  const { isRTL, lang } = useDirection();
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const params = useLocalSearchParams<{ tool?: string; text?: string }>();
  const tool = toolOf(params.tool);
  const conns = useConnections();
  const providers = useProviders();
  const items = useToolItems(tool);
  const added = useToolTasks(items.data);
  const team = useTeam();
  const incoming = useIncomingActions();
  const connActions = useConnectionActions();
  const [note, setNote] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [bulk, setBulk] = useState<'add' | 'reject' | null>(null);
  const [allAdded, setAllAdded] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/42-incoming'));
  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <IconButton label={t('back')} onPress={back}>
        <ChevronLeft color={colors.text} size={22} strokeWidth={2} style={flip} />
      </IconButton>
      {tool && (
        <IconBadge size={40} bg={tool.bg}>
          <AppText weight="extrabold" style={{ color: tool.fg, fontSize: 18 }}>
            {tool.letter}
          </AppText>
        </IconBadge>
      )}
      <AppText variant="titleLg" style={{ flex: 1 }} numberOfLines={1}>
        {tool ? t(`t_${tool.key}`) : ''}
      </AppText>
    </View>
  );
  if (!tool)
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.screen, gap: spacing.lg }}>
        {header}
        <AppText color="textMuted">{t('notFound')}</AppText>
      </SafeAreaView>
    );

  const mine = connectionsFor(tool, conns.data ?? []);
  const info = (providers.data ?? []).find((p) => p.id === tool.provider);
  const problem = problemOf(tool, mine);
  const waitingItems = (items.data ?? []).filter((it) => it.status === 'new' && it.suggestions.some((s) => s.state === 'new'));
  const waiting = waitingItems.reduce((n, it) => n + it.suggestions.filter((s) => s.state === 'new').length, 0);
  const tasks = added.data ?? [];
  const firstName = (id: string | null) => {
    const p = (team.data ?? []).find((x) => x.id === id);
    return p ? ((lang === 'ar' && p.full_name_ar) || p.full_name).split(' ')[0] : null;
  };
  const ago = (iso: string) => formatDue(iso, lang);

  const status = tool.key === 'whatsapp' ? t('alwaysOn') : tool.key === 'pasted' ? t('pastedSub') : tool.key === 'api' ? t('apiSub') : null;
  const lastRead = mine.map((c) => c.last_sync_at).filter(Boolean).sort().at(-1) as string | undefined;

  const addAll = async () => {
    setBulk('add');
    try {
      await incoming.acceptEverything(waitingItems.map((it) => it.id));
      await items.refetch();
    } finally {
      setBulk(null);
    }
  };
  const rejectAll = () => {
    const go = async () => {
      setBulk('reject');
      try {
        await incoming.ignoreEverything(waitingItems.map((it) => it.id));
        await items.refetch();
      } finally {
        setBulk(null);
      }
    };
    const msg = t('rejectConfirm', { n: waiting, tool: t(`t_${tool.key}`) });
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) go();
    } else Alert.alert(t('rejectAll'), msg, [{ text: t('cancel'), style: 'cancel' }, { text: t('rejectAll'), style: 'destructive', onPress: go }]);
  };
  const disconnect = (c: Connection) => {
    const who = c.account_label ?? t(`t_${tool.key}`);
    const msg = tool.provider === 'google' ? t('confirmDisconnectGoogle', { who }) : t('confirmDisconnect', { who });
    const go = async () => {
      try {
        await connActions.disconnect(c.provider, c.id);
        if (mine.length <= 1) back();
      } catch (e) {
        setNote({ tone: 'red', text: (e as Error).message });
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) go();
    } else Alert.alert(t('disconnect'), msg, [{ text: t('cancel'), style: 'cancel' }, { text: t('disconnect'), style: 'destructive', onPress: go }]);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.screen, paddingTop: 20, gap: spacing.lg, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={items.isRefetching}
            onRefresh={() => {
              items.refetch();
              conns.refetch();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {header}

        {/* status: fine (accounts · last read), always on (WhatsApp), or what it needs from you */}
        {problem ? (
          <Card tone="red" padding={spacing.lg} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AlertCircle color={colors.red} size={18} />
              <AppText variant="small" weight="semibold" color="red" style={{ flex: 1 }}>
                {t('problem', { msg: problem })}
              </AppText>
            </View>
            {tool.provider && <Button label={t('reconnect')} size="md" onPress={() => connActions.connect(tool.provider!).catch(() => {})} />}
          </Card>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <CheckCircle2 color={mine.length || !tool.provider ? colors.green : colors.textMuted} size={18} />
            <AppText variant="small" weight="semibold" color={mine.length || !tool.provider ? 'greenText' : 'textMuted'} style={{ flex: 1 }}>
              {status ??
                (mine.length
                  ? [mine.map((c) => c.account_label).filter(Boolean).join(' · '), lastRead ? t('read', { when: ago(lastRead) }) : t('never')]
                      .filter(Boolean)
                      .join(' · ')
                  : t('notConnected'))}
            </AppText>
          </View>
        )}
        {tool.provider && !mine.length && !problem && (
          <Button label={t('connect')} size="md" onPress={() => connActions.connect(tool.provider!).catch(() => {})} />
        )}
        {note && (
          <Card tone={note.tone} padding={spacing.lg}>
            <AppText variant="small" weight="semibold" color={note.tone === 'green' ? 'greenText' : 'red'}>
              {note.text}
            </AppText>
          </Card>
        )}

        {/* Read now with its progress, right under the status: the tasks it finds land just below */}
        {mine.length > 0 && <ReadBar conns={mine} onRead={() => items.refetch()} />}

        {/* the paste box sits on top of its own page: it's the reason you came */}
        {tool.key === 'pasted' && <PasteBox initial={typeof params.text === 'string' ? params.text : undefined} />}

        {/* waiting for your OK, from this tool only */}
        <AppText variant="section">{t('waiting')}</AppText>
        {items.isLoading && <ActivityIndicator color={colors.primary} />}
        {!items.isLoading && waiting === 0 && (
          <AppText variant="small" color="textMuted">
            {t('nothingWaiting')}
          </AppText>
        )}
        {waiting > 1 && (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label={t('addAll', { n: waiting })} size="md" loading={bulk === 'add'} disabled={!!bulk} onPress={addAll} style={{ flex: 1.3 }} />
            <Button label={t('rejectAll')} variant="outline" size="md" loading={bulk === 'reject'} disabled={!!bulk} onPress={rejectAll} style={{ flex: 1 }} />
          </View>
        )}
        {waitingItems.map((it) => (
          <ItemCard key={it.id} item={it} />
        ))}

        {/* the tasks that came from here */}
        <AppText variant="section">{t('added')}</AppText>
        {tasks.length === 0 ? (
          <AppText variant="small" color="textMuted">
            {t('addedNone')}
          </AppText>
        ) : (
          <Card padding={spacing.sm}>
            {(allAdded ? tasks : tasks.slice(0, SHOWN)).map((x, i) => (
              <Pressable
                key={x.id}
                onPress={() => router.push({ pathname: '/14-task-detail', params: { id: x.id } })}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  minHeight: sizes.touch + 8,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.sm,
                  gap: 4,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <AppText weight="bold" numberOfLines={2}>
                  {x.title}
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <Chip label={t(`s_${x.status}`)} tone={x.status === 'done' ? 'green' : 'primary'} />
                  {!!firstName(x.owner_id) && <Chip label={`👤 ${firstName(x.owner_id)}`} />}
                  {!!x.due_at && <Chip label={`📅 ${formatDue(x.due_at, lang)}`} />}
                </View>
              </Pressable>
            ))}
            {tasks.length > SHOWN && (
              <Pressable onPress={() => setAllAdded((v) => !v)} accessibilityRole="button" style={{ minHeight: sizes.touch, justifyContent: 'center', paddingHorizontal: spacing.sm }}>
                <AppText weight="bold" color="primary">
                  {allAdded ? t('showLess') : t('showAll', { n: tasks.length })}
                </AppText>
              </Pressable>
            )}
          </Card>
        )}

        {/* settings: this tool's own */}
        {(tool.key === 'whatsapp' || mine.length > 0) && <AppText variant="section">{t('settings')}</AppText>}
        {tool.key === 'whatsapp' && (
          <TourTarget id="sources.whatsapp">
            <WhatsAppCard />
          </TourTarget>
        )}
        {mine.map((c) => (
          <View key={c.id} style={{ gap: spacing.sm }}>
            <ToolCard c={c} hideRead />
            <Button label={mine.length > 1 ? t('disconnectAccount', { who: c.account_label ?? '' }) : t('disconnect')} variant="outline" size="md" onPress={() => disconnect(c)} />
          </View>
        ))}
        {mine.length > 0 && tool.provider && tool.provider !== 'google' && (
          <Card>
            <Directions id={tool.provider} conn={mine[0]} twoWay={!!info?.twoWay} onNote={setNote} />
          </Card>
        )}
        {mine.length > 0 && tool.part && (
          <TourTarget id="sources.google">
            <Card>
              <GoogleParts onNote={setNote} part={tool.part} />
            </Card>
          </TourTarget>
        )}

        {/* how it works */}
        <Card style={{ gap: spacing.sm }}>
          <AppText weight="bold">{t('how')}</AppText>
          <AppText variant="small" color="textSoft">
            {t(`h_${tool.key}`)}
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
