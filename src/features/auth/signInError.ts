// Sign-in failures say their real cause, with a ref number (Apple, 11 Nov: "an error occurred when we tapped login" on
// an iPad, and our server never saw the request). Each failure is also sent to supabase/functions/client-error with the
// same ref, the step, the device and the build, so a screenshot with "ref 4821" points straight to the log line.
// A report that can't be sent (no internet: the very case Apple hit) is kept on the phone and sent on the next try.
// Never sent: the code, the password, or the full email (the server keeps only its domain).
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type SignInStep = 'send_code' | 'verify' | 'quick_login' | 'resend' | 'whatsapp' | 'biometric' | 'admin' | 'mfa';
export type FailureKind = 'network' | 'wrong_code' | 'rate_limited' | 'other';

type Translate = (key: string, opts?: Record<string, unknown>) => string;
type Report = Record<string, string | number | boolean | null>;

const WAITING = 'muntej.signInReports';
const KEEP = 20;

/** the HTTP status inside a Supabase auth / functions error, when there is one */
export function statusOf(err: unknown): number | undefined {
  if (err instanceof FunctionsHttpError) return (err.context as Response | undefined)?.status;
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === 'number' && s > 0 ? s : undefined;
}

export function kindOf(step: SignInStep, err: unknown): FailureKind {
  const name = String((err as { name?: unknown } | null)?.name ?? '');
  const message = String((err as { message?: unknown } | null)?.message ?? err ?? '');
  const status = statusOf(err);
  if (status === 429) return 'rate_limited';
  if (/RetryableFetch|FunctionsFetchError|FunctionsRelayError/.test(name) || /network request failed|failed to fetch|load failed|network|timed? ?out|offline/i.test(message)) return 'network';
  if ((step === 'verify' || step === 'quick_login' || step === 'admin' || step === 'mfa') && status && [400, 401, 403, 404, 422].includes(status)) return 'wrong_code';
  return 'other';
}

/** a short cause for "other" failures: the HTTP status, else the error's name */
function causeOf(err: unknown) {
  const status = statusOf(err);
  if (status) return String(status);
  const name = String((err as { name?: unknown } | null)?.name ?? '').replace(/Error$/, '');
  return name && name !== 'Error' ? name.slice(0, 24) : 'app';
}

/** what the device and build are. An iPad running the iPhone app reports a phone screen, so the model name decides. */
function deviceInfo(): Report {
  const info: Report = { platform: Platform.OS, os_version: String(Platform.Version ?? '') };
  try {
    const Device = require('expo-device') as typeof import('expo-device');
    info.device = Device.modelName ?? Device.modelId ?? null;
    info.ipad =
      (Platform.OS === 'ios' && (Platform as { isPad?: boolean }).isPad === true) ||
      Device.deviceType === Device.DeviceType.TABLET ||
      /^iPad/i.test(Device.modelName ?? '') ||
      /^iPad/i.test(Device.modelId ?? '') ||
      Device.osName === 'iPadOS';
  } catch {
    // older build without the module
  }
  try {
    const App = require('expo-application') as typeof import('expo-application');
    info.app_version = App.nativeApplicationVersion ?? null;
    info.build = App.nativeBuildVersion ?? null;
  } catch {
    // older build without the module
  }
  try {
    const Updates = require('expo-updates') as typeof import('expo-updates');
    info.update_id = Updates.updateId ?? null;
  } catch {
    // web or a build without updates
  }
  return info;
}

/** send one report; true when the server has it (4 s at most) */
async function send(body: Report) {
  try {
    const sent = supabase.functions.invoke('client-error', { body }).then((r) => !r.error || statusOf(r.error) === 400);
    const late = new Promise<boolean>((ok) => setTimeout(() => ok(false), 4000));
    return await Promise.race([sent, late]);
  } catch {
    return false;
  }
}

async function waiting(): Promise<Report[]> {
  try {
    const raw = await AsyncStorage.getItem(WAITING);
    const list = raw ? (JSON.parse(raw) as Report[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function keep(list: Report[]) {
  try {
    if (list.length) await AsyncStorage.setItem(WAITING, JSON.stringify(list.slice(-KEEP)));
    else await AsyncStorage.removeItem(WAITING);
  } catch {
    // nothing more we can do on this phone
  }
}

// every read and write of the kept list goes through one chain, so a report added while others are being sent is
// never written over (reviewer, 12 Nov)
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(f: () => Promise<T>): Promise<T> {
  const next = chain.then(f, f);
  chain = next.catch(() => {});
  return next;
}
const same = (a: Report, b: Report) => a.ref === b.ref && a.step === b.step && a.client_at === b.client_at;

let flushing = false;
/** send the reports kept on this phone (on the sign-in screen and after each new report); never throws */
export async function sendWaitingReports() {
  if (flushing) return;
  flushing = true;
  try {
    const list = await serial(waiting);
    const sent: Report[] = [];
    for (const r of list) if (await send(r)) sent.push(r);
    // drop only what was sent, from the list as it is now (new reports may have been added meanwhile)
    if (sent.length) await serial(async () => keep((await waiting()).filter((r) => !sent.some((s) => same(r, s)))));
  } catch {
    // sending later is all that can happen
  } finally {
    flushing = false;
  }
}

/** keep the report first, then try to send everything kept */
async function report(body: Report) {
  await serial(async () => keep([...(await waiting()), body]));
  await sendWaitingReports();
}

/** the failure reported (or kept until it can be) with a new ref, and the words to show for it */
export function signInFailureRef(t: Translate, step: SignInStep, err: unknown, email?: string) {
  const kind = kindOf(step, err);
  const ref = String(1000 + Math.floor(Math.random() * 9000));
  const message = String((err as { message?: unknown } | null)?.message ?? err ?? '').slice(0, 300);
  void report({ ref, step, kind, message, status: statusOf(err) ?? null, email: email ?? null, client_at: new Date().toISOString(), ...deviceInfo() }).catch(() => {});
  const text =
    kind === 'rate_limited'
      ? t('auth.rateLimitedRef', { ref })
      : kind === 'wrong_code'
        ? t(step === 'mfa' ? 'auth.mfaWrongRef' : 'auth.wrongCodeRef', { ref })
        : kind === 'network'
          ? t('auth.noServer', { ref })
          : t('auth.failedRef', { ref, cause: causeOf(err) });
  return { kind, ref, text };
}

/** the words to show for this failure (see signInFailureRef) */
export const signInFailure = (t: Translate, step: SignInStep, err: unknown, email?: string) => signInFailureRef(t, step, err, email).text;
