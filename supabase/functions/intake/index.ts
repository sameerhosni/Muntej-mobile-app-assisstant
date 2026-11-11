// intake — the door for messages the person brings in themselves (pasted / shared text). Connected tools come in
// through sync-sources; both use the same reading rules (_shared/intake-core.ts). Nothing becomes a task without the
// person's OK, except the ones Muntej is sure about (autopilot, switchable).
//
//   { action: 'ingest', text, source?: 'paste' | 'share', sender?, subject? }  → the incoming item (same text twice → same item)
//   { action: 'accept', id, index, edit?: { title?, owner_id?, due_at? } }    → creates that task (as the caller, RLS applies)
//   { action: 'accept_all', id }                                             → every open suggestion that isn't a duplicate
//   { action: 'ignore', id, index? }                                         → one suggestion, or the whole item
//   { action: 'find_email', id, index }                                      → the email of the person a task names
//   { action: 'set_owner', id, index, owner_id }                             → that waiting task goes to this person
//   { action: 'recheck_owners' }                                             → re-pick owners of my waiting tasks
//   (server, x-cron-secret) { action: 'recheck_owners', profiles: [ids] }    → the same for those people
// Every read and every task created is written to activity_log.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { getCaller, HttpError, json, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';
import { emailFromMailbox } from '../_shared/connections.ts';
import { createFromSuggestion, doneBefore, ingestMessage, recheckOwners, rereadWaiting, MAX_MEETING_TEXT, MAX_TEXT, OPEN, saveItem, type Creator, type Item } from '../_shared/intake-core.ts';

async function loadItem(admin: SupabaseClient, profileId: string, id: unknown): Promise<Item> {
  const { data, error } = await admin.from('incoming_items').select('*').eq('id', String(id ?? '')).maybeSingle();
  if (error) throw error;
  if (!data || data.owner_id !== profileId) throw new HttpError(404, 'Not found');
  return data as Item;
}

/** an item that came from a task tool (ClickUp, Jira, Trello) and was added by hand stays linked to it (two-way sync) */
async function linkToTool(admin: SupabaseClient, profileId: string, item: Item, taskId: string | null) {
  const externalId = (item as Item & { external_id?: string }).external_id;
  if (!taskId || !externalId || !['clickup', 'jira', 'trello'].includes(item.source)) return;
  const { data: conn } = await admin.from('connections').select('id').eq('profile_id', profileId).eq('provider', item.source).maybeSingle();
  if (!conn) return;
  const link = item.suggestions.find((s) => s.task_id === taskId)?.quote;
  await admin
    .from('task_links')
    .upsert(
      { task_id: taskId, connection_id: conn.id, provider: item.source, external_id: externalId, external_url: link?.startsWith('http') ? link : null, direction: 'in' },
      { onConflict: 'connection_id,external_id', ignoreDuplicates: true },
    );
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const admin = adminClient();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // from the server itself: re-pick owners for these people (no user session)
  const cron = Deno.env.get('CRON_SECRET');
  if (cron && req.headers.get('x-cron-secret') === cron && (body.action === 'recheck_owners' || body.action === 'reread_waiting')) {
    const out: Record<string, unknown> = {};
    for (const id of (body.profiles as string[]) ?? []) out[id] = body.action === 'reread_waiting' ? await rereadWaiting(admin, id, body.ids as string[] | undefined) : await recheckOwners(admin, id);
    return json(out);
  }
  const { db, profileId } = await getCaller(req);
  // tasks are created as the caller: their RLS and their name on the activity log
  const create: Creator = async (p) => {
    const { data, error } = await db.rpc('create_task_with_plan', { p });
    if (error) throw new HttpError(400, error.message);
    return data as string;
  };

  // a found task's new choices go to testers first (feature found_task_choices)
  const choicesOn = async () => {
    if ((await db.rpc('feature_on', { p_key: 'found_task_choices' })).data !== true) throw new HttpError(403, 'Not available yet');
  };

  switch (body.action) {
    case 'ingest': {
      const text = String(body.text ?? '');
      // read it as if it came from one of the caller's own connected accounts (QA, and "read this mail again"): only
      // their own connection, and only mail / chat
      const viaConn =
        typeof body.connection_id === 'string' && (body.source === 'gmail' || body.source === 'google_chat')
          ? (await admin.from('connections').select('id').eq('id', body.connection_id).eq('profile_id', profileId).maybeSingle()).data
          : null;
      const source = viaConn ? (body.source as string) : body.source === 'share' || body.source === 'meeting' ? body.source : 'paste';
      if (text.trim().length > (source === 'meeting' ? MAX_MEETING_TEXT : MAX_TEXT))
        throw new HttpError(413, 'That message is too long — paste the part with the requests');
      const [{ data: team }, { data: open }] = await Promise.all([
        db.from('profiles').select('id, full_name, full_name_ar, title, skills').neq('status', 'deleted'),
        db.from('tasks').select('id, title, owner_id').in('status', OPEN),
      ]);
      return json(
        await ingestMessage(admin, {
          profileId,
          text,
          source,
          sender: (body.sender as string) ?? null,
          subject: (body.subject as string) ?? null,
          team: team ?? [],
          open: open ?? [],
          create,
          connectionId: viaConn?.id ?? null,
          // the tool's conversation id (a thread / space), only with the caller's own connection
          conversation: viaConn && typeof body.conversation === 'string' ? body.conversation.slice(0, 200) : null,
          // mail waits for an OK, as the Gmail reader does (a hand-off to a teammate still goes by itself)
          confirmFirst: source === 'gmail',
        }),
      );
    }

    case 'accept': {
      const item = await loadItem(admin, profileId, body.id);
      const i = Number(body.index);
      const s = item.suggestions[i];
      if (!s || s.state !== 'new') throw new HttpError(409, 'Already handled');
      const edit = (body.edit ?? {}) as { title?: string; owner_id?: string | null; due_at?: string | null };
      if (typeof edit.title === 'string' && edit.title.trim()) s.title = edit.title.trim().slice(0, 200);
      if (edit.owner_id !== undefined) s.owner_id = edit.owner_id || null;
      if (edit.due_at !== undefined) s.due_at = edit.due_at || null;
      s.task_id = await createFromSuggestion(admin, profileId, item, s, create);
      s.state = 'accepted';
      await linkToTool(admin, profileId, item, s.task_id);
      return json(await saveItem(admin, item));
    }

    case 'accept_all': {
      const item = await loadItem(admin, profileId, body.id);
      for (const s of item.suggestions) {
        if (s.state !== 'new' || s.duplicate_of) continue;
        s.task_id = await createFromSuggestion(admin, profileId, item, s, create);
        s.state = 'accepted';
        await linkToTool(admin, profileId, item, s.task_id);
      }
      return json(await saveItem(admin, item));
    }

    case 'ignore': {
      const item = await loadItem(admin, profileId, body.id);
      if (body.index === undefined || body.index === null) {
        for (const s of item.suggestions) if (s.state === 'new') s.state = 'ignored';
        if (!item.suggestions.length) {
          const { data, error } = await admin
            .from('incoming_items')
            .update({ status: 'ignored', decided_at: new Date().toISOString() })
            .eq('id', item.id)
            .select('*')
            .single();
          if (error) throw error;
          return json(data);
        }
      } else {
        const s = item.suggestions[Number(body.index)];
        if (!s || s.state !== 'new') throw new HttpError(409, 'Already handled');
        s.state = 'ignored';
      }
      return json(await saveItem(admin, item));
    }

    // «خلصتها قبل» (owner, 11 Nov): on the record as done, nothing to follow up
    case 'done_before': {
      await choicesOn();
      const item = await loadItem(admin, profileId, body.id);
      const s = item.suggestions[Number(body.index)];
      if (!s || s.state !== 'new') throw new HttpError(409, 'Already handled');
      // closed the normal way, as them (set_task_status)
      await doneBefore(admin, profileId, item, s, create, async (taskId) => {
        const { data, error } = await db.rpc('set_task_status', { p_task: taskId, p_status: 'done' });
        if (error) throw new HttpError(400, error.message);
        return String(data ?? 'done');
      });
      return json(await saveItem(admin, item));
    }

    // «رجّعها» after Ignore, or from the handled ones: back in the list as it was
    case 'restore': {
      await choicesOn();
      const item = await loadItem(admin, profileId, body.id);
      const s = item.suggestions[Number(body.index)];
      if (!s || s.state !== 'ignored') throw new HttpError(409, 'Not ignored');
      s.state = 'new';
      return json(await saveItem(admin, item));
    }

    // «رجّعها» after Add or «خلصتها قبل»: only what that tap did, in the last 5 minutes, untouched since
    case 'undo_found': {
      await choicesOn();
      const item = await loadItem(admin, profileId, body.id);
      const s = item.suggestions[Number(body.index)];
      if (!s || s.state !== 'accepted' || !s.task_id) throw new HttpError(409, 'Nothing to undo');
      const { error } = await db.rpc('undo_found_task', { p_task: s.task_id });
      if (error) throw new HttpError(409, /moved_on/.test(error.message) ? 'moved_on' : error.message);
      s.state = 'new';
      s.task_id = null;
      s.done_before = false;
      return json(await saveItem(admin, item));
    }

    // "+ Add Nouran" on a task card: the message's own "Name <email>" or an address with her name, else the mailbox
    case 'find_email': {
      const item = await loadItem(admin, profileId, body.id);
      const name = item.suggestions[Number(body.index)]?.owner_name?.trim();
      if (!name) return json({ email: null, from: null });
      const first = name.split(/\s+/)[0].toLowerCase();
      const inBody = [...item.body.matchAll(/([^\s<>,;:]+@[^\s<>,;:]+\.[a-z]{2,})/gi)].map((m) => m[1].toLowerCase());
      const own = first.length >= 3 ? inBody.find((m) => m.split('@')[0].includes(first)) : undefined;
      if (own) return json({ email: own, from: 'message' });
      const { data: me } = await admin.from('profiles').select('email').eq('id', profileId).maybeSingle();
      const found = await emailFromMailbox(admin, profileId, name, me?.email as string | null);
      if (found)
        await admin.from('activity_log').insert({
          actor_type: 'muntej',
          subject_id: profileId,
          action: 'email_looked_up',
          summary: `Found ${name}'s email in the connected mailbox`,
          summary_ar: `لقيت إيميل ${name} في البريد المربوط`,
          reason: 'adding them to the team from a task',
          undoable: false,
        });
      return json({ email: found, from: found ? 'mailbox' : null });
    }

    // someone was just added to the team: the waiting task goes to them
    case 'set_owner': {
      const item = await loadItem(admin, profileId, body.id);
      const s = item.suggestions[Number(body.index)];
      if (!s || s.state !== 'new') throw new HttpError(409, 'Already handled');
      const { data: me } = await admin.from('profiles').select('account_id').eq('id', profileId).maybeSingle();
      const { data: them } = await admin.from('profiles').select('id, account_id').eq('id', String(body.owner_id ?? '')).maybeSingle();
      if (!them || them.account_id !== me?.account_id) throw new HttpError(404, 'Person not found');
      s.owner_id = them.id as string;
      s.outside = false;
      return json(await saveItem(admin, item));
    }

    case 'recheck_owners':
      return json(await recheckOwners(admin, profileId));

    default:
      throw new HttpError(400, 'Unknown action');
  }
});
