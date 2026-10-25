// Top of "Your tools" (screen 42): one card per connected tool account. Each card shows when Saree3 last read it,
// how many tasks it brought, when he reads it next, a "Read now" button and "How often?" (10 min · 30 min · 1 h ·
// 3 h · daily · manual only), saved on the connection (read_every_min). sync-sources reads each one on its own
// schedule. WhatsApp (Muntej's own number) has no schedule: messages arrive the moment they're sent.
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react-native';
import { AppText, Card } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { useConnectionActions, useConnections, type Connection } from '@/features/sources/connections';
import { CONN_NS } from '@/features/sources/connStrings';

const EVERY = [10, 30, 60, 180, 1440, 0] as const;

const en = {
  lastRead: 'Read {{when}}',
  never: 'Not read yet',
  found_one: 'found {{count}} task today',
  found_other: 'found {{count}} tasks today',
  next: 'Next read {{when}}',
  manualOnly: 'Reads only when you tap "Read now"',
  readNow: 'Read now',
  reading: 'Reading…',
  readDone_one: 'Done: read {{read}}, {{count}} new task',
  readDone_other: 'Done: read {{read}}, {{count}} new tasks',
  readFail: 'Couldn’t read it: {{reason}}',
  howOften: 'How often?',
  e10: '10 min',
  e30: '30 min',
  e60: 'Hourly',
  e180: '3 hours',
  e1440: 'Daily',
  e0: 'Manual',
  justNow: 'just now',
  minAgo: '{{n}} min ago',
  hAgo: '{{n}} h ago',
  inMin: 'in {{n}} min',
  at: 'at {{time}}',
  error: 'Needs attention: {{msg}}',
};
const ar: typeof en & Record<string, string> = {
  lastRead: 'آخر قراءة {{when}}',
  never: 'ما انقرت للحين',
  found_one: 'لقيت مهمة اليوم',
  found_other: 'لقيت {{count}} مهام اليوم',
  found_two: 'لقيت مهمتين اليوم',
  next: 'القراءة الجاية {{when}}',
  manualOnly: 'ما أقراها إلا لما تضغط "اقرا الحين"',
  readNow: 'اقرا الحين',
  reading: 'أقرا…',
  readDone_one: 'تم: قريت {{read}}، ومهمة جديدة',
  readDone_other: 'تم: قريت {{read}}، و{{count}} مهام جديدة',
  readFail: 'ما قدرت أقراها: {{reason}}',
  howOften: 'كل كم أقراها؟',
  e10: '10 د',
  e30: '30 د',
  e60: 'كل ساعة',
  e180: '3 ساعات',
  e1440: 'مرة باليوم',
  e0: 'يدوي',
  justNow: 'الحين',
  minAgo: 'قبل {{n}} د',
  hAgo: 'قبل {{n}} س',
  inMin: 'بعد {{n}} د',
  at: 'الساعة {{time}}',
  error: 'تحتاج انتباه: {{msg}}',
};
const NS = registerStrings('toolCards', { en, ar });

export function ToolCards() {
  const conns = useConnections();
  const list = conns.data ?? [];
  if (!list.length) return null;
  return (
    <View style={{ gap: spacing.md }}>
      {list.map((c) => (
        <ToolCard key={c.id} c={c} />
      ))}
    </View>
  );
}

export function ToolCard({ c }: { c: Connection }) {
  const { t } = useScreenT(NS);
  const { t: tc } = useScreenT(CONN_NS);
  const { lang } = useDirection();
  const actions = useConnectionActions();
  const [busy, setBusy] = useState<'read' | 'every' | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const every = c.read_every_min ?? 10;
  const now = Date.now();

  const ago = (iso: string) => {
    const m = Math.round((now - Date.parse(iso)) / 60_000);
    return m < 1 ? t('justNow') : m < 60 ? t('minAgo', { n: m }) : t('hAgo', { n: Math.round(m / 60) });
  };
  // the job runs every 10 minutes: the next read is the first run after last read + the interval
  const nextText = () => {
    if (!every) return t('manualOnly');
    const at = c.last_sync_at ? Date.parse(c.last_sync_at) + every * 60_000 : now;
    const mins = Math.max(1, Math.round((at - now) / 60_000));
    if (mins <= 60) return t('next', { when: t('inMin', { n: mins }) });
    const time = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(at);
    return t('next', { when: t('at', { time }) });
  };
  const today = c.found_day === new Date(now + 3 * 3_600_000).toISOString().slice(0, 10) ? c.found_today : 0;

  const readNow = async () => {
    setBusy('read');
    setNote(null);
    try {
      const r = await actions.syncNow(c.provider, c.id);
      setNote(r.error ? { ok: false, text: t('readFail', { reason: r.error }) } : { ok: true, text: t('readDone', { count: r.tasks, read: r.read }) });
    } catch (e) {
      setNote({ ok: false, text: t('readFail', { reason: (e as Error).message }) });
    } finally {
      setBusy(null);
    }
  };
  const setEvery = async (m: number) => {
    setBusy('every');
    try {
      await actions.settings(c.provider, { read_every_min: m }, c.id);
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const ok = c.status !== 'error';
  return (
    <Card padding={spacing.lg} style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        {ok ? <CheckCircle2 color={colors.green} size={20} /> : <AlertCircle color={colors.red} size={20} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText weight="bold" numberOfLines={1}>
            {tc(`n_${c.provider}`)}
          </AppText>
          {!!c.account_label && (
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              {c.account_label}
            </AppText>
          )}
        </View>
      </View>
      <AppText variant="small" color={ok ? 'textSoft' : 'red'}>
        {!ok && c.last_error
          ? t('error', { msg: c.last_error })
          : [c.last_sync_at ? t('lastRead', { when: ago(c.last_sync_at) }) : t('never'), today ? t('found', { count: today }) : null]
              .filter(Boolean)
              .join(' · ')}
      </AppText>
      <AppText variant="caption" color="textMuted">
        {nextText()}
      </AppText>

      <Pressable
        onPress={readNow}
        disabled={busy === 'read'}
        accessibilityRole="button"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          minHeight: sizes.touch,
          borderRadius: radius.pill,
          backgroundColor: colors.primaryTint,
          opacity: pressed || busy === 'read' ? 0.7 : 1,
        })}
      >
        <RefreshCw color={colors.primary} size={16} />
        <AppText weight="bold" color="primary">
          {busy === 'read' ? t('reading') : t('readNow')}
        </AppText>
      </Pressable>
      {!!note && (
        <AppText variant="small" weight="semibold" color={note.ok ? 'green' : 'red'}>
          {note.text}
        </AppText>
      )}

      <AppText variant="caption" weight="bold" color="textMuted">
        {t('howOften')}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {EVERY.map((m) => {
          const on = every === m;
          return (
            <Pressable
              key={m}
              onPress={() => !on && setEvery(m)}
              disabled={busy === 'every'}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={{
                minHeight: sizes.touch - 4,
                paddingHorizontal: spacing.md,
                borderRadius: radius.pill,
                justifyContent: 'center',
                borderWidth: on ? 1.5 : 1,
                borderColor: on ? colors.primary : colors.border,
                backgroundColor: on ? colors.primaryTint : colors.surface,
              }}
            >
              <AppText variant="small" weight="bold" color={on ? 'primary' : 'textSoft'}>
                {t(`e${m}`)}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </Card>
  );
}
