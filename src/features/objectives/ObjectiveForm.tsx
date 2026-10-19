// New / edit objective (react-hook-form + zod). Saves through upsert_objective; on edit only changed keys are sent,
// and changed dates first show "This will re-time N open tasks" (the RPC stretches them into the new window).
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AppText, Button, Card, Chip, TextField } from '@/components/ui';
import { spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTeam, type Profile } from '@/lib/api';
import { formatNumber } from '@/features/home/value';
import { useUpsertObjective, type ObjectivePayload, type ObjectiveWithOwner } from './api';
import { reportsOf } from './health';
import { NS } from './strings';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const validYmd = (v: string) => YMD.test(v.trim()) && !Number.isNaN(parseYmd(v.trim()).getTime());

const schema = z
  .object({
    title: z.string().refine((v) => v.trim().length > 0, { message: 'e_title' }),
    title_ar: z.string(),
    owner_id: z.string(),
    start: z.string().refine(validYmd, { message: 'e_date' }),
    due: z.string().refine(validYmd, { message: 'e_date' }),
    description: z.string(),
  })
  .refine((v) => !validYmd(v.start) || !validYmd(v.due) || v.due.trim() > v.start.trim(), { message: 'e_order', path: ['due'] });

type FormValues = z.infer<typeof schema>;

const pad = (n: number) => String(n).padStart(2, '0');
export function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseYmd(v: string) {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d);
}
/** Start of the day (local) for the start date; 5 PM local for the due date (end of a working day). */
const startIso = (v: string) => parseYmd(v.trim()).toISOString();
const dueIso = (v: string) => {
  const d = parseYmd(v.trim());
  d.setHours(17, 0, 0, 0);
  return d.toISOString();
};

type Quick = 'q_1w' | 'q_2w' | 'q_1m' | 'q_eoq';
const QUICK: Quick[] = ['q_1w', 'q_2w', 'q_1m', 'q_eoq'];
function quickDate(q: Quick, from: Date) {
  const d = new Date(from);
  if (q === 'q_1w') d.setDate(d.getDate() + 7);
  else if (q === 'q_2w') d.setDate(d.getDate() + 14);
  else if (q === 'q_1m') d.setMonth(d.getMonth() + 1);
  else return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 0); // last day of this quarter
  return d;
}

type Props = {
  editing?: ObjectiveWithOwner;
  /** open linked tasks with a due date (re-timed when dates change) */
  retimeCount?: number;
  onDone: (id: string) => void;
};

export function ObjectiveForm({ editing, retimeCount = 0, onDone }: Props) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const me = useMyProfile();
  const team = useTeam();
  const upsert = useUpsertObjective();
  const [serverError, setServerError] = useState<string | null>(null);

  const initial = useMemo<FormValues>(
    () => ({
      title: editing?.title ?? '',
      title_ar: editing?.title_ar ?? '',
      owner_id: editing?.owner_id ?? me.data?.id ?? '',
      start: toYmd(editing ? new Date(editing.start_at) : new Date()),
      due: editing ? toYmd(new Date(editing.due_at)) : toYmd(quickDate('q_1m', new Date())),
      description: editing?.description ?? '',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing?.id, me.data?.id],
  );

  const { control, handleSubmit, formState, setValue, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: initial,
  });

  // me + everyone under me (the RPC allows "yourself or people in your team"); keep the current owner selectable
  const owners = useMemo(() => {
    const people = team.data ?? [];
    const meP = me.data;
    const list: Profile[] = meP ? [meP, ...reportsOf(meP.id, people).filter((p) => p.status !== 'deleted')] : [];
    const current = editing?.owner_id ? people.find((p) => p.id === editing.owner_id) : undefined;
    if (current && !list.some((p) => p.id === current.id)) list.push(current);
    return list;
  }, [team.data, me.data, editing?.owner_id]);

  const start = watch('start');
  const due = watch('due');
  const datesChanged = !!editing && (start.trim() !== initial.start || due.trim() !== initial.due);
  const retiming = datesChanged && retimeCount > 0;

  const err = (m?: string) => (m ? t(m) : undefined);
  const name = (p: Profile) => ((lang === 'ar' && p.full_name_ar) || p.full_name).split(' ')[0];

  const submit = handleSubmit(async (v) => {
    setServerError(null);
    const p: ObjectivePayload = {};
    if (editing) {
      p.id = editing.id;
      if (v.title.trim() !== editing.title) p.title = v.title.trim();
      if (v.title_ar.trim() !== (editing.title_ar ?? '')) p.title_ar = v.title_ar.trim() || null;
      if (v.description.trim() !== (editing.description ?? '')) p.description = v.description.trim() || null;
      if (v.owner_id !== (editing.owner_id ?? '')) p.owner_id = v.owner_id || null;
      if (v.start.trim() !== initial.start) p.start_at = startIso(v.start);
      if (v.due.trim() !== initial.due) p.due_at = dueIso(v.due);
      // the RPC checks due > start on the merged values; send both when either moved so they stay consistent
      if (p.start_at || p.due_at) {
        p.start_at ??= editing.start_at;
        p.due_at ??= editing.due_at;
      }
    } else {
      p.title = v.title.trim();
      p.title_ar = v.title_ar.trim() || null;
      p.description = v.description.trim() || null;
      p.owner_id = v.owner_id || null;
      // today as start = "from now", so the window doesn't begin in the past
      p.start_at = v.start.trim() === toYmd(new Date()) ? new Date().toISOString() : startIso(v.start);
      p.due_at = dueIso(v.due);
    }
    try {
      const id = await upsert.mutateAsync(p);
      onDone(id);
    } catch (e) {
      setServerError(t('e_generic', { msg: e instanceof Error ? e.message : '' }));
    }
  });

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.screen, paddingBottom: 48, gap: spacing.xxl }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <AppText variant="titleLg">{editing ? t('formEdit') : t('formNew')}</AppText>

      <Controller
        control={control}
        name="title"
        render={({ field }) => (
          <TextField
            label={t('f_title')}
            placeholder={t('f_titlePh')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={err(formState.errors.title?.message)}
          />
        )}
      />
      <Controller
        control={control}
        name="title_ar"
        render={({ field }) => <TextField label={t('f_titleAr')} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} />}
      />

      <View style={{ gap: spacing.sm }}>
        <AppText variant="small" weight="semibold" color="textMuted">
          {t('f_owner')}
        </AppText>
        <Controller
          control={control}
          name="owner_id"
          render={({ field }) => (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {owners.map((p) => (
                <Chip
                  key={p.id}
                  label={p.id === me.data?.id ? t('f_me') : name(p)}
                  selected={field.value === p.id}
                  onPress={() => field.onChange(p.id)}
                />
              ))}
            </View>
          )}
        />
      </View>

      <Controller
        control={control}
        name="start"
        render={({ field }) => (
          <TextField
            label={t('f_start')}
            placeholder={t('f_datePh')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            ltr
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            error={err(formState.errors.start?.message)}
          />
        )}
      />

      <View style={{ gap: spacing.sm }}>
        <Controller
          control={control}
          name="due"
          render={({ field }) => (
            <TextField
              label={t('f_due')}
              placeholder={t('f_datePh')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              ltr
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              error={err(formState.errors.due?.message)}
            />
          )}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {QUICK.map((q) => {
            const base = validYmd(start) ? parseYmd(start.trim()) : new Date();
            const value = toYmd(quickDate(q, base));
            return (
              <Chip
                key={q}
                label={t(q)}
                selected={due.trim() === value}
                onPress={() => setValue('due', value, { shouldValidate: true, shouldDirty: true })}
              />
            );
          })}
        </View>
      </View>

      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <TextField
            label={t('f_description')}
            placeholder={t('f_descriptionPh')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            multiline
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
        )}
      />

      {retiming && (
        <Card tone="amber" padding={spacing.lg}>
          <AppText variant="small" weight="semibold" color="amberStrong">
            {t('retimeWarn', { count: retimeCount, n: formatNumber(retimeCount, lang) })}
          </AppText>
        </Card>
      )}
      {serverError && (
        <Card tone="red" padding={spacing.lg}>
          <AppText variant="small" color="red">
            {serverError}
          </AppText>
        </Card>
      )}

      <Button
        label={retiming ? t('saveAnyway') : editing ? t('save') : t('create')}
        onPress={submit}
        loading={upsert.isPending}
      />
    </ScrollView>
  );
}
