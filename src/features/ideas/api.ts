// Ideas, problems and likes (table ideas): people send them and see their own; the super admin sees all (wish list),
// sets the status and replies; the person hears it from Saree3 (alert idea_update, written by a database trigger).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Linking } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/api';
import { track } from '@/lib/analytics';

// ideas is not in the generated database types yet; the untyped client stays inside this file
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

export type IdeaKind = 'idea' | 'problem' | 'like';
export type IdeaStatus = 'new' | 'planned' | 'building' | 'done' | 'not_now';
export const IDEA_KINDS: IdeaKind[] = ['idea', 'problem', 'like'];
export const IDEA_STATUSES: IdeaStatus[] = ['new', 'planned', 'building', 'done', 'not_now'];

export type Idea = {
  id: string;
  profile_id: string;
  account_id: string;
  kind: IdeaKind;
  body: string;
  screen: string | null;
  status: IdeaStatus;
  reply: string | null;
  attachments: Attachment[];
  created_at: string;
  updated_at: string;
  person?: { full_name: string; full_name_ar: string | null } | null;
  account?: { name: string } | null;
};

export type Attachment = { path: string; name: string; mime: string };
export type PickedFile = { uri: string; name: string; mime: string };

const key = ['ideas'] as const;

/** a photo from the gallery; null when cancelled */
export async function pickIdeaPhoto(): Promise<PickedFile | null> {
  const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('permission');
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return { uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.jpg`, mime: a.mimeType ?? 'image/jpeg' };
}

/** a PDF or an image file; null when cancelled */
export async function pickIdeaFile(): Promise<PickedFile | null> {
  const DocumentPicker = require('expo-document-picker') as typeof import('expo-document-picker');
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return { uri: a.uri, name: a.name, mime: a.mimeType ?? 'application/pdf' };
}

/** the private 'ideas' bucket, under the sender's profile id */
async function upload(profileId: string, f: PickedFile): Promise<Attachment> {
  const safe = f.name.replace(/[^\w.\-]+/g, '_').slice(-80) || `file-${Date.now()}`;
  const path = `${profileId}/${Date.now()}-${safe}`;
  const body = await (await fetch(f.uri)).arrayBuffer();
  const { error } = await supabase.storage.from('ideas').upload(path, body, { contentType: f.mime, upsert: false });
  if (error) throw new Error(error.message);
  return { path, name: f.name, mime: f.mime };
}

/** open an attachment (a short-lived link) */
export async function openIdeaFile(a: Attachment) {
  const { data } = await supabase.storage.from('ideas').createSignedUrl(a.path, 300);
  if (data?.signedUrl) await Linking.openURL(data.signedUrl);
}

export function useMyIdeas() {
  const me = useMyProfile();
  return useQuery({
    queryKey: [...key, 'mine', me.data?.id],
    enabled: !!me.data?.id,
    queryFn: async (): Promise<Idea[]> => {
      const { data, error } = await untyped.from('ideas').select('*').eq('profile_id', me.data!.id).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** super admin: everyone's, newest first, with who and which company */
export function useAllIdeas() {
  return useQuery({
    queryKey: [...key, 'all'],
    queryFn: async (): Promise<Idea[]> => {
      const { data, error } = await untyped
        .from('ideas')
        .select('*, person:profiles!ideas_profile_id_fkey(full_name, full_name_ar), account:accounts(name)')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useSendIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { kind: IdeaKind; body: string; screen: string | null; files?: PickedFile[]; voice?: boolean }) => {
      // no wait for the loaded profile (QA, 10 Nov: «Not signed in» when it hadn't loaded yet): the server knows the seat
      const attachments: Attachment[] = [];
      // files go in the folder of the seat the SERVER sees (the storage policy checks current_profile_id(), like the
      // row; reviewer, 10 Nov, R126): never the one the app loaded before a seat switch
      if (v.files?.length) {
        const { data: seat, error: seatErr } = await untyped.rpc('current_profile_id');
        if (seatErr) throw new Error(seatErr.message);
        if (!seat) throw new Error('Not signed in');
        for (const f of v.files) attachments.push(await upload(seat as string, f));
      }
      // the seat is filled in by the database (ideas_fill_seat): the one the server sees now, never a stale one the app
      // loaded before a seat switch (QA, 10 Nov: the insert was refused)
      const { error } = await untyped.from('ideas').insert({ kind: v.kind, body: v.body.trim(), screen: v.screen, attachments });
      if (error) throw new Error(error.message);
      track('idea_sent', { kind: v.kind, screen: v.screen, length: v.body.trim().length, files: attachments.length, voice: !!v.voice });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/** super admin: status and / or reply */
export function useUpdateIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; status?: IdeaStatus; reply?: string | null }) => {
      const patch: Record<string, unknown> = {};
      if (v.status) patch.status = v.status;
      if (v.reply !== undefined) patch.reply = v.reply?.trim() || null;
      const { error } = await untyped.from('ideas').update(patch).eq('id', v.id);
      if (error) throw new Error(error.message);
      track('idea_updated', { status: v.status ?? null, replied: v.reply !== undefined });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}
