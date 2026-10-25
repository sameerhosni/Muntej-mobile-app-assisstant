// Screen 42 · Your tools (Incoming) — no mockup; v2 light style per design/TOKENS.md
// The hub: how many tasks wait for your OK (Add all / Reject all across every tool), then a tile per tool (WhatsApp,
// each connected tool, Google by part, pasted / API once something waits) with its state, what waits and when it was
// read. A tile opens that tool's own page (screen 55) with its tasks and settings. No email yet: connect it here.
// ?text= (muntej://42-incoming?text=…, shared from another app) opens the "Pasted & shared" page pre-filled.
import { SetupBar } from '@/features/onboarding/SetupBar';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, ClipboardPaste, Plug } from 'lucide-react-native';
import { AppText, Button, Card, IconBadge, IconButton } from '@/components/ui';
import { colors, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatDue } from '@/features/capture/format';
import { useIncoming, useIncomingActions } from '@/features/incoming/api';
import { NS } from '@/features/incoming/strings';
import { EmailAccounts } from '@/features/incoming/EmailAccounts';
import { useConnections } from '@/features/sources/connections';
import { useToolList, type ToolTile } from '@/features/tools/tools';
import { TOOL_NS } from '@/features/tools/strings';
import { TourTarget } from '@/features/walkthrough/TourTarget';
import { useWalkthrough } from '@/features/walkthrough/useWalkthrough';

const EMAIL_STEPS = [{ target: 'email.connect', key: 'emailConnect' }];

export default function IncomingScreen() {
  const { t } = useScreenT(NS);
  useWalkthrough('email', EMAIL_STEPS);
  const { isRTL } = useDirection();
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const params = useLocalSearchParams<{ text?: string }>();
  const incoming = useIncoming();
  const actions = useIncomingActions();
  const conns = useConnections();
  const { tiles } = useToolList();
  const hasEmail = (conns.data ?? []).some((c) => c.provider === 'google' || c.provider === 'microsoft');
  const [bulk, setBulk] = useState<'add' | 'reject' | null>(null);

  // something shared into Muntej: straight to the paste page with the text in it
  useEffect(() => {
    if (typeof params.text === 'string' && params.text)
      router.replace({ pathname: '/55-tool', params: { tool: 'pasted', text: params.text } } as unknown as Href);
  }, [params.text]);

  const waitingIds = () => (incoming.data ?? []).filter((it) => it.suggestions.some((s) => s.state === 'new')).map((it) => it.id);
  const waiting = (incoming.data ?? []).reduce((n, it) => n + it.suggestions.filter((s) => s.state === 'new').length, 0);
  const addEverything = async () => {
    setBulk('add');
    try {
      await actions.acceptEverything(waitingIds());
    } finally {
      setBulk(null);
    }
  };
  const rejectEverything = () => {
    const go = async () => {
      setBulk('reject');
      try {
        await actions.ignoreEverything(waitingIds());
      } finally {
        setBulk(null);
      }
    };
    const msg = t('rejectConfirm', { n: waiting });
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) go();
    } else Alert.alert(t('rejectEverything'), msg, [{ text: t('cancel'), style: 'cancel' }, { text: t('rejectEverything'), style: 'destructive', onPress: go }]);
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const open = (tool: string) => router.push({ pathname: '/55-tool', params: { tool } } as unknown as Href);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.screen, paddingTop: 20, gap: spacing.lg, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={incoming.isRefetching}
            onRefresh={() => {
              incoming.refetch();
              conns.refetch();
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
        <SetupBar />

        {/* everything waiting, across every tool */}
        {waiting > 0 && (
          <AppText weight="bold" color="primary">
            {t('waiting', { count: waiting, n: waiting })}
          </AppText>
        )}
        {waiting > 1 && (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label={t('addEverything', { n: waiting })} size="md" loading={bulk === 'add'} disabled={!!bulk} onPress={addEverything} style={{ flex: 1.3 }} />
            <Button label={t('rejectEverything')} variant="outline" size="md" loading={bulk === 'reject'} disabled={!!bulk} onPress={rejectEverything} style={{ flex: 1 }} />
          </View>
        )}

        {/* a tile per tool: tap for its own page */}
        <TourTarget id="email.connect">
          <View style={{ gap: spacing.md }}>
            {tiles.map((tile, i) =>
              i === 0 ? (
                <TourTarget key={tile.tool.key} id="tools.tiles">
                  <Tile tile={tile} onPress={() => open(tile.tool.key)} />
                </TourTarget>
              ) : (
                <Tile key={tile.tool.key} tile={tile} onPress={() => open(tile.tool.key)} />
              ),
            )}
            {!hasEmail && <EmailAccounts />}
          </View>
        </TourTarget>

        {/* paste a message: its own page */}
        {!tiles.some((x) => x.tool.key === 'pasted') && <LinkRow Icon={ClipboardPaste} label={t('pasteOpen')} onPress={() => open('pasted')} />}

        {/* more tools */}
        <TourTarget id="email.tools">
          <Card onPress={() => router.push('/12-sources')} accessibilityLabel={t('connectMore')} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconBadge size={40} bg="greenTint" round>
              <Plug color={colors.green} size={18} strokeWidth={2} />
            </IconBadge>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText weight="bold">{t('connectMore')}</AppText>
              <AppText variant="caption" color="textMuted">
                {t('connectMoreSub')}
              </AppText>
            </View>
          </Card>
        </TourTarget>
      </ScrollView>
    </SafeAreaView>
  );
}

/** one tool: icon · name · state dot · what waits · when it was read */
function Tile({ tile, onPress }: { tile: ToolTile; onPress: () => void }) {
  const { t } = useScreenT(TOOL_NS);
  const { isRTL, lang } = useDirection();
  const { tool, waiting, problem, lastRead, conns } = tile;
  const sub = [
    problem ? t('problem', { msg: problem }) : waiting ? t('tileWaiting', { count: waiting }) : t('tileNone'),
    !problem && tool.provider ? (lastRead ? t('read', { when: formatDue(lastRead, lang) }) : t('never')) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const label = conns.length > 1 ? `${t(`t_${tool.key}`)} · ${conns.length}` : t(`t_${tool.key}`);
  return (
    <Card onPress={onPress} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View>
        <IconBadge size={44} bg={tool.bg}>
          <AppText weight="extrabold" style={{ color: tool.fg, fontSize: 18 }}>
            {tool.letter}
          </AppText>
        </IconBadge>
        {/* green: fine · red: needs you */}
        <View
          style={{
            position: 'absolute',
            bottom: -2,
            end: -2,
            width: 14,
            height: 14,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: colors.surface,
            backgroundColor: problem ? colors.red : colors.green,
          }}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AppText weight="bold" numberOfLines={1}>
          {label}
        </AppText>
        <AppText variant="caption" color={problem ? 'red' : waiting ? 'primary' : 'textMuted'} weight={waiting ? 'bold' : 'regular'} numberOfLines={2}>
          {sub}
        </AppText>
      </View>
      <ChevronRight color={colors.textMuted} size={20} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
    </Card>
  );
}

function LinkRow({ Icon, label, onPress }: { Icon: typeof Plug; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ minHeight: sizes.touch, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Icon color={colors.primary} size={18} />
      <AppText weight="bold" color="primary">
        {label}
      </AppText>
    </Pressable>
  );
}
