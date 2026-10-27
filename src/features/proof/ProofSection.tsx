// The task page's proof block: what "done" must show (Muntej set it from the task), what's attached (tap to open),
// one-tap ways to add more (photo · camera · file · link) for the people working on it, and Muntej's check of the
// proof once it's sent in (passed / missing), so the reviewer reads a verdict instead of opening every file.
// Proof is optional unless whoever gave the task asks for it (owner, 27 Oct): they switch it on/off with the chip.
import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, CircleCheck, CircleX, FileText, Image as ImageIcon, Link2, ShieldCheck } from 'lucide-react-native';
import { AppText, Card } from '@/components/ui';
import { colors, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import type { Evidence, Profile, Review } from '@/lib/api';
import { contentDirection } from '@/features/chat/Bubbles';
import { addFile, addLink, addPhoto, canPickFile, canPickPhoto, latestCheck, openProof, proofMet, proofRequired, refreshTask, setProofRequired } from './api';
import { PROOF_NS } from './strings';

type TaskLike = { id: string; owner_id: string | null; helper_id?: string | null; assigner_id: string | null; status: string; evidence?: Evidence[]; reviews?: Review[] };

const VERDICT: Record<string, { fg: ColorToken; bg: ColorToken }> = {
  pass: { fg: 'greenText', bg: 'greenTint' },
  missing: { fg: 'amberStrong', bg: 'amberTint' },
  unclear: { fg: 'textSoft', bg: 'chip' },
};

export function ProofSection({ task, me }: { task: TaskLike; me: Profile | undefined }) {
  const { t } = useScreenT(PROOF_NS);
  const { isRTL } = useDirection();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);

  const kind = proofRequired(task);
  const items = task.evidence ?? [];
  const met = proofMet(kind, items);
  const check = latestCheck(task.reviews);
  const working = !!me && [task.owner_id, task.helper_id, task.assigner_id].includes(me.id) && !['done', 'cancelled'].includes(task.status);
  // whoever gave the task decides whether proof is needed (and it's never needed on your own to-dos)
  const canRequire = !!me && task.assigner_id === me.id && task.owner_id !== me.id && !['done', 'cancelled'].includes(task.status);
  // with proof optional, Muntej's "missing" reads as a hint, not a blocker
  const hint = kind === 'none' && check?.verdict === 'missing';
  const tone = hint ? VERDICT.unclear : VERDICT[check?.verdict ?? ''];

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refreshTask(qc, task.id);
    } catch (e) {
      const m = (e as Error).message;
      setError(m === 'permission' ? t('noPermission') : t('failed', { reason: m }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="section" style={{ flex: 1 }}>
          {t('title')}
        </AppText>
        {kind !== 'none' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: met ? colors.greenTint : colors.amberTint }}>
            {met ? <CircleCheck color={colors.greenText} size={12} strokeWidth={2.4} /> : <ShieldCheck color={colors.amberStrong} size={12} strokeWidth={2.4} />}
            <AppText variant="caption" weight="bold" color={met ? 'greenText' : 'amberStrong'}>
              {t(`need_${kind}`)}
            </AppText>
          </View>
        )}
        {kind === 'none' && !canRequire && (
          <AppText variant="caption" color="textMuted">
            {t('optional')}
          </AppText>
        )}
        {canRequire && (
          <Pressable
            onPress={() => run('require', () => setProofRequired(task.id, kind === 'none' ? 'any' : 'none'))}
            disabled={!!busy}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => ({
              minHeight: 32,
              justifyContent: 'center',
              paddingHorizontal: 12,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.borderBlue,
              opacity: pressed || busy === 'require' ? 0.6 : 1,
            })}
          >
            <AppText variant="caption" weight="bold" color="primary">
              {kind === 'none' ? t('askProof') : t('dropProof')}
            </AppText>
          </Pressable>
        )}
      </View>

      {/* what's attached */}
      {items.length ? (
        <View style={{ gap: 6 }}>
          {items.map((e) => (
            <Pressable
              key={e.id}
              onPress={() => openProof(e)}
              accessibilityRole="link"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                minHeight: sizes.touch,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              {e.type === 'image' ? (
                <ImageIcon color={colors.primary} size={16} strokeWidth={2.2} />
              ) : e.type === 'link' ? (
                <Link2 color={colors.primary} size={16} strokeWidth={2.2} />
              ) : (
                <FileText color={colors.primary} size={16} strokeWidth={2.2} />
              )}
              <AppText variant="small" numberOfLines={1} style={{ flex: 1, writingDirection: contentDirection(e.title ?? '') }}>
                {e.title ?? e.url ?? e.storage_path}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : (
        <AppText variant="small" color="textMuted">
          {t('none')}
        </AppText>
      )}

      {/* Muntej's check of the proof (after it was sent in) */}
      {!!check && (
        <Card padding={spacing.md} style={{ gap: 6, backgroundColor: colors[tone?.bg ?? 'chip'] }}>
          <AppText variant="caption" weight="extrabold" color={tone?.fg ?? 'textSoft'}>
            {`${t('checked')} · ${hint ? t('v_hint') : t(`v_${check.verdict}`)}`}
          </AppText>
          {check.passed.map((p) => (
            <View key={`p-${p}`} style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
              <CircleCheck color={colors.greenText} size={14} strokeWidth={2.4} style={{ marginTop: 2 }} />
              <AppText variant="small" style={{ flex: 1, writingDirection: contentDirection(p) }}>
                {p}
              </AppText>
            </View>
          ))}
          {check.missing.map((m) => (
            <View key={`m-${m}`} style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
              <CircleX color={hint ? colors.textMuted : colors.red} size={14} strokeWidth={2.4} style={{ marginTop: 2 }} />
              <AppText variant="small" style={{ flex: 1, writingDirection: contentDirection(m) }}>
                {m}
              </AppText>
            </View>
          ))}
        </Card>
      )}

      {/* add proof (the people working on it) */}
      {working &&
        (linkOpen ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <TextInput
              value={link}
              onChangeText={setLink}
              placeholder={t('linkPh')}
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
              style={{
                flex: 1,
                minHeight: sizes.touch,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.borderBlue,
                backgroundColor: colors.surface,
                color: colors.text,
                textAlign: isRTL ? 'right' : 'left',
                writingDirection: 'ltr',
              }}
            />
            <AddButton
              label={t('save')}
              busy={busy === 'link'}
              onPress={() =>
                link.trim() &&
                run('link', async () => {
                  await addLink(task.id, me!.id, link);
                  setLink('');
                  setLinkOpen(false);
                })
              }
            />
            <AddButton label={t('cancel')} quiet onPress={() => setLinkOpen(false)} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {canPickPhoto && (
              <>
                <AddButton label={t('camera')} icon={<Camera color={colors.primary} size={15} strokeWidth={2.2} />} busy={busy === 'camera'} onPress={() => run('camera', () => addPhoto(task.id, me!.id, 'camera'))} />
                <AddButton label={t('photo')} icon={<ImageIcon color={colors.primary} size={15} strokeWidth={2.2} />} busy={busy === 'photo'} onPress={() => run('photo', () => addPhoto(task.id, me!.id, 'library'))} />
              </>
            )}
            {canPickFile && (
              <AddButton label={t('file')} icon={<FileText color={colors.primary} size={15} strokeWidth={2.2} />} busy={busy === 'file'} onPress={() => run('file', () => addFile(task.id, me!.id))} />
            )}
            <AddButton label={t('link')} icon={<Link2 color={colors.primary} size={15} strokeWidth={2.2} />} onPress={() => setLinkOpen(true)} />
          </View>
        ))}
      {working && (!canPickPhoto || !canPickFile) && (
        <AppText variant="caption" color="textMuted">
          {t('updateApp')}
        </AppText>
      )}
      {!!error && (
        <AppText variant="small" color="red">
          {error}
        </AppText>
      )}
    </View>
  );
}

function AddButton({ label, icon, onPress, busy, quiet }: { label: string; icon?: React.ReactNode; onPress: () => void; busy?: boolean; quiet?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minHeight: sizes.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: quiet ? colors.border : colors.borderBlue,
        backgroundColor: quiet ? colors.surface : colors.primaryTint,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {busy ? <ActivityIndicator size="small" color={colors.primary} /> : icon}
      <AppText variant="small" weight="bold" color={quiet ? 'textSoft' : 'primary'}>
        {label}
      </AppText>
    </Pressable>
  );
}
