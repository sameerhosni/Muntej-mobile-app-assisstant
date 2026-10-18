import type { ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { colors, fontFamily, fontSize, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { AppText } from './AppText';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  /** Fixed text before the input, e.g. "+966". Always LTR. */
  prefix?: string;
  mono?: boolean;
  right?: ReactNode;
};

export function TextField({ label, error, prefix, mono, right, style, ...rest }: Props) {
  const { lang, isRTL } = useDirection();
  const ltrContent = !!prefix || mono; // phone numbers and codes read left-to-right in both languages
  return (
    <View style={{ gap: spacing.sm }}>
      {label && (
        <AppText variant="small" color="textMuted">
          {label}
        </AppText>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: sizes.buttonHeight + 4,
          backgroundColor: colors.surface,
          borderRadius: radius.button,
          borderWidth: 1,
          borderColor: error ? colors.red : colors.border,
          paddingHorizontal: spacing.xxl,
          gap: spacing.md,
          direction: ltrContent ? 'ltr' : isRTL ? 'rtl' : 'ltr',
        }}
      >
        {prefix && (
          <AppText mono weight="semibold" color="textMuted" style={{ fontSize: fontSize.lead, writingDirection: 'ltr' }}>
            {prefix}
          </AppText>
        )}
        <TextInput
          placeholderTextColor={colors.textDim}
          selectionColor={colors.teal}
          {...rest}
          style={[
            {
              flex: 1,
              color: colors.text,
              fontSize: fontSize.lead,
              fontFamily: mono || prefix ? fontFamily.mono.semibold : fontFamily[lang].medium,
              paddingVertical: spacing.lg,
              textAlign: ltrContent ? 'left' : isRTL ? 'right' : 'left',
              writingDirection: ltrContent ? 'ltr' : isRTL ? 'rtl' : 'ltr',
            },
            style,
          ]}
        />
        {right}
      </View>
      {error && (
        <AppText variant="caption" color="red">
          {error}
        </AppText>
      )}
    </View>
  );
}
