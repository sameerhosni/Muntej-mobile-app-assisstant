// Smart team setup (owner, 26 Oct: "the org structure is the hook"): a photo of the org chart, an Excel / PDF file or
// a pasted list → the team-import function reads it into a draft (team_drafts) → Review (screen 62) → confirm once.
import { Linking, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toError } from '@/features/capture/api';
import { track } from '@/lib/analytics';

// team_drafts is not in the generated database types yet; the untyped client stays inside this file
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

export type DraftPerson = {
  ref: string;
  full_name: string;
  full_name_ar: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  manager_ref: string | null;
  manager_id: string | null;
  existing_id: string | null;
  role: 'employee' | 'manager';
  confidence: number;
  unsure: string[];
  skip?: boolean;
};
export type Draft = { id: string; source: string; people: DraftPerson[]; company_name: string | null; status: string; result: ApplyResult | null };
export type ApplyResult = { created: number; updated: number; failed: { ref: string; name: string; error: string }[]; ids: Record<string, string> };

const web = Platform.OS === 'web';
export const canPhoto = web || !!requireOptionalNativeModule('ExponentImagePicker');
export const canFile = web || !!requireOptionalNativeModule('ExpoDocumentPicker');

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('team-import', { body });
  if (error) throw await toError(error);
  return data as T;
}

/** a picked file → base64 (no extra native module: fetch + FileReader) */
async function toBase64(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read'));
    r.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(',') + 1);
}

/** the company directory, read once (Microsoft 365 / Google Workspace): the sign-in page opens, and it comes back to
 *  Review your team with the new draft (connect function, _shared/directory.ts) */
export async function readDirectory(provider: 'microsoft_directory' | 'google_directory') {
  track('team_import_start', { source: provider });
  const ExpoLinking = require('expo-linking') as typeof import('expo-linking');
  const redirect = ExpoLinking.createURL('/62-team-review');
  const { data, error } = await supabase.functions.invoke<{ url: string }>('connect', { body: { action: 'start', provider, redirect } });
  if (error || !data?.url) throw await toError(error);
  if (Platform.OS === 'web') window.location.href = data.url;
  else await Linking.openURL(data.url);
}

/** read pasted text / a sentence about the team */
export async function readText(text: string) {
  track('team_import_start', { source: 'paste' });
  return (await call<{ draft: Draft }>({ action: 'read', text })).draft;
}

/** camera or gallery → the org chart photo; null when cancelled */
export async function readPhoto(from: 'camera' | 'library') {
  const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
  const perm = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('permission');
  const opts = { mediaTypes: ['images'] as import('expo-image-picker').MediaType[], quality: 0.7 };
  const r = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  track('team_import_start', { source: 'photo', from });
  const base64 = await toBase64(a.uri);
  return (await call<{ draft: Draft }>({ action: 'read', file: { name: a.fileName ?? 'org.jpg', mime: a.mimeType ?? 'image/jpeg', base64 } })).draft;
}

/** Excel / CSV / PDF / photo file; null when cancelled */
export async function readFile() {
  const DocumentPicker = require('expo-document-picker') as typeof import('expo-document-picker');
  const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  track('team_import_start', { source: 'file', type: a.name.split('.').pop()?.toLowerCase() ?? null });
  const base64 = await toBase64(a.uri);
  return (await call<{ draft: Draft }>({ action: 'read', file: { name: a.name, mime: a.mimeType ?? '', base64 } })).draft;
}

export function useDraft(id: string | undefined) {
  return useQuery({
    queryKey: ['teamDraft', id],
    enabled: !!id,
    queryFn: async (): Promise<Draft> => {
      const { data, error } = await untyped.from('team_drafts').select('id, source, people, company_name, status, result').eq('id', id).single();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

/** keep the edits (so leaving and coming back doesn't lose them) */
export async function saveDraft(id: string, people: DraftPerson[]) {
  await untyped.from('team_drafts').update({ people, updated_at: new Date().toISOString() }).eq('id', id);
}

/** confirm: everyone created / updated as the caller, managers first */
export async function applyDraft(id: string, people: DraftPerson[]) {
  const res = await call<ApplyResult>({ action: 'apply', draft_id: id, people });
  track('team_import_confirm', { created: res.created, updated: res.updated, failed: res.failed.length });
  return res;
}
