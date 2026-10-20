// Cards for changes that ask first or report back (screen 02 · Muntej chat):
//   BulkCard        — the same change on many tasks; untick any, then Apply (nothing changes before that)
//   BulkDoneCard    — what Apply did (+ Undo for 5 minutes)
//   UndoRow         — Undo under a task card right after a status change
//   PeopleCard      — a new task for several people: one each / one shared / only the first
//   DuplicateCard   — a new task that looks like an open one: create anyway / update the existing / never mind
//   CreatedListCard — several tasks created at once
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { CircleCheck, Copy, Layers, ListChecks, RotateCcw, Square, SquareCheck, Users } from 'lucide-react-native';
import { AppText } from '@/components/ui';
import { colors, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import type { BulkDone, BulkProposal, CreatedItem, Duplicate, PeopleChoice } from './api';
import { contentDirection } from './Bubbles';
import { CardButton } from './TaskCard';
import { NS } from './strings';

/** open = can act now; done = acted; rejected = "Not now"; stale = never acted on */
export type AskState = 'open' | 'done' | 'rejected' | 'stale';

function useDueFmt() {
  const { lang } = useDirection();
  return useMemo(() => {
    const f = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', {
      timeZone: 'Asia/Riyadh',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    return (iso: string | null) => {
      if (!iso) return '';
      try {
        return f.format(new Date(iso));
      } catch {
        return '';
      }
    };
  }, [lang]);
}

function Shell({ open, done, children }: { open: boolean; done?: boolean; children: React.ReactNode }) {
  return (
    <View
      style={{
        maxWidth: '94%',
        alignSelf: 'stretch',
        backgroundColor: open ? colors.surface : colors.surfaceMuted,
        borderRadius: radius.tile,
        borderWidth: 1,
        borderColor: open ? colors.amber : colors.border,
        borderStartWidth: 4,
        borderStartColor: open ? colors.amber : done ? colors.green : colors.textFaint,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      {children}
    </View>
  );
}

function Header({ icon, label, color }: { icon: React.ReactNode; label: string; color: ColorToken }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon}
      <AppText variant="micro" weight="bold" color={color} style={{ flex: 1 }}>
        {label}
      </AppText>
    </View>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: colors.redTint, borderRadius: radius.md, padding: spacing.md }}>
      <AppText variant="small" weight="bold" color="red" style={{ writingDirection: contentDirection(text) }}>
        {text}
      </AppText>
    </View>
  );
}

export function BulkCard({
  proposal,
  state,
  onApply,
  onReject,
}: {
  proposal: BulkProposal;
  state: AskState;
  /** throws with a readable reason */
  onApply: (ids: string[]) => Promise<void>;
  onReject: () => void;
}) {
  const { t } = useScreenT(NS);
  const due = useDueFmt();
  const [off, setOff] = useState<Record<string, true>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = state === 'open';
  const picked = proposal.items.filter((i) => !off[i.id]);
  const danger = proposal.change.kind === 'delete';

  const apply = async () => {
    setWorking(true);
    setError(null);
    try {
      await onApply(picked.map((i) => i.id));
    } catch (e) {
      setError(t('bulkFailed', { reason: (e as Error).message || t('confirmFailed') }));
    } finally {
      setWorking(false);
    }
  };

  const label =
    state === 'done' ? t('bulkApplied') : state === 'open' ? t('bulkTitle', { count: proposal.items.length }) : t('bulkSkipped');
  return (
    <Shell open={open} done={state === 'done'}>
      <Header
        icon={
          state === 'done' ? (
            <CircleCheck color={colors.greenText} size={13} strokeWidth={2.4} />
          ) : (
            <Layers color={open ? colors.amberStrong : colors.textMuted} size={13} strokeWidth={2.4} />
          )
        }
        label={label}
        color={open ? 'amberStrong' : state === 'done' ? 'greenText' : 'textMuted'}
      />
      <AppText variant="cardTitle" weight="bold" color={open ? (danger ? 'red' : 'text') : 'textMuted'} style={{ writingDirection: contentDirection(proposal.label) }}>
        {proposal.label}
      </AppText>

      <View style={{ gap: 2 }}>
        {proposal.items.map((item) => {
          const on = !off[item.id];
          const sub = [item.owner_name, due(item.due_at)].filter(Boolean).join(' · ');
          return (
            <Pressable
              key={item.id}
              disabled={!open}
              onPress={() => setOff((o) => (o[item.id] ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== item.id)) : { ...o, [item.id]: true }))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: !open }}
              accessibilityLabel={t('bulkTick', { title: item.title })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                minHeight: sizes.touch,
                paddingVertical: 4,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              {on ? (
                <SquareCheck color={open ? colors.primary : colors.textFaint} size={20} strokeWidth={2.2} />
              ) : (
                <Square color={colors.textFaint} size={20} strokeWidth={2} />
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText
                  numberOfLines={1}
                  color={on && open ? 'text' : 'textMuted'}
                  style={{ writingDirection: contentDirection(item.title), textDecorationLine: on ? 'none' : 'line-through' }}
                >
                  {item.title}
                </AppText>
                {(!!sub || item.to_status === 'submitted') && (
                  <AppText variant="caption" color="textMuted" numberOfLines={1}>
                    {sub}
                    {item.to_status === 'submitted' ? `${sub ? ' · ' : ''}${t('bulkReview')}` : ''}
                  </AppText>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      {!!error && <ErrorBox text={error} />}

      {open && (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <CardButton label={t('bulkNotNow')} onPress={onReject} />
          <CardButton
            label={danger ? t('bulkDanger', { n: picked.length }) : t('bulkApply', { n: picked.length })}
            onPress={apply}
            busy={working}
            danger={danger}
            tone={danger ? undefined : 'green'}
          />
        </View>
      )}
    </Shell>
  );
}

/** Undo for 5 minutes after a change (hidden once used or too late). */
export function UndoRow({ until, undone, onUndo }: { until: number; undone: boolean; onUndo: () => Promise<void> }) {
  const { t } = useScreenT(NS);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (undone) {
    return (
      <AppText variant="caption" weight="bold" color="textMuted">
        {t('undone')}
      </AppText>
    );
  }
  if (Date.now() > until) return null;
  const undo = async () => {
    setWorking(true);
    setError(null);
    try {
      await onUndo();
    } catch (e) {
      setError(t('undoFailed', { reason: (e as Error).message }));
    } finally {
      setWorking(false);
    }
  };
  return (
    <View style={{ gap: spacing.xs, alignSelf: 'flex-start', minWidth: 140 }}>
      <CardButton label={t('undo')} onPress={undo} busy={working}>
        <RotateCcw color={colors.textSoft} size={14} strokeWidth={2.2} />
      </CardButton>
      {!!error && <ErrorBox text={error} />}
    </View>
  );
}

export function BulkDoneCard({ done, undone, onUndo }: { done: BulkDone; undone: boolean; onUndo: () => Promise<void> }) {
  const { t } = useScreenT(NS);
  return (
    <Shell open={false} done>
      <Header
        icon={<CircleCheck color={undone ? colors.textMuted : colors.greenText} size={13} strokeWidth={2.4} />}
        label={undone ? t('undone') : t('doneTitle', { count: done.ok })}
        color={undone ? 'textMuted' : 'greenText'}
      />
      {done.failed.slice(0, 5).map((f, i) => (
        <AppText key={i} variant="small" color="red" style={{ writingDirection: contentDirection(f.title ?? f.error) }}>
          {t('doneFailedLine', { title: f.title ?? '—', reason: f.error })}
        </AppText>
      ))}
      {!!done.log_id && done.ok > 0 && !undone && <UndoRow until={Date.parse(done.undo_until)} undone={false} onUndo={onUndo} />}
    </Shell>
  );
}

export function PeopleCard({
  choice,
  state,
  onPick,
  onReject,
}: {
  choice: PeopleChoice;
  state: AskState;
  onPick: (mode: 'separate' | 'shared', ownerIds: string[]) => Promise<void>;
  onReject: () => void;
}) {
  const { t } = useScreenT(NS);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = state === 'open';
  const first = (n: string | null) => (n ?? '').split(' ')[0];
  const ids = choice.people.map((p) => p.id);

  const pick = async (key: string, mode: 'separate' | 'shared', owners: string[]) => {
    setWorking(key);
    setError(null);
    try {
      await onPick(mode, owners);
    } catch (e) {
      setError(t('confirmFailed') + ' ' + (e as Error).message);
    } finally {
      setWorking(null);
    }
  };

  return (
    <Shell open={open} done={state === 'done'}>
      <Header
        icon={<Users color={open ? colors.amberStrong : colors.textMuted} size={13} strokeWidth={2.4} />}
        label={state === 'done' ? t('cardDone') : open ? t('peopleTitle') : t('cardSkipped')}
        color={open ? 'amberStrong' : state === 'done' ? 'greenText' : 'textMuted'}
      />
      <AppText variant="cardTitle" weight="bold" color={open ? 'text' : 'textMuted'} style={{ writingDirection: contentDirection(choice.task.title) }}>
        {choice.task.title}
      </AppText>
      <AppText variant="small" color="textSoft">
        {choice.people.map((p) => p.name).filter(Boolean).join(' · ')}
      </AppText>
      {!!error && <ErrorBox text={error} />}
      {open && (
        <View style={{ gap: spacing.sm }}>
          <CardButton label={t('peopleEach', { n: ids.length })} onPress={() => pick('each', 'separate', ids)} busy={working === 'each'} tone="green" />
          {choice.can_share && (
            <CardButton
              label={t('peopleShared', { owner: first(choice.people[0].name), helper: first(choice.people[1].name) })}
              onPress={() => pick('shared', 'shared', ids)}
              busy={working === 'shared'}
            />
          )}
          <CardButton label={t('peopleOnly', { name: first(choice.people[0].name) })} onPress={() => pick('only', 'separate', [ids[0]])} busy={working === 'only'} />
          <CardButton label={t('dupCancel')} onPress={onReject} />
        </View>
      )}
    </Shell>
  );
}

export function DuplicateCard({
  dup,
  state,
  onNew,
  onUpdate,
  onReject,
}: {
  dup: Duplicate;
  state: AskState;
  onNew: () => Promise<void>;
  onUpdate: () => Promise<void>;
  onReject: () => void;
}) {
  const { t } = useScreenT(NS);
  const due = useDueFmt();
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = state === 'open';
  const run = async (key: string, fn: () => Promise<void>) => {
    setWorking(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(t('confirmFailed') + ' ' + (e as Error).message);
    } finally {
      setWorking(null);
    }
  };
  const sub = [dup.existing.owner_name, due(dup.existing.due_at), t(`st_${dup.existing.status}`, { defaultValue: '' })].filter(Boolean).join(' · ');
  const canUpdate = Object.keys(dup.patch ?? {}).length > 0;
  return (
    <Shell open={open} done={state === 'done'}>
      <Header
        icon={<Copy color={open ? colors.amberStrong : colors.textMuted} size={13} strokeWidth={2.4} />}
        label={state === 'done' ? t('cardDone') : open ? t('dupTitle') : t('cardSkipped')}
        color={open ? 'amberStrong' : state === 'done' ? 'greenText' : 'textMuted'}
      />
      <View style={{ gap: 2 }}>
        <AppText weight="bold" color={open ? 'text' : 'textMuted'} style={{ writingDirection: contentDirection(dup.existing.title) }}>
          {dup.existing.title}
        </AppText>
        {!!sub && (
          <AppText variant="caption" color="textMuted">
            {sub}
          </AppText>
        )}
      </View>
      {!!error && <ErrorBox text={error} />}
      {open && (
        <View style={{ gap: spacing.sm }}>
          {canUpdate && <CardButton label={t('dupUpdate')} onPress={() => run('update', onUpdate)} busy={working === 'update'} tone="green" />}
          <CardButton label={t('dupNew')} onPress={() => run('new', onNew)} busy={working === 'new'} tone={canUpdate ? undefined : 'green'} />
          <CardButton label={t('dupCancel')} onPress={onReject} />
        </View>
      )}
    </Shell>
  );
}

export function CreatedListCard({ items }: { items: CreatedItem[] }) {
  const { t } = useScreenT(NS);
  const due = useDueFmt();
  return (
    <Shell open={false} done>
      <Header icon={<ListChecks color={colors.greenText} size={13} strokeWidth={2.4} />} label={t('createdList', { n: items.length })} color="greenText" />
      {items.map((i) => (
        <View key={i.id} style={{ gap: 1 }}>
          <AppText weight="semibold" numberOfLines={1} style={{ writingDirection: contentDirection(i.title) }}>
            {i.title}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {[i.owner_name, due(i.due_at)].filter(Boolean).join(' · ')}
          </AppText>
        </View>
      ))}
    </Shell>
  );
}
