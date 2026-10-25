// Top of a tool's page (screen 55): "Read now" with a moving bar and a live count while Saree3 reads ("Read 3
// messages…"), then the result in one line pointing at the tasks right under it. Also when the tool was last read and
// when it's read next, so the page answers "is it working?" before anything else.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import { AppText, Button, Card } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { readSince } from '@/features/incoming/api';
import { useConnectionActions, type Connection } from '@/features/sources/connections';

const en = {
  readNow: 'Read now',
  reading: 'Reading…',
  readingCount_one: 'Reading… {{count}} message so far',
  readingCount_other: 'Reading… {{count}} messages so far',
  done_one: 'Done ✓ read {{read}}, found {{count}} task: it’s just below 👇',
  done_other: 'Done ✓ read {{read}}, found {{count}} tasks: they’re just below 👇',
  doneNone: 'Done ✓ read {{read}}, nothing new for you',
  failed: 'Couldn’t read it: {{reason}}',
  last: 'Last read {{when}}',
  never: 'Not read yet',
  next: 'Next read {{when}}',
  manual: 'I read it only when you tap "Read now"',
  justNow: 'just now',
  minAgo: '{{n}} min ago',
  hAgo: '{{n}} h ago',
  inMin: 'in {{n}} min',
};
const ar: typeof en & Record<string, string> = {
  readNow: 'اقرا الحين',
  reading: 'أقرا…',
  readingCount_one: 'أقرا… قريت رسالة وحدة للحين',
  readingCount_two: 'أقرا… قريت رسالتين للحين',
  readingCount_few: 'أقرا… قريت {{count}} رسائل للحين',
  readingCount_many: 'أقرا… قريت {{count}} رسالة للحين',
  readingCount_other: 'أقرا… قريت {{count}} رسالة للحين',
  done_one: 'خلصت ✓ قريت {{read}}، ولقيت مهمة: تحت 👇',
  done_two: 'خلصت ✓ قريت {{read}}، ولقيت مهمتين: تحت 👇',
  done_few: 'خلصت ✓ قريت {{read}}، ولقيت {{count}} مهام: تحت 👇',
  done_many: 'خلصت ✓ قريت {{read}}، ولقيت {{count}} مهمة: تحت 👇',
  done_other: 'خلصت ✓ قريت {{read}}، ولقيت {{count}} مهمة: تحت 👇',
  doneNone: 'خلصت ✓ قريت {{read}}، وما فيه شي جديد لك',
  failed: 'ما قدرت أقراها: {{reason}}',
  last: 'آخر قراءة {{when}}',
  never: 'ما قريتها للحين',
  next: 'القراءة الجاية {{when}}',
  manual: 'ما أقراها إلا لما تضغط "اقرا الحين"',
  justNow: 'الحين',
  minAgo: 'قبل {{n}} د',
  hAgo: 'قبل {{n}} س',
  inMin: 'بعد {{n}} د',
};
const NS = registerStrings('readBar', { en, ar });

export function ReadBar({ conns, onRead }: { conns: Connection[]; onRead?: () => void }) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const actions = useConnectionActions();
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const slide = useRef(new Animated.Value(0)).current;

  // the moving bar while reading
  useEffect(() => {
    if (!busy) return;
    const loop = Animated.loop(Animated.timing(slide, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    slide.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [busy, slide]);

  const now = Date.now();
  const ago = (iso: string) => {
    const m = Math.round((now - Date.parse(iso)) / 60_000);
    return m < 1 ? t('justNow') : m < 60 ? t('minAgo', { n: m }) : t('hAgo', { n: Math.round(m / 60) });
  };
  const last = conns.map((c) => c.last_sync_at).filter(Boolean).sort().at(-1) as string | undefined;
  const every = Math.min(...conns.map((c) => c.read_every_min ?? 10));
  const nextText = () => {
    if (!every) return t('manual');
    const at = last ? Date.parse(last) + every * 60_000 : now;
    const mins = Math.max(1, Math.round((at - now) / 60_000));
    if (mins <= 60) return t('next', { when: t('inMin', { n: mins }) });
    return t('next', { when: new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(at) });
  };

  const read = async () => {
    setBusy(true);
    setResult(null);
    setCount(0);
    const since = new Date().toISOString();
    // count the messages as they come in
    const timer = setInterval(() => readSince(since).then(setCount).catch(() => {}), 1500);
    try {
      let readN = 0;
      let tasks = 0;
      let error: string | undefined;
      for (const c of conns) {
        const r = await actions.syncNow(c.provider, c.id);
        readN += r.read ?? 0;
        tasks += r.tasks ?? 0;
        error = error ?? r.error;
      }
      setResult(
        error && !readN
          ? { ok: false, text: t('failed', { reason: error }) }
          : { ok: true, text: tasks ? t('done', { count: tasks, read: readN }) : t('doneNone', { read: readN }) },
      );
      onRead?.();
    } catch (e) {
      setResult({ ok: false, text: t('failed', { reason: (e as Error).message }) });
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  };

  const x = slide.interpolate({ inputRange: [0, 1], outputRange: [-120, 320] });
  return (
    <Card padding={spacing.lg} style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <AppText variant="small" weight="semibold">
            {last ? t('last', { when: ago(last) }) : t('never')}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {nextText()}
          </AppText>
        </View>
        <Button
          label={busy ? t('reading') : t('readNow')}
          size="md"
          disabled={busy}
          onPress={read}
          icon={<RefreshCw color={colors.onDark} size={16} />}
        />
      </View>
      {busy && (
        <View style={{ gap: 6 }}>
          <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.primaryTint, overflow: 'hidden' }}>
            <Animated.View style={{ width: 120, height: 6, borderRadius: radius.pill, backgroundColor: colors.primary, transform: [{ translateX: x }] }} />
          </View>
          <AppText variant="caption" color="primary" weight="semibold">
            {count ? t('readingCount', { count }) : t('reading')}
          </AppText>
        </View>
      )}
      {!busy && result && (
        <AppText variant="small" weight="bold" color={result.ok ? 'greenText' : 'red'}>
          {result.text}
        </AppText>
      )}
    </Card>
  );
}
