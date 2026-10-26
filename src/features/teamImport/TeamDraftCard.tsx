// The chat's card when Saree3 drew a whole team from what you said ("Faisal leads sales with Abdullah and Saad…"):
// how many people and managers, the first names, and Review → screen 62 (fix anything, then confirm once).
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Network } from 'lucide-react-native';
import { AppText, Button, Card, IconBadge } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { TEAM_IMPORT_NS } from './strings';

export type TeamDraftPayload = { id: string; count: number; managers: number; names: string[] };

export function TeamDraftCard({ draft }: { draft: TeamDraftPayload }) {
  const { t } = useScreenT(TEAM_IMPORT_NS);
  const { lang } = useDirection();
  const n = (x: number) => formatNumber(x, lang);
  return (
    <Card style={{ gap: spacing.md, borderWidth: 1.5, borderColor: colors.purpleBorder }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconBadge size={40} bg="purpleTint" round>
          <Network color={colors.purple} size={20} />
        </IconBadge>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight="bold">{t('rSub', { n: n(draft.count), count: draft.count })}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('managers', { n: n(draft.managers), count: draft.managers })}
          </AppText>
        </View>
      </View>
      <AppText variant="small" color="textSoft" numberOfLines={3}>
        {draft.names.join('، ')}
        {draft.count > draft.names.length ? '…' : ''}
      </AppText>
      <Button label={t('rTitle')} onPress={() => router.push(`/62-team-review?id=${draft.id}` as Href)} />
    </Card>
  );
}
