// Top of "Tasks from email" (screen 42): your email, connected right here. Not connected → "Continue with Google" /
// "Continue with Microsoft" (the provider's own sign-in page; nothing to configure). Connected → who, when it was last
// checked, and "Check now". Opening the screen checks the email by itself, so the found tasks are waiting below.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CheckCircle2, Mail, RefreshCw } from 'lucide-react-native';
import { AppText, Card } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { useConnectionActions, useConnections, useProviders, type ProviderId } from '@/features/sources/connections';
import { readSince } from './api';
import { NS } from './strings';

const EMAIL_TOOLS: ProviderId[] = ['google', 'microsoft'];
/** opening the screen re-checks the email when the last check is older than this */
const FRESH_MS = 2 * 60_000;

export function EmailAccounts() {
  const { t } = useScreenT(NS);
  const params = useLocalSearchParams<{ connected?: string; error?: string }>();
  const connections = useConnections();
  const providers = useProviders();
  const actions = useConnectionActions();
  const [checking, setChecking] = useState(false);
  // while reading: an estimated % (the server reads in one go) and how many mails it has read so far (live count)
  const [progress, setProgress] = useState<{ pct: number; read: number } | null>(null);
  const startedAt = useRef(0);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const autoChecked = useRef(false);

  const mine = (connections.data ?? []).filter((c) => EMAIL_TOOLS.includes(c.provider));
  // only the sign-ins this server offers (credentials set)
  const offered = EMAIL_TOOLS.filter((id) => (providers.data ?? []).some((p) => p.id === id && p.configured) && !mine.some((c) => c.provider === id));

  const checkNow = async () => {
    if (!mine.length) return;
    setChecking(true);
    setNote(null);
    startedAt.current = Date.now();
    setProgress({ pct: 0, read: 0 });
    let found = 0;
    try {
      for (const c of mine) found += (await actions.syncNow(c.provider)).tasks ?? 0;
      setProgress((p) => ({ pct: 100, read: p?.read ?? 0 }));
      setNote({ ok: true, text: found ? t('emailFound', { count: found, n: found }) : t('emailNothing') });
    } catch {
      setNote({ ok: false, text: t('emailCheckFailed') });
    } finally {
      setChecking(false);
      setTimeout(() => setProgress(null), 900);
    }
  };

  // the % climbs towards 95 while the server works, the count comes from what it has saved so far
  useEffect(() => {
    if (!checking) return;
    const since = new Date(startedAt.current - 1000).toISOString();
    const tick = setInterval(() => {
      const pct = Math.min(95, Math.round(100 * (1 - Math.exp(-(Date.now() - startedAt.current) / 20_000))));
      setProgress((p) => (p ? { ...p, pct: Math.max(p.pct, pct) } : p));
    }, 500);
    const count = setInterval(() => {
      readSince(since)
        .then((read) => setProgress((p) => (p ? { ...p, read } : p)))
        .catch(() => {});
    }, 1500);
    return () => {
      clearInterval(tick);
      clearInterval(count);
    };
  }, [checking]);

  // just came back from signing in, or opened the screen: read the email now
  useEffect(() => {
    if (params.connected) setNote({ ok: true, text: t('emailConnected') });
    if (params.error) setNote({ ok: false, text: t('emailConnectFailed') });
  }, [params.connected, params.error, t]);
  useEffect(() => {
    if (autoChecked.current || !connections.data) return;
    const stale = mine.some((c) => !c.last_sync_at || Date.now() - Date.parse(c.last_sync_at) > FRESH_MS);
    if (!mine.length || (!stale && !params.connected)) return;
    autoChecked.current = true;
    checkNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections.data, params.connected]);

  if (connections.isLoading) return null;

  return (
    <Card padding={spacing.lg} style={{ gap: spacing.sm }}>
      {mine.length === 0 ? (
        <>
          <AppText weight="bold">{t('emailConnectTitle')}</AppText>
          <AppText variant="small" color="textSoft">
            {t('emailConnectHint')}
          </AppText>
        </>
      ) : (
        mine.map((c) => (
          <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <CheckCircle2 color={c.status === 'error' ? colors.red : colors.green} size={18} />
            <View style={{ flex: 1 }}>
              <AppText weight="semibold" numberOfLines={1}>
                {c.account_label ?? t(`src_${c.provider === 'google' ? 'gmail' : 'outlook'}`)}
              </AppText>
              <AppText variant="caption" color={c.status === 'error' ? 'red' : 'textMuted'}>
                {c.status === 'error' ? t('emailReconnect') : c.last_sync_at ? t('emailChecked', { when: ago(c.last_sync_at, t) }) : t('emailNotYet')}
              </AppText>
            </View>
            {c.status === 'error' && (
              <Pressable
                onPress={() => actions.connect(c.provider, '/42-incoming')}
                accessibilityRole="button"
                style={{ minHeight: sizes.touch, justifyContent: 'center' }}
              >
                <AppText variant="small" weight="bold" color="primary">
                  {t('emailSignInAgain')}
                </AppText>
              </Pressable>
            )}
          </View>
        ))
      )}

      {offered.map((id) => (
        <Pressable
          key={id}
          onPress={() => actions.connect(id, '/42-incoming').catch(() => setNote({ ok: false, text: t('emailConnectFailed') }))}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            minHeight: sizes.touch + 4,
            borderRadius: radius.pill,
            borderWidth: 1.5,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <AppText weight="extrabold" style={{ fontSize: 18, color: id === 'google' ? '#EA4335' : '#0078D4' }}>
            {id === 'google' ? 'G' : 'M'}
          </AppText>
          <AppText weight="bold">{id === 'google' ? t('withGoogle') : t('withMicrosoft')}</AppText>
        </Pressable>
      ))}

      {progress && (
        <View accessibilityLiveRegion="polite" style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="small" weight="bold" color="primary">
              {progress.pct >= 100 ? t('emailDone') : t('emailChecking')}
            </AppText>
            <AppText variant="small" weight="extrabold" color="primary" style={{ writingDirection: 'ltr' }}>
              {`${progress.pct}%`}
            </AppText>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.primaryTint, overflow: 'hidden' }}>
            <View style={{ width: `${progress.pct}%`, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
          </View>
          {progress.read > 0 && (
            <AppText variant="caption" color="textMuted">
              {t('emailReadSoFar', { count: progress.read, n: progress.read })}
            </AppText>
          )}
        </View>
      )}
      {mine.length > 0 && !progress && (
        <Pressable
          onPress={checkNow}
          disabled={checking}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            minHeight: sizes.touch,
            borderRadius: radius.pill,
            backgroundColor: colors.primaryTint,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {checking ? <ActivityIndicator color={colors.primary} /> : <RefreshCw color={colors.primary} size={16} />}
          <AppText weight="bold" color="primary">
            {checking ? t('emailChecking') : t('emailCheckNow')}
          </AppText>
        </Pressable>
      )}
      {mine.length === 0 && offered.length === 0 && !providers.isLoading && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Mail color={colors.textMuted} size={16} />
          <AppText variant="small" color="textMuted">
            {t('emailUnavailable')}
          </AppText>
        </View>
      )}
      {!!note && (
        <AppText variant="small" weight="semibold" color={note.ok ? 'green' : 'red'}>
          {note.text}
        </AppText>
      )}
    </Card>
  );
}

function ago(iso: string, t: (k: string, o?: Record<string, unknown>) => string) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return t('justNow');
  if (min < 60) return t('minAgo', { n: min });
  return t('hAgo', { n: Math.round(min / 60) });
}
