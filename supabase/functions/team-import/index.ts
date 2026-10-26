// team-import — the smart way in to building a team (owner, 26 Oct: "the org structure is the hook"). A photo of an
// org chart, an Excel / CSV / PDF file or any pasted list becomes one team draft (team_drafts) that the person
// reviews as a tree in the app (screen 62) and confirms once.
//   POST {action:'read', text?, file?: {name, mime, base64}}  → {draft}   (signed in)
//   POST {action:'apply', draft_id, people}                     → {created, updated, failed, ids}
// Everything runs as the caller (their JWT), so upsert_person's rules hold: people go only into the caller's branch,
// no cycles, admin roles only by the super admin. Images and PDFs go to the model as they are; Excel / CSV are turned
// into text first (SheetJS). Env: OPENAI_API_KEY, IMPORT_MODEL (default gpt-4.1: reads Arabic org charts well).
import { getCaller, HttpError, json, serve } from '../_shared/http.ts';
import { phCapture } from '../_shared/posthog.ts';
import { adminClient } from '../_shared/push.ts';
import { readTeam, saudiPhone, type DraftPerson, type ReadInput } from '../_shared/team-reader.ts';

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const body = (await req.json().catch(() => ({}))) as ReadInput & {
    action?: string;
    /** server-only dry run (x-cron-secret): read as this profile, return the draft without saving it */
    test_as?: string;
    draft_id?: string;
    people?: DraftPerson[];
  };
  const cron = Deno.env.get('CRON_SECRET');
  const dry = !!cron && req.headers.get('x-cron-secret') === cron && !!body.test_as;
  const { db, profileId } = dry ? { db: adminClient(), profileId: body.test_as! } : await getCaller(req);
  if (dry && body.action !== 'read') throw new HttpError(400, 'Dry runs only read');
  if (body.action === 'apply') return json(await apply(db, profileId, body.draft_id ?? '', body.people ?? []));
  if (body.action !== 'read') throw new HttpError(400, 'Unknown action');
  return json({ draft: await readTeam(db, profileId, { text: body.text, file: body.file, source: body.source, dry, model: body.model, effort: body.effort }) });
});

/** create / update everyone, managers first, as the caller; one failure never stops the rest */
async function apply(db: Awaited<ReturnType<typeof getCaller>>['db'], profileId: string, draftId: string, people: DraftPerson[]) {
  const { data: draft } = await db.from('team_drafts').select('id, status').eq('id', draftId).maybeSingle();
  if (!draft) throw new HttpError(404, 'Draft not found');
  if (draft.status === 'applied') throw new HttpError(409, 'Already confirmed');
  const keep = people.filter((p) => !p.skip && p.full_name?.trim());
  const ids: Record<string, string> = {};
  const failed: { ref: string; name: string; error: string }[] = [];
  let created = 0;
  let updated = 0;
  // managers before their people (several passes; a missing / skipped manager falls back to the caller)
  const left = new Map(keep.map((p) => [p.ref, p]));
  const inList = new Set(keep.map((p) => p.ref));
  for (let pass = 0; left.size && pass < 50; pass++) {
    const ready = [...left.values()].filter((p) => !p.manager_ref || !inList.has(p.manager_ref) || ids[p.manager_ref] || failed.some((f) => f.ref === p.manager_ref));
    if (!ready.length) break; // a loop in the draft: the rest go under the caller below
    for (const p of ready) {
      left.delete(p.ref);
      await save(p);
    }
  }
  for (const p of left.values()) await save({ ...p, manager_ref: null });

  async function save(p: DraftPerson) {
    const manager = (p.manager_ref && ids[p.manager_ref]) || p.manager_id || null;
    const payload: Record<string, unknown> = p.existing_id
      ? {
          id: p.existing_id,
          ...(p.title ? { title: p.title } : {}),
          ...(p.phone ? { phone: p.phone } : {}),
          ...(p.email ? { email: p.email } : {}),
          ...(manager && manager !== p.existing_id ? { manager_id: manager } : {}),
        }
      : {
          full_name: p.full_name.trim(),
          ...(p.full_name_ar ? { full_name_ar: p.full_name_ar } : {}),
          ...(p.title ? { title: p.title } : {}),
          ...(p.phone ? { phone: saudiPhone(p.phone) } : {}),
          ...(p.email ? { email: p.email.trim().toLowerCase() } : {}),
          ...(manager ? { manager_id: manager } : {}),
          ...(p.role === 'manager' ? { role: 'manager' } : {}),
        };
    const { data, error } = await db.rpc('upsert_person', { p: payload });
    if (error) return void failed.push({ ref: p.ref, name: p.full_name, error: error.message });
    ids[p.ref] = data as string;
    if (p.existing_id) updated++;
    else created++;
  }

  const result = { created, updated, failed, ids };
  await db.from('team_drafts').update({ status: 'applied', people, result, updated_at: new Date().toISOString() }).eq('id', draftId);
  await phCapture([{ distinctId: profileId, event: 'team_import_applied', properties: { created, updated, failed: failed.length } }]);
  return result;
}
