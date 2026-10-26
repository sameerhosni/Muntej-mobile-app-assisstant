// Screen 62 · Review your team — no mockup. The draft from Build your team (team_drafts) as a tree: who reports to
// whom, people Muntej already has (matched by email / phone / name), anything the reader wasn't sure of in yellow.
// Tap a person to fix them (name, title, mobile, email, manager, leads a team, leave out); Confirm creates everyone
// once, managers first, as you (team-import apply → upsert_person). Then: invite by email (WhatsApp invites come next).
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { AppText, Button, Card, Chip, IconButton, TimedProgress } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { useOrg, displayName } from '@/features/org/model';
import { sendInvites } from '@/features/invite/api';
import { TeamTree } from '@/features/teamImport/TeamTree';
import { applyDraft, draftPhoto, saveDraft, useDraft, type ApplyResult, type DraftPerson } from '@/features/teamImport/api';
import { TEAM_IMPORT_NS } from '@/features/teamImport/strings';

export default function TeamReviewScreen() {
  const { t } = useScreenT(TEAM_IMPORT_NS);
  const { isRTL, lang } = useDirection();
  const { id, error: back_error } = useLocalSearchParams<{ id?: string; error?: string }>();
  const draft = useDraft(id);
  const org = useOrg();
  const [people, setPeople] = useState<DraftPerson[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [invited, setInvited] = useState<number | null>(null);
  const [bigPhoto, setBigPhoto] = useState(false);
  const [inviting, setInviting] = useState(false);
  const photo = draftPhoto(id);
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
    setInviting(true);
    const ids = list.filter((p) => result.ids[p.ref] && !p.existing_id && !p.skip && (p.phone || p.email)).map((p) => result.ids[p.ref]);
    const res = await sendInvites(ids, 'auto').catch(() => []);
    setInvited(res.filter((r) => r.whatsapp === 'sent' || r.email === 'invited').length);
    setInviting(false);
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
            <TimedProgress active={inviting} expectedMs={Math.max(4000, list.length * 1500)} stages={[t('p_invite'), t('p_almost')]} />
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
            {/* the photo it was read from: check the names side by side */}
            {!!photo && (
              <Pressable onPress={() => setBigPhoto(true)} accessibilityRole="imagebutton" accessibilityLabel={t('photoHint')} style={{ gap: 4 }}>
                <Image source={{ uri: photo }} resizeMode="cover" style={{ width: '100%', height: 160, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }} />
                <AppText variant="caption" color="textMuted">
                  {t('photoHint')}
                </AppText>
              </Pressable>
            )}
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
              <TeamTree
                people={list}
                team={(org.data ?? []).map((p) => ({ id: p.id, name: displayName(p, lang) }))}
                existingName={existingName}
                onChange={update}
              />
            </Card>
          </>
        )}
      </ScrollView>

      {!result && !!kept.length && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.screen, gap: spacing.sm, backgroundColor: colors.bg }}>
          <TimedProgress active={busy} expectedMs={Math.max(4000, kept.length * 1200)} stages={[t('p_add'), t('p_link'), t('p_almost')]} />
          <Button label={busy ? t('saving') : t('confirmN', { n: n(kept.length), count: kept.length })} onPress={confirm} loading={busy} />
        </View>
      )}

      {/* the photo, big */}
      <Modal visible={bigPhoto && !!photo} transparent animationType="fade" onRequestClose={() => setBigPhoto(false)}>
        <Pressable onPress={() => setBigPhoto(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center' }} accessibilityLabel={t('done')}>
          {!!photo && <Image source={{ uri: photo }} resizeMode="contain" style={{ width: '100%', height: '90%' }} />}
        </Pressable>
      </Modal>

    </SafeAreaView>
  );
}

