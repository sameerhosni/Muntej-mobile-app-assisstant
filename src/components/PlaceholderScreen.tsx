import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Settings } from 'lucide-react-native';
import { AppText, Card, Chip, IconButton, Screen } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { screenMeta, type ScreenNum } from '@/features/screens/registry';

type Props = { num: ScreenNum };

/** Temporary body for screens that are not built yet. */
export function PlaceholderScreen({ num }: Props) {
  const { t } = useTranslation();
  const { isRTL } = useDirection();
  const meta = screenMeta(num);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
          {!meta.tab && (
            <IconButton label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
              <ChevronLeft color={colors.text} size={22} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </IconButton>
          )}
          <AppText variant="titleLg" style={{ flexShrink: 1 }}>
            {t(`screens.${num}`)}
          </AppText>
        </View>
        {meta.tab && (
          <IconButton label={t('settings.open')} onPress={() => router.push('/settings')}>
            <Settings color={colors.textMuted} size={22} strokeWidth={1.8} />
          </IconButton>
        )}
      </View>
      <Card>
        <Chip label={`${num} · ${t('common.comingSoon', { sprint: meta.sprint })}`} tone="primary" />
        <AppText color="textSoft">{t('common.placeholderBody', { file: `${meta.design}.dc.html` })}</AppText>
      </Card>
    </Screen>
  );
}
