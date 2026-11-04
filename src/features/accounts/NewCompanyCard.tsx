// On top of every screen when this login was added to one more company and hasn't opened it (owner's employee, 4 Nov:
// "I downloaded the app, but never found any notification to join"). Open = switch to it, which also makes them active
// and tells their manager (switch_account). Later hides it until tomorrow; the company stays in Settings → Accounts.
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Building2 } from 'lucide-react-native';
import { AppText, Button } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { switchAccount } from './api';

type NewCompany = { account_id: string; name: string; name_ar: string | null; added_by: string | null; added_by_ar: string | null; active: boolean };

const en = {
  addedBy: '{{who}} added you to {{company}}',
  added: 'You were added to {{company}}',
  hint: 'Your team and your tasks are waiting there.',
  open: 'Open',
  later: 'Later',
};
const ar: typeof en & Record<string, string> = {
  addedBy: '{{who}} أضافك لـ {{company}}',
  added: 'انضفت لـ {{company}}',
  hint: 'فريقك ومهامك ينتظرونك هناك.',
  open: 'افتحها',
  later: 'بعدين',
};
const NS = registerStrings('newCompany', { en, ar });

const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const laterKey = (id: string) => `newCompany.later.${id}`;

export function NewCompanyCard() {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['newCompanies'],
    queryFn: async (): Promise<NewCompany[]> => {
      const { data, error } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: NewCompany[] | null; error: { message: string } | null }>)('my_new_companies');
      if (error) throw new Error(error.message);
      const list = data ?? [];
      const later = await Promise.all(list.map((c) => AsyncStorage.getItem(laterKey(c.account_id)).catch(() => null)));
      return list.filter((_, i) => later[i] !== today());
    },
    staleTime: 60_000,
  });
  const list = q.data ?? [];

  // already working in it (their only company, say): that's joining; nothing to ask
  const inside = list.find((c) => c.active);
  useEffect(() => {
    if (inside) switchAccount(qc, inside.account_id).catch(() => {});
  }, [inside, qc]);

  const next = list.find((c) => !c.active && c.account_id !== hidden);
  if (!next) return null;
  const company = (lang === 'ar' && next.name_ar) || next.name;
  const who = (lang === 'ar' && next.added_by_ar) || next.added_by;

  const open = async () => {
    setBusy(true);
    try {
      await switchAccount(qc, next.account_id);
      router.replace('/');
    } catch {
      // stays on screen; they can try again or use Settings
    } finally {
      setBusy(false);
    }
  };
  const later = () => {
    setHidden(next.account_id);
    AsyncStorage.setItem(laterKey(next.account_id), today()).catch(() => {});
  };

  return (
    <View
      style={{
        paddingTop: insets.top + spacing.sm,
        paddingBottom: spacing.md,
        paddingHorizontal: spacing.lg,
        backgroundColor: colors.primary,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Building2 color={colors.onDark} size={18} strokeWidth={2.2} />
        <View style={{ flex: 1 }}>
          <AppText weight="bold" color="onDark" numberOfLines={2}>
            {who ? t('addedBy', { who, company }) : t('added', { company })}
          </AppText>
          <AppText variant="caption" color="onDark">
            {t('hint')}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button label={t('open')} variant="outline" size="md" loading={busy} onPress={open} />
        </View>
        <Pressable
          onPress={later}
          accessibilityRole="button"
          accessibilityLabel={t('later')}
          style={{ minHeight: sizes.touch, minWidth: sizes.touch, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill }}
        >
          <AppText weight="semibold" color="onDark">
            {t('later')}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
