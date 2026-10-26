// Saree3 gets smaller as people get used to him (owner, 26 Oct: "after 2 or 3 days of using most of the Saree3 options,
// change his size to medium then small, not to disturb users"). We remember on the server (app_prefs.saree3) the days
// he was used and which of his options were tried; his drawing shrinks, his tap area stays full size (≥ 44 px), and he
// still grows when something needs you (support mode).
import { useCallback } from 'react';
import { useAppPrefs, useSaveAppPrefs } from '@/features/prefs/appPrefs';

/** how big he's drawn: normal → medium → small */
export const FAMILIAR_SCALE = { normal: 1, medium: 0.82, small: 0.66 } as const;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function useFamiliar() {
  const prefs = useAppPrefs();
  const save = useSaveAppPrefs();
  const s = prefs.data?.saree3 ?? {};
  const days = s.days ?? [];
  const used = s.used ?? [];
  // medium: 2 days of use and 3 of his options tried; small: 3+ days and most of them (4+)
  const scale = days.length >= 3 && used.length >= 4 ? FAMILIAR_SCALE.small : days.length >= 2 && used.length >= 3 ? FAMILIAR_SCALE.medium : FAMILIAR_SCALE.normal;

  /** one of his options was used (a quick ask, talking to him…): saved only when it adds a new day or option */
  const note = useCallback(
    (key: string) => {
      if (!prefs.data) return;
      const d = today();
      const newDay = !days.includes(d);
      const newKey = !used.includes(key);
      if (!newDay && !newKey) return;
      save.mutate({ saree3: { days: newDay ? [...days, d].slice(-14) : days, used: newKey ? [...used, key] : used } });
    },
    [prefs.data, days, used, save],
  );
  return { scale, note };
}
