// Settings → Accounts: the account you're in, and (with more than one, or as super admin) a tap to work in another.
// Plus ViewingBanner: a thin strip while the super admin is looking into an account they're not a member of.
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Check, Eye } from 'lucide-react-native';
import { AppText, Card, SectionTitle } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { accountName, switchAccount, useMyAccounts, type MyAccount } from './api';
import { ACCOUNTS_NS } from './strings';

export function AccountSwitcher() {
  const { t } = useScreenT(ACCOUNTS_NS);
  const { lang } = useDirection();
  const qc = useQueryClient();
  const accounts = useMyAccounts();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = accounts.data ?? [];
  if (!list.length) return null;
  const current = list.find((a) => a.active);

  // one account only: just say which one
  if (list.length === 1)
    return (
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Building2 color={colors.primary} size={20} strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color="textMuted">
            {t('account')}
          </AppText>
          <AppText weight="bold">{accountName(current, lang)}</AppText>
        </View>
      </Card>
    );

  const go = async (a: MyAccount) => {
    if (a.active) return;
    setBusy(a.id);
    setError(null);
    try {
      await switchAccount(qc, a.id);
      router.replace('/');
    } catch (e) {
      setError(t('switchFailed', { reason: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <SectionTitle title={t('accounts')} />
      <AppText variant="caption" color="textMuted">
        {t('switchHint')}
      </AppText>
      <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
        {list.map((a, i) => (
          <Pressable
            key={a.id}
            onPress={() => go(a)}
            disabled={!!busy}
            accessibilityRole="button"
            accessibilityState={{ selected: a.active }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              minHeight: sizes.touch + 8,
              paddingHorizontal: spacing.xs,
              borderTopWidth: i ? 1 : 0,
              borderTopColor: colors.border,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Building2 color={a.active ? colors.primary : colors.textMuted} size={18} strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <AppText weight={a.active ? 'bold' : 'semibold'}>{accountName(a, lang)}</AppText>
              <AppText variant="caption" color="textMuted">
                {t('people', { count: Number(a.people), n: Number(a.people) })}
                {!a.member ? ` · ${t('viewingOnly')}` : ''}
              </AppText>
            </View>
            {busy === a.id ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : a.active ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.primaryTint }}>
                <Check color={colors.primary} size={12} strokeWidth={2.6} />
                <AppText variant="micro" weight="extrabold" color="primary">
                  {t('current')}
                </AppText>
              </View>
            ) : null}
          </Pressable>
        ))}
      </Card>
      {!!error && (
        <AppText variant="small" color="red">
          {error}
        </AppText>
      )}
    </View>
  );
}

/** A thin strip on top while the super admin looks into an account they don't belong to (tap → back to their own). */
export function ViewingBanner() {
  const { t } = useScreenT(ACCOUNTS_NS);
  const { lang } = useDirection();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const accounts = useMyAccounts();
  const list = accounts.data ?? [];
  const current = list.find((a) => a.active);
  const home = list.find((a) => a.member);
  if (!current || current.member || !home) return null;
  return (
    <Pressable
      onPress={async () => {
        await switchAccount(qc, home.id).catch(() => {});
        router.replace('/');
      }}
      accessibilityRole="button"
      accessibilityLabel={`${t('viewing', { name: accountName(current, lang) })}. ${t('backHome')}`}
      style={{
        paddingTop: insets.top + 4,
        paddingBottom: 6,
        paddingHorizontal: spacing.lg,
        backgroundColor: colors.purple,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <Eye color={colors.onDark} size={14} strokeWidth={2.4} />
      <AppText variant="caption" weight="bold" color="onDark" style={{ flex: 1 }} numberOfLines={1}>
        {t('viewing', { name: accountName(current, lang) })}
      </AppText>
      <AppText variant="caption" weight="extrabold" color="onDark">
        {t('backHome')}
      </AppText>
    </Pressable>
  );
}
