// Chat card for "invite Faisal faisal@x.sa on WhatsApp 0555…": who was invited and one-tap WhatsApp (to that number) or any
// other app, with the message Saree3 wrote ready to send.
import type { ReactNode } from 'react';
import { Linking, Pressable, Share, View } from 'react-native';
import { MessageCircle, Share2 } from 'lucide-react-native';
import { AppText, Card } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { whatsappUrl } from './api';
import { INVITE_NS } from './strings';

/** email = who was invited (older cards carried a team code instead) */
export type InviteLinkPayload = { email?: string; code?: string; message: string; phone: string | null; name: string | null; account_name: string };

export function InviteLinkCard({ invite }: { invite: InviteLinkPayload }) {
  const { t } = useScreenT(INVITE_NS);
  const share = () => Share.share({ message: invite.message }).catch(() => {});
  return (
    <Card padding={spacing.lg} style={{ gap: spacing.md, borderWidth: 1.5, borderColor: colors.primary }}>
      <AppText selectable weight="extrabold" color="primary" align="center" style={{ fontSize: 18, writingDirection: 'ltr' }}>
        {invite.email ?? invite.code}
      </AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Btn
          label={invite.name ? `${t('whatsapp')} · ${invite.name}` : t('whatsapp')}
          bg="#25D366"
          icon={<MessageCircle color={colors.onDark} size={18} />}
          onPress={() => Linking.openURL(whatsappUrl(invite.message, invite.phone ?? undefined)).catch(share)}
        />
        <Btn label={t('share')} bg={colors.purple} icon={<Share2 color={colors.onDark} size={18} />} onPress={share} />
      </View>
    </Card>
  );
}

function Btn({ label, bg, icon, onPress }: { label: string; bg: string; icon: ReactNode; onPress: () => void }) {
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
        gap: 6,
        paddingHorizontal: spacing.md,
        backgroundColor: bg,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {icon}
      <AppText weight="bold" color="onDark" numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}
