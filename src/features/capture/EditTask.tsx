import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Chip, TextField } from '@/components/ui';
import { spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import type { Profile, TaskPriority } from '@/lib/api';
import type { ParsedTask } from './api';
import { dayChip, timeChip } from './format';
import { personName } from './TaskReview';

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
const HOURS = [9, 12, 14, 17];

type Props = { draft: ParsedTask; team: Profile[]; meId?: string; onChange: (next: ParsedTask) => void };

/** Edit any field of the parsed task. No native date picker: day + time chips work everywhere. */
export function EditTask({ draft, team, meId, onChange }: Props) {
  const { t } = useTranslation();
  const { lang } = useDirection();
  const set = (patch: Partial<ParsedTask>) => onChange({ ...draft, ...patch });
  const people = team.filter((p) => p.id !== meId);

  const days = useMemo(() => {
    const out: Date[] = [];
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    for (let i = 0; i < 10; i++) {
      const x = new Date(d);
      x.setDate(d.getDate() + i);
      if (x.getDay() !== 5) out.push(x); // skip Friday
    }
    return out;
  }, []);

  const due = draft.due_at ? new Date(draft.due_at) : null;
  const [hour, setHour] = useState(due?.getHours() ?? 17);

  const pickDay = (day: Date | null) => {
    if (!day) return set({ due_at: null });
    const x = new Date(day);
    x.setHours(hour, 0, 0, 0);
    set({ due_at: x.toISOString() });
  };
  const pickHour = (h: number) => {
    setHour(h);
    if (due) {
      const x = new Date(due);
      x.setHours(h, 0, 0, 0);
      set({ due_at: x.toISOString() });
    }
  };
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  return (
    <View style={{ gap: spacing.xxl + 4 }}>
      <TextField label={t('capture.title')} value={draft.title} onChangeText={(v) => set({ title: v })} />

      <Field label={t('capture.owner')}>
        <Chips>
          {people.map((p) => (
            <Chip
              key={p.id}
              label={personName(p, lang).split(' ')[0]}
              selected={draft.owner_id === p.id}
              onPress={() => set({ owner_id: p.id, helper_id: draft.helper_id === p.id ? null : draft.helper_id })}
            />
          ))}
        </Chips>
      </Field>

      <Field label={t('capture.due')}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          <Chip label={t('capture.noDate')} selected={!due} onPress={() => pickDay(null)} />
          {days.map((d) => (
            <Chip key={d.toISOString()} label={dayChip(d, lang)} selected={!!due && sameDay(d, due)} onPress={() => pickDay(d)} />
          ))}
        </ScrollView>
        {due && (
          <Chips>
            {HOURS.map((h) => (
              <Chip key={h} label={timeChip(h, lang)} selected={hour === h} onPress={() => pickHour(h)} />
            ))}
          </Chips>
        )}
      </Field>

      <Field label={t('capture.priority')}>
        <Chips>
          {PRIORITIES.map((p) => (
            <Chip key={p} label={t(`capture.p_${p}`)} selected={draft.priority === p} onPress={() => set({ priority: p })} />
          ))}
        </Chips>
      </Field>

      <Field label={t('capture.support')}>
        <Chips>
          <Chip label={t('capture.nobody')} selected={!draft.helper_id} onPress={() => set({ helper_id: null })} />
          {people
            .filter((p) => p.id !== draft.owner_id)
            .map((p) => (
              <Chip
                key={p.id}
                label={personName(p, lang).split(' ')[0]}
                selected={draft.helper_id === p.id}
                onPress={() => set({ helper_id: p.id })}
              />
            ))}
        </Chips>
      </Field>

      <TextField label={t('capture.goal')} value={draft.goal ?? ''} onChangeText={(v) => set({ goal: v || null })} />
      <TextField
        label={t('capture.dod')}
        value={draft.definition_of_done ?? ''}
        onChangeText={(v) => set({ definition_of_done: v || null })}
        multiline
      />
      <TextField label={t('capture.budget')} value={draft.budget ?? ''} onChangeText={(v) => set({ budget: v || null })} />
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm + 2 }}>
      <AppText variant="small" color="textMuted">
        {label}
      </AppText>
      {children}
    </View>
  );
}

function Chips({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View>;
}
