// Bell with the unread-alerts count, for the Home headers (manager + employee). Tap → Alerts (screen 18).
// The same count is shown on the app icon (native only). Live: Realtime refreshes the count when alerts change.
import { useEffect } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { AppText } from '@/components/ui';
import { colors, radius, sizes } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { setAppBadge } from '@/features/notifications/push';
import { NS } from './strings';
import { useUnreadAlerts } from './useAlerts';

export function AlertsBell() {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const unread = useUnreadAlerts();
  const n = unread.data ?? 0;

  useEffect(() => {
    if (Platform.OS !== 'web') setAppBadge(n);
  }, [n]);

  return (
    <Pressable
      onPress={() => router.push('/18-alerts')}
      accessibilityRole="button"
      accessibilityLabel={n ? t('bellUnread', { count: n }) : t('bell')}
      hitSlop={2}
      style={({ pressed }) => ({
        width: sizes.touch,
        height: sizes.touch,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.glass,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Bell color={colors.onDark} size={20} strokeWidth={2} />
      {n > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 4,
            end: 4,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            backgroundColor: colors.red,
            borderWidth: 1.5,
            borderColor: colors.onDark,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppText variant="micro" weight="extrabold" color="onDark" style={{ fontSize: 10, lineHeight: 12 }}>
            {n > 99 ? '99+' : formatNumber(n, lang)}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}
