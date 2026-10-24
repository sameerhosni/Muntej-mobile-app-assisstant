// Add people in one box (owner: the 8-field form was "the worst screen and the most difficult action"):
//   type an email, or a name and an email ("Faisal faisal@co.sa" / "فيصل faisal@co.sa"), or paste several at once
//   (one per line or separated by commas) → Add. Role (employee / manager) and who they report to are two chips with
//   sensible defaults; the name comes from what you typed or the email, the title is left for later. Each person gets
//   the invitation email, and a WhatsApp button to tell them too. The full form is only for editing someone.
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, Share, TextInput, View } from 'react-native';
import { MessageCircle, Share2 } from 'lucide-react-native';
import { AppText, Button, Card } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTeam } from '@/lib/api';
import { useUpsertPerson } from '@/features/org/model';
import { useMyAccounts } from '@/features/accounts/api';
import { emailInviteMessage, nameFromEmail, whatsappUrl } from './api';
import { INVITE_NS } from './strings';

const en = {
  box: 'Their email, or their name and email',
  boxHint: 'Several people? One per line, or separate them with commas.',
  role: 'Role',
  employee: 'Employee',
  manager: 'Manager',
  reportsTo: 'Reports to',
  you: 'You',
  add: 'Add',
  addN: 'Add {{n}}',
  noEmail: 'I need an email for each person (that’s how they sign in).',
  later: 'Their job title and the rest: they fill it in when they first sign in, or you edit it any time.',
};
const ar: typeof en & Record<string, string> = {
  box: 'إيميله، أو اسمه وإيميله',
  boxHint: 'أكثر من شخص؟ كل واحد بسطر، أو افصل بينهم بفاصلة.',
  role: 'الدور',
  employee: 'موظف',
  manager: 'مدير',
  reportsTo: 'يتبع لـ',
  you: 'أنت',
  add: 'أضف',
  addN: 'أضف {{n}}',
  noEmail: 'أحتاج إيميل لكل شخص (فيه يدخل).',
  later: 'مسماه الوظيفي والباقي: يعبّيها هو أول ما يدخل، أو تعدّلها أنت بأي وقت.',
};
const NS = registerStrings('quickAdd', { en, ar });

const EMAIL = /[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+/;
const ARABIC = /[؀-ۿ]/;

type Entry = { email: string; name: string; nameAr: string | null };

/** "Faisal Ali <faisal@co.sa>, noura@co.sa\nفيصل faisal2@co.sa" → one entry per email */
function parse(text: string): Entry[] | null {
  const parts = text.split(/[\n,;،]+/).map((x) => x.trim()).filter(Boolean);
  const out: Entry[] = [];
  for (const p of parts) {
    const m = p.match(EMAIL);
    if (!m) return null;
    const email = m[0].toLowerCase();
    const said = p.replace(m[0], '').replace(/[<>()"]/g, '').trim();
    const fromEmail = nameFromEmail(email);
    out.push(
      ARABIC.test(said)
        ? { email, name: fromEmail, nameAr: said }
        : { email, name: said || fromEmail, nameAr: null },
    );
  }
  return out;
}

export function QuickAdd({ managerId, onDone }: { managerId?: string | null; onDone?: (lastId: string) => void }) {
  const { t } = useScreenT(NS);
  const { t: ti } = useScreenT(INVITE_NS);
  const { lang, isRTL } = useDirection();
  const me = useMyProfile();
  const team = useTeam();
  const accounts = useMyAccounts();
  const upsert = useUpsertPerson();
  const [text, setText] = useState('');
  const [role, setRole] = useState<'employee' | 'manager'>('employee');
  const [boss, setBoss] = useState<string | null>(managerId === undefined ? (me.data?.id ?? null) : managerId);
  const [sent, setSent] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ar_ = lang === 'ar';
  const entries = text.trim() ? parse(text) : [];
  const ok = !!entries?.length;
  const first = (p: { full_name: string; full_name_ar?: string | null }) => ((ar_ && p.full_name_ar) || p.full_name).split(' ')[0];
  // who can be someone's manager: you, and the managers / admins on the team
  const leads = (team.data ?? []).filter((p) => p.id === me.data?.id || ['manager', 'admin', 'super_admin'].includes(p.role));
  const active = (accounts.data ?? []).find((a) => a.active);
  const company = active ? (ar_ && active.name_ar) || active.name : '';
  const inviter = me.data ? first(me.data) : '';

  const add = async () => {
    if (!entries?.length) return setErr(t('noEmail'));
    setErr(null);
    setBusy(true);
    let last = '';
    const done: string[] = [];
    for (const e of entries) {
      try {
        last = await upsert.mutateAsync({
          full_name: e.name,
          ...(e.nameAr ? { full_name_ar: e.nameAr } : {}),
          email: e.email,
          role,
          manager_id: boss,
        });
        done.push(e.email);
      } catch (x) {
        setErr(/already used/i.test((x as Error).message) ? `${e.email}: ${ti('emailTaken')}` : `${e.email}: ${(x as Error).message}`);
      }
    }
    setBusy(false);
    if (done.length) {
      setSent((s) => [...done, ...s.filter((x) => !done.includes(x))]);
      setText('');
      if (last) onDone?.(last);
    }
  };

  return (
    <View style={{ gap: spacing.lg }}>
      <Card padding={spacing.lg} style={{ gap: spacing.md }}>
        <AppText weight="bold">{t('box')}</AppText>
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            setErr(null);
          }}
          placeholder={ar_ ? 'فيصل faisal@company.sa' : 'Faisal faisal@company.sa'}
          placeholderTextColor={colors.textFaint}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          style={{
            minHeight: sizes.touch + 8,
            borderRadius: radius.md,
            borderWidth: 1.5,
            borderColor: colors.borderBlue,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            color: colors.text,
            fontSize: 16,
            textAlign: isRTL ? 'right' : 'left',
          }}
        />
        <AppText variant="caption" color="textMuted">
          {t('boxHint')}
        </AppText>

        <Chips label={t('role')}>
          {(['employee', 'manager'] as const).map((r) => (
            <Chip key={r} on={role === r} label={t(r)} onPress={() => setRole(r)} />
          ))}
        </Chips>
        {leads.length > 1 && (
          <Chips label={t('reportsTo')}>
            {leads.map((p) => (
              <Chip key={p.id} on={boss === p.id} label={p.id === me.data?.id ? t('you') : first(p)} onPress={() => setBoss(p.id)} />
            ))}
          </Chips>
        )}

        <Button
          label={entries && entries.length > 1 ? t('addN', { n: entries.length }) : t('add')}
          loading={busy}
          disabled={!ok}
          onPress={add}
        />
        {!!err && (
          <AppText variant="small" color="red">
            {err}
          </AppText>
        )}
        <AppText variant="caption" color="textFaint">
          {t('later')}
        </AppText>
      </Card>

      {/* everyone just added: tell them on WhatsApp too (the email may sit in spam) */}
      {sent.map((e) => {
        const message = emailInviteMessage(ti, { company, inviter, email: e });
        return (
          <Card key={e} padding={spacing.lg} style={{ gap: spacing.sm }}>
            <AppText variant="small" weight="semibold" color="green">
              {ti('emailSent', { email: e })}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {ti('tellThem')}
            </AppText>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pill label={ti('whatsapp')} bg="#25D366" icon={<MessageCircle color={colors.onDark} size={18} />} onPress={() => Linking.openURL(whatsappUrl(message)).catch(() => Share.share({ message }))} />
              <Pill label={ti('share')} bg={colors.purple} icon={<Share2 color={colors.onDark} size={18} />} onPress={() => Share.share({ message }).catch(() => {})} />
            </View>
          </Card>
        );
      })}
    </View>
  );
}

function Chips({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="caption" weight="bold" color="textMuted">
        {label}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View>
    </View>
  );
}

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={{
        minHeight: sizes.touch,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.pill,
        justifyContent: 'center',
        borderWidth: on ? 1.5 : 1,
        borderColor: on ? colors.primary : colors.border,
        backgroundColor: on ? colors.primaryTint : colors.surface,
      }}
    >
      <AppText weight="bold" color={on ? 'primary' : 'textSoft'}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Pill({ label, bg, icon, onPress }: { label: string; bg: string; icon: ReactNode; onPress: () => void }) {
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
