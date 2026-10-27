// Proof on a task (BRD v1.2 M6): attach a photo, a file or a link (evidence table + the private 'evidence' bucket,
// path <task_id>/<file>), open what's attached, and read Muntej's check of it (reviews.ai_check, verify-proof).
// The photo and file pickers are native modules added after build 1.1: on an older build they're simply missing,
// so the buttons hide instead of crashing (links work everywhere).
import { Linking, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Evidence, Review } from '@/lib/api';

export type ProofKind = 'none' | 'any' | 'file' | 'image' | 'link';
export type ProofCheck = { verdict: 'pass' | 'missing' | 'unclear'; passed: string[]; missing: string[]; summary: string; at: string };

const web = Platform.OS === 'web';
export const canPickPhoto = web || !!requireOptionalNativeModule('ExponentImagePicker');
export const canPickFile = web || !!requireOptionalNativeModule('ExpoDocumentPicker');

/** what this task needs (column added after the generated types) */
export const proofRequired = (task: object | undefined | null): ProofKind =>
  ((task as { proof_required?: ProofKind } | null)?.proof_required ?? 'none') as ProofKind;

/** does what's attached satisfy the rule? */
export function proofMet(kind: ProofKind, evidence: Evidence[] | undefined) {
  if (kind === 'none') return true;
  return (evidence ?? []).some((e) => kind === 'any' || e.type === kind);
}

/** Muntej's check on the latest review round, if any */
export function latestCheck(reviews: Review[] | undefined): ProofCheck | null {
  const last = [...(reviews ?? [])].sort((a, b) => b.round - a.round)[0] as (Review & { ai_check?: ProofCheck | null }) | undefined;
  return last?.ai_check ?? null;
}

async function upload(taskId: string, meId: string, file: { uri: string; name: string; mime: string }, type: 'image' | 'file') {
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80) || `proof-${Date.now()}`;
  const path = `${taskId}/${Date.now()}-${safe}`;
  const body = await (await fetch(file.uri)).arrayBuffer();
  const up = await supabase.storage.from('evidence').upload(path, body, { contentType: file.mime, upsert: false });
  if (up.error) throw new Error(up.error.message);
  const { error } = await supabase
    .from('evidence')
    .insert({ task_id: taskId, type, title: file.name, storage_path: path, mime_type: file.mime, uploaded_by: meId });
  if (error) throw new Error(error.message);
}

/** camera or gallery → photo proof; false when cancelled */
export async function addPhoto(taskId: string, meId: string, from: 'camera' | 'library'): Promise<boolean> {
  const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
  const perm = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('permission');
  const opts = { mediaTypes: ['images'] as import('expo-image-picker').MediaType[], quality: 0.7 };
  const r = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets?.[0]) return false;
  const a = r.assets[0];
  await upload(taskId, meId, { uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.jpg`, mime: a.mimeType ?? 'image/jpeg' }, 'image');
  return true;
}

/** any document → file proof; false when cancelled */
export async function addFile(taskId: string, meId: string): Promise<boolean> {
  const DocumentPicker = require('expo-document-picker') as typeof import('expo-document-picker');
  const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return false;
  const a = r.assets[0];
  await upload(taskId, meId, { uri: a.uri, name: a.name, mime: a.mimeType ?? 'application/octet-stream' }, 'file');
  return true;
}

export async function addLink(taskId: string, meId: string, url: string) {
  const clean = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  const { error } = await supabase.from('evidence').insert({ task_id: taskId, type: 'link', url: clean, title: clean, uploaded_by: meId });
  if (error) throw new Error(error.message);
}

/** whoever gave the task switches proof on ('any') or back to optional ('none'); the RPC checks who may */
export async function setProofRequired(taskId: string, kind: ProofKind) {
  const { error } = await supabase.rpc('set_proof_required' as never, { task: taskId, kind } as never);
  if (error) throw new Error((error as { message: string }).message);
}

/** open an attached item: links directly, stored files through a short-lived signed link */
export async function openProof(e: Evidence) {
  if (e.type === 'link' && e.url) return Linking.openURL(e.url);
  if (!e.storage_path) return;
  const { data } = await supabase.storage.from('evidence').createSignedUrl(e.storage_path, 300);
  if (data?.signedUrl) await Linking.openURL(data.signedUrl);
}

export const refreshTask = (qc: QueryClient, taskId: string) => qc.invalidateQueries({ queryKey: ['task', taskId] });
