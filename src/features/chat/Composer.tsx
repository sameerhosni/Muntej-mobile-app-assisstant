import type { ReactNode, Ref } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { Mic, Send, X } from 'lucide-react-native';
import { AppText, Gradient } from '@/components/ui';
import { colors, fontFamily, fontSize, shadows, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { Waveform } from '@/features/capture/Waveform';
import { formatClock } from '@/features/capture/points';
import { NS } from './strings';

export type VoiceState = 'idle' | 'recording' | 'transcribing';

type Props = {
  value: string;
  onChangeText: (v: string) => void;
  onSend: () => void;
  onMic: () => void;
  /** A send is in flight: typing is fine, sending again is not. */
  busy: boolean;
  autoFocus?: boolean;
  inputRef?: Ref<TextInput>;
  voice: VoiceState;
  level: number;
  durationMs: number;
  onStop: () => void;
  onCancel: () => void;
  bottomInset: number;
};

/** Pinned chat composer; turns into a listening strip while recording. */
export function Composer(p: Props) {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const canSend = !!p.value.trim() && !p.busy;

  return (
    <View
      style={{
        paddingHorizontal: spacing.xxl,
        paddingTop: spacing.sm,
        paddingBottom: Math.max(p.bottomInset, spacing.md),
        backgroundColor: colors.bg,
      }}
    >
      <View
        style={{
          minHeight: 64,
          backgroundColor: colors.surface,
          borderRadius: 32,
          boxShadow: shadows.raised,
          paddingVertical: spacing.sm,
          paddingStart: spacing.sm,
          paddingEnd: spacing.sm,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: spacing.sm,
        }}
      >
        {p.voice === 'recording' ? (
          // listening: cancel · live bars + "I send it when you pause" + clock · send now
          <>
            <RoundButton label={t('cancel')} onPress={p.onCancel}>
              <X color={colors.textSoft} size={20} strokeWidth={2} />
            </RoundButton>
            <View style={{ flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ overflow: 'hidden' }}>
                  <Waveform level={p.level} />
                </View>
                <AppText variant="small" weight="extrabold" color="textMuted" accessibilityLiveRegion="polite" style={{ writingDirection: 'ltr' }}>
                  {formatClock(p.durationMs)}
                </AppText>
              </View>
              <AppText variant="caption" color="primary" weight="bold" numberOfLines={1}>
                {t('listeningHint')}
              </AppText>
            </View>
            <RoundButton label={t('stop')} onPress={p.onStop} gradient>
              <Send color={colors.onDark} size={19} strokeWidth={1.9} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </RoundButton>
          </>
        ) : p.voice === 'transcribing' ? (
          // writing it down: always cancellable, so a slow connection never traps the person here
          <>
            <RoundButton label={t('cancel')} onPress={p.onCancel}>
              <X color={colors.textSoft} size={20} strokeWidth={2} />
            </RoundButton>
            <View
              accessibilityLiveRegion="polite"
              style={{ flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md }}
            >
              <ActivityIndicator color={colors.primary} />
              <AppText color="textMuted" numberOfLines={1}>
                {t('transcribing')}
              </AppText>
            </View>
            <View style={{ width: 48 }} />
          </>
        ) : (
          <>
            <TextInput
              ref={p.inputRef}
              value={p.value}
              onChangeText={p.onChangeText}
              placeholder={t('placeholder')}
              placeholderTextColor={colors.textFaint}
              selectionColor={colors.primary}
              accessibilityLabel={t('message')}
              autoFocus={p.autoFocus}
              multiline
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 48,
                maxHeight: 120,
                borderRadius: 24,
                backgroundColor: colors.bg,
                color: colors.text,
                paddingHorizontal: spacing.xxl,
                paddingTop: 13,
                paddingBottom: 13,
                fontFamily: fontFamily[lang].regular,
                fontSize: fontSize.cardTitle,
                textAlign: isRTL ? 'right' : 'left',
                writingDirection: isRTL ? 'rtl' : 'ltr',
                textAlignVertical: 'center',
              }}
            />
            <RoundButton label={t('voice')} onPress={p.onMic} disabled={p.busy}>
              <Mic color={colors.primary} size={20} strokeWidth={1.9} />
            </RoundButton>
            <RoundButton label={t('send')} onPress={p.onSend} gradient disabled={!canSend}>
              <Send color={colors.onDark} size={19} strokeWidth={1.9} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </RoundButton>
          </>
        )}
      </View>
    </View>
  );
}

function RoundButton({
  label,
  onPress,
  gradient,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  gradient?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  const size = 48;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        boxShadow: gradient && !disabled ? shadows.primary : undefined,
      })}
    >
      {gradient ? (
        <Gradient name="primary" style={{ flex: 1, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
          {children}
        </Gradient>
      ) : (
        <View style={{ flex: 1, borderRadius: size / 2, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
          {children}
        </View>
      )}
    </Pressable>
  );
}
