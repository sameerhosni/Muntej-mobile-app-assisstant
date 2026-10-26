// Screen 59 · Your ideas — no mockup. Owner, 26 Oct: a way for people to suggest improvements. Pick idea / problem /
// I like, type it (or use the keyboard's mic), send; below, everything you sent with its status and the team's reply.
// Opened from Saree3's menu, More and Settings with ?from=<screen> so the idea knows where it came from.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { AppText, Button, Card, Chip, IconButton, TextField } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { IDEA_KINDS, useMyIdeas, useSendIdea, type IdeaKind } from '@/features/ideas/api';
import { IDEAS_NS } from '@/features/ideas/strings';
import { STATUS_TONE } from '@/features/ideas/look';

export default function IdeasScreen() {
  const { t } = useScreenT(IDEAS_NS);
  const { isRTL, lang } = useDirection();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [kind, setKind] = useState<IdeaKind>('idea');
  const [body, setBody] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const mine = useMyIdeas();
  const send = useSendIdea();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as Href));
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' });

  const submit = () => {
    setNote(null);
    send.mutate(
      { kind, body, screen: from ? String(from) : null },
      {
        onSuccess: () => {
          setBody('');
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
            <Button label={t('send')} onPress={submit} loading={send.isPending} disabled={body.trim().length < 3} />
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
