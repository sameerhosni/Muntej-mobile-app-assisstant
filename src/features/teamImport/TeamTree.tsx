// Review your team's tree (owner, 28 Oct: "add lines or arrows or + and − for a better visual, like a tree"; "I can't
// update them"). Lines join each person to their manager; managers have + / − to fold their team (with how many are
// under them); tapping a person opens their details right there under them to fix (no pop-up).
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, Minus, Plus } from 'lucide-react-native';
import { AppText, Avatar, Button, Chip, TextField, Toggle } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import type { DraftPerson } from './api';
import { TEAM_IMPORT_NS } from './strings';

const STEP = 22; // width of one level of the tree
const LINE = colors.borderBlue;

type Node = { p: DraftPerson; depth: number; rails: boolean[]; last: boolean; kids: number };

export function TeamTree({
  people,
  team,
  existingName,
  onChange,
}: {
  people: DraftPerson[];
  /** people already in Muntej (to put someone under them) */
  team: { id: string; name: string }[];
  existingName: (id: string | null) => string | null;
  onChange: (ref: string, patch: Partial<DraftPerson>) => void;
}) {
  const { t } = useScreenT(TEAM_IMPORT_NS);
  const { lang } = useDirection();
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);

  // the tree: roots are people with no manager in the draft; rails[i] = a line keeps going down at level i
  const nodes = useMemo(() => {
    const refs = new Set(people.map((p) => p.ref));
    const kids = new Map<string, DraftPerson[]>();
    const roots: DraftPerson[] = [];
    for (const p of people) {
      if (p.manager_ref && refs.has(p.manager_ref) && p.manager_ref !== p.ref) kids.set(p.manager_ref, [...(kids.get(p.manager_ref) ?? []), p]);
      else roots.push(p);
    }
    const out: Node[] = [];
    const seen = new Set<string>();
    const walk = (p: DraftPerson, depth: number, rails: boolean[], last: boolean) => {
      if (seen.has(p.ref)) return;
      seen.add(p.ref);
      const k = kids.get(p.ref) ?? [];
      out.push({ p, depth, rails, last, kids: k.length });
      if (folded.has(p.ref)) {
        // still mark the folded ones as seen so they don't show up as roots
        const hide = (x: DraftPerson) => (kids.get(x.ref) ?? []).forEach((c) => (seen.add(c.ref), hide(c)));
        hide(p);
        return;
      }
      // a child's through-lines: its parent's, plus one more when the parent has siblings below it
      k.forEach((c, i) => walk(c, depth + 1, depth === 0 ? [] : [...rails, !last], i === k.length - 1));
    };
    roots.forEach((r, i) => walk(r, 0, [], i === roots.length - 1));
    people.forEach((p) => walk(p, 0, [], true)); // anything left in a loop
    return out;
  }, [people, folded]);

  const toggleFold = (ref: string) =>
    setFolded((f) => {
      const n = new Set(f);
      if (n.has(ref)) n.delete(ref);
      else n.add(ref);
      return n;
    });

  return (
    <View>
      {nodes.map(({ p, depth, rails, last, kids }, i) => {
        const outside = !p.manager_ref ? (p.manager_id ? t('underExisting', { name: existingName(p.manager_id) ?? '…' }) : t('underYou')) : null;
        const open = editing === p.ref;
        return (
          <View key={p.ref} style={{ borderTopWidth: i && depth === 0 ? 1 : 0, borderTopColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'stretch', minHeight: 60, opacity: p.skip ? 0.45 : 1 }}>
              {/* the lines: one column per level above, then the elbow to this person */}
              {Array.from({ length: depth }).map((_, level) => {
                const elbow = level === depth - 1;
                return (
                  <View key={level} style={{ width: STEP, alignItems: 'center' }}>
                    {elbow ? (
                      <>
                        <View style={{ position: 'absolute', top: 0, height: last ? '50%' : '100%', width: 2, backgroundColor: LINE }} />
                        <View style={{ position: 'absolute', top: '50%', start: STEP / 2, width: STEP / 2 + 4, height: 2, backgroundColor: LINE }} />
                      </>
                    ) : rails[level] ? (
                      <View style={{ position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: LINE }} />
                    ) : null}
                  </View>
                );
              })}
              <Pressable
                onPress={() => setEditing(open ? null : p.ref)}
                accessibilityRole="button"
                accessibilityLabel={`${t('edit')} ${p.full_name}`}
                style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, opacity: pressed ? 0.7 : 1 })}
              >
                <Avatar name={p.full_name} size={34} />
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <AppText weight="bold" numberOfLines={2}>
                    {(lang === 'ar' && p.full_name_ar) || p.full_name}
                  </AppText>
                  <AppText variant="caption" color="textMuted" numberOfLines={2}>
                    {[p.title, outside].filter(Boolean).join(' · ')}
                  </AppText>
                </View>
                {p.skip ? (
                  <Chip label={t('skipped')} />
                ) : p.unsure.length ? (
                  <CircleAlert color={colors.amberText} size={18} />
                ) : p.existing_id ? (
                  <CircleCheck color={colors.green} size={18} />
                ) : null}
                {open ? <ChevronUp color={colors.textMuted} size={18} /> : <ChevronDown color={colors.textFaint} size={18} />}
              </Pressable>
              {/* + / − folds this person's team */}
              {kids > 0 && (
                <Pressable
                  onPress={() => toggleFold(p.ref)}
                  accessibilityRole="button"
                  accessibilityLabel={folded.has(p.ref) ? t('unfold', { count: kids }) : t('fold')}
                  hitSlop={6}
                  style={{ width: sizes.touch, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View
                    style={{
                      minWidth: 30,
                      height: 30,
                      paddingHorizontal: 6,
                      borderRadius: 15,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 2,
                      backgroundColor: folded.has(p.ref) ? colors.primary : colors.primaryTint,
                    }}
                  >
                    {folded.has(p.ref) ? <Plus color={colors.onDark} size={14} strokeWidth={3} /> : <Minus color={colors.primary} size={14} strokeWidth={3} />}
                    <AppText variant="caption" weight="bold" style={{ color: folded.has(p.ref) ? colors.onDark : colors.primary }}>
                      {String(kids)}
                    </AppText>
                  </View>
                </Pressable>
              )}
            </View>
            {/* fix this person right here */}
            {open && (
              <EditPerson
                person={p}
                indent={depth * STEP}
                others={people.filter((x) => x.ref !== p.ref && !x.skip)}
                team={team}
                onChange={(patch) => onChange(p.ref, patch)}
                onDone={() => setEditing(null)}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

function EditPerson({
  person: p,
  indent,
  others,
  team,
  onChange,
  onDone,
}: {
  person: DraftPerson;
  indent: number;
  others: DraftPerson[];
  team: { id: string; name: string }[];
  onChange: (patch: Partial<DraftPerson>) => void;
  onDone: () => void;
}) {
  const { t } = useScreenT(TEAM_IMPORT_NS);
  const warn = (f: string) => (p.unsure.includes(f) ? t('check') : undefined);
  return (
    <View style={{ marginStart: indent, marginBottom: spacing.md, padding: spacing.md, gap: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }}>
      <TextField label={t('name')} value={p.full_name} onChangeText={(v) => onChange({ full_name: v })} error={warn('name')} />
      <TextField label={t('nameAr')} value={p.full_name_ar ?? ''} onChangeText={(v) => onChange({ full_name_ar: v || null })} />
      <TextField label={t('jobTitle')} value={p.title ?? ''} onChangeText={(v) => onChange({ title: v || null })} error={warn('title')} />
      <TextField label={t('phone')} value={p.phone ?? ''} onChangeText={(v) => onChange({ phone: v || null })} keyboardType="phone-pad" ltr error={warn('phone')} />
      <TextField label={t('email')} value={p.email ?? ''} onChangeText={(v) => onChange({ email: v || null })} keyboardType="email-address" autoCapitalize="none" ltr error={warn('email')} />
      <AppText weight="bold">
        {t('manager')}
        {warn('manager') ? ` · ${t('check')}` : ''}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Chip label={t('underYou')} selected={!p.manager_ref && !p.manager_id} onPress={() => onChange({ manager_ref: null, manager_id: null })} />
        {others.map((o) => (
          <Chip key={o.ref} label={o.full_name_ar || o.full_name} selected={p.manager_ref === o.ref} onPress={() => onChange({ manager_ref: o.ref, manager_id: null })} />
        ))}
        {team.slice(0, 30).map((m) => (
          <Chip key={m.id} label={m.name} tone="green" selected={!p.manager_ref && p.manager_id === m.id} onPress={() => onChange({ manager_ref: null, manager_id: m.id })} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48 }}>
        <AppText weight="bold" style={{ flex: 1 }}>
          {t('isManager')}
        </AppText>
        <Toggle value={p.role === 'manager'} onValueChange={(v) => onChange({ role: v ? 'manager' : 'employee' })} accessibilityLabel={t('isManager')} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48 }}>
        <AppText weight="bold" style={{ flex: 1 }}>
          {t('leaveOut')}
        </AppText>
        <Toggle value={!!p.skip} onValueChange={(v) => onChange({ skip: v })} accessibilityLabel={t('leaveOut')} />
      </View>
      <Button label={t('done')} size="md" onPress={onDone} />
    </View>
  );
}
