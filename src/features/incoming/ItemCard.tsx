// One message a tool brought in, with the tasks Saree3 found in it: Add / Edit / Ignore each (or all at once).
// Used by Your tools (screen 42) and every tool's own page (screen 55).
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Check, CopyCheck, Pencil, X } from 'lucide-react-native';
import { AppText, Button, Card, Chip, TextField } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useTeam, type Profile } from '@/lib/api';
import { formatDue } from '@/features/capture/format';
import { contentDirection } from '@/features/chat/Bubbles';
import { FromTag } from '@/features/tasks/FromTag';
import { useIncomingActions, type IncomingItem, type Suggestion, type SuggestionEdit } from './api';
import { NS } from './strings';

export function ItemCard({ item }: { item: IncomingItem }) {
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
      {/* one line: where it came from · who sent it · when (the date and time on their own line under it) */}
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Chip label={t(`src_${item.source}`)} tone="primary" />
          <AppText weight="bold" numberOfLines={1} style={{ flex: 1 }}>
            {item.sender ?? ''}
          </AppText>
        </View>
        <AppText variant="caption" color="textMuted">
          {time}
        </AppText>
      </View>
      {!!item.summary && (
        <AppText variant="small" color="textSoft" numberOfLines={2} style={{ writingDirection: contentDirection(item.summary) }}>
          {item.summary}
        </AppText>
      )}

      <View style={{ gap: spacing.sm }}>
        {item.suggestions.map((s, i) => (
          <SuggestionRow
            key={i}
            s={s}
            from={item.sender}
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
      {/* several tasks: add them all at once; ignoring the whole message is a quiet link, not a big button */}
      {open.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          {addable.length >= 2 && (
            <Button
              label={t('acceptAll', { n: addable.length })}
              size="md"
              loading={busy === 'all'}
              onPress={() => run('all', () => actions.acceptAll(item.id))}
              style={{ flex: 1 }}
            />
          )}
          <Pressable
            onPress={() => run('ignoreAll', () => actions.ignore(item.id))}
            disabled={busy === 'ignoreAll'}
            accessibilityRole="button"
            style={{ minHeight: sizes.touch, justifyContent: 'center', paddingHorizontal: spacing.sm }}
          >
            <AppText variant="small" weight="semibold" color="textMuted">
              {busy === 'ignoreAll' ? '…' : t('ignoreAll')}
            </AppText>
          </Pressable>
        </View>
      )}
    </Card>
  );
}

function SuggestionRow({
  s,
  from,
  busy,
  onAccept,
  onIgnore,
}: {
  s: Suggestion;
  /** the message's sender, when Saree3 didn't name who asked */
  from?: string | null;
  busy: boolean;
  onAccept: (edit?: SuggestionEdit) => void;
  onIgnore: () => void;
}) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const team = useTeam();
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState(false);
  const [title, setTitle] = useState(s.title);
  const [owner, setOwner] = useState<string | null>(s.owner_id);
  const people = (team.data ?? []).filter((p) => p.status !== 'deleted');
  const nameOf = (p: Profile | undefined) => (p ? ((lang === 'ar' && p.full_name_ar) || p.full_name).split(' ')[0] : null);
  const ownerName = nameOf(people.find((p) => p.id === s.owner_id));
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
      {/* who asked for it, in the same "From" style as every task */}
      <FromTag name={s.requested_by ?? from ?? null} />
      {/* who · when · how urgent · what to send back · budget, as small chips you read at a glance */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip label={`👤 ${ownerName ?? t('noOwner')}`} />
        <Chip label={`📅 ${s.due_at ? formatDue(s.due_at, lang) : t('noDue')}`} />
        {(s.priority === 'urgent' || s.priority === 'high') && <Chip label={`${s.priority === 'urgent' ? '🔴' : '🟠'} ${t(`pr_${s.priority}`)}`} />}
        {!!s.proof_required && s.proof_required !== 'none' && <Chip label={`📎 ${t(`proof_${s.proof_required}`)}`} />}
        {!!s.budget && <Chip label={`💰 ${s.budget}`} />}
        {s.confidence < 0.5 && <Chip label={t('maybe')} />}
      </View>
      {/* the details from the email: two lines, "more" opens the rest and what "done" means */}
      {!!s.description && (
        <Pressable onPress={() => setMore((m) => !m)} accessibilityRole="button" style={{ gap: 4 }}>
          <AppText
            variant="small"
            color="textSoft"
            numberOfLines={more ? undefined : 2}
            style={{ writingDirection: contentDirection(s.description) }}
          >
            {s.description}
          </AppText>
          {more && !!s.definition_of_done && (
            <AppText variant="caption" weight="semibold" color="greenText" style={{ writingDirection: contentDirection(s.definition_of_done) }}>
              {`✓ ${s.definition_of_done}`}
            </AppText>
          )}
          <AppText variant="caption" weight="bold" color="primary">
            {more ? t('less') : t('more')}
          </AppText>
        </Pressable>
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
