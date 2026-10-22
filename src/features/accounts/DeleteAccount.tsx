// Settings → "Delete my account" (members only: admins and the super admin don't see it, and the server refuses).
// Two taps: the row opens a plain confirmation; Delete removes the login (supabase/functions/delete-account) and
// signs out. Tasks and history stay with the team.
import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react-native';
import { AppText, Button, Card } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { DELETE_NS } from './deleteStrings';

export function DeleteAccount({ role }: { role: string | undefined }) {
  const { t } = useScreenT(DELETE_NS);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!role || role === 'admin' || role === 'super_admin') return null;

  const remove = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.functions.invoke('delete-account', { body: {} });
    if (e) {
      setBusy(false);
      return setError(t('failed'));
    }
    qc.clear();
    await supabase.auth.signOut().catch(() => {});
  };

  if (!open)
    return <Button label={t('row')} variant="ghost" onPress={() => setOpen(true)} icon={<Trash2 color={colors.red} size={16} strokeWidth={2.2} />} />;

  return (
    <Card style={{ gap: spacing.md, backgroundColor: colors.redTint }}>
      <AppText weight="bold" color="red">
        {t('title')}
      </AppText>
      <AppText variant="small" color="textSoft">
        {t('body')}
      </AppText>
      {!!error && (
        <AppText variant="small" color="red">
          {error}
        </AppText>
      )}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label={t('keep')} variant="outline" onPress={() => setOpen(false)} disabled={busy} style={{ flex: 1 }} />
        <Button label={t('confirm')} onPress={remove} loading={busy} style={{ flex: 1, backgroundColor: colors.red }} />
      </View>
    </Card>
  );
}
