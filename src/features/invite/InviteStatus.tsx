// A person's invitation on their sheet (Team): not invited / sent / opened / joined, with Invite or Send again.
// WhatsApp with a one-time join link when they have a mobile, email otherwise (invite function "send").
import { useState } from 'react';
import { intlTag } from '@/lib/i18n/locale';
import { Share, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react-native';
import { AppText, Button, Card, Chip } from '@/components/ui';
import type { ChipTone } from '@/components/ui/Chip';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { joinLink, sendInvites, useInviteStates, type InviteState } from './api';

const en = {
  title: 'Invitation',
  none: 'Not invited yet',
  sent_whatsapp: 'Invited on WhatsApp',
  sent_email: 'Invited by email',
  sent_app: 'Told in the app. They haven’t opened your company yet',
  sent_link: 'Join link shared',
  opened: 'Opened the invite',
  joined: 'Joined ✅',
  failed: 'Didn’t go out',
  invite: 'Invite',
  again: 'Send again',
  on: '{{when}}',
  done_one: 'Sent ✓',
  done_other: 'Sent ✓',
  noWay: 'No mobile or email, so I can’t tell them. Share this link with them, or add a mobile or an email.',
  shareLink: 'Share their join link',
  shareMsg: 'Hi {{name}}! You’ve been added to your team on Muntej. Open this link on your phone to join: {{url}}',
};
const ar: typeof en & Record<string, string> = {
  title: 'الدعوة',
  none: 'ما انرسلت له دعوة للحين',
  sent_whatsapp: 'انرسلت له على الواتساب',
  sent_email: 'انرسلت له بالإيميل',
  sent_app: 'انبلّغ في التطبيق، وما فتح شركتك للحين',
  sent_link: 'انرسل له رابط الدخول',
  opened: 'فتح الدعوة',
  joined: 'دخل منتج ✅',
  failed: 'ما وصلت',
  invite: 'ادعه',
  again: 'أرسلها مرة ثانية',
  on: '{{when}}',
  done_one: 'انرسلت ✓',
  done_other: 'انرسلت ✓',
  noWay: 'ما عنده جوال ولا إيميل، فما أقدر أبلّغه. شارك له هالرابط، أو أضف له جوال أو إيميل.',
  shareLink: 'شارك رابط الدخول',
  shareMsg: 'هلا {{name}}! انضفت لفريقك على منتج. افتح هالرابط من جوالك عشان تدخل: {{url}}',
};
export const INVITE_STATUS_NS = registerStrings('inviteStatus', { en, ar });

const TONE: Record<InviteState['status'], ChipTone> = { sent: 'primary', opened: 'amber', joined: 'green', failed: 'red' };

export function InviteStatus({ person }: { person: { id: string; user_id: string | null; phone: string | null; email: string | null; status: string; full_name: string; full_name_ar: string | null } }) {
  const { t } = useScreenT(INVITE_STATUS_NS);
  const { lang } = useDirection();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const last = useInviteStates().data?.get(person.id) ?? null;
  // a login alone isn't joining: someone who already uses Muntej stays pending until they open this company
  const joined = (!!person.user_id && person.status !== 'pending') || last?.status === 'joined';
  const label = joined ? t('joined') : !last ? t('none') : last.status === 'sent' ? t(`sent_${last.channel}`) : t(last.status);
  const when = last ? new Date(last.sent_at).toLocaleDateString(intlTag(lang, 'ar-SA-u-ca-gregory-nu-latn', 'en-GB'), { day: 'numeric', month: 'short' }) : null;

  const send = async () => {
    setBusy(true);
    setNote(null);
    try {
      await sendInvites([person.id], 'auto');
      setNote(t('done', { count: 1 }));
      await qc.invalidateQueries({ queryKey: ['invites'] });
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const shareLink = async () => {
    setBusy(true);
    setNote(null);
    try {
      const url = await joinLink(person.id);
      const name = ((lang === 'ar' && person.full_name_ar) || person.full_name).split(' ')[0];
      await Share.share({ message: t('shareMsg', { name, url }) });
      await qc.invalidateQueries({ queryKey: ['invites'] });
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
        (person.phone || person.email || person.user_id ? (
          <>
            <Button label={last ? t('again') : t('invite')} variant={last ? 'outline' : 'primary'} size="md" loading={busy} onPress={send} />
            {/* the email may never arrive: the manager can send them in anywhere they already talk */}
            {!!last && last.channel !== 'app' && <Button label={t('shareLink')} variant="outline" size="md" loading={busy} onPress={shareLink} />}
          </>
        ) : (
          <>
            <AppText variant="caption" color="amberText">
              {t('noWay')}
            </AppText>
            <Button label={t('shareLink')} variant={last ? 'outline' : 'primary'} size="md" loading={busy} onPress={shareLink} />
          </>
        ))}
      {!!note && (
        <AppText variant="caption" color="greenText">
          {note}
        </AppText>
      )}
    </Card>
  );
}
