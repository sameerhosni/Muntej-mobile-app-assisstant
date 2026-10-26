// A person's invitation on their sheet (Team): not invited / sent / opened / joined, with Invite or Send again.
// WhatsApp with a one-time join link when they have a mobile, email otherwise (invite function "send").
import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react-native';
import { AppText, Button, Card, Chip } from '@/components/ui';
import type { ChipTone } from '@/components/ui/Chip';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { sendInvites } from './api';

// invites is not in the generated database types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

type InviteRow = { channel: 'whatsapp' | 'email'; status: 'sent' | 'opened' | 'joined' | 'failed'; sent_at: string; error: string | null };

const en = {
  title: 'Invitation',
  none: 'Not invited yet',
  sent_whatsapp: 'Invited on WhatsApp',
  sent_email: 'Invited by email',
  opened: 'Opened the invite',
  joined: 'Joined ✅',
  failed: 'Didn’t go out',
  invite: 'Invite',
  again: 'Send again',
  on: '{{when}}',
  done_one: 'Sent ✓',
  done_other: 'Sent ✓',
  noWay: 'Add a mobile or an email first',
};
const ar: typeof en & Record<string, string> = {
  title: 'الدعوة',
  none: 'ما انرسلت له دعوة للحين',
  sent_whatsapp: 'انرسلت له على الواتساب',
  sent_email: 'انرسلت له بالإيميل',
  opened: 'فتح الدعوة',
  joined: 'دخل منتج ✅',
  failed: 'ما وصلت',
  invite: 'ادعه',
  again: 'أرسلها مرة ثانية',
  on: '{{when}}',
  done_one: 'انرسلت ✓',
  done_other: 'انرسلت ✓',
  noWay: 'أضف له جوال أو إيميل أول',
};
export const INVITE_STATUS_NS = registerStrings('inviteStatus', { en, ar });

const TONE: Record<InviteRow['status'], ChipTone> = { sent: 'primary', opened: 'amber', joined: 'green', failed: 'red' };

export function InviteStatus({ person }: { person: { id: string; user_id: string | null; phone: string | null; email: string | null } }) {
  const { t } = useScreenT(INVITE_STATUS_NS);
  const { lang } = useDirection();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['invites', person.id],
    queryFn: async (): Promise<InviteRow | null> => {
      const { data } = await untyped.from('invites').select('channel, status, sent_at, error').eq('profile_id', person.id).order('sent_at', { ascending: false }).limit(1);
      return (data ?? [])[0] ?? null;
    },
  });
  const last = q.data;
  const joined = !!person.user_id || last?.status === 'joined';
  const label = joined ? t('joined') : !last ? t('none') : last.status === 'sent' ? t(`sent_${last.channel}`) : t(last.status);
  const when = last ? new Date(last.sent_at).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' }) : null;

  const send = async () => {
    setBusy(true);
    setNote(null);
    try {
      await sendInvites([person.id], 'auto');
      setNote(t('done', { count: 1 }));
      await qc.invalidateQueries({ queryKey: ['invites', person.id] });
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Send color={colors.primary} size={16} />
        <AppText variant="cardTitle" style={{ flex: 1 }}>
          {t('title')}
        </AppText>
        <Chip label={label} tone={joined ? 'green' : last ? TONE[last.status] : 'neutral'} />
      </View>
      {!!when && !joined && (
        <AppText variant="caption" color="textMuted">
          {t('on', { when })}
        </AppText>
      )}
      {!joined &&
        (person.phone || person.email ? (
          <Button label={last ? t('again') : t('invite')} variant={last ? 'outline' : 'primary'} size="md" loading={busy} onPress={send} />
        ) : (
          <AppText variant="caption" color="textMuted">
            {t('noWay')}
          </AppText>
        ))}
      {!!note && (
        <AppText variant="caption" color="greenText">
          {note}
        </AppText>
      )}
    </Card>
  );
}
