import { Pressable, TextInput, View } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { colors, fontFamily, fontSize, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';

type Props = {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  clearLabel: string;
};

/** Compact search box for list screens: magnifier, text, and a clear ✕ once something is typed. */
export function SearchField({ value, onChangeText, placeholder, clearLabel }: Props) {
  const { lang, isRTL } = useDirection();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: sizes.touch,
        backgroundColor: colors.surface,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.borderBlue,
        paddingStart: spacing.lg,
        gap: spacing.sm,
      }}
    >
      <Search color={colors.textFaint} size={17} strokeWidth={2.2} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.primary}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityRole="search"
        style={{
          flex: 1,
          color: colors.text,
          fontSize: fontSize.body,
          fontFamily: fontFamily[lang].medium,
          paddingVertical: spacing.sm,
          textAlign: isRTL ? 'right' : 'left',
        }}
      />
      {!!value && (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          style={{ width: sizes.touch, height: sizes.touch, alignItems: 'center', justifyContent: 'center' }}
        >
          <X color={colors.textMuted} size={16} strokeWidth={2.2} />
        </Pressable>
      )}
    </View>
  );
}
