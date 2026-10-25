// Push notifications (Android first). Expo Go can't receive pushes since SDK 53, so everything here is a no-op
// unless the app runs as a real Muntej build on a physical device.
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { router, type Href } from 'expo-router';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/tokens';
import i18n from '@/lib/i18n';

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
    await registerCheckinButtons();
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

// ── one-tap check-in (BRD v1.2 FR-FUP-02): Done / On track / Blocked right on the notification ──
// The server sends check-ins with categoryId 'checkin' (send-followups). The buttons open the app for a moment so the
// answer is saved even if Muntej wasn't running; the task opens with the answer applied.
const CHECKIN_ACTIONS = ['done', 'on_track', 'blocked', 'got_it', 'need_time', 'need_help'] as const;
type CheckinAction = (typeof CHECKIN_ACTIONS)[number];

async function registerCheckinButtons() {
  if (!Notifications) return;
  const ar = i18n.language === 'ar';
  await Notifications.setNotificationCategoryAsync('checkin', [
    { identifier: 'done', buttonTitle: ar ? 'خلصت ✓' : 'Done ✓', options: { opensAppToForeground: true } },
    { identifier: 'on_track', buttonTitle: ar ? 'ماشية تمام' : 'On track', options: { opensAppToForeground: true } },
    {
      identifier: 'blocked',
      buttonTitle: ar ? 'واقفة' : 'Blocked',
      textInput: { submitButtonTitle: ar ? 'أرسل' : 'Send', placeholder: ar ? 'وش اللي موقفها؟' : "What's in the way?" },
      options: { opensAppToForeground: true },
    },
  ]).catch((e) => console.warn('[push] check-in buttons', e));
  // the hand-off of a task someone gave you (category 'handoff', also Saree3's "you haven't confirmed" reminder)
  await Notifications.setNotificationCategoryAsync('handoff', [
    { identifier: 'got_it', buttonTitle: ar ? 'استلمت 👍' : 'Got it 👍', options: { opensAppToForeground: true } },
    {
      identifier: 'need_time',
      buttonTitle: ar ? 'أحتاج وقت' : 'Need time',
      textInput: { submitButtonTitle: ar ? 'أرسل' : 'Send', placeholder: ar ? 'كم تحتاج زيادة وليش؟' : 'How much more, and why?' },
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'need_help',
      buttonTitle: ar ? 'أحتاج مساعدة' : 'Need help',
      textInput: { submitButtonTitle: ar ? 'أرسل' : 'Send', placeholder: ar ? 'وش اللي موقفك؟' : "What's in the way?" },
      options: { opensAppToForeground: true },
    },
  ]).catch((e) => console.warn('[push] hand-off buttons', e));
}

/** a check-in button was tapped: save the answer (checkin_reply), then open the task */
async function answerCheckin(taskId: string, action: CheckinAction, note: string | undefined) {
  const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: object) => Promise<{ error: { message: string } | null }>;
  // "need help" is the server's 'blocked' answer (with what's in the way)
  const reply = action === 'need_help' ? 'blocked' : action;
  const { error } = await rpc('checkin_reply', { p_task: taskId, p_reply: reply, p_note: note ?? null });
  if (error) console.warn('[push] check-in answer failed', error.message);
}

function handleResponse(r: import('expo-notifications').NotificationResponse) {
  const data = r.notification.request.content.data as { taskId?: string } | undefined;
  const action = r.actionIdentifier as CheckinAction;
  if (data?.taskId && CHECKIN_ACTIONS.includes(action)) {
    answerCheckin(data.taskId, action, r.userText).finally(() => {
      // Android keeps a written reply "sending…" until the app clears that notification
      Notifications?.dismissNotificationAsync(r.notification.request.identifier).catch(() => {});
      openFrom(data);
    });
    return;
  }
  openFrom(data);
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
    Notifications.getLastNotificationResponseAsync().then((r) => r && handleResponse(r));
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, [signedIn]);
}

/** Turn notifications on now (asks for permission; Saree3's setup guide). Same as what happens at sign-in. */
export const enablePush = () => register();

/** Settings → "Send me a test": the server pushes to this person's own devices. */
export async function sendTestPush(): Promise<number> {
  const { data, error } = await supabase.functions.invoke<{ sent: number }>('send-followups', { body: { test: true } });
  if (error) throw error;
  return data?.sent ?? 0;
}
