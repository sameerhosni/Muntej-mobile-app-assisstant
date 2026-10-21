// "View as" for admins: one account can use the app as a manager or as an employee (Settings switch).
// Only the UI follows it (tabs, Home, Tasks, Saree3) — what the server lets you see and change stays your real role.
// Saved on the phone so the app reopens in the same view.
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '@/lib/api/types';

const STORAGE_KEY = 'viewAs';

export type ViewAs = 'manager' | 'employee';

let current: ViewAs = 'manager';
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(STORAGE_KEY)
    .then((v) => {
      if (v === 'employee' && current !== 'employee') {
        current = 'employee';
        emit();
      }
    })
    .catch(() => {});
}

export const viewAs = {
  set(v: ViewAs) {
    if (v === current) return;
    current = v;
    emit();
    AsyncStorage.setItem(STORAGE_KEY, v).catch(() => {});
  },
};

export function useViewAs(): ViewAs {
  load();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

export const canSwitchView = (role: Profile['role'] | undefined) => role === 'admin' || role === 'super_admin';

/** The profile as the UI should see it: admins viewing as an employee get role "employee"; the real one stays in actual_role. */
export function withView(p: Profile, v: ViewAs): Profile & { actual_role: Profile['role'] } {
  return { ...p, actual_role: p.role, role: canSwitchView(p.role) && v === 'employee' ? 'employee' : p.role };
}
