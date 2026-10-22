// "Your forget rate" on Your week: the share of handed-off tasks that closed with zero touches from you, against the
// 70% goal, and the few tasks you still stepped into (tap → the task) so you can see what pulled you back in.
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Brain } from 'lucide-react-native';
import { AppText, Card, IconBadge, ProgressBar } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import type { Period } from '@/features/receipt/useReceipt';
import { FORGET_TARGET, touchesOf, useForgetRate } from './forget';
import { FORGET_NS } from './strings';

export function ForgetCard({ period }: { period: Period }) {
  const { t } = useScreenT(FORGET_NS);
  const { lang } = useDirection();
  const f = useForgetRate(period);
  if (!f.ready) return null;
  const n = (v: number) => formatNumber(v, lang);
  const good = f.pct !== null && f.pct >= FORGET_TARGET;
  const tone = f.pct === null ? 'textMuted' : good ? 'greenText' : 'amberStrong';

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconBadge size={36} gradient={good ? 'success' : 'warning'}>
          <Brain color={colors.onDark} size={18} strokeWidth={2} />
        </IconBadge>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="cardTitle" weight="bold">
            {t('title')}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {t('target', { target: n(FORGET_TARGET) })}
          </AppText>
        </View>
        {f.pct !== null && (
          <AppText variant="big" display color={tone}>
            {`${n(f.pct)}%`}
          </AppText>
        )}
      </View>

      {f.pct === null ? (
        <AppText variant="small" color="textMuted">
          {t('none')}
        </AppText>
      ) : (
        <>
          <ProgressBar value={f.pct / 100} />
          <AppText variant="small" color="textSoft">
            {t('body', { forgotten: n(f.forgotten), closed: n(f.closed) })}
          </AppText>
          <AppText variant="small" weight="bold" color={tone}>
            {good ? t('great') : t('low')}
          </AppText>
        </>
      )}

      {f.mostTouched.length > 0 && (
        <View style={{ gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
          <AppText variant="caption" weight="bold" color="textMuted">
            {t('touched')}
          </AppText>
          {f.mostTouched.map((x) => (
            <Pressable
              key={x.id}
              onPress={() => router.push({ pathname: '/14-task-detail', params: { id: x.id } })}
              accessibilityRole="link"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36, opacity: pressed ? 0.7 : 1 })}
            >
              <AppText variant="small" numberOfLines={1} style={{ flex: 1 }}>
                {x.title}
              </AppText>
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.amberTint }}>
                <AppText variant="micro" weight="extrabold" color="amberStrong">
                  {t('touches', { count: touchesOf(x), n: n(touchesOf(x)) })}
                </AppText>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Card>
  );
}
