// Sign-in failures say their real cause, with a ref number (Apple, 11 Nov: "an error occurred when we tapped login" on
// an iPad, and our server never saw the request). Each failure is also sent to supabase/functions/client-error with the
// same ref, the step, the device and the build, so a screenshot with "ref 4821" points straight to the log line.
// Never sent: the code, the password, or the full email (only its domain, worked out on the server).
import { Platform } from 'react-native';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type SignInStep = 'send_code' | 'verify' | 'quick_login' | 'resend' | 'whatsapp' | 'biometric' | 'admin';
export type FailureKind = 'network' | 'wrong_code' | 'rate_limited' | 'other';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

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
  if ((step === 'verify' || step === 'quick_login' || step === 'admin') && status && [400, 401, 403, 404, 422].includes(status)) return 'wrong_code';
  return 'other';
}

/** what the device and build are: helps tell an iPad running the iPhone app from a phone */
function deviceInfo() {
  const info: Record<string, string | boolean | null> = { platform: Platform.OS, os_version: String(Platform.Version ?? '') };
  try {
    const Device = require('expo-device') as typeof import('expo-device');
    info.device = Device.modelName ?? null;
    info.ipad = (Platform.OS === 'ios' && (Platform as { isPad?: boolean }).isPad === true) || Device.deviceType === Device.DeviceType.TABLET;
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

/** report the failure (never throws, never waits more than 4 s) */
function report(ref: string, step: SignInStep, kind: FailureKind, err: unknown, email?: string) {
  const message = String((err as { message?: unknown } | null)?.message ?? err ?? '').slice(0, 300);
  const body = { ref, step, kind, message, status: statusOf(err) ?? null, email: email ?? null, ...deviceInfo() };
  const timeout = new Promise((ok) => setTimeout(ok, 4000));
  try {
    void Promise.race([supabase.functions.invoke('client-error', { body }), timeout]).catch(() => {});
  } catch {
    // reporting must never break sign-in
  }
}

/** the words to show for this failure; the failure is reported with the same ref */
export function signInFailure(t: Translate, step: SignInStep, err: unknown, email?: string): string {
  const kind = kindOf(step, err);
  const ref = String(1000 + Math.floor(Math.random() * 9000));
  report(ref, step, kind, err, email);
  if (kind === 'rate_limited') return t('auth.rateLimited');
  if (kind === 'wrong_code') return t('auth.wrongCode');
  if (kind === 'network') return t('auth.noServer', { ref });
  return t('auth.failedRef', { ref });
}
