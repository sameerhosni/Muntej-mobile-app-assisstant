// «لما تخلصها:» on the task page (Nouran, 11 Nov: "the task type (set close or needs my review) only shows on the chat…
// it should show as well on the task detail screen"). The giver side switches it (👀 أراجعها أنا / ✓ تنقفل لحالها), put
// back if the save fails; everyone else reads what will really happen, with the name — the same rule as the Done button
// (ReviewBar closesDirectly). Hidden once it's sent for review, done or cancelled.
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AppText } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import type { Profile } from '@/lib/api';
import { setClosesItself } from '@/features/chat/api';
import { useFeatureOn } from '@/lib/useFeatureOn';

const en = {
  label: 'When it’s finished:',
  review: '👀 I review it',
  closes: '✓ Closes by itself',
  goesTo: 'goes to {{name}} to review',
  closesNow: 'closes as soon as Done is tapped',
  failed: 'Didn’t save. Try again?',
};
const ar: typeof en = {
  label: 'لما تخلصها:',
  review: '👀 أراجعها أنا',
  closes: '✓ تنقفل لحالها',
  goesTo: 'تروح لـ{{name}} يراجعها',
  closesNow: 'تنقفل على طول لما يضغط «خلصتها»',
  failed: 'ما انحفظ. جرّب مرة ثانية؟',
};
const NS = registerStrings('whenFinished', { en, ar });

type TaskLike = { id: string; status: string; owner_id: string | null; assigner_id: string | null; closes_itself?: boolean | null };
type Person = Pick<Profile, 'id' | 'full_name' | 'full_name_ar' | 'manager_id' | 'role'>;
const OPEN = ['draft', 'assigned', 'in_progress', 'blocked', 'returned'];

export function WhenFinished({ task, me, team }: { task: TaskLike; me: Person | undefined; team: Person[] }) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const qc = useQueryClient();
  const [value, setValue] = useState(!!task.closes_itself);
  const [failed, setFailed] = useState(false);
  useEffect(() => setValue(!!task.closes_itself), [task.closes_itself]);
  // testers first (feature when_finished)
  const on = useFeatureOn('when_finished');
  if (!on || !OPEN.includes(task.status) || !task.owner_id) return null;

  const person = (id: string | null | undefined) => team.find((p) => p.id === id);
  const first = (p: Person | undefined) => (p ? ((lang === 'ar' && p.full_name_ar) || p.full_name).split(' ')[0] : null);
  const owner = person(task.owner_id);
  const ownerManager = owner?.manager_id ?? null;
  const above = (() => {
    let cur = ownerManager;
    for (let i = 0; cur && i < 20; i++) {
      if (cur === me?.id) return true;
      cur = person(cur)?.manager_id ?? null;
    }
    return false;
  })();
  const amAdmin = me?.role === 'admin' || me?.role === 'super_admin';
  // the giver side (the same people the server lets change it)
  const canSwitch = !!me && task.owner_id !== me.id && (task.assigner_id === me.id || above || amAdmin);

  // what really happens when the doer taps Done (ReviewBar closesDirectly, seen from anyone)
  const giver = task.assigner_id && task.assigner_id !== task.owner_id ? person(task.assigner_id) : undefined;
  const reviewer = giver ?? person(ownerManager);
  const chainHas = (start: string | null | undefined, target: string | null) => {
    let cur = start ?? null;
    for (let i = 0; cur && i < 20; i++) {
      if (cur === target) return true;
      cur = person(cur)?.manager_id ?? null;
    }
    return false;
  };
  // the giver is below the doer: the doer's Done closes it (owner, 9 Nov)
  const giverBelowOwner = !!giver && chainHas(giver.manager_id, task.owner_id);
  const ownerAdmin = owner?.role === 'admin' || owner?.role === 'super_admin';
  const closesDirectly = value || !reviewer || ownerAdmin || giverBelowOwner;
  const reads = closesDirectly ? t('closesNow') : t('goesTo', { name: first(reviewer) ?? '…' });

  const pick = async (next: boolean) => {
    if (next === value) return;
    setFailed(false);
    setValue(next);
    try {
      await setClosesItself(task.id, next);
      void qc.invalidateQueries({ queryKey: ['task', task.id] });
    } catch (e) {
      console.error('closes_itself failed:', e instanceof Error ? e.message : String(e));
      setValue(!next);
      setFailed(true);
    }
  };

  const chip = (on: boolean, label: string, next: boolean) => (
    <Pressable
      key={label}
      onPress={() => pick(next)}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{ minHeight: sizes.touch, paddingHorizontal: spacing.md, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: on ? colors.primary : colors.primaryTint }}
    >
      <AppText variant="small" weight="bold" color={on ? 'onDark' : 'primary'}>
        {label}
      </AppText>
    </Pressable>
  );

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
        <AppText variant="small" weight="bold" color="textMuted">
          {t('label')}
        </AppText>
        {canSwitch ? (
          <>
            {chip(!value, t('review'), false)}
            {chip(value, t('closes'), true)}
          </>
        ) : (
          <AppText variant="small" weight="semibold" style={{ flexShrink: 1 }}>
            {reads}
          </AppText>
        )}
      </View>
      {canSwitch && (
        <AppText variant="caption" color="textMuted">
          {reads}
        </AppText>
      )}
      {failed && (
        <AppText variant="caption" color="red">
          {t('failed')}
        </AppText>
      )}
    </View>
  );
}
