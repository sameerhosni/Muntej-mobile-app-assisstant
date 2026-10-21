// Munti's tiny store: on/off (saved on the phone), hidden-for-this-session, and the toast other code can trigger.
//   munti.celebrate('Task added!')  → jump + confetti + toast
//   munti.say('Hello')              → talking toast
//   munti.sayKey('value_followups', { n: 3, min: 30 }) → same, from the munti strings
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Href } from 'expo-router';
import i18n from '@/lib/i18n';
import { MUNTI_NS, type MuntiKey } from './tips';
import type { MuntiMood, MuntiTone } from './Munti';

const STORAGE_KEY = 'munti.enabled';

export type MuntiToast = { id: number; text: string; mood: MuntiMood; action?: Href };
export type SayOptions = { ms?: number; action?: Href };

/** a moment's colour on top of his status colour: gold = cheer, green = done, brand = thinking, red = needs you */
export type MuntiFlash = { id: number; tone: MuntiTone };

type State = { enabled: boolean; hidden: boolean; toast: MuntiToast | null; flash: MuntiFlash | null };

let state: State = { enabled: true, hidden: false, toast: null, flash: null };
const listeners = new Set<() => void>();
let nextId = 1;
let loaded = false;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let flashTimer: ReturnType<typeof setTimeout> | undefined;

function flash(tone: MuntiTone, ms = 2600) {
  clearTimeout(flashTimer);
  set({ flash: { id: nextId++, tone } });
  flashTimer = setTimeout(() => set({ flash: null }), ms);
}

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

function show(text: string, mood: MuntiMood, ms = 4500, action?: Href) {
  if (!state.enabled || state.hidden || !text) return;
  clearTimeout(toastTimer);
  set({ toast: { id: nextId++, text, mood, action } });
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
  celebrate(text?: string, opts: SayOptions = {}) {
    flash('gold');
    show(text ?? i18n.t(`${MUNTI_NS}.value_done`), 'celebrate', opts.ms, opts.action);
  },
  /** change his colour for a moment (e.g. green when a task is done, brand blue while he works) */
  flash(tone: MuntiTone, ms?: number) {
    flash(tone, ms);
  },
  endFlash() {
    clearTimeout(flashTimer);
    set({ flash: null });
  },
  say(text: string, mood: MuntiMood = 'talk', opts: SayOptions = {}) {
    show(text, mood, opts.ms, opts.action);
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
