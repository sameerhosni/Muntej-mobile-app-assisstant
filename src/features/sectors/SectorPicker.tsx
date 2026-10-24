// "What's your field?" — five big choices with the tools each one brings. Used in Saree3's setup guide, in Settings
// and at the top of the tools screen when no sector is picked yet. Managers can also apply it to their whole team.
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { BriefcaseBusiness, Code2, LineChart, Settings2, UsersRound, type LucideProps } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { AppText } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { SECTORS, useMySector, useSetSector, type Sector } from './sectors';

const en = {
  ask: 'What’s your field? I’ll put your tools first',
  s_sales: 'Sales',
  s_sales_tools: 'Email, WhatsApp, CRM (HubSpot, Zoho, Odoo, Salesforce)',
  s_tech: 'Tech / development',
  s_tech_tools: 'Jira, Azure DevOps, GitHub, Slack, Teams',
  s_product: 'Product',
  s_product_tools: 'Gmail, Outlook, meetings, Jira, Azure DevOps',
  s_operations: 'Operations / admin',
  s_operations_tools: 'Email, WhatsApp, Trello, ClickUp, Odoo',
  s_hr: 'HR',
  s_hr_tools: 'Email, WhatsApp, Zoho People, Odoo',
  everyone: 'Same for my whole team (who hasn’t picked)',
  saved: 'Done ✓ Your tools are first now',
  failed: 'Didn’t save: {{reason}}',
  yourTools: 'Your tools · {{sector}}',
  change: 'Change',
  moreTools: 'More tools ({{n}})',
  lessTools: 'Fewer tools',
  tool_odoo: 'Odoo',
  tool_zoho: 'Zoho',
  tool_hubspot: 'HubSpot',
  tool_salesforce: 'Salesforce',
  tool_github: 'GitHub',
  tool_teams: 'Microsoft Teams',
  mySector: 'My field of work',
};
const ar: typeof en & Record<string, string> = {
  ask: 'وش مجال شغلك؟ أحط أدواتك أول شي',
  s_sales: 'المبيعات',
  s_sales_tools: 'الإيميل، الواتساب، أنظمة العملاء (HubSpot، Zoho، Odoo، Salesforce)',
  s_tech: 'التقنية / التطوير',
  s_tech_tools: 'Jira، Azure DevOps، GitHub، Slack، Teams',
  s_product: 'إدارة المنتج',
  s_product_tools: 'جيميل، أوتلوك، الاجتماعات، Jira، Azure DevOps',
  s_operations: 'العمليات / الإدارة',
  s_operations_tools: 'الإيميل، الواتساب، Trello، ClickUp، Odoo',
  s_hr: 'الموارد البشرية',
  s_hr_tools: 'الإيميل، الواتساب، Zoho People، Odoo',
  everyone: 'نفسه لكل فريقي (اللي ما اختار)',
  saved: 'تم ✓ أدواتك صارت أول شي',
  failed: 'ما انحفظ: {{reason}}',
  yourTools: 'أدواتك · {{sector}}',
  change: 'غيّر',
  moreTools: 'أدوات أكثر ({{n}})',
  lessTools: 'أدوات أقل',
  tool_odoo: 'أودو',
  tool_zoho: 'زوهو',
  tool_hubspot: 'هب سبوت',
  tool_salesforce: 'سيلز فورس',
  tool_github: 'جت هب',
  tool_teams: 'مايكروسوفت تيمز',
  mySector: 'مجال شغلي',
};
export const SECTOR_NS = registerStrings('sectors', { en, ar });

const ICON: Record<Sector, ComponentType<LucideProps>> = {
  sales: BriefcaseBusiness,
  tech: Code2,
  product: LineChart,
  operations: Settings2,
  hr: UsersRound,
};

export function SectorPicker({ onPicked, showAsk = true }: { onPicked?: (s: Sector) => void; showAsk?: boolean }) {
  const { t } = useScreenT(SECTOR_NS);
  const me = useMyProfile();
  const current = useMySector();
  const save = useSetSector();
  const [everyone, setEveryone] = useState(true);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const role = me.data?.role;
  const leads = role === 'admin' || role === 'super_admin' || role === 'manager';

  const pick = (s: Sector) => {
    setNote(null);
    save.mutate(
      { sector: s, everyone: leads && everyone },
      {
        onSuccess: () => {
          setNote({ ok: true, text: t('saved') });
          onPicked?.(s);
        },
        onError: (e) => setNote({ ok: false, text: t('failed', { reason: (e as Error).message }) }),
      },
    );
  };

  return (
    <View style={{ gap: spacing.sm }}>
      {showAsk && <AppText weight="bold">{t('ask')}</AppText>}
      {SECTORS.map((s) => {
        const Icon = ICON[s];
        const on = current === s;
        return (
          <Pressable
            key={s}
            onPress={() => pick(s)}
            disabled={save.isPending}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              minHeight: sizes.touch + 12,
              padding: spacing.md,
              borderRadius: radius.tile,
              borderWidth: on ? 1.5 : 1,
              borderColor: on ? colors.primary : colors.border,
              backgroundColor: on ? colors.primaryTint : colors.surface,
              opacity: pressed || save.isPending ? 0.8 : 1,
            })}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryTint }}>
              <Icon color={colors.primary} size={18} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText weight="bold">{t(`s_${s}`)}</AppText>
              <AppText variant="caption" color="textMuted">
                {t(`s_${s}_tools`)}
              </AppText>
            </View>
          </Pressable>
        );
      })}
      {leads && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: sizes.touch }}>
          <AppText variant="small" style={{ flex: 1 }}>
            {t('everyone')}
          </AppText>
          <Switch value={everyone} onValueChange={setEveryone} trackColor={{ true: colors.primary }} />
        </View>
      )}
      {!!note && (
        <AppText variant="small" weight="semibold" color={note.ok ? 'green' : 'red'}>
          {note.text}
        </AppText>
      )}
    </View>
  );
}

/** Settings: "My field of work · Sales" — tap to change it */
export function SectorSetting() {
  const { t } = useScreenT(SECTOR_NS);
  const current = useMySector();
  const [open, setOpen] = useState(false);
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        padding: spacing.lg,
        gap: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: sizes.touch }}
      >
        <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryTint }}>
          <BriefcaseBusiness color={colors.primary} size={20} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="cardTitle">{t('mySector')}</AppText>
          <AppText variant="caption" color="textMuted">
            {current ? t(`s_${current}`) : t('ask')}
          </AppText>
        </View>
        <AppText variant="small" weight="bold" color="primary">
          {t('change')}
        </AppText>
      </Pressable>
      {open && <SectorPicker showAsk={false} onPicked={() => setOpen(false)} />}
    </View>
  );
}
