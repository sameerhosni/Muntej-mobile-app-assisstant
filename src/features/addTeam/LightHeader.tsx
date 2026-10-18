// Light header used by Screens 34 (Add team) and 36 (How-to): soft blue band, white back button,
// display title and two small white pills under it (design: AddTeam.dc.html / HowTo.dc.html header).
import type { ComponentType } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, type LucideProps } from 'lucide-react-native';
import { AppText, IconButton } from '@/components/ui';
import { colors, radius, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';

export type HeaderPill = { label: string; Icon: ComponentType<LucideProps>; color: ColorToken };

type Props = { title: string; backLabel: string; pills: HeaderPill[]; bandHeight?: number };

export function LightHeader({ title, backLabel, pills, bandHeight = 200 }: Props) {
  const insets = useSafeAreaInsets();
  const { isRTL } = useDirection();
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: bandHeight + insets.top,
          backgroundColor: colors.primaryTint,
          borderBottomLeftRadius: radius.hero,
          borderBottomRightRadius: radius.hero,
        }}
      />
      <View style={{ paddingTop: insets.top + spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <IconButton label={backLabel} onPress={goBack}>
          <BackIcon color={colors.text} size={20} strokeWidth={2} />
        </IconButton>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="titleLg" style={{ fontSize: 23, lineHeight: 28 }} numberOfLines={1}>
            {title}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {pills.map((p) => (
              <View
                key={p.label}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: colors.surface,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 3,
                }}
              >
                <p.Icon color={colors[p.color]} size={11} strokeWidth={2.6} />
                <AppText variant="micro" weight="extrabold" color={p.color}>
                  {p.label}
                </AppText>
              </View>
            ))}
          </View>
        </View>
      </View>
    </>
  );
}
