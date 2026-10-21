// Push notifications (Android first). Expo Go can't receive pushes since SDK 53, so everything here is a no-op
// unless the app runs as a real Muntej build on a physical device.
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { router, type Href } from 'expo-router';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/tokens';

export type PushStatus = 'unsupported' | 'checking' | 'denied' | 'on' | 'error';

export const pushSupported =
  Platform.OS !== 'web' && Device.isDevice && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

// loaded lazily so Expo Go and web never touch the native module
type NotificationsModule = typeof import('expo-notifications');
const loadNotifications = (): NotificationsModule | null =>
  pushSupported ? (require('expo-notifications') as NotificationsModule) : null;

// ── tiny status store for Settings ──
let status: PushStatus = pushSupported ? 'checking' : 'unsupported';
const listeners = new Set<() => void>();
const setStatus = (s: PushStatus) => {
  status = s;
  listeners.forEach((l) => l());
};
export const usePushStatus = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );

const Notifications = loadNotifications();
// show banners while the app is open too
Notifications?.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

async function register() {
  if (!Notifications) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('muntej', {
        name: 'Muntej',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: colors.primary,
      });
    }
    let { status: perm } = await Notifications.getPermissionsAsync();
    if (perm !== 'granted') perm = (await Notifications.requestPermissionsAsync()).status;
    if (perm !== 'granted') return setStatus('denied');

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    // save_push_token isn't in the generated types yet
    const { error } = await (supabase.rpc as unknown as (fn: string, args: object) => Promise<{ error: unknown }>)(
      'save_push_token',
      { p_token: token, p_platform: Platform.OS, p_device_name: Device.deviceName ?? Device.modelName ?? null },
    );
    if (error) throw error;
    setStatus('on');
  } catch (e) {
    console.warn('[push] registration failed', e);
    setStatus('error');
  }
}

/** A tapped notification opens its task; anything else (grouped updates, decisions, overload, a test) opens Alerts.
 *  The alert it came from is marked read. */
function openFrom(data: unknown) {
  const d = (data ?? {}) as { taskId?: string; alertId?: string; kind?: string; screen?: string };
  if (d.alertId) {
    const loose = supabase as unknown as { from: (t: string) => { update: (v: object) => { eq: (c: string, v: string) => PromiseLike<unknown> } } };
    Promise.resolve(loose.from('alerts').update({ read_at: new Date().toISOString() }).eq('id', d.alertId)).catch(() => {});
  }
  if (d.taskId) router.push({ pathname: '/14-task-detail', params: { id: d.taskId } } as Href);
  else if (d.kind === 'decision_waiting') router.push('/04-decisions' as Href);
  // the daily summary opens Home
  else if (d.screen) router.push(d.screen as Href);
  else router.push('/18-alerts' as Href);
}

/** The number on the app icon (unread alerts). No-op where push isn't available. */
export function setAppBadge(n: number) {
  Notifications?.setBadgeCountAsync(n).catch(() => {});
}

/** Registers this device once signed in, and opens the task when a notification is tapped. */
export function usePushNotifications(signedIn: boolean) {
  useEffect(() => {
    if (signedIn) register();
  }, [signedIn]);

  useEffect(() => {
    if (!Notifications || !signedIn) return;
    // app was opened by tapping a notification
    Notifications.getLastNotificationResponseAsync().then((r) => r && openFrom(r.notification.request.content.data));
    const sub = Notifications.addNotificationResponseReceivedListener((r) => openFrom(r.notification.request.content.data));
    return () => sub.remove();
  }, [signedIn]);
}

/** Settings → "Send me a test": the server pushes to this person's own devices. */
export async function sendTestPush(): Promise<number> {
  const { data, error } = await supabase.functions.invoke<{ sent: number }>('send-followups', { body: { test: true } });
  if (error) throw error;
  return data?.sent ?? 0;
}
