// Munti's tiny store: on/off (saved on the phone), hidden-for-this-session, and the toast other code can trigger.
//   munti.celebrate('Task added!')  → jump + confetti + toast
//   munti.say('Hello')              → talking toast
//   munti.sayKey('value_followups', { n: 3, min: 30 }) → same, from the munti strings
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '@/lib/i18n';
import { MUNTI_NS, type MuntiKey } from './tips';
import type { MuntiMood } from './Munti';

const STORAGE_KEY = 'munti.enabled';

export type MuntiToast = { id: number; text: string; mood: MuntiMood };

type State = { enabled: boolean; hidden: boolean; toast: MuntiToast | null };

let state: State = { enabled: true, hidden: false, toast: null };
const listeners = new Set<() => void>();
let nextId = 1;
let loaded = false;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(STORAGE_KEY)
    .then((v) => {
      if (v === '0') set({ enabled: false });
    })
    .catch(() => {});
}

function show(text: string, mood: MuntiMood, ms = 4500) {
  if (!state.enabled || state.hidden || !text) return;
  clearTimeout(toastTimer);
  set({ toast: { id: nextId++, text, mood } });
  toastTimer = setTimeout(() => set({ toast: null }), ms);
}

export const munti = {
  setEnabled(enabled: boolean) {
    set({ enabled, toast: enabled ? state.toast : null, hidden: enabled ? false : state.hidden });
    AsyncStorage.setItem(STORAGE_KEY, enabled ? '1' : '0').catch(() => {});
  },
  /** Long-press: gone until the app is opened again. */
  hideForSession() {
    clearTimeout(toastTimer);
    set({ hidden: true, toast: null });
  },
  celebrate(text?: string) {
    show(text ?? i18n.t(`${MUNTI_NS}.value_done`), 'celebrate');
  },
  say(text: string, mood: MuntiMood = 'talk') {
    show(text, mood);
  },
  /** value_* lines celebrate by default, everything else talks. */
  sayKey(key: MuntiKey, vars?: Record<string, string | number>, mood?: MuntiMood) {
    show(i18n.t(`${MUNTI_NS}.${key}`, vars), mood ?? (key.startsWith('value_') ? 'celebrate' : 'talk'));
  },
  dismiss() {
    clearTimeout(toastTimer);
    set({ toast: null });
  },
};

export function useMunti(): State {
  load();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
