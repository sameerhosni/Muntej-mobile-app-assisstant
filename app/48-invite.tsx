// Screen 48 · Invite people — no mockup; v2 light style per design/TOKENS.md
// Managers and admins: their invite code (MNT-XXXXXX, one account, 7 days) with one-tap sharing: WhatsApp, email,
// other apps, copy; Saree3 says what happens to whoever joins; cancel and renew. Everyone: join another team with a
// code they were given. (The chat does the same: "invite Faisal on WhatsApp 0555…".)
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { requireOptionalNativeModule } from 'expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Copy, Mail, MessageCircle, Share2 } from 'lucide-react-native';
import { AppText, Button, Card, IconButton } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { Munti } from '@/features/munti/Munti';
import { inviteMessage, redeemCode, renewInviteCode, showCode, useInviteCode, whatsappUrl } from '@/features/invite/api';
import { INVITE_NS } from '@/features/invite/strings';

// the clipboard arrives with the next app build; until then Copy is hidden
const canCopy = !!requireOptionalNativeModule('ExpoClipboard');

export default function InviteScreen() {
  const { t } = useScreenT(INVITE_NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useMyProfile();
  const lead = !!me.data && me.data.role !== 'employee';
  const code = useInviteCode(lead);
  const [note, setNote] = useState<string | null>(null);
  const c = code.data;
  const inviter = me.data ? ((lang === 'ar' && me.data.full_name_ar) || me.data.full_name).split(' ')[0] : '';
  const message = c ? inviteMessage(t, c, inviter) : '';

  const copy = async () => {
    const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
    await Clipboard.setStringAsync(message);
    setNote(t('copied'));
  };
  const renew = async () => {
    if (!c) return;
    await renewInviteCode(qc, c.code).catch(() => {});
    setNote(t('renewed'));
  };
  const until = c
    ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', { timeZone: 'Asia/Riyadh', weekday: 'long', day: 'numeric', month: 'long' }).format(
        new Date(c.expires_at),
      )
    : '';

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.screen, paddingBottom: 40, gap: spacing.lg }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconButton label={t('back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <ChevronLeft color={colors.text} size={20} strokeWidth={1.9} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </IconButton>
          <AppText variant="title" style={{ flex: 1 }}>
            {lead ? t('title') : t('titleJoin')}
          </AppText>
        </View>

        {lead && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
              <Munti size="md" mood="wave" />
              <Card padding={spacing.lg} style={{ flex: 1 }}>
                <AppText>{t('saree3', { company: c?.account_name ?? '…' })}</AppText>
              </Card>
            </View>

            <Card padding={spacing.xl} style={{ alignItems: 'center', gap: spacing.sm, borderWidth: 1.5, borderColor: colors.primary }}>
              {code.isLoading || !c ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <AppText selectable weight="extrabold" color="primary" style={{ fontSize: 30, letterSpacing: 2, writingDirection: 'ltr' }}>
                    {showCode(c.code)}
                  </AppText>
                  <AppText variant="caption" color="textMuted">
                    {t('validUntil', { date: until })}
                    {c.uses ? ` · ${t('used', { count: c.uses })}` : ''}
                  </AppText>
                </>
              )}
            </Card>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              <ShareButton
                label={t('whatsapp')}
                bg="#25D366"
                icon={<MessageCircle color={colors.onDark} size={20} />}
                disabled={!c}
                onPress={() => Linking.openURL(whatsappUrl(message)).catch(() => Share.share({ message }))}
              />
              <ShareButton
                label={t('email')}
                bg={colors.primary}
                icon={<Mail color={colors.onDark} size={20} />}
                disabled={!c}
                onPress={() =>
                  Linking.openURL(
                    `mailto:?subject=${encodeURIComponent(t('emailSubject', { company: c?.account_name ?? '' }))}&body=${encodeURIComponent(message)}`,
                  ).catch(() => Share.share({ message }))
                }
              />
              <ShareButton
                label={t('share')}
                bg={colors.purple}
                icon={<Share2 color={colors.onDark} size={20} />}
                disabled={!c}
                onPress={() => Share.share({ message }).catch(() => {})}
              />
              {canCopy && (
                <ShareButton label={t('copy')} bg={colors.textSoft} icon={<Copy color={colors.onDark} size={20} />} disabled={!c} onPress={copy} />
              )}
            </View>
            {!!note && (
              <AppText variant="small" weight="bold" color="green" align="center">
                {note}
              </AppText>
            )}
            <AppText variant="small" color="textSoft">
              {t('aiHint')}
            </AppText>
            {!!c && (
              <Pressable onPress={renew} accessibilityRole="button" style={{ minHeight: sizes.touch, justifyContent: 'center' }}>
                <AppText variant="small" color="red" weight="semibold">
                  {t('renew')}
                </AppText>
              </Pressable>
            )}
          </>
        )}

        <JoinWithCode />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** got a code from another team: join it too (you can switch between teams) */
function JoinWithCode() {
  const { t } = useScreenT(INVITE_NS);
  const qc = useQueryClient();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const join = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await redeemCode(qc, value);
      if (r.error) setMsg({ ok: false, text: r.error === 'too_many' ? t('tooMany') : t('invalid') });
      else {
        setMsg({ ok: true, text: r.joined ? t('joined', { company: r.account_name }) : t('already', { company: r.account_name }) });
        setTimeout(() => router.replace('/'), 1600);
      }
    } catch {
      setMsg({ ok: false, text: t('failed') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card padding={spacing.lg} style={{ gap: spacing.sm }}>
      <AppText weight="bold">{t('joinTitle')}</AppText>
      <AppText variant="small" color="textSoft">
        {t('joinHint')}
      </AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={t('joinPh')}
          placeholderTextColor={colors.textFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          style={{
            flex: 1,
            minHeight: sizes.touch,
            borderRadius: radius.md,
            borderWidth: 1.5,
            borderColor: colors.borderBlue,
            paddingHorizontal: spacing.md,
            color: colors.text,
            fontSize: 17,
            letterSpacing: 1,
            textAlign: 'left',
            writingDirection: 'ltr',
          }}
        />
        <Button label={t('joinGo')} size="md" loading={busy} disabled={value.replace(/\W/g, '').length < 6} onPress={join} />
      </View>
      {!!msg && (
        <AppText variant="small" weight="semibold" color={msg.ok ? 'green' : 'red'}>
          {msg.text}
        </AppText>
      )}
    </Card>
  );
}

function ShareButton({
  label,
  bg,
  icon,
  onPress,
  disabled,
}: {
  label: string;
  bg: string;
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexGrow: 1,
        flexBasis: '45%',
        minHeight: sizes.touch + 8,
        borderRadius: radius.pill,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: bg,
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      {icon}
      <AppText weight="bold" color="onDark">
        {label}
      </AppText>
    </Pressable>
  );
}
