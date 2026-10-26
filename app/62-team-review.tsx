// Screen 62 · Review your team — no mockup. The draft from Build your team (team_drafts) as a tree: who reports to
// whom, people Muntej already has (matched by email / phone / name), anything the reader wasn't sure of in yellow.
// Tap a person to fix them (name, title, mobile, email, manager, leads a team, leave out); Confirm creates everyone
// once, managers first, as you (team-import apply → upsert_person). Then: invite by email (WhatsApp invites come next).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, CircleAlert, CircleCheck } from 'lucide-react-native';
import { AppText, Avatar, Button, Card, Chip, IconButton, TextField, Toggle } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { useOrg, displayName } from '@/features/org/model';
import { sendInvites } from '@/features/invite/api';
import { applyDraft, saveDraft, useDraft, type ApplyResult, type DraftPerson } from '@/features/teamImport/api';
import { TEAM_IMPORT_NS } from '@/features/teamImport/strings';

export default function TeamReviewScreen() {
  const { t } = useScreenT(TEAM_IMPORT_NS);
  const { isRTL, lang } = useDirection();
  const { id, error: back_error } = useLocalSearchParams<{ id?: string; error?: string }>();
  const draft = useDraft(id);
  const org = useOrg();
  const [people, setPeople] = useState<DraftPerson[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [invited, setInvited] = useState<number | null>(null);
  const n = (x: number) => formatNumber(x, lang);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/61-build-team' as Href));

  useEffect(() => {
    if (draft.data && !people) setPeople(draft.data.people);
  }, [draft.data, people]);
  // keep edits on the server a moment after each change
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = (ref: string, patch: Partial<DraftPerson>) =>
    setPeople((ps) => {
      const next = (ps ?? []).map((p) => (p.ref === ref ? { ...p, ...patch, unsure: patch.unsure ?? p.unsure.filter((u) => !(u in patch) && !(u === 'manager' && ('manager_ref' in patch || 'manager_id' in patch))) } : p));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => id && saveDraft(id, next), 800);
      return next;
    });

  const existingName = (pid: string | null) => {
    const p = (org.data ?? []).find((x) => x.id === pid);
    return p ? displayName(p, lang) : null;
  };

  // the tree: roots are people with no manager in the draft
  const tree = useMemo(() => {
    const list = people ?? [];
    const refs = new Set(list.map((p) => p.ref));
    const kids = new Map<string, DraftPerson[]>();
    const roots: DraftPerson[] = [];
    for (const p of list) {
      if (p.manager_ref && refs.has(p.manager_ref) && p.manager_ref !== p.ref) kids.set(p.manager_ref, [...(kids.get(p.manager_ref) ?? []), p]);
      else roots.push(p);
    }
    const out: { p: DraftPerson; depth: number }[] = [];
    const seen = new Set<string>();
    const walk = (p: DraftPerson, depth: number) => {
      if (seen.has(p.ref)) return;
      seen.add(p.ref);
      out.push({ p, depth });
      for (const k of kids.get(p.ref) ?? []) walk(k, depth + 1);
    };
    roots.forEach((r) => walk(r, 0));
    list.forEach((p) => walk(p, 0)); // anything left in a loop
    return out;
  }, [people]);

  // the directory sign-in came back without a draft
  if (!id && back_error)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.screen, gap: spacing.lg, justifyContent: 'center' }}>
        <AppText variant="titleLg">{t('dirFailed')}</AppText>
        {back_error === 'needs_admin' && <AppText color="textSoft">{t('dirNeedsAdmin')}</AppText>}
        <Button label={t('back')} onPress={() => router.replace('/61-build-team' as Href)} />
      </SafeAreaView>
    );

  if (draft.data?.status === 'applied' && !result)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.screen, gap: spacing.lg }}>
        <AppText variant="titleLg">{t('already')}</AppText>
        <Button label={t('seeTeam')} onPress={() => router.replace('/39-team' as Href)} />
      </SafeAreaView>
    );

  const list = people ?? [];
  const kept = list.filter((p) => !p.skip);
  const managers = kept.filter((p) => p.role === 'manager').length;
  const unsure = kept.filter((p) => p.unsure.length).length;
  const exists = kept.filter((p) => p.existing_id).length;
  const editingPerson = list.find((p) => p.ref === editing) ?? null;

  const confirm = async () => {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await applyDraft(id, list));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const inviteAll = async () => {
    if (!result) return;
    setBusy(true);
    // WhatsApp (a one-time join link) when there's a mobile, email otherwise
    const ids = list.filter((p) => result.ids[p.ref] && !p.existing_id && !p.skip && (p.phone || p.email)).map((p) => result.ids[p.ref]);
    const res = await sendInvites(ids, 'auto').catch(() => []);
    setInvited(res.filter((r) => r.whatsapp === 'sent' || r.email === 'invited').length);
    setBusy(false);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.screen, gap: spacing.md, paddingBottom: 120 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconButton label={t('back')} onPress={back}>
            <ChevronLeft color={colors.text} size={22} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </IconButton>
          <AppText variant="titleLg" numberOfLines={1} style={{ flex: 1 }}>
            {result ? t('resTitle') : t('rTitle')}
          </AppText>
        </View>

        {result ? (
          <Card style={{ gap: spacing.md }}>
            <AppText weight="bold">{t('resLine', { created: n(result.created), updated: n(result.updated) })}</AppText>
            {!!result.failed.length && (
              <View style={{ gap: 4 }}>
                <AppText variant="small" color="red" weight="bold">
                  {t('resFailed')}
                </AppText>
                {result.failed.map((f) => (
                  <AppText key={f.ref} variant="caption" color="textSoft">
                    • {f.name}: {f.error}
                  </AppText>
                ))}
              </View>
            )}
            {invited === null ? (
              list.some((p) => !p.existing_id && (p.phone || p.email) && !p.skip) && <Button label={t('inviteEmail')} onPress={inviteAll} loading={busy} />
            ) : (
              <AppText color="greenText" weight="semibold">
                {t('invited', { n: n(invited), count: invited })}
              </AppText>
            )}
            <Button label={t('seeTeam')} variant="outline" onPress={() => router.replace('/39-team' as Href)} />
          </Card>
        ) : (
          <>
            <AppText color="textMuted">{t('rSub', { n: n(kept.length), count: kept.length })}</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              <Chip label={t('managers', { n: n(managers), count: managers })} tone="primary" />
              {!!unsure && <Chip label={t('unsureN', { n: n(unsure), count: unsure })} tone="amber" />}
              {!!exists && <Chip label={t('existsN', { n: n(exists), count: exists })} tone="green" />}
            </View>
            {!!error && (
              <AppText variant="small" color="red">
                {error}
              </AppText>
            )}
            <Card style={{ paddingVertical: spacing.sm, gap: 0 }}>
              {tree.map(({ p, depth }, i) => {
                const outside = !p.manager_ref ? (p.manager_id ? t('underExisting', { name: existingName(p.manager_id) ?? '…' }) : t('underYou')) : null;
                return (
                  <Pressable
                    key={p.ref}
                    onPress={() => setEditing(p.ref)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('edit')} ${p.full_name}`}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      minHeight: 56,
                      paddingStart: depth * 22,
                      borderTopWidth: i ? 1 : 0,
                      borderTopColor: colors.border,
                      opacity: p.skip ? 0.45 : pressed ? 0.7 : 1,
                    })}
                  >
                    {depth > 0 && <View style={{ width: 10, height: 2, backgroundColor: colors.border }} />}
                    <Avatar name={p.full_name} size={34} />
                    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                      <AppText weight="bold" numberOfLines={1}>
                        {(lang === 'ar' && p.full_name_ar) || p.full_name}
                      </AppText>
                      <AppText variant="caption" color="textMuted" numberOfLines={1}>
                        {[p.title, outside].filter(Boolean).join(' · ')}
                      </AppText>
                    </View>
                    {p.skip ? (
                      <Chip label={t('skipped')} />
                    ) : p.unsure.length ? (
                      <CircleAlert color={colors.amberText} size={20} />
                    ) : p.existing_id ? (
                      <CircleCheck color={colors.green} size={20} />
                    ) : null}
                  </Pressable>
                );
              })}
            </Card>
          </>
        )}
      </ScrollView>

      {!result && !!kept.length && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.screen, backgroundColor: colors.bg }}>
          <Button label={busy ? t('saving') : t('confirmN', { n: n(kept.length), count: kept.length })} onPress={confirm} loading={busy} />
        </View>
      )}

      {/* edit one person */}
      <Modal visible={!!editingPerson} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <Pressable onPress={() => setEditing(null)} style={{ flex: 1, backgroundColor: 'rgba(11,26,51,0.45)' }} accessibilityLabel={t('done')} />
        {editingPerson && (
          <EditPerson
            person={editingPerson}
            others={list.filter((p) => p.ref !== editingPerson.ref && !p.skip)}
            team={(org.data ?? []).map((p) => ({ id: p.id, name: displayName(p, lang) }))}
            onChange={(patch) => update(editingPerson.ref, patch)}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

function EditPerson({
  person: p,
  others,
  team,
  onChange,
  onDone,
}: {
  person: DraftPerson;
  others: DraftPerson[];
  team: { id: string; name: string }[];
  onChange: (patch: Partial<DraftPerson>) => void;
  onDone: () => void;
}) {
  const { t } = useScreenT(TEAM_IMPORT_NS);
  const warn = (f: string) => (p.unsure.includes(f) ? t('check') : undefined);
  return (
    <View style={{ maxHeight: '88%', backgroundColor: colors.bg, borderTopLeftRadius: radius.cardLg, borderTopRightRadius: radius.cardLg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.screen, gap: spacing.md }} keyboardShouldPersistTaps="handled">
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
        <Button label={t('done')} onPress={onDone} />
      </ScrollView>
    </View>
  );
}
