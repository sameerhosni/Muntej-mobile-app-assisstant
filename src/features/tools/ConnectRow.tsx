// "Connect a tool" on Your tools (screen 42): one tool you haven't connected yet. Connect opens the tool's own
// sign-in page (it comes back to Your tools); tools that take a personal API token show where to find it, a box to
// paste it, and the server checks it before saving. Once connected, the tool gets its own tile and page (screen 55).
import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Card, IconBadge, TextField } from '@/components/ui';
import { colors, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { useConnectionActions, type ProviderId, type ProviderInfo } from '@/features/sources/connections';
import { CONN_NS } from '@/features/sources/connStrings';

/** letter badge per tool (brand logos aren't in the app; colours from the theme) */
const BADGE: Record<ProviderId, { letter: string; bg: ColorToken; fg: string }> = {
  microsoft: { letter: 'M', bg: 'primaryTint', fg: colors.primary },
  google: { letter: 'G', bg: 'redTint', fg: colors.red },
  slack: { letter: 'S', bg: 'purpleTint', fg: colors.purple },
  jira: { letter: 'J', bg: 'primaryTint', fg: colors.primary },
  clickup: { letter: 'C', bg: 'purpleTint', fg: colors.purple },
  trello: { letter: 'T', bg: 'primaryTint', fg: colors.primary },
  notion: { letter: 'N', bg: 'chip', fg: colors.text },
  azure_devops: { letter: 'A', bg: 'primaryTint', fg: colors.primary },
};

export function ConnectRow({ info, onNote }: { info: ProviderInfo; onNote: (n: { tone: 'green' | 'red'; text: string } | null) => void }) {
  const { t } = useScreenT(CONN_NS);
  const { lang } = useDirection();
  const actions = useConnectionActions();
  const id = info.id;
  const [busy, setBusy] = useState<null | 'connect' | 'token'>(null);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const fields = info.tokenFields ?? ['token'];
  const filled = fields.every((f) => (creds[f] ?? '').trim().length >= (f === 'token' ? 10 : 2));
  const b = BADGE[id];
  const name = t(`n_${id}`);

  const run = async (kind: 'connect' | 'token', fn: () => Promise<void>) => {
    setBusy(kind);
    onNote(null);
    try {
      await fn();
    } catch (e) {
      onNote({ tone: 'red', text: (e as Error).message || t('error') });
    } finally {
      setBusy(null);
    }
  };
  const connect = () => run('connect', () => actions.connect(id, '/42-incoming'));
  const saveToken = () =>
    run('token', async () => {
      const r = await actions.connectWithToken(id, creds);
      setCreds({});
      setTokenOpen(false);
      onNote({ tone: 'green', text: t('tokenDone', { name, tasks: formatNumber(r.tasks, lang) }) });
    });

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconBadge size={40} bg={b.bg}>
          <AppText weight="extrabold" style={{ color: b.fg, fontSize: 18 }}>
            {b.letter}
          </AppText>
        </IconBadge>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText weight="bold">{name}</AppText>
          <AppText variant="caption" color="textMuted">
            {t(`r_${id}`)}
          </AppText>
        </View>
        {info.configured && !tokenOpen && <Button label={t('connect')} size="md" loading={busy === 'connect'} onPress={connect} />}
      </View>
      {info.token && !tokenOpen && (
        <Button label={t('withToken')} variant={info.configured ? 'outline' : 'primary'} size="md" onPress={() => setTokenOpen(true)} />
      )}
      {info.token && tokenOpen && (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="small" color="textSoft">
            {t(`tokenHelp_${id}`, { defaultValue: '' })}
          </AppText>
          {fields.map((f) => (
            <TextField
              key={f}
              label={t(`field_${f}`, { defaultValue: f })}
              value={creds[f] ?? ''}
              onChangeText={(v) => setCreds((c) => ({ ...c, [f]: v }))}
              placeholder={t(`field_${f}_ph`, { defaultValue: t('tokenPlaceholder') })}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={f === 'email' ? 'email-address' : 'default'}
              secureTextEntry={f === 'token' || f === 'key'}
              ltr
            />
          ))}
          <AppText variant="caption" color="textMuted">
            {t('tokenSafe')}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label={t('cancel')} variant="outline" size="md" onPress={() => setTokenOpen(false)} style={{ flex: 1 }} />
            <Button label={t('tokenSave')} size="md" loading={busy === 'token'} disabled={!filled} onPress={saveToken} style={{ flex: 1 }} />
          </View>
        </View>
      )}
    </Card>
  );
}
