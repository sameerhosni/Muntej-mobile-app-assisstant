import { View } from 'react-native';
import { colors, radius } from '@/theme/tokens';
import { AppText } from './AppText';
import { Gradient } from './Gradient';

/** The orange "#" coin used for points everywhere. */
export function PointsCoin({ size = 20 }: { size?: number }) {
  return (
    <Gradient
      name="points"
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
    >
      <AppText weight="extrabold" color="onDark" style={{ fontSize: size * 0.5 }}>
        #
      </AppText>
    </Gradient>
  );
}

/** Coin + label pill, e.g. "+65 pts" or a balance. */
export function PointsPill({ label, size = 'md' }: { label: string; size?: 'sm' | 'md' }) {
  const coin = size === 'sm' ? 18 : 20;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: colors.orangeTint,
        borderRadius: radius.pill,
        paddingVertical: 3,
        paddingStart: 4,
        paddingEnd: 10,
        alignSelf: 'flex-start',
      }}
    >
      <PointsCoin size={coin} />
      <AppText variant={size === 'sm' ? 'caption' : 'small'} weight="extrabold" color="orangeText">
        {label}
      </AppText>
    </View>
  );
}
