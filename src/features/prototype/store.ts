import { useSyncExternalStore } from 'react';
import { SCREENS, type ScreenMeta, type ScreenNum } from '@/features/screens/registry';

// Audience per screen, from design/v2/html/Prototype.dc.html
const AUDIENCE: Record<ScreenNum, 'manager' | 'employee' | 'both'> = {
  '01': 'manager', '02': 'manager', '03': 'manager', '04': 'manager', '05': 'manager', '06': 'employee',
  '07': 'manager', '08': 'employee', '09': 'employee', '10': 'manager', '11': 'manager', '12': 'both',
  '13': 'manager', '14': 'both', '15': 'manager', '16': 'manager', '17': 'manager', '18': 'both',
  '19': 'manager', '20': 'manager', '21': 'manager', '22': 'manager', '23': 'manager', '24': 'manager',
  '25': 'employee', '26': 'employee', '27': 'manager', '28': 'manager', '29': 'employee', '30': 'employee',
  '31': 'manager', '32': 'manager', '33': 'manager', '34': 'manager', '35': 'employee', '36': 'both', '37': 'manager',
  '38': 'both', '39': 'both', '40': 'both', '41': 'both', '42': 'both', '43': 'manager',
};

export type ProtoScreen = ScreenMeta & { audience: 'manager' | 'employee' | 'both' };
export const PROTO_SCREENS: ProtoScreen[] = SCREENS.map((s) => ({ ...s, audience: AUDIENCE[s.num] }));

export type RoleFilter = 'all' | 'manager' | 'employee';
export type SprintFilter = 'all' | 1 | 2 | 3;

type State = { active: boolean; role: RoleFilter; sprint: SprintFilter; tips: boolean };

let state: State = { active: false, role: 'all', sprint: 'all', tips: true };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const proto = {
  start: () => set({ active: true }),
  stop: () => set({ active: false }),
  setRole: (role: RoleFilter) => set({ role }),
  setSprint: (sprint: SprintFilter) => set({ sprint }),
  toggleTips: () => set({ tips: !state.tips }),
};

export function useProto(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export function filteredScreens(s: Pick<State, 'role' | 'sprint'>): ProtoScreen[] {
  return PROTO_SCREENS.filter(
    (x) =>
      !RETIRED.includes(x.num) &&
      (s.sprint === 'all' || x.sprint === s.sprint) && (s.role === 'all' || x.audience === s.role || x.audience === 'both'),
  );
}

/** Replaced in the app journey (Saree3's setup guide, Tasks from email/meetings): kept in code, out of the list */
const RETIRED: ScreenNum[] = ['07', '13', '33', '35', '37'];

/** Screens with real backend data today (the rest render demo data). */
export const LIVE_SCREENS: ScreenNum[] = ['01', '02', '03', '04', '05', '06', '08', '09', '10', '11', '12', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '32', '38', '39', '40', '41'];
