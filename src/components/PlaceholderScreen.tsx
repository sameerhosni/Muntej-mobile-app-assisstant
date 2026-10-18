import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Settings } from 'lucide-react-native';
import { AppText, Card, Chip, Screen } from '@/components/ui';
import { colors, sizes } from '@/theme/tokens';
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
            <IconButton label={t('common.back')} onPress={() => router.back()}>
              <ChevronLeft
                color={colors.textMuted}
                size={22}
                strokeWidth={2}
                style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }}
              />
            </IconButton>
          )}
          <AppText variant="title" style={{ flexShrink: 1 }}>
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
        <Chip label={`${num} · ${t('common.comingSoon', { sprint: meta.sprint })}`} tone="teal" />
        <AppText color="textSoft">{t('common.placeholderBody', { file: meta.design })}</AppText>
      </Card>
    </Screen>
  );
}

function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: sizes.touch,
        height: sizes.touch,
        borderRadius: sizes.touch / 2,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </Pressable>
  );
}
