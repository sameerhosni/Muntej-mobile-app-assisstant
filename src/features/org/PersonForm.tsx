// Add / edit a person for screen 39 (react-hook-form + zod). Saves through upsert_person; the RPC re-checks permissions.
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ChevronDown, Plus, X } from 'lucide-react-native';
import { AppText, Avatar, Button, Card, Chip, SearchField, TextField, Toggle } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import {
  displayName,
  displayTitle,
  isAdminRole,
  managerCandidates,
  roleOptions,
  serverErrorKey,
  skillsOf,
  useUpsertPerson,
  type OrgIndex,
  type Person,
  type PersonPayload,
  type PersonRole,
  type PersonStatus,
} from './model';
import { NS } from './strings';

const num = (max: number, msg: string) =>
  z.string().refine((v) => v.trim() === '' || (/^\d+(\.\d+)?$/.test(v.trim()) && Number(v) <= max), { message: msg });

const schema = z.object({
  full_name: z.string().refine((v) => v.trim().length > 0, { message: 'e_name' }),
  full_name_ar: z.string(),
  title: z.string(),
  title_ar: z.string(),
  phone: z.string().refine((v) => /^\+?[\d\s-]*$/.test(v.trim()), { message: 'e_phone' }),
  email: z.string().refine((v) => v.trim() === '' || z.email().safeParse(v.trim()).success, { message: 'e_email' }),
  role: z.enum(['super_admin', 'admin', 'manager', 'employee']),
  manager_id: z.string().nullable(),
  weekly_capacity_hours: num(168, 'e_hours'),
  years_experience: num(60, 'e_years'),
  skills: z.array(
    z.object({
      name: z.string().refine((v) => v.trim().length > 0, { message: 'e_skill' }),
      level: z.number(),
      years: num(60, 'e_years'),
      notes: z.string(),
    }),
  ),
  whatsapp_connected: z.boolean(),
  telegram_connected: z.boolean(),
  telegram_handle: z.string(),
  status: z.enum(['active', 'pending', 'deleted']),
});

type FormValues = z.infer<typeof schema>;

export type FormMode = { kind: 'edit'; person: Person; selfOnly: boolean } | { kind: 'add'; managerId: string | null };

type Props = {
  mode: FormMode;
  me: Person | undefined;
  people: Person[];
  index: OrgIndex;
  onDone: (id: string) => void;
};

function toValues(p: Person | undefined, managerId: string | null): FormValues {
  return {
    full_name: p?.full_name ?? '',
    full_name_ar: p?.full_name_ar ?? '',
    title: p?.title ?? '',
    title_ar: p?.title_ar ?? '',
    phone: p?.phone ?? '',
    email: p?.email ?? '',
    role: p?.role ?? 'employee',
    manager_id: p ? p.manager_id : managerId,
    weekly_capacity_hours: String(p?.weekly_capacity_hours ?? 40),
    years_experience: p?.years_experience === null || p?.years_experience === undefined ? '' : String(p.years_experience),
    skills: p
      ? skillsOf(p).map((s) => ({
          name: s.name,
          level: s.level,
          years: s.years === null || s.years === undefined || Number.isNaN(s.years) ? '' : String(s.years),
          notes: s.notes ?? '',
        }))
      : [],
    whatsapp_connected: p?.whatsapp_connected ?? false,
    telegram_connected: p?.telegram_connected ?? false,
    telegram_handle: p?.telegram_handle ?? '',
    status: p?.status ?? 'pending',
  };
}

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

/** Form values → upsert_person keys (only the RPC's column names). */
function toPayload(v: FormValues, selfOnly: boolean): Record<string, unknown> {
  const skills_detail = v.skills.map((s) => ({
    name: s.name.trim(),
    level: s.level,
    years: numOrNull(s.years),
    notes: s.notes.trim() || null,
  }));
  if (selfOnly) return { skills_detail, years_experience: numOrNull(v.years_experience) };
  return {
    full_name: v.full_name.trim(),
    full_name_ar: v.full_name_ar.trim() || null,
    title: v.title.trim() || null,
    title_ar: v.title_ar.trim() || null,
    phone: v.phone.replace(/\D/g, '') || null,
    email: v.email.trim().toLowerCase() || null,
    role: v.role,
    manager_id: v.manager_id,
    weekly_capacity_hours: numOrNull(v.weekly_capacity_hours) ?? 40,
    years_experience: numOrNull(v.years_experience),
    skills_detail,
    whatsapp_connected: v.whatsapp_connected,
    telegram_connected: v.telegram_connected,
    telegram_handle: v.telegram_handle.trim().replace(/^@/, '') || null,
    status: v.status,
  };
}

export function PersonForm({ mode, me, people, index, onDone }: Props) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const upsert = useUpsertPerson();
  const [serverError, setServerError] = useState<string | null>(null);
  const editing = mode.kind === 'edit' ? mode.person : undefined;
  const selfOnly = mode.kind === 'edit' && mode.selfOnly;
  const initial = useMemo(
    () => toValues(editing, mode.kind === 'add' ? mode.managerId : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing?.id],
  );

  const { control, handleSubmit, formState, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial,
  });
  const skills = useFieldArray({ control, name: 'skills' });
  const err = (m?: string) => (m ? t(m) : undefined);

  const roles = useMemo(() => {
    const list = roleOptions(me);
    return editing && !list.includes(editing.role) ? [editing.role, ...list] : list;
  }, [me, editing]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const next = toPayload(values, selfOnly);
    let payload: PersonPayload;
    if (editing) {
      // send only what changed: the RPC changes only keys that are present
      const before = toPayload(initial, selfOnly);
      const changed = Object.fromEntries(
        Object.entries(next).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k])),
      );
      if (Object.keys(changed).length === 0) return onDone(editing.id);
      payload = { id: editing.id, ...changed };
    } else {
      payload = next;
    }
    try {
      const id = await upsert.mutateAsync(payload);
      onDone(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const key = serverErrorKey(msg);
      setServerError(key ? t(key) : t('err_generic', { msg }));
    }
  });

  const title = editing ? (selfOnly ? t('skillsTitle') : t('editTitle', { name: displayName(editing, lang) })) : t('addTitle');
  const telegramOn = watch('telegram_connected');

  return (
    <View style={{ gap: spacing.lg }}>
      <AppText variant="title">{title}</AppText>

      {!selfOnly && (
        <>
          <Controller
            control={control}
            name="full_name"
            render={({ field }) => (
              <TextField
                label={t('nameEn')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                autoCapitalize="words"
                error={err(formState.errors.full_name?.message)}
              />
            )}
          />
          <Controller
            control={control}
            name="full_name_ar"
            render={({ field }) => (
              <TextField label={t('nameAr')} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} />
            )}
          />
          <Controller
            control={control}
            name="title"
            render={({ field }) => (
              <TextField label={t('titleEn')} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} />
            )}
          />
          <Controller
            control={control}
            name="title_ar"
            render={({ field }) => (
              <TextField label={t('titleAr')} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} />
            )}
          />
          <Controller
            control={control}
            name="phone"
            render={({ field }) => (
              <TextField
                label={t('mobile')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                placeholder="9665XXXXXXXX"
                keyboardType="phone-pad"
                ltr
                error={err(formState.errors.phone?.message)}
              />
            )}
          />
          <Controller
            control={control}
            name="email"
            render={({ field }) => (
              <TextField
                label={t('email')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                placeholder="name@company.sa"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                ltr
                error={err(formState.errors.email?.message)}
              />
            )}
          />

          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <ChipGroup
                label={t('role')}
                options={roles.map((r) => ({ key: r, label: t(`role_${r}`) }))}
                value={field.value}
                onChange={(v) => field.onChange(v as PersonRole)}
              />
            )}
          />

          <Controller
            control={control}
            name="manager_id"
            render={({ field }) => (
              <ManagerPicker
                value={field.value}
                onChange={field.onChange}
                me={me}
                editingId={editing?.id}
                people={people}
                index={index}
              />
            )}
          />

          <Controller
            control={control}
            name="weekly_capacity_hours"
            render={({ field }) => (
              <TextField
                label={t('hours')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                keyboardType="decimal-pad"
                ltr
                error={err(formState.errors.weekly_capacity_hours?.message)}
              />
            )}
          />
        </>
      )}

      <Controller
        control={control}
        name="years_experience"
        render={({ field }) => (
          <TextField
            label={t('years')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            keyboardType="decimal-pad"
            ltr
            error={err(formState.errors.years_experience?.message)}
          />
        )}
      />

      <View style={{ gap: spacing.sm }}>
        <AppText variant="small" weight="semibold" color="textMuted">
          {t('skills')}
        </AppText>
        {skills.fields.map((f, i) => (
          <Card key={f.id} tone="muted" elevation="flat" padding={spacing.lg}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Controller
                  control={control}
                  name={`skills.${i}.name`}
                  render={({ field }) => (
                    <TextField
                      label={t('skillName')}
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={err(formState.errors.skills?.[i]?.name?.message)}
                    />
                  )}
                />
              </View>
              <Pressable
                onPress={() => skills.remove(i)}
                accessibilityRole="button"
                accessibilityLabel={t('removeSkill', { name: watch(`skills.${i}.name`) || t('thisSkill') })}
                style={{ width: sizes.touch, height: sizes.touch, alignItems: 'center', justifyContent: 'center', marginTop: 22 }}
              >
                <X color={colors.textMuted} size={18} strokeWidth={2.2} />
              </Pressable>
            </View>
            <Controller
              control={control}
              name={`skills.${i}.level`}
              render={({ field }) => (
                <View style={{ gap: spacing.sm }}>
                  <AppText variant="small" weight="semibold" color="textMuted">
                    {t('skillLevel')}
                  </AppText>
                  <LevelPicker value={field.value} onChange={field.onChange} labelFor={(n) => t('levelA11y', { n })} />
                </View>
              )}
            />
            <Controller
              control={control}
              name={`skills.${i}.years`}
              render={({ field }) => (
                <TextField
                  label={t('skillYearsLabel')}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  keyboardType="decimal-pad"
                  ltr
                  error={err(formState.errors.skills?.[i]?.years?.message)}
                />
              )}
            />
            <Controller
              control={control}
              name={`skills.${i}.notes`}
              render={({ field }) => (
                <TextField
                  label={t('skillNotes')}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  multiline
                />
              )}
            />
          </Card>
        ))}
        <Button
          label={t('addSkill')}
          variant="outline"
          size="md"
          icon={<Plus color={colors.primary} size={16} strokeWidth={2.2} />}
          onPress={() => skills.append({ name: '', level: 3, years: '', notes: '' })}
        />
      </View>

      {!selfOnly && (
        <>
          <Controller
            control={control}
            name="whatsapp_connected"
            render={({ field }) => (
              <ToggleRow label={t('waToggle')} value={field.value} onChange={field.onChange} />
            )}
          />
          <Controller
            control={control}
            name="telegram_connected"
            render={({ field }) => (
              <ToggleRow label={t('tgToggle')} value={field.value} onChange={field.onChange} />
            )}
          />
          {telegramOn && (
            <Controller
              control={control}
              name="telegram_handle"
              render={({ field }) => (
                <TextField
                  label={t('tgHandle')}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="@username"
                  autoCapitalize="none"
                  autoCorrect={false}
                  ltr
                />
              )}
            />
          )}
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <ChipGroup
                label={t('status')}
                options={(['active', 'pending', 'deleted'] as PersonStatus[]).map((s) => ({ key: s, label: t(`status_${s}`) }))}
                value={field.value}
                onChange={(v) => field.onChange(v as PersonStatus)}
              />
            )}
          />
        </>
      )}

      {serverError && (
        <Card tone="red" padding={spacing.lg}>
          <AppText variant="small" color="red">
            {serverError}
          </AppText>
        </Card>
      )}

      <Button label={t('save')} onPress={onSubmit} loading={formState.isSubmitting || upsert.isPending} />
    </View>
  );
}

function ChipGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="small" weight="semibold" color="textMuted">
        {label}
      </AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {options.map((o) => (
          <Chip key={o.key} label={o.label} selected={o.key === value} onPress={() => onChange(o.key)} />
        ))}
      </View>
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minHeight: sizes.touch }}>
      <AppText weight="semibold" style={{ flex: 1 }}>
        {label}
      </AppText>
      <Toggle value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

function LevelPicker({ value, onChange, labelFor }: { value: number; onChange: (n: number) => void; labelFor: (n: number) => string }) {
  return (
    <View
      accessibilityRole="radiogroup"
      style={{ flexDirection: 'row', backgroundColor: colors.track, borderRadius: radius.pill, padding: 3, gap: 2 }}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n === value;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={labelFor(n)}
            style={{
              flex: 1,
              minHeight: sizes.touch - 4,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? colors.primary : n < value ? colors.primaryTint : colors.transparent,
            }}
          >
            <AppText weight="extrabold" color={active ? 'onDark' : n < value ? 'primary' : 'textMuted'}>
              {n}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function ManagerPicker({
  value,
  onChange,
  me,
  editingId,
  people,
  index,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  me: Person | undefined;
  editingId: string | undefined;
  people: Person[];
  index: OrgIndex;
}) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const admin = isAdminRole(me?.role);
  const current = value ? index.byId.get(value) : undefined;
  const candidates = useMemo(() => managerCandidates(me, editingId, people, index.byId), [me, editingId, people, index]);
  const query = q.trim().toLowerCase();
  const matches = candidates
    .filter(
      (p) =>
        !query ||
        [p.full_name, p.full_name_ar, p.title, p.title_ar].some((s) => s?.toLowerCase().includes(query)),
    )
    .slice(0, 12);

  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setQ('');
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="small" weight="semibold" color="textMuted">
        {t('managerPick')}
      </AppText>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${t('managerPick')}: ${current ? displayName(current, lang) : t('noManager')}. ${t('changeManager')}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          minHeight: sizes.buttonHeight + 4,
          backgroundColor: colors.surface,
          borderRadius: radius.tile,
          borderWidth: 1,
          borderColor: colors.borderBlue,
          paddingHorizontal: spacing.xxl,
        }}
      >
        {current && <Avatar name={displayName(current, lang)} size={28} />}
        <AppText weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
          {current ? displayName(current, lang) : t('noManager')}
        </AppText>
        <ChevronDown color={colors.textMuted} size={18} strokeWidth={2.2} />
      </Pressable>
      {open && (
        <Card padding={spacing.md} style={{ gap: spacing.xs }}>
          <SearchField value={q} onChangeText={setQ} placeholder={t('managerSearch')} clearLabel={t('clearSearch')} />
          {admin && !query && (
            <PickRow label={t('noManager')} selected={value === null} onPress={() => pick(null)} />
          )}
          {matches.map((p) => (
            <PickRow
              key={p.id}
              label={displayName(p, lang)}
              sub={displayTitle(p, lang)}
              selected={p.id === value}
              onPress={() => pick(p.id)}
            />
          ))}
        </Card>
      )}
    </View>
  );
}

function PickRow({ label, sub, selected, onPress }: { label: string; sub?: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: sizes.touch,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.sm,
        backgroundColor: selected ? colors.primaryTint : pressed ? colors.surfaceMuted : colors.transparent,
      })}
    >
      <View style={{ flex: 1 }}>
        <AppText weight={selected ? 'bold' : 'medium'} color={selected ? 'primary' : 'text'} numberOfLines={1}>
          {label}
        </AppText>
        {!!sub && (
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {sub}
          </AppText>
        )}
      </View>
      {selected && <Check color={colors.primary} size={17} strokeWidth={2.4} />}
    </Pressable>
  );
}
