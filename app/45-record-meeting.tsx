// Screen 45 · Record a meeting — no mockup; the real, simpler version of the Note Taker (design/v2/html/NoteTaker.dc.html)
// Record in the room → transcribe (same STT as voice notes) → the intake reads the transcript like a pasted
// message (source 'meeting') → the tasks wait in Incoming for Add / Ignore. Nothing becomes a task by itself
// unless Autopilot's "add sure tasks" switch is on. The audio file is deleted from the phone after upload.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Inbox, Mic, Square } from 'lucide-react-native';
import { AppText, Button, Card, IconButton } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { MicDeniedError, useVoiceRecorder } from '@/features/capture/useVoiceRecorder';
import { transcribeAudio } from '@/features/capture/api';
import { useIncomingActions } from '@/features/incoming/api';
import { MEETING_NS } from '@/features/meeting/strings';

/** ~32 kbps speech: 30 minutes stays well under the 25 MB speech-to-text limit and the server's time budget */
const MAX_MIN = 30;

type Phase = 'idle' | 'recording' | 'writing' | 'finding' | 'done';

export default function RecordMeetingScreen() {
  const { t } = useScreenT(MEETING_NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const rec = useVoiceRecorder();
  const { ingest } = useIncomingActions();
  const [phase, setPhase] = useState<Phase>('idle');
  const [found, setFound] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const mins = Math.floor(rec.durationMillis / 60_000);
  const secs = Math.floor((rec.durationMillis % 60_000) / 1000);
  const clock = `${mins}:${String(secs).padStart(2, '0')}`;

  const start = async () => {
    setError(null);
    try {
      await rec.start();
      setPhase('recording');
    } catch (e) {
      setError(e instanceof MicDeniedError ? t('micDenied') : t('failed', { reason: (e as Error).message }));
    }
  };

  const finish = async () => {
    const uri = await rec.stop();
    if (!uri) return setPhase('idle');
    try {
      setPhase('writing');
      // a long recording takes a while to write down: allow ~4 minutes
      const text = await transcribeAudio(uri, 240_000);
      setPhase('finding');
      const when = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date());
      const item = await ingest(text, 'meeting', t('subject', { when }));
      setFound(item?.suggestions?.length ?? 0);
      setPhase('done');
    } catch (e) {
      setError(t('failed', { reason: (e as Error).message }));
      setPhase('idle');
    }
  };

  const discard = async () => {
    await rec.stop();
    setPhase('idle');
  };

  // the time limit: stop by itself and carry on
  useEffect(() => {
    if (phase === 'recording' && rec.durationMillis >= MAX_MIN * 60_000) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, rec.durationMillis]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.screen, gap: spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconButton label={t('back')} onPress={back}>
          <ChevronLeft color={colors.text} size={20} strokeWidth={1.9} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </IconButton>
        <AppText variant="title" style={{ flex: 1 }}>
          {t('title')}
        </AppText>
      </View>
      <AppText color="textSoft">{t('sub')}</AppText>

      <Card style={{ alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xxl + 8 }}>
        {phase === 'writing' || phase === 'finding' ? (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <AppText weight="bold">{phase === 'writing' ? t('writing') : t('finding')}</AppText>
          </>
        ) : phase === 'done' ? (
          <>
            <Inbox color={colors.primary} size={40} strokeWidth={1.8} />
            <AppText variant="section" align="center">
              {found ? t('found', { count: found, n: found }) : t('foundNone')}
            </AppText>
            {found > 0 && <Button label={t('review')} onPress={() => router.replace('/42-incoming')} style={{ alignSelf: 'stretch' }} />}
            <Button label={t('again')} variant="outline" onPress={() => setPhase('idle')} style={{ alignSelf: 'stretch' }} />
          </>
        ) : (
          <>
            {/* the big button: start / stop; the ring grows with the voice level */}
            <Pressable
              onPress={phase === 'recording' ? finish : start}
              accessibilityRole="button"
              accessibilityLabel={phase === 'recording' ? t('stop') : t('start')}
              style={({ pressed }) => ({
                width: 132,
                height: 132,
                borderRadius: 66,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: phase === 'recording' ? colors.red : colors.primary,
                borderWidth: 10 + Math.round(rec.level * 14),
                borderColor: phase === 'recording' ? colors.redTint : colors.primaryTint,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {phase === 'recording' ? <Square color={colors.onDark} size={34} fill={colors.onDark} /> : <Mic color={colors.onDark} size={40} strokeWidth={2} />}
            </Pressable>
            {phase === 'recording' ? (
              <>
                <AppText variant="big" color="red" style={{ writingDirection: 'ltr' }}>
                  {`● ${clock}`}
                </AppText>
                <AppText weight="bold">{t('stop')}</AppText>
                <Pressable onPress={discard} accessibilityRole="button" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center', borderRadius: radius.pill }}>
                  <AppText variant="small" color="textMuted">
                    {t('cancel')}
                  </AppText>
                </Pressable>
              </>
            ) : (
              <>
                <AppText weight="bold">{t('start')}</AppText>
                <AppText variant="caption" color="textMuted">
                  {t('limit', { min: MAX_MIN })}
                </AppText>
              </>
            )}
          </>
        )}
      </Card>

      {!!error && (
        <AppText variant="small" color="red">
          {error}
        </AppText>
      )}
      <AppText variant="caption" color="textMuted">
        {t('privacy')}
      </AppText>
    </View>
  );
}
