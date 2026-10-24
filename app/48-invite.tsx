// Screen 48 · Invite people — no mockup; v2 light style per design/TOKENS.md
// Managers and admins bring people in by email, nothing else: type it, tap Invite. They get the invitation email and
// just sign in with that email: Muntej knows their team from the email (no codes). Each invited person can also be
// told on WhatsApp (or any app) with one tap: the download link + "sign in with <their email>".
// (The chat does the same: "add noura@company.sa", "invite Faisal faisal@company.sa on WhatsApp 0555…".)
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { AppText, IconButton } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { Munti } from '@/features/munti/Munti';
import { QuickAdd } from '@/features/invite/QuickAdd';
import { INVITE_NS } from '@/features/invite/strings';


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

        {/* one box: email, or name + email, several at once; role and manager as chips */}
        <QuickAdd />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

