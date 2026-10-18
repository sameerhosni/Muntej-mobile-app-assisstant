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
  /** Wide letter-spaced digits (OTP codes). */
  code?: boolean;
  /** Force left-to-right input (emails, URLs) even in Arabic. */
  ltr?: boolean;
  right?: ReactNode;
};

export function TextField({ label, error, prefix, code, ltr, right, style, ...rest }: Props) {
  const { lang, isRTL } = useDirection();
  const ltrContent = !!prefix || !!code || !!ltr; // numbers, codes and emails read left-to-right in both languages
  return (
    <View style={{ gap: spacing.sm }}>
      {label && (
        <AppText variant="small" weight="semibold" color="textMuted">
          {label}
        </AppText>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: sizes.buttonHeight + 4,
          backgroundColor: colors.surface,
          borderRadius: radius.tile,
          borderWidth: 1,
          borderColor: error ? colors.red : colors.borderBlue,
          paddingHorizontal: spacing.xxl,
          gap: spacing.md,
          direction: ltrContent ? 'ltr' : isRTL ? 'rtl' : 'ltr',
        }}
      >
        {prefix && (
          <AppText weight="extrabold" color="textMuted" style={{ fontSize: fontSize.lead, writingDirection: 'ltr' }}>
            {prefix}
          </AppText>
        )}
        <TextInput
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.primary}
          {...rest}
          style={[
            {
              flex: 1,
              color: colors.text,
              fontSize: fontSize.lead,
              fontFamily: ltrContent ? fontFamily.en[code ? 'extrabold' : 'semibold'] : fontFamily[lang].medium,
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
