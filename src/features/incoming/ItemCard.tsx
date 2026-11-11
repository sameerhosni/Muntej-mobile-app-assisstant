// One message a tool brought in, with the tasks Saree3 found in it: Add / Edit / Ignore each (or all at once).
// Used by Your tools (screen 42) and every tool's own page (screen 55).
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Check, CheckCheck, CopyCheck, Pencil, X } from 'lucide-react-native';
import { quickDates } from '@/features/task-detail/DetailAnswer';
import { AppText, Avatar, Button, Card, Chip, TextField } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTeam, type Profile } from '@/lib/api';
import { formatDue } from '@/features/capture/format';
import { contentDirection } from '@/features/chat/Bubbles';
import { FromTag } from '@/features/tasks/FromTag';
import { FoundFromTo } from '@/features/tasks/FromTo';
import { useFoundChoicesOn, useIncomingActions, type IncomingItem, type Suggestion, type SuggestionEdit } from './api';
import { NS } from './strings';

export function ItemCard({ item }: { item: IncomingItem }) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const actions = useIncomingActions();
  const choicesOn = useFoundChoicesOn();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      console.error('your tools action failed:', e instanceof Error ? e.message : String(e));
      setError((e as Error).message === 'moved_on' ? t('movedOn') : (e as Error).message || t('actionError'));
    } finally {
      setBusy(null);
    }
  };
  const open = item.suggestions.filter((s) => s.state === 'new');
  const addable = open.filter((s) => !s.duplicate_of);
  const time = formatDue(item.received_at, lang);
  // a meeting: one card with its title, time and who was there, then each person's tasks (owner, 8 Nov)
  const meeting = readMeeting(item.body);
  if (meeting)
    return (
      <MeetingCard
        item={item}
        meeting={meeting}
        busy={busy}
        error={error}
        run={run}
        addable={addable.length}
        open={open.length}
      />
    );

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
        {item.suggestions.map((s, i) => s.state === 'filtered' ? null : (
          <SuggestionRow
            key={i}
            s={s}
            from={item.sender}
            busy={busy === `s${i}`}
            onAccept={(edit) => run(`s${i}`, () => actions.accept(item.id, i, edit, choicesOn))}
            onIgnore={() => run(`s${i}`, () => actions.ignore(item.id, i, choicesOn))}
            onAddOwner={() => router.push({ pathname: '/39-team', params: { add: '1', name: s.owner_name ?? '', item: item.id, index: String(i) } })}
            onSetOwner={(ownerId) => run(`s${i}`, () => actions.setOwner(item.id, i, ownerId))}
            onDoneBefore={choicesOn ? () => run(`s${i}`, () => actions.doneBefore(item.id, i)) : undefined}
            onRestore={choicesOn ? () => run(`s${i}`, () => actions.restore(item.id, i)) : undefined}
                onUndo={choicesOn ? () => run(`s${i}`, () => actions.undoFound(item.id, i)) : undefined}
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

type Meeting = { title: string; start: string | null; end: string | null; people: string[] };

/** "Google Meet meeting: Title (start → end)", then who spoke, else the organiser and invitees (rooms left out) */
function readMeeting(body: string): Meeting | null {
  const head = /^Google Meet meeting(?::\s*(.+?))?\s*\(([^)→]*)→\s*([^)]*)\)/m.exec(body);
  if (!head) return null;
  const [top, ...rest] = body.split('\n\n');
  const spoke = [...rest.join('\n').matchAll(/^([^:\n[\]]{2,40}):\s/gm)].map((m) => m[1].trim());
  const listed = (top.match(/^(?:Organiser|Invited):\s*(.+)$/gm) ?? [])
    .flatMap((l) => l.replace(/^(?:Organiser|Invited):\s*/, '').split(','))
    .map((x) => x.trim())
    .filter((x) => x && !/room|قاعة|\(\d+\)/i.test(x) && !x.includes('@'));
  const people = [...new Set([...spoke, ...listed])];
  return { title: head[1]?.trim() || '', start: head[2]?.trim() || null, end: head[3]?.trim() || null, people };
}

function MeetingCard({
  item,
  meeting,
  busy,
  error,
  run,
  addable,
  open,
}: {
  item: IncomingItem;
  meeting: Meeting;
  busy: string | null;
  error: string | null;
  run: (key: string, fn: () => Promise<void>) => Promise<void>;
  addable: number;
  open: number;
}) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const actions = useIncomingActions();
  const choicesOn = useFoundChoicesOn();
  const team = useTeam();
  const me = useMyProfile();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const people = (team.data ?? []).filter((p) => p.status !== 'deleted');
  const full = (p: Profile | undefined) => (p ? (lang === 'ar' && p.full_name_ar) || p.full_name : null);
  const isMe = (name: string) => [me.data?.full_name, me.data?.full_name_ar].some((n) => n && n.toLowerCase().split(' ')[0] === name.toLowerCase().split(' ')[0]);
  const clock = (iso: string | null) =>
    iso && !Number.isNaN(Date.parse(iso))
      ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(new Date(iso))
      : '';
  const day = meeting.start && !Number.isNaN(Date.parse(meeting.start)) ? formatDue(meeting.start, lang).split(/[·,]/)[0].trim() : formatDue(item.received_at, lang);

  // each person's tasks: by the teammate, else by the name the meeting gave them, else "nobody yet"
  const groups: { key: string; name: string; you: boolean; outside: boolean; rows: { s: Suggestion; i: number }[] }[] = [];
  item.suggestions.forEach((s, i) => {
    if (s.state === 'filtered') return;
    const p = people.find((x) => x.id === s.owner_id);
    const key = s.owner_id ?? (s.owner_name ? `n:${s.owner_name}` : 'nobody');
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = {
        key,
        name: p ? (full(p) ?? '') : (s.owner_name ?? t('noOwner')),
        you: !!me.data && s.owner_id === me.data.id,
        outside: !p && !!s.owner_name,
        rows: [],
      };
      groups.push(g);
    }
    g.rows.push({ s, i });
  });
  // other people first, your own tasks last (as in the example the owner approved)
  groups.sort((a, b) => Number(a.you) - Number(b.you));
  const SHOWN = 3;

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row' }}>
          <Chip label={`📹 ${t(`src_${item.source}`)}`} tone="primary" />
        </View>
        <AppText variant="cardTitle" weight="bold" style={{ writingDirection: contentDirection(meeting.title || item.subject || '') }}>
          {meeting.title || item.subject || ''}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {[day, meeting.start && meeting.end ? `${clock(meeting.start)} – ${clock(meeting.end)}` : null].filter(Boolean).join(' · ')}
        </AppText>
        {meeting.people.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {meeting.people.map((n) => (
              <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3, paddingStart: 4, paddingEnd: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted }}>
                <Avatar name={n} size={24} />
                <AppText variant="small">{isMe(n) ? `${n} (${t('you')})` : n}</AppText>
              </View>
            ))}
          </View>
        )}
      </View>

      {groups.map((g) => {
        const more = g.rows.length - SHOWN;
        const rows = expanded[g.key] || more <= 0 ? g.rows : g.rows.slice(0, SHOWN);
        return (
          <View key={g.key} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Avatar name={g.name} size={28} />
              <AppText weight="bold" style={{ flexShrink: 1 }}>
                {g.you ? t('you') : g.name}
              </AppText>
              <View style={{ paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.primaryTint }}>
                <AppText variant="caption" weight="bold" color="primary">
                  {String(g.rows.length)}
                </AppText>
              </View>
            </View>
            {g.outside && (
              <Pressable
                onPress={() => router.push({ pathname: '/39-team', params: { add: '1', name: g.name, item: item.id, index: String(g.rows[0].i) } })}
                accessibilityRole="button"
                style={{ minHeight: sizes.touch, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.amberTint }}
              >
                <AppText variant="small" color="amberText">
                  {t('notInTeam')} · <AppText variant="small" weight="bold" color="amberText">{t('addThem')}</AppText>
                </AppText>
              </Pressable>
            )}
            {rows.map(({ s, i }) => (
              <SuggestionRow
                key={i}
                s={s}
                from={item.sender}
                compact
                busy={busy === `s${i}`}
                onAccept={(edit) => run(`s${i}`, () => actions.accept(item.id, i, edit, choicesOn))}
                onIgnore={() => run(`s${i}`, () => actions.ignore(item.id, i, choicesOn))}
                onAddOwner={() => router.push({ pathname: '/39-team', params: { add: '1', name: s.owner_name ?? '', item: item.id, index: String(i) } })}
                onSetOwner={(ownerId) => run(`s${i}`, () => actions.setOwner(item.id, i, ownerId))}
                onDoneBefore={choicesOn ? () => run(`s${i}`, () => actions.doneBefore(item.id, i)) : undefined}
                onRestore={choicesOn ? () => run(`s${i}`, () => actions.restore(item.id, i)) : undefined}
                onUndo={choicesOn ? () => run(`s${i}`, () => actions.undoFound(item.id, i)) : undefined}
              />
            ))}
            {more > 0 && !expanded[g.key] && (
              <Pressable onPress={() => setExpanded((e) => ({ ...e, [g.key]: true }))} accessibilityRole="button" style={{ minHeight: sizes.touch, justifyContent: 'center' }}>
                <AppText variant="small" weight="bold" color="primary">
                  {t('moreTasks', { count: more })}
                </AppText>
              </Pressable>
            )}
          </View>
        );
      })}

      {error && (
        <AppText variant="small" color="red">
          {error}
        </AppText>
      )}
      {open > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          {addable >= 1 && (
            <Button label={t('acceptMeeting', { n: addable })} size="md" loading={busy === 'all'} onPress={() => run('all', () => actions.acceptAll(item.id))} style={{ flex: 1 }} />
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
  compact = false,
  busy,
  onAccept,
  onIgnore,
  onAddOwner,
  onSetOwner,
  onDoneBefore,
  onRestore,
  onUndo,
}: {
  /** «رجّعها» on one just added (Add / «خلصتها قبل»): only that tap, within 5 minutes */
  onUndo?: () => void;
  /** «خلصتها قبل» (owner, 11 Nov) */
  onDoneBefore?: () => void;
  /** «رجّعها» on an ignored one */
  onRestore?: () => void;
  s: Suggestion;
  /** inside a meeting card: the person heading the group already says who, so no owner or "from" chips */
  compact?: boolean;
  /** the message's sender, when Saree3 didn't name who asked */
  from?: string | null;
  busy: boolean;
  onAccept: (edit?: SuggestionEdit) => void;
  /** the message names someone not in Muntej: add them */
  onAddOwner: () => void;
  onIgnore: () => void;
  /** give it to someone else on the team before adding it */
  onSetOwner?: (ownerId: string) => void;
}) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const team = useTeam();
  const me = useMyProfile();
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState(false);
  const [title, setTitle] = useState(s.title);
  const [owner, setOwner] = useState<string | null>(s.owner_id);
  const [due, setDue] = useState<string | null>(s.due_at);
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
      {/* who asked → who it's for, the same two boxes as every task; "To" picks someone (owner, 8 Nov) */}
      {/* (in a meeting card too, under each person: owner, 8 Nov "Add assignee near each task and also from whom") */}
      {onSetOwner && !done ? (
        <FoundFromTo from={s.requested_by ?? from ?? null} toId={s.owner_id} toName={s.owner_name} team={people} meId={me.data?.id} onPick={onSetOwner} />
      ) : (
        !compact && <FromTag name={s.requested_by ?? from ?? null} />
      )}
      {/* who · when · how urgent · what to send back · budget, as small chips you read at a glance */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {!compact && !(onSetOwner && !done) && <Chip label={`👤 ${ownerName ?? (s.owner_name ? t('outsideOwner', { name: s.owner_name }) : t('noOwner'))}`} />}
        <Chip label={`📅 ${s.due_at ? formatDue(s.due_at, lang) : t('noDue')}`} />
        {(s.priority === 'urgent' || s.priority === 'high') && <Chip label={`${s.priority === 'urgent' ? '🔴' : '🟠'} ${t(`pr_${s.priority}`)}`} />}
        {!!s.proof_required && s.proof_required !== 'none' && <Chip label={`📎 ${t(`proof_${s.proof_required}`)}`} />}
        {!!s.budget && <Chip label={`💰 ${s.budget}`} />}
        {s.confidence < 0.5 && <Chip label={t('maybe')} />}
      </View>
      {/* the message names someone who isn't in Muntej yet: add them, then the task can go to them */}
      {!compact && !done && !ownerName && !!s.owner_name && (
        <Pressable
          onPress={onAddOwner}
          accessibilityRole="link"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: sizes.touch - 8 }}
        >
          <AppText variant="caption" weight="bold" color="primary">
            {t('addOutside', { name: s.owner_name })}
          </AppText>
        </Pressable>
      )}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <AppText variant="small" weight="bold" color={s.state === 'accepted' ? 'greenText' : 'textMuted'} style={{ flexShrink: 1 }}>
            {s.state === 'accepted' ? (s.done_before ? (s.done_status === 'submitted' ? t('doneBeforeReview') : t('doneBeforeOk')) : t('added')) : t('ignored')}
          </AppText>
          {/* one tap brings it back (owner, 11 Nov): an ignored one, or one just added */}
          {((s.state === 'ignored' && !!onRestore) || (s.state === 'accepted' && !!s.task_id && !!onUndo)) && (
            <Pressable onPress={s.state === 'ignored' ? onRestore : onUndo} disabled={busy} accessibilityRole="button" hitSlop={8} style={{ minHeight: sizes.touch, justifyContent: 'center' }}>
              <AppText variant="small" weight="bold" color="primary">
                {`↩️ ${t('bringBack')}`}
              </AppText>
            </Pressable>
          )}
        </View>
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
          {/* the due date too (owner, 11 Nov): the message's own, a quick one, or none (with the new choices on) */}
          {!!onDoneBefore && (
          <AppText variant="small" weight="semibold" color="textMuted">
            {t('editDue')}
          </AppText>
          )}
          {!!onDoneBefore && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {!!s.due_at && <Chip label={formatDue(s.due_at, lang)} selected={due === s.due_at} onPress={() => setDue(s.due_at)} />}
            {quickDates().map((q) => (
              <Chip key={q.key} label={t(`d${q.key === 'in3' ? 'In3' : q.key[0].toUpperCase() + q.key.slice(1)}`)} selected={due === q.at} onPress={() => setDue(q.at)} />
            ))}
            <Chip label={t('noDate')} selected={due === null} onPress={() => setDue(null)} />
          </View>
          )}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label={t('cancel')} variant="outline" size="md" onPress={() => setEditing(false)} style={{ flex: 1 }} />
            <Button
              label={t('save')}
              size="md"
              loading={busy}
              disabled={!title.trim()}
              onPress={() => onAccept({ title, owner_id: owner, ...(onDoneBefore ? { due_at: due } : {}) })}
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
          {!!onDoneBefore && (
            <RoundIcon label={t('doneBefore')} disabled={busy} onPress={onDoneBefore}>
              <CheckCheck color={colors.greenText} size={19} />
            </RoundIcon>
          )}
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
