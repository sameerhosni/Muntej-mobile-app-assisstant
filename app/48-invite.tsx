// Screen 48 · Invite people — no mockup; v2 light style per design/TOKENS.md
// Managers and admins bring people in, simplest first:
//   1. by email: type it, tap Invite. They get the invitation email and just sign in with that email: Muntej knows
//      their team from the email, no code.
//   2. the team code, for people whose email you don't have (WhatsApp, a group): one compact row with Copy, Edit
//      (pick your own, e.g. MNT-SAREE3) and New, then WhatsApp / other apps.
// (The chat does both too: "add noura@company.sa", "invite Faisal on WhatsApp 0555…".)
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { requireOptionalNativeModule } from 'expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, Copy, MessageCircle, Pencil, RefreshCw, Share2, X } from 'lucide-react-native';
import { AppText, Button, Card, IconButton } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { Munti } from '@/features/munti/Munti';
import { useUpsertPerson } from '@/features/org/model';
import { chooseInviteCode, inviteMessage, nameFromEmail, renewInviteCode, showCode, useInviteCode, whatsappUrl } from '@/features/invite/api';
import { INVITE_NS } from '@/features/invite/strings';

// the clipboard arrives with the next app build; until then Copy opens the share sheet (it has "Copy" too)
const canCopy = !!requireOptionalNativeModule('ExpoClipboard');
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function InviteScreen() {
  const { t } = useScreenT(INVITE_NS);
  const { isRTL } = useDirection();
  const insets = useSafeAreaInsets();

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
            {t('title')}
          </AppText>
          <Munti size="sm" mood="wave" />
        </View>
        <ByEmail />
        <TeamCode />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** 1. the easy way: their email → invitation email; they sign in with it and land in your team */
function ByEmail() {
  const { t } = useScreenT(INVITE_NS);
  const me = useMyProfile();
  const upsert = useUpsertPerson();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const ok = EMAIL.test(email.trim());
  const invite = async () => {
    const e = email.trim().toLowerCase();
    setErr(null);
    try {
      await upsert.mutateAsync({ full_name: nameFromEmail(e), email: e, role: 'employee', manager_id: me.data?.id ?? null });
      setSent((s) => [e, ...s]);
      setEmail('');
    } catch (x) {
      setErr(/already used/i.test((x as Error).message) ? t('emailTaken') : t('failed'));
    }
  };
  return (
    <Card padding={spacing.lg} style={{ gap: spacing.sm }}>
      <AppText weight="bold">{t('byEmail')}</AppText>
      <AppText variant="small" color="textSoft">
        {t('byEmailHint')}
      </AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="name@company.sa"
          placeholderTextColor={colors.textFaint}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          onSubmitEditing={() => ok && invite()}
          style={{
            flex: 1,
            minHeight: sizes.touch,
            borderRadius: radius.md,
            borderWidth: 1.5,
            borderColor: colors.borderBlue,
            paddingHorizontal: spacing.md,
            color: colors.text,
            fontSize: 16,
            textAlign: 'left',
            writingDirection: 'ltr',
          }}
        />
        <Button label={t('inviteGo')} size="md" loading={upsert.isPending} disabled={!ok} onPress={invite} />
      </View>
      {!!err && (
        <AppText variant="small" color="red">
          {err}
        </AppText>
      )}
      {sent.map((e) => (
        <AppText key={e} variant="small" weight="semibold" color="green">
          {t('emailSent', { email: e })}
        </AppText>
      ))}
    </Card>
  );
}

/** 2. the team code: copy, pick your own, or a new one; then WhatsApp / other apps */
function TeamCode() {
  const { t } = useScreenT(INVITE_NS);
  const { lang } = useDirection();
  const qc = useQueryClient();
  const me = useMyProfile();
  const code = useInviteCode(!!me.data && me.data.role !== 'employee');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const c = code.data;
  const inviter = me.data ? ((lang === 'ar' && me.data.full_name_ar) || me.data.full_name).split(' ')[0] : '';
  const message = c ? inviteMessage(t, c, inviter) : '';

  const copy = async () => {
    if (!c) return;
    if (!canCopy) return Share.share({ message: showCode(c.code) }).catch(() => {});
    const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
    await Clipboard.setStringAsync(showCode(c.code));
    setNote({ ok: true, text: t('copied') });
  };
  const renew = async () => {
    if (!c) return;
    setBusy(true);
    await renewInviteCode(qc, c.code).catch(() => {});
    setBusy(false);
    setNote({ ok: true, text: t('renewed') });
  };
  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      await chooseInviteCode(qc, draft);
      setEditing(false);
      setNote({ ok: true, text: t('codeSaved') });
    } catch (e) {
      const m = (e as Error).message;
      setNote({ ok: false, text: m === 'CODE_TAKEN' ? t('codeTaken') : m === 'CODE_FORMAT' ? t('codeFormat') : t('failed') });
    } finally {
      setBusy(false);
    }
  };
  const until = c
    ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'long' }).format(
        new Date(c.expires_at),
      )
    : '';

  return (
    <Card padding={spacing.lg} style={{ gap: spacing.sm }}>
      <AppText weight="bold">{t('byCode')}</AppText>
      <AppText variant="small" color="textSoft">
        {t('byCodeHint', { company: c?.account_name ?? '…' })}
      </AppText>

      {/* the code, with Copy · Edit · New right next to it */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          minHeight: sizes.touch + 8,
          paddingStart: spacing.md,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: colors.primary,
          backgroundColor: colors.primaryTint,
        }}
      >
        {editing ? (
          <>
            <AppText weight="extrabold" color="primary" style={{ fontSize: 20, writingDirection: 'ltr' }}>
              MNT-
            </AppText>
            <TextInput
              value={draft}
              onChangeText={(v) =>
                setDraft(
                  v
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 12),
                )
              }
              autoFocus
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="SAREE3"
              placeholderTextColor={colors.textFaint}
              onSubmitEditing={save}
              style={{
                flex: 1,
                minHeight: sizes.touch,
                color: colors.primary,
                fontSize: 20,
                fontWeight: '800',
                textAlign: 'left',
                writingDirection: 'ltr',
              }}
            />
            <Icon label={t('save')} onPress={save} disabled={draft.length < 6 || busy}>
              {busy ? <ActivityIndicator color={colors.primary} /> : <Check color={colors.green} size={20} />}
            </Icon>
            <Icon label={t('cancel')} onPress={() => setEditing(false)}>
              <X color={colors.textMuted} size={20} />
            </Icon>
          </>
        ) : (
          <>
            <View style={{ flex: 1 }}>
              {c ? (
                <>
                  <AppText
                    selectable
                    weight="extrabold"
                    color="primary"
                    style={{ fontSize: 20, letterSpacing: 1, writingDirection: 'ltr', textAlign: 'left' }}
                  >
                    {showCode(c.code)}
                  </AppText>
                  <AppText variant="micro" color="textMuted">
                    {t('validUntil', { date: until })}
                    {c.uses ? ` · ${t('used', { count: c.uses })}` : ''}
                  </AppText>
                </>
              ) : (
                <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} />
              )}
            </View>
            <Icon label={t('copy')} onPress={copy} disabled={!c}>
              <Copy color={colors.primary} size={19} />
            </Icon>
            <Icon
              label={t('edit')}
              onPress={() => {
                setDraft('');
                setNote(null);
                setEditing(true);
              }}
              disabled={!c}
            >
              <Pencil color={colors.primary} size={19} />
            </Icon>
            <Icon label={t('renew')} onPress={renew} disabled={!c || busy}>
              <RefreshCw color={colors.primary} size={19} />
            </Icon>
          </>
        )}
      </View>
      {!!note && (
        <AppText variant="small" weight="semibold" color={note.ok ? 'green' : 'red'}>
          {note.text}
        </AppText>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <ShareButton
          label={t('whatsapp')}
          bg="#25D366"
          icon={<MessageCircle color={colors.onDark} size={18} />}
          disabled={!c}
          onPress={() => Linking.openURL(whatsappUrl(message)).catch(() => Share.share({ message }))}
        />
        <ShareButton
          label={t('share')}
          bg={colors.purple}
          icon={<Share2 color={colors.onDark} size={18} />}
          disabled={!c}
          onPress={() => Share.share({ message }).catch(() => {})}
        />
      </View>
    </Card>
  );
}

function Icon({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: sizes.touch,
        height: sizes.touch,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      {children}
    </Pressable>
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
        flex: 1,
        minHeight: sizes.touch,
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
