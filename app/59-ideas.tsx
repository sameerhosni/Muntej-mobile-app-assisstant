// Screen 59 · Your ideas — no mockup. Owner, 26 Oct: a way for people to suggest improvements. Pick idea / problem /
// I like, type it or say it (mic → text), attach a photo or a PDF, send; below, everything you sent with its status and the team's reply.
// Opened from Saree3's menu, More and Settings with ?from=<screen> so the idea knows where it came from.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Mic, Square, X } from 'lucide-react-native';
import { AppText, Button, Card, Chip, IconButton, TextField, TimedProgress } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { IDEA_KINDS, openIdeaFile, pickIdeaFile, pickIdeaPhoto, useMyIdeas, useSendIdea, type IdeaKind, type PickedFile } from '@/features/ideas/api';
import { MicDeniedError, useVoiceRecorder } from '@/features/capture/useVoiceRecorder';
import { transcribeAudio } from '@/features/capture/api';
import { canPickFile, canPickPhoto } from '@/features/proof/api';
import { IDEAS_NS } from '@/features/ideas/strings';
import { STATUS_TONE } from '@/features/ideas/look';

export default function IdeasScreen() {
  const { t } = useScreenT(IDEAS_NS);
  const { isRTL, lang } = useDirection();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [kind, setKind] = useState<IdeaKind>('idea');
  const [body, setBody] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [listening, setListening] = useState<'off' | 'on' | 'writing'>('off');
  const [usedVoice, setUsedVoice] = useState(false);
  const voice = useVoiceRecorder();
  const mine = useMyIdeas();
  const send = useSendIdea();

  // say it: tap to start, tap to stop; what was said is added to the text
  const toggleVoice = async () => {
    setNote(null);
    try {
      if (listening === 'off') {
        await voice.start();
        setListening('on');
        return;
      }
      if (listening !== 'on') return;
      setListening('writing');
      const uri = await voice.stop();
      const said = uri ? (await transcribeAudio(uri)).trim() : '';
      if (said) {
        setBody((b) => (b.trim() ? `${b.trim()} ${said}` : said));
        setUsedVoice(true);
      }
    } catch (e) {
      setNote(e instanceof MicDeniedError ? t('micDenied') : t('failed'));
    } finally {
      setListening((l) => (l === 'on' ? 'on' : 'off'));
    }
  };

  const attach = async (pick: () => Promise<PickedFile | null>) => {
    setNote(null);
    try {
      const f = await pick();
      if (f) setFiles((fs) => [...fs, f].slice(0, 5));
    } catch {
      setNote(t('pickFailed'));
    }
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as Href));
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' });

  const submit = () => {
    setNote(null);
    send.mutate(
      { kind, body, screen: from ? String(from) : null, files, voice: usedVoice },
      {
        onSuccess: () => {
          setBody('');
          setFiles([]);
          setUsedVoice(false);
          setNote(t('sent'));
        },
        onError: () => setNote(t('failed')),
      },
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.screen, gap: spacing.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconButton label={t('back')} onPress={back}>
              <ChevronLeft color={colors.text} size={22} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </IconButton>
            <AppText variant="titleLg" numberOfLines={1} style={{ flex: 1 }}>
              {t('title')}
            </AppText>
          </View>
          <AppText color="textMuted">{t('sub')}</AppText>

          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {IDEA_KINDS.map((k) => (
                <Chip key={k} label={t(`kind_${k}`)} selected={kind === k} onPress={() => setKind(k)} />
              ))}
            </View>
            <TextField
              value={body}
              onChangeText={setBody}
              placeholder={t(`placeholder_${kind}`)}
              multiline
              maxLength={2000}
              style={{ minHeight: 110, textAlignVertical: 'top' }}
            />
            {/* say it, or attach a photo / PDF */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              <Pressable
                onPress={toggleVoice}
                disabled={listening === 'writing'}
                accessibilityRole="button"
                accessibilityLabel={listening === 'on' ? t('stopSpeak') : t('speak')}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: sizes.touch,
                  paddingHorizontal: spacing.lg,
                  borderRadius: radius.pill,
                  backgroundColor: listening === 'on' ? colors.red : colors.primaryTint,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                {listening === 'on' ? <Square color={colors.onDark} size={16} fill={colors.onDark} /> : <Mic color={colors.primary} size={18} />}
                <AppText weight="bold" style={{ color: listening === 'on' ? colors.onDark : colors.primary }}>
                  {listening === 'on' ? t('stopSpeak') : listening === 'writing' ? t('writing') : t('speak')}
                </AppText>
              </Pressable>
              {canPickPhoto && <Chip label={`🖼️ ${t('photo')}`} onPress={() => attach(pickIdeaPhoto)} />}
              {canPickFile && <Chip label={`📎 ${t('file')}`} onPress={() => attach(pickIdeaFile)} />}
            </View>
            {!!files.length && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {files.map((f, n) => (
                  <Pressable
                    key={`${f.uri}-${n}`}
                    onPress={() => setFiles((fs) => fs.filter((_, k) => k !== n))}
                    accessibilityRole="button"
                    accessibilityLabel={t('remove', { name: f.name })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.chip }}
                  >
                    <AppText variant="caption" numberOfLines={1} style={{ maxWidth: 160 }}>
                      {f.mime.startsWith('image/') ? '🖼️' : '📄'} {f.name}
                    </AppText>
                    <X color={colors.textMuted} size={14} />
                  </Pressable>
                ))}
              </View>
            )}
            <TimedProgress active={listening === 'writing'} expectedMs={6000} stages={[t('p_listening')]} />
            <TimedProgress
              active={send.isPending}
              expectedMs={2500 + files.length * 4000}
              stages={files.length ? [t('p_files'), t('p_sending')] : [t('p_sending')]}
            />
            <Button label={t('send')} onPress={submit} loading={send.isPending} disabled={body.trim().length < 3 || listening !== 'off'} />
            {!!note && (
              <AppText variant="caption" color={send.isError ? 'red' : 'greenText'}>
                {note}
              </AppText>
            )}
          </Card>

          <AppText variant="section">{t('mine')}</AppText>
          {!mine.data?.length && !mine.isLoading ? (
            <AppText color="textMuted">{t('none')}</AppText>
          ) : (
            (mine.data ?? []).map((i) => (
              <Card key={i.id} style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                  <Chip label={t(`kind_${i.kind}`)} />
                  <Chip label={t(`status_${i.status}`)} tone={STATUS_TONE[i.status]} />
                  <AppText variant="caption" color="textFaint" style={{ marginStart: 'auto' }}>
                    {date(i.created_at)}
                  </AppText>
                </View>
                <AppText>{i.body}</AppText>
                {!!i.attachments?.length && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                    {i.attachments.map((a) => (
                      <Chip key={a.path} label={`${a.mime.startsWith('image/') ? '🖼️' : '📄'} ${a.name}`} onPress={() => openIdeaFile(a)} />
                    ))}
                  </View>
                )}
                {!!i.reply && (
                  <AppText variant="small" color="primary" weight="semibold">
                    {t('reply', { text: i.reply })}
                  </AppText>
                )}
              </Card>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
