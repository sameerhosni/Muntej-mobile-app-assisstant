// What's missing in this person's setup (Saree3's setup guide, app/47-welcome.tsx, and the Home strip), read from
// real data, one item at a time:
//   owner  profile (name + company) · team (anyone invited) · structure (who reports to whom, 2+ people) · email
//          (Gmail / Outlook connected) · notify (push on) · task (gave a first task)
//   member profile (name) · notify · checkin (answered the practice check-in) · email (optional, last)
import { useMyProfile, useTasks, useTeam } from '@/lib/api';
import { useMyAccounts } from '@/features/accounts/api';
import { useConnections } from '@/features/sources/connections';
import { usePushStatus } from '@/features/notifications/push';
import { useOnboarding } from './api';
import { useMySector } from '@/features/sectors/sectors';

export type SetupKey = 'profile' | 'sector' | 'team' | 'structure' | 'email' | 'notify' | 'task' | 'checkin';
export type SetupItem = { key: SetupKey; done: boolean };

export function useSetup() {
  const me = useMyProfile();
  const row = useOnboarding(me.data?.id);
  const team = useTeam();
  const tasks = useTasks();
  const accounts = useMyAccounts();
  const connections = useConnections();
  const push = usePushStatus();
  const sector = useMySector();

  const ready = !!me.data && row.isFetched && !!team.data && !!tasks.data && !!connections.data;
  const member = (row.data as { kind?: string } | null | undefined)?.kind === 'member';
  const others = (team.data ?? []).filter((p) => p.id !== me.data?.id);
  const emailOn = (connections.data ?? []).some((c) => c.provider === 'google' || c.provider === 'microsoft');
  // web / Expo Go can't get pushes: nothing to set up there
  const notifyOn = push === 'on' || push === 'unsupported';
  const profileDone = !!row.data?.account_named;

  const items: SetupItem[] = member
    ? [
        { key: 'profile', done: profileDone },
        { key: 'sector', done: !!sector },
        { key: 'notify', done: notifyOn },
        { key: 'checkin', done: !!row.data?.demo_seen },
        { key: 'email', done: emailOn },
      ]
    : [
        { key: 'profile', done: profileDone },
        { key: 'sector', done: !!sector },
        { key: 'team', done: others.length > 0 },
        // only once there are 2+ teammates is "who reports to whom" a question
        ...(others.length >= 2 ? [{ key: 'structure' as const, done: others.every((p) => !!p.manager_id || p.role === 'admin') }] : []),
        { key: 'email', done: emailOn },
        { key: 'notify', done: notifyOn },
        { key: 'task', done: (tasks.data ?? []).some((t) => t.assigner_id === me.data?.id && t.status !== 'cancelled') },
      ];
  const done = items.filter((i) => i.done).length;
  const active = (accounts.data ?? []).find((a) => a.active);
  return {
    ready,
    member,
    items,
    done,
    total: items.length,
    next: items.find((i) => !i.done)?.key ?? null,
    me: me.data,
    row: row.data,
    others,
    company: active?.name ?? '',
  };
}
