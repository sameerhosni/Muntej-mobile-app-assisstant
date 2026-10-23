// Screen 42 · Tasks from email (Incoming) — no mockup; v2 light style per design/TOKENS.md
// Your email first: connect Gmail / Outlook right here (their own sign-in, nothing to set up); opening the screen
// reads the new mail, and every task found waits below with Add task / Edit / Ignore. Pasting a message (WhatsApp,
// notes) is folded at the bottom; ?text= (muntej://42-incoming?text=…) opens it pre-filled. Other tools: Sources.
// Data: src/features/incoming/api.ts.
import { SetupBar } from '@/features/onboarding/SetupBar';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowDownUp, Check, ChevronLeft, CopyCheck, Inbox, Pencil, Plug, X } from 'lucide-react-native';
import { AppText, Button, Card, Chip, IconBadge, IconButton, TextField } from '@/components/ui';
import { colors, fontFamily, fontSize, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useTeam, type Profile } from '@/lib/api';
import { formatDue } from '@/features/capture/format';
import { contentDirection } from '@/features/chat/Bubbles';
import { useIncoming, useIncomingActions, useIncomingPages, type IncomingItem, type Suggestion, type SuggestionEdit } from '@/features/incoming/api';
import { NS } from '@/features/incoming/strings';
import { featureUsed } from '@/features/launch/launch';
import { Spotlight } from '@/features/launch/Spotlight';
import { EmailAccounts } from '@/features/incoming/EmailAccounts';
import { TourTarget } from '@/features/walkthrough/TourTarget';
import { useWalkthrough } from '@/features/walkthrough/useWalkthrough';

const EMAIL_STEPS = [
  { target: 'email.connect', key: 'emailConnect' },
  { target: 'email.add', key: 'emailAdd', demo: 'add' as const },
];

export default function IncomingScreen() {
  const { t } = useScreenT(NS);
  useWalkthrough('email', EMAIL_STEPS);
  const { isRTL } = useDirection();
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const params = useLocalSearchParams<{ text?: string }>();
  const incoming = useIncoming();
  // the list itself: newest first, 10 messages at a time
  // by date and time: newest first unless flipped
  const [newestFirst, setNewestFirst] = useState(true);
  const pages = useIncomingPages(newestFirst);
  const actions = useIncomingActions();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // the paste box stays folded unless something was shared in
  const [pasteOpen, setPasteOpen] = useState(false);

  useEffect(() => {
    if (typeof params.text === 'string' && params.text) {
      setText(params.text);
      setPasteOpen(true);
    }
  }, [params.text]);

  const find = async () => {
    setBusy(true);
    setNote(null);
    try {
      const item = await actions.ingest(text, params.text ? 'share' : 'paste');
      featureUsed('incoming');
      setText('');
      const auto = item.suggestions.filter((s) => s.auto).length;
      if (item.duplicate_message) setNote(t('sameMessage'));
      else if (!item.suggestions.length) setNote(t('foundNone'));
      else if (auto) setNote(t('autoAdded', { count: auto, n: auto }));
    } catch (e) {
      setNote((e as Error).message || t('error'));
    } finally {
      setBusy(false);
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const items = (pages.data?.pages ?? []).flat();
  const waiting = (incoming.data ?? []).reduce((n, it) => n + it.suggestions.filter((s) => s.state === 'new').length, 0);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.screen, paddingTop: 20, gap: spacing.lg, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={pages.isRefetching} onRefresh={() => pages.refetch()} tintColor={colors.primary} />}
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
        {/* your email, connected right here; opening the screen reads it, the found tasks wait below for an OK */}
        <SetupBar />
        <TourTarget id="email.connect">
          <EmailAccounts />
        </TourTarget>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText weight="bold" color="primary" style={{ flex: 1 }}>
            {waiting > 0 ? t('waiting', { count: waiting, n: waiting }) : ''}
          </AppText>
          {items.length > 1 && (
            <Pressable
              onPress={() => setNewestFirst((v) => !v)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                minHeight: sizes.touch,
                paddingHorizontal: spacing.md,
                borderRadius: radius.pill,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <ArrowDownUp color={colors.textSoft} size={14} />
              <AppText variant="small" weight="semibold" color="textSoft">
                {newestFirst ? t('newestFirst') : t('oldestFirst')}
              </AppText>
            </Pressable>
          )}
        </View>

        {pages.isLoading && <ActivityIndicator color={colors.primary} />}
        {pages.isError && (
          <Card tone="red" padding={spacing.lg}>
            <AppText variant="small" color="red">
              {t('loadError')}
            </AppText>
          </Card>
        )}
        {!pages.isLoading && !pages.isError && items.length === 0 && (
          <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl }}>
            <IconBadge size={44} bg="primaryTint" round>
              <Inbox color={colors.primary} size={20} strokeWidth={2} />
            </IconBadge>
            <AppText color="textMuted" align="center">
              {t('empty')}
            </AppText>
          </Card>
        )}
        {items.map((it, i) =>
          i === 0 ? (
            <TourTarget key={it.id} id="email.add">
              <ItemCard item={it} />
            </TourTarget>
          ) : (
            <ItemCard key={it.id} item={it} />
          ),
        )}
        {pages.hasNextPage && (
          <Button label={t('showMore')} variant="outline" size="md" loading={pages.isFetchingNextPage} onPress={() => pages.fetchNextPage()} />
        )}

        {/* paste a message instead (WhatsApp, notes…): folded until asked for; open when something was shared */}
        {!pasteOpen ? (
          <Pressable onPress={() => setPasteOpen(true)} accessibilityRole="button" style={{ minHeight: sizes.touch, justifyContent: 'center' }}>
            <AppText weight="bold" color="primary">
              {t('pasteOpen')}
            </AppText>
          </Pressable>
        ) : (
          <Spotlight id="incoming.paste">
            <Card style={{ gap: spacing.md }}>
              <AppText variant="small" weight="semibold" color="textMuted">
                {t('pasteLabel')}
              </AppText>
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                placeholder={t('pastePlaceholder')}
                placeholderTextColor={colors.textFaint}
                selectionColor={colors.primary}
                accessibilityLabel={t('pasteLabel')}
                style={{
                  minHeight: 110,
                  maxHeight: 240,
                  borderWidth: 1,
                  borderColor: colors.borderBlue,
                  borderRadius: radius.tile,
                  padding: spacing.lg,
                  color: colors.text,
                  fontSize: fontSize.body,
                  fontFamily: fontFamily.en.medium,
                  textAlignVertical: 'top',
                  writingDirection: contentDirection(text),
                  textAlign: contentDirection(text) === 'rtl' ? 'right' : 'left',
                }}
              />
              <Button label={t('find')} size="md" loading={busy} disabled={!text.trim()} onPress={find} />
              {note && (
                <AppText variant="small" color="textMuted" align="center">
                  {note}
                </AppText>
              )}
            </Card>
          </Spotlight>
        )}

        {/* other tools (Teams, Jira, ClickUp…) bring their tasks here too */}
        <Pressable
          onPress={() => router.push('/12-sources')}
          accessibilityRole="link"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            minHeight: sizes.touch,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Plug color={colors.textMuted} size={16} strokeWidth={2} />
          <AppText variant="small" weight="semibold" color="textMuted" style={{ flex: 1 }}>
            {t('connectTools')}
          </AppText>
          <ChevronLeft color={colors.textMuted} size={14} strokeWidth={2.2} style={{ transform: [{ scaleX: isRTL ? 1 : -1 }] }} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function ItemCard({ item }: { item: IncomingItem }) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const actions = useIncomingActions();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message || t('actionError'));
    } finally {
      setBusy(null);
    }
  };
  const open = item.suggestions.filter((s) => s.state === 'new');
  const addable = open.filter((s) => !s.duplicate_of);
  const time = formatDue(item.received_at, lang);

  return (
    <Card style={{ gap: spacing.md }}>
      {/* source + when it arrived (date and time, never cut), then who sent it */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Chip label={t(`src_${item.source}`)} tone="primary" />
        <AppText variant="small" weight="bold" color="textSoft" style={{ flex: 1 }}>
          {time}
        </AppText>
      </View>
      {!!item.sender && (
        <AppText variant="caption" color="textFaint" numberOfLines={1}>
          {item.sender}
        </AppText>
      )}
      {!!item.summary && (
        <AppText weight="bold" style={{ writingDirection: contentDirection(item.summary) }}>
          {item.summary}
        </AppText>
      )}

      <View style={{ gap: spacing.sm }}>
        {item.suggestions.map((s, i) => (
          <SuggestionRow
            key={i}
            s={s}
            busy={busy === `s${i}`}
            onAccept={(edit) => run(`s${i}`, () => actions.accept(item.id, i, edit))}
            onIgnore={() => run(`s${i}`, () => actions.ignore(item.id, i))}
          />
        ))}
      </View>

      {error && (
        <AppText variant="small" color="red">
          {error}
        </AppText>
      )}
      {open.length > 0 && (
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {addable.length >= 2 && (
            <Button
              label={t('acceptAll', { n: addable.length })}
              size="md"
              loading={busy === 'all'}
              onPress={() => run('all', () => actions.acceptAll(item.id))}
              style={{ flex: 1 }}
            />
          )}
          <Button
            label={t('ignoreAll')}
            variant="outline"
            size="md"
            loading={busy === 'ignoreAll'}
            onPress={() => run('ignoreAll', () => actions.ignore(item.id))}
            style={{ flex: 1 }}
          />
        </View>
      )}
    </Card>
  );
}

function SuggestionRow({
  s,
  busy,
  onAccept,
  onIgnore,
}: {
  s: Suggestion;
  busy: boolean;
  onAccept: (edit?: SuggestionEdit) => void;
  onIgnore: () => void;
}) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const team = useTeam();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(s.title);
  const [owner, setOwner] = useState<string | null>(s.owner_id);
  const people = (team.data ?? []).filter((p) => p.status !== 'deleted');
  const nameOf = (p: Profile | undefined) => (p ? ((lang === 'ar' && p.full_name_ar) || p.full_name).split(' ')[0] : null);
  const ownerName = nameOf(people.find((p) => p.id === s.owner_id));
  const meta = [ownerName ?? t('noOwner'), s.due_at ? formatDue(s.due_at, lang) : t('noDue'), t(`pr_${s.priority}`)].join(' · ');
  const done = s.state !== 'new';

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.tile,
        padding: spacing.md,
        gap: spacing.sm,
        opacity: done ? 0.6 : 1,
      }}
    >
      <AppText
        weight="bold"
        style={{ writingDirection: contentDirection(s.title), textDecorationLine: s.state === 'ignored' ? 'line-through' : 'none' }}
      >
        {s.title}
      </AppText>
      <AppText variant="caption" color="textMuted">
        {meta}
        {s.confidence < 0.5 ? ` · ${t('maybe')}` : ''}
      </AppText>
      {/* what the email said about it: the details, what "done" means, what to send back, the budget */}
      {!!s.description && (
        <AppText variant="small" color="textSoft" numberOfLines={5} style={{ writingDirection: contentDirection(s.description) }}>
          {s.description}
        </AppText>
      )}
      {!!s.definition_of_done && (
        <AppText variant="caption" weight="semibold" color="greenText" style={{ writingDirection: contentDirection(s.definition_of_done) }}>
          {`✓ ${s.definition_of_done}`}
        </AppText>
      )}
      {((!!s.proof_required && s.proof_required !== 'none') || !!s.budget) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {!!s.proof_required && s.proof_required !== 'none' && <Chip label={`📎 ${t(`proof_${s.proof_required}`)}`} />}
          {!!s.budget && <Chip label={`💰 ${s.budget}`} />}
        </View>
      )}
      {!!s.quote && !s.description && (
        <AppText variant="caption" color="textFaint" numberOfLines={2} style={{ writingDirection: contentDirection(s.quote) }}>
          “{s.quote}”
        </AppText>
      )}
      {s.duplicate_of && !done && (
        <Pressable
          onPress={() => router.push({ pathname: '/14-task-detail', params: { id: s.duplicate_of!.id } })}
          accessibilityRole="link"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: sizes.touch - 8 }}
        >
          <CopyCheck color={colors.amberText} size={14} strokeWidth={2.2} />
          <AppText variant="caption" weight="bold" color="amberText" style={{ flex: 1 }} numberOfLines={2}>
            {t('looksLike', { title: s.duplicate_of.title })} · {t('open')}
          </AppText>
        </Pressable>
      )}

      {done ? (
        <AppText variant="small" weight="bold" color={s.state === 'accepted' ? 'greenText' : 'textMuted'}>
          {s.state === 'accepted' ? t('added') : t('ignored')}
        </AppText>
      ) : editing ? (
        <View style={{ gap: spacing.md }}>
          <TextField label={t('editTitle')} value={title} onChangeText={setTitle} />
          <AppText variant="small" weight="semibold" color="textMuted">
            {t('editOwner')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Chip label={t('nobody')} selected={owner === null} onPress={() => setOwner(null)} />
            {people.map((p) => (
              <Chip key={p.id} label={nameOf(p) ?? ''} selected={owner === p.id} onPress={() => setOwner(p.id)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label={t('cancel')} variant="outline" size="md" onPress={() => setEditing(false)} style={{ flex: 1 }} />
            <Button
              label={t('save')}
              size="md"
              loading={busy}
              disabled={!title.trim()}
              onPress={() => onAccept({ title, owner_id: owner })}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : (
        // one clear "Add" (with a check), Edit and Ignore as round icon buttons: never wraps, thumb-sized
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Pressable
            onPress={() => onAccept()}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.sm,
              minHeight: sizes.touch,
              borderRadius: radius.pill,
              backgroundColor: colors.primary,
              opacity: busy ? 0.6 : pressed ? 0.85 : 1,
            })}
          >
            {busy ? <ActivityIndicator color={colors.onDark} /> : <Check color={colors.onDark} size={18} strokeWidth={2.6} />}
            <AppText weight="bold" color="onDark" numberOfLines={1}>
              {t('accept')}
            </AppText>
          </Pressable>
          <RoundIcon label={t('edit')} disabled={busy} onPress={() => setEditing(true)}>
            <Pencil color={colors.primary} size={18} />
          </RoundIcon>
          <RoundIcon label={t('ignore')} disabled={busy} onPress={onIgnore}>
            <X color={colors.textMuted} size={20} />
          </RoundIcon>
        </View>
      )}
    </View>
  );
}

function RoundIcon({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: sizes.touch,
        height: sizes.touch,
        borderRadius: sizes.touch / 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}
