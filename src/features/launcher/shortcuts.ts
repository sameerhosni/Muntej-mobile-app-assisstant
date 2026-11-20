// Your shortcuts (owner, 20 Nov: "many icons in home page … something like android user experience here and open only
// selected one", then "Both options in saree3 settings and the side bar one to be closed and opened easily"):
// the places you picked (up to MAX, in your order), and how they open: a side panel on Home or Saree3's speed dial.
// Saved per seat with the other app prefs (app_prefs.saree3.launcher / .shortcuts), so they follow you to a new phone.
// "Everything Muntej does" is always there as the last one, the way to anything not on the list.
import { useSyncExternalStore, type ComponentType } from 'react';
import type { Href } from 'expo-router';
import { LayoutGrid, type LucideProps } from 'lucide-react-native';
import { colors, type ColorToken } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { MORE_NS } from '@/features/more/strings';
import { useAppPrefs, useSaveAppPrefs } from '@/features/prefs/appPrefs';
import { FEATURES, useMyFeatures, type FeatureKey } from '@/features/prefs/featureCards';
import { track } from '@/lib/analytics';
import { LAUNCHER_NS } from './strings';

export const MAX_SHORTCUTS = 6;
export type LauncherStyle = 'panel' | 'saree3';
export type ShortcutItem = { key: string; label: string; Icon: ComponentType<LucideProps>; bg: ColorToken; fg: string; href: Href };

/** what a manager and an employee start with (the old shortcut row on their Home) */
const DEFAULTS: Record<'manager' | 'employee', FeatureKey[]> = {
  manager: ['week', 'team', 'incoming', 'decisions'],
  employee: ['week', 'waiting', 'incoming', 'achievements'],
};

export function useShortcuts() {
  const { t } = useScreenT(MORE_NS);
  const { t: tl } = useScreenT(LAUNCHER_NS);
  const me = useMyProfile();
  const prefs = useAppPrefs();
  const save = useSaveAppPrefs();
  const mine = useMyFeatures();
  const role = me.data?.role === 'employee' ? 'employee' : 'manager';
  const s = prefs.data?.saree3 ?? {};
  const style: LauncherStyle = s.launcher === 'saree3' ? 'saree3' : 'panel';
  // only what this role may open (an employee never gets a manager page, even from an old list)
  const allowed = new Set(mine.map((f) => f.key as string));
  const keys = (s.shortcuts ?? DEFAULTS[role]).filter((k) => allowed.has(k)).slice(0, MAX_SHORTCUTS);
  const item = (k: string): ShortcutItem | null => {
    const f = FEATURES.find((x) => x.key === k);
    return f ? { key: f.key, label: t(f.key), Icon: f.Icon, bg: f.bg, fg: f.fg, href: f.href } : null;
  };
  const items = keys.map(item).filter((x): x is ShortcutItem => !!x);
  const more: ShortcutItem = { key: 'more', label: tl('more'), Icon: LayoutGrid, bg: 'chip', fg: colors.textSoft, href: '/44-more' as Href };
  // never before the saved prefs are in: writing from an empty start would wipe the rest of saree3 (reviewer, 20 Nov)
  const write = (patch: { launcher?: LauncherStyle; shortcuts?: string[] }) => {
    if (!prefs.data) return;
    save.mutate({ saree3: { ...s, ...patch } });
  };
  return {
    ready: !!prefs.data && !!me.data,
    failed: prefs.isError,
    retry: () => prefs.refetch(),
    style,
    keys,
    items,
    more,
    /** everything this role can add, as items */
    catalog: mine.map((f) => item(f.key)).filter((x): x is ShortcutItem => !!x),
    setStyle: (launcher: LauncherStyle) => {
      track('shortcuts_style', { style: launcher });
      write({ launcher });
    },
    setKeys: (next: string[]) => write({ shortcuts: next.slice(0, MAX_SHORTCUTS) }),
  };
}

// ─── open or closed (the panel on Home and Saree3's speed dial share it; one place opens at a time) ───────────
let openNow = false;
const listeners = new Set<() => void>();
export const shortcutsOpen = {
  set(v: boolean) {
    if (openNow === v) return;
    openNow = v;
    listeners.forEach((l) => l());
  },
  toggle() {
    shortcutsOpen.set(!openNow);
  },
};
export function useShortcutsOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => openNow,
    () => openNow,
  );
}
