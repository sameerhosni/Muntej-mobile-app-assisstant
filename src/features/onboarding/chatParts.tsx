// The pieces both setup chats share (admin: app/63-setup-chat.tsx, members: MemberSetupChat): the header, the small
// card inside a bubble, tags, the checklist line, the quick answers under Saree3's last message, and the type / talk bar.
import { useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Mic, Send, Square, X } from 'lucide-react-native';
import { AppText } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { Munti } from '@/features/munti/Munti';
import { contentDirection } from '@/features/chat/Bubbles';
import { MicDeniedError, useVoiceRecorder } from '@/features/capture/useVoiceRecorder';
import { transcribeAudio } from '@/features/capture/api';
import { SETUP_CHAT_NS } from './setupChatStrings';

export type Chip = { label: string; onPress: () => void; primary?: boolean };

/** Saree3 + the step + close (= later: Home keeps a card that comes back here) */
export function ChatHeader({ sub, done, onClose }: { sub: string; done: boolean; onClose: () => void }) {
  const { t } = useScreenT(SETUP_CHAT_NS);
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + spacing.sm,
        paddingBottom: spacing.md,
        paddingHorizontal: spacing.screen,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Munti size="sm" mood={done ? 'celebrate' : 'talk'} />
      <View style={{ flex: 1 }}>
        <AppText weight="extrabold" style={{ fontSize: 17 }}>
          {t('title')}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {sub}
        </AppText>
      </View>
      {!done && (
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('close')} hitSlop={8} style={{ padding: 8 }}>
          <X color={colors.textMuted} size={22} />
        </Pressable>
      )}
    </View>
  );
}

export function Mini({ children }: { children: ReactNode }) {
  return <View style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.md, gap: 4 }}>{children}</View>;
}

export function Tag({ text, warn }: { text: string; warn?: boolean }) {
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, backgroundColor: warn ? colors.amberTint : colors.greenTint }}>
      <AppText variant="micro" weight="bold" color={warn ? 'amberText' : 'greenText'}>
        {text}
      </AppText>
    </View>
  );
}

export function Done({ text, off }: { text: string; off?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Check color={off ? colors.textFaint : colors.green} size={16} strokeWidth={2.6} />
      <AppText variant="small" color={off ? 'textMuted' : 'text'}>
        {text}
      </AppText>
    </View>
  );
}

/** the quick answers under Saree3's last message */
export function Chips({ chips }: { chips: Chip[] }) {
  if (!chips.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingStart: 44 }}>
      {chips.map((c) => (
        <Pressable
          key={c.label}
          onPress={c.onPress}
          accessibilityRole="button"
          style={({ pressed }) => ({
            minHeight: sizes.touch,
            paddingHorizontal: spacing.lg,
            justifyContent: 'center',
            borderRadius: radius.pill,
            borderWidth: 1.5,
            borderColor: colors.primary,
            backgroundColor: c.primary ? colors.primary : colors.surface,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <AppText variant="small" weight="bold" color={c.primary ? 'onDark' : 'primary'}>
            {c.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

/** type or talk: what's said goes to onSay (a voice note is written down first) */
export function InputBar({
  onSay,
  busy,
  onBusy,
  onError,
}: {
  onSay: (text: string, source: 'text' | 'voice') => void;
  busy: boolean;
  onBusy: (label: string | null) => void;
  onError: (text: string) => void;
}) {
  const { t } = useScreenT(SETUP_CHAT_NS);
  const { isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const rec = useVoiceRecorder();
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);

  const send = () => {
    if (!text.trim() || busy) return;
    onSay(text.trim(), 'text');
    setText('');
  };
  const talk = async () => {
    if (!recording) {
      try {
        await rec.start();
        setRecording(true);
      } catch (e) {
        onError(e instanceof MicDeniedError ? t('micDenied') : t('failed'));
      }
      return;
    }
    setRecording(false);
    const uri = await rec.stop();
    if (!uri) return;
    onBusy(t('writing'));
    try {
      const said = await transcribeAudio(uri);
      onBusy(null);
      if (said.trim()) onSay(said.trim(), 'voice');
    } catch {
      onBusy(null);
      onError(t('failed'));
    }
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        paddingBottom: insets.bottom + spacing.sm,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={recording ? t('stop') : t('placeholder')}
        placeholderTextColor={colors.textFaint}
        editable={!recording && !busy}
        multiline
        onSubmitEditing={send}
        style={{
          flex: 1,
          minHeight: sizes.touch,
          maxHeight: 120,
          borderRadius: 22,
          backgroundColor: colors.bg,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          color: colors.text,
          fontSize: 16,
          textAlign: isRTL ? 'right' : 'left',
          writingDirection: contentDirection(text),
        }}
      />
      {text.trim() ? (
        <Round label={t('send')} bg={colors.primary} onPress={send} disabled={busy}>
          <Send color={colors.onDark} size={20} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </Round>
      ) : (
        <Round label={recording ? t('stop') : t('talk')} bg={recording ? colors.red : colors.purple} onPress={talk} disabled={busy}>
          {recording ? <Square color={colors.onDark} size={18} fill={colors.onDark} /> : <Mic color={colors.onDark} size={22} />}
        </Round>
      )}
    </View>
  );
}

function Round({ label, bg, onPress, disabled, children }: { label: string; bg: string; onPress: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: sizes.touch + 4,
        height: sizes.touch + 4,
        borderRadius: (sizes.touch + 4) / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}
