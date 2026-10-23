// Bottom of Tasks from email: the other tools whose tasks also land here, as a grid you understand at a glance:
// each tool's mark and name with its state (Connected ✓ / Connect / Soon). Tap → Connect your tools, where each one
// is set up.
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AppText, Card } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { useConnections, useProviders, type ProviderId } from '@/features/sources/connections';
import { CONN_NS } from '@/features/sources/connStrings';
import { NS } from './strings';

type Tile = { id: ProviderId | 'whatsapp'; mark: string; fg: string; bg: string };
const TILES: Tile[] = [
  { id: 'microsoft', mark: 'M', fg: '#0078D4', bg: '#E6F1FB' },
  { id: 'whatsapp', mark: 'W', fg: '#1DA851', bg: '#E5F8EC' },
  { id: 'jira', mark: 'J', fg: '#2684FF', bg: '#E8F1FF' },
  { id: 'clickup', mark: 'C', fg: '#7B68EE', bg: '#F0EEFF' },
  { id: 'trello', mark: 'T', fg: '#0079BF', bg: '#E6F2FA' },
  { id: 'slack', mark: 'S', fg: '#611F69', bg: '#F5EBF6' },
];

export function ToolsGrid() {
  const { t } = useScreenT(NS);
  const { t: tc } = useScreenT(CONN_NS);
  const conns = useConnections();
  const providers = useProviders();
  const wa = useQuery({
    queryKey: ['whatsappInfo'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke<{ ready: boolean; mine: string | null }>('connect', { body: { action: 'whatsapp' } });
      return data ?? { ready: false, mine: null };
    },
  });
  const state = (id: Tile['id']): 'on' | 'connect' | 'soon' => {
    if (id === 'whatsapp') return wa.data?.ready && wa.data.mine ? 'on' : wa.data?.ready ? 'connect' : 'soon';
    if ((conns.data ?? []).some((c) => c.provider === id)) return 'on';
    const p = (providers.data ?? []).find((x) => x.id === id);
    return p?.configured || p?.token ? 'connect' : 'soon';
  };

  return (
    <Card padding={spacing.lg} style={{ gap: spacing.md }}>
      <View style={{ gap: 2 }}>
        <AppText weight="bold">{t('toolsTitle')}</AppText>
        <AppText variant="caption" color="textMuted">
          {t('toolsSub')}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {TILES.map((x) => {
          const s = state(x.id);
          return (
            <Pressable
              key={x.id}
              onPress={() => router.push('/12-sources')}
              accessibilityRole="button"
              style={({ pressed }) => ({
                width: '31.5%',
                alignItems: 'center',
                gap: 6,
                paddingVertical: spacing.md,
                borderRadius: radius.tile,
                borderWidth: 1,
                borderColor: s === 'on' ? colors.green : colors.border,
                backgroundColor: colors.surface,
                opacity: pressed ? 0.8 : s === 'soon' ? 0.6 : 1,
              })}
            >
              <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: x.bg }}>
                <AppText weight="extrabold" style={{ fontSize: 18, color: x.fg }}>
                  {x.mark}
                </AppText>
              </View>
              <AppText variant="caption" weight="bold" numberOfLines={1} align="center">
                {x.id === 'whatsapp' ? tc('wa_title') : tc(`n_${x.id}`)}
              </AppText>
              <AppText variant="micro" weight="bold" color={s === 'on' ? 'green' : s === 'connect' ? 'primary' : 'textMuted'}>
                {s === 'on' ? `✓ ${t('toolOn')}` : s === 'connect' ? t('toolConnect') : t('toolSoon')}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}
