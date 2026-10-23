// Screen 48 · Invite people — no mockup; v2 light style per design/TOKENS.md
// Managers and admins bring people in by email, nothing else: type it, tap Invite. They get the invitation email and
// just sign in with that email: Muntej knows their team from the email (no codes). Each invited person can also be
// told on WhatsApp (or any app) with one tap: the download link + "sign in with <their email>".
// (The chat does the same: "add noura@company.sa", "invite Faisal faisal@company.sa on WhatsApp 0555…".)
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Linking, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, MessageCircle, Share2 } from 'lucide-react-native';
import { AppText, Button, Card, IconButton } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { Munti } from '@/features/munti/Munti';
import { useUpsertPerson } from '@/features/org/model';
import { useMyAccounts } from '@/features/accounts/api';
import { emailInviteMessage, nameFromEmail, whatsappUrl } from '@/features/invite/api';
import { INVITE_NS } from '@/features/invite/strings';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function InviteScreen() {
  const { t } = useScreenT(INVITE_NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const me = useMyProfile();
  const accounts = useMyAccounts();
  const upsert = useUpsertPerson();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const ok = EMAIL.test(email.trim());
  const active = (accounts.data ?? []).find((a) => a.active);
  const company = active ? (lang === 'ar' && active.name_ar) || active.name : '';
  const inviter = me.data ? ((lang === 'ar' && me.data.full_name_ar) || me.data.full_name).split(' ')[0] : '';

  const invite = async () => {
    const e = email.trim().toLowerCase();
    setErr(null);
    try {
      await upsert.mutateAsync({ full_name: nameFromEmail(e), email: e, role: 'employee', manager_id: me.data?.id ?? null });
      setSent((s) => [e, ...s.filter((x) => x !== e)]);
      setEmail('');
    } catch (x) {
      setErr(/already used/i.test((x as Error).message) ? t('emailTaken') : t('failed'));
    }
  };

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
        </Card>

        {/* everyone invited now: tell them on WhatsApp too (the email may sit in spam) */}
        {sent.map((e) => {
          const message = emailInviteMessage(t, { company, inviter, email: e });
          return (
            <Card key={e} padding={spacing.lg} style={{ gap: spacing.sm }}>
              <AppText variant="small" weight="semibold" color="green">
                {t('emailSent', { email: e })}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {t('tellThem')}
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <ShareButton
                  label={t('whatsapp')}
                  bg="#25D366"
                  icon={<MessageCircle color={colors.onDark} size={18} />}
                  onPress={() => Linking.openURL(whatsappUrl(message)).catch(() => Share.share({ message }))}
                />
                <ShareButton
                  label={t('share')}
                  bg={colors.purple}
                  icon={<Share2 color={colors.onDark} size={18} />}
                  onPress={() => Share.share({ message }).catch(() => {})}
                />
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ShareButton({ label, bg, icon, onPress }: { label: string; bg: string; icon: ReactNode; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
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
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {icon}
      <AppText weight="bold" color="onDark">
        {label}
      </AppText>
    </Pressable>
  );
}
