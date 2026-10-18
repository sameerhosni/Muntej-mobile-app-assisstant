import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { TaskPriority } from '@/lib/api';

export type FollowupStep = {
  at: string;
  kind: 'brief' | 'check' | 'risk' | 'collect';
  channel: 'whatsapp' | 'in_app' | 'push' | 'email';
  summary: string;
  message: string;
};

/** Mirrors the parse-task Edge Function output. */
export type ParsedTask = {
  language: 'en' | 'ar';
  transcript: string;
  title: string;
  owner_id: string | null;
  helper_id: string | null;
  helper_reason: string | null;
  due_at: string | null;
  priority: TaskPriority;
  goal: string | null;
  definition_of_done: string | null;
  budget: string | null;
  workspace_id: string | null;
  missing: ('owner' | 'due' | 'definition_of_done' | 'budget')[];
  followup_plan: FollowupStep[];
};

/** Turns a functions.invoke error into an Error with the server's message. */
async function toError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string };
      if (body?.error) return new Error(body.error);
    } catch {
      // fall through
    }
  }
  // FunctionsFetchError keeps the underlying network error in `context`
  const cause = (error as { context?: unknown })?.context;
  if (cause) console.warn('[functions] request failed', String(cause));
  return error instanceof Error ? error : new Error(String(error));
}

export async function transcribeAudio(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const form = new FormData();
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob, blob.type.includes('webm') ? 'audio.webm' : 'audio.m4a');
    const { data, error } = await supabase.functions.invoke<{ text: string }>('transcribe', { body: form });
    if (error) throw await toError(error);
    return data!.text;
  }

  // Native: expo's fetch only accepts real Blob parts (not RN's {uri,name,type}), so attach an expo-file-system File.
  const fileUri = uri.startsWith('file://') || uri.startsWith('content://') ? uri : `file://${uri}`;
  const file = new File(fileUri);
  const form = new FormData();
  form.append('file', file, 'audio.m4a');

  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('Not signed in');

  let res: Response;
  try {
    res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/transcribe`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
      },
      body: form,
    });
  } catch (e) {
    console.warn('[transcribe] network error', { uri: fileUri, error: String(e) });
    throw new Error(`Upload failed: ${String(e)}`);
  } finally {
    // the recording is only needed for this upload; never keep audio on the device
    try {
      file.delete();
    } catch {
      // already gone
    }
  }
  const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok || !body.text) {
    console.warn('[transcribe] server error', res.status, body);
    throw new Error(body.error ?? `Transcription failed (${res.status})`);
  }
  return body.text;
}

export async function parseTask(text: string): Promise<ParsedTask> {
  const { data, error } = await supabase.functions.invoke<ParsedTask>('parse-task', { body: { text } });
  if (error) throw await toError(error);
  return data!;
}

export async function createTask(task: ParsedTask, source: 'voice' | 'text'): Promise<string> {
  const { data, error } = await supabase.rpc('create_task_with_plan', { p: { ...task, source } });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Keeps the follow-up plan in step with an edited due date: the first step stays "now",
 * the last lands on the new due date, the ones in between keep their relative position.
 */
export function rescalePlan(plan: FollowupStep[], oldDue: string | null, newDue: string | null): FollowupStep[] {
  if (!newDue || plan.length < 2) return plan;
  const start = new Date(plan[0].at).getTime();
  const oldEnd = oldDue ? new Date(oldDue).getTime() : new Date(plan[plan.length - 1].at).getTime();
  const newEnd = new Date(newDue).getTime();
  const span = Math.max(oldEnd - start, 1);
  return plan.map((s, i) => {
    if (i === 0) return s;
    const ratio = Math.min(Math.max((new Date(s.at).getTime() - start) / span, 0), 1);
    return { ...s, at: new Date(start + ratio * (newEnd - start)).toISOString() };
  });
}
