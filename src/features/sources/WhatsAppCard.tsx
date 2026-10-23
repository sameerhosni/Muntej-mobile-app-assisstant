// Connect your tools → WhatsApp: Muntej's own WhatsApp number. Send or forward voice notes and messages to it and
// the tasks in them wait for your OK (supabase/functions/whatsapp). You add your own WhatsApp number once so Muntej
// knows it's you. Shows "needs setup" until the Meta WhatsApp Business setup is done on the server.
import { useEffect, useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react-native';
import { AppText, Button, Card, IconBadge } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { CONN_NS } from './connStrings';

type Info = { ready: boolean; number: string; mine: string | null };
const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: object) => Promise<{ data: unknown; error: { message: string } | null }>;

/** 966115209855 → +966 11 520 9855 (easier to read) */
const pretty = (d: string) => (d.startsWith('966') ? `+966 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : `+${d}`);

export function WhatsAppCard() {
  const { t } = useScreenT(CONN_NS);
  const qc = useQueryClient();
  const info = useQuery({
    queryKey: ['whatsappInfo'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<Info>('connect', { body: { action: 'whatsapp' } });
      if (error) throw error;
      return data!;
    },
  });
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (info.data?.mine) setPhone(info.data.mine);
  }, [info.data?.mine]);
  const i = info.data;

  const save = async () => {
    setBusy(true);
    setNote(null);
    const { error } = await rpc('set_my_phone', { p_phone: phone });
    setBusy(false);
    if (error) return setNote({ ok: false, text: /PHONE_FORMAT/.test(error.message) ? t('wa_badPhone') : t('error') });
    setNote({ ok: true, text: t('wa_saved') });
    qc.invalidateQueries({ queryKey: ['whatsappInfo'] });
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconBadge size={40} bg="greenTint">
          <MessageCircle color="#25D366" size={22} />
        </IconBadge>
        <View style={{ flex: 1 }}>
          <AppText weight="bold">{t('wa_title')}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('wa_sub')}
          </AppText>
        </View>
        {!!i && !i.ready && (
          <View style={{ paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.chip }}>
            <AppText variant="micro" weight="bold" color="textMuted">
              {t('needsSetup')}
            </AppText>
          </View>
        )}
      </View>
      {!!i && (
        <>
          <AppText variant="small" color="textSoft">
            {t('wa_how', { number: pretty(i.number) })}
          </AppText>
          {/* your own number: how Muntej knows a voice note is from you */}
          <AppText variant="small" weight="bold">
            {t('wa_mine')}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="05xxxxxxxx"
              placeholderTextColor={colors.textFaint}
              keyboardType="phone-pad"
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
            <Button label={t('wa_save')} size="md" loading={busy} disabled={phone.replace(/\D/g, '').length < 9} onPress={save} />
          </View>
          {!!note && (
            <AppText variant="small" weight="semibold" color={note.ok ? 'green' : 'red'}>
              {note.text}
            </AppText>
          )}
          {i.ready && !!i.mine && (
            <Button label={t('wa_open')} size="md" onPress={() => Linking.openURL(`https://wa.me/${i.number}`).catch(() => {})} />
          )}
        </>
      )}
    </Card>
  );
}
