// team-import — the smart way in to building a team (owner, 26 Oct: "the org structure is the hook"). A photo of an
// org chart, an Excel / CSV / PDF file or any pasted list becomes one team draft (team_drafts) that the person
// reviews as a tree in the app (screen 62) and confirms once.
//   POST {action:'read', text?, file?: {name, mime, base64}}  → {draft}   (signed in)
//   POST {action:'apply', draft_id, people}                     → {created, updated, failed, ids}
// Everything runs as the caller (their JWT), so upsert_person's rules hold: people go only into the caller's branch,
// no cycles, admin roles only by the super admin. Images and PDFs go to the model as they are; Excel / CSV are turned
// into text first (SheetJS). Env: OPENAI_API_KEY, IMPORT_MODEL (default gpt-4.1: reads Arabic org charts well).
// SheetJS (Excel / CSV reading)
import * as XLSX from 'npm:xlsx@0.18.5';
import { getCaller, HttpError, json, requireEnv, serve } from '../_shared/http.ts';
import { phCapture } from '../_shared/posthog.ts';
import { adminClient } from '../_shared/push.ts';

type DraftPerson = {
  ref: string;
  full_name: string;
  full_name_ar: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  manager_ref: string | null;
  /** a person already in Muntej who manages this one */
  manager_id: string | null;
  /** this row is someone already in Muntej */
  existing_id: string | null;
  role: 'employee' | 'manager';
  confidence: number;
  unsure: string[];
  skip?: boolean;
};

const MAX_BYTES = 6 * 1024 * 1024;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['company_name', 'people'],
  properties: {
    company_name: { type: ['string', 'null'] },
    people: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'full_name', 'full_name_ar', 'title', 'email', 'phone', 'department', 'manager_ref', 'manager_name', 'confidence', 'unsure'],
        properties: {
          ref: { type: 'string', description: 'short id you give this person: p1, p2…' },
          full_name: { type: 'string', description: 'name as written (Latin letters if given, else the Arabic)' },
          full_name_ar: { type: ['string', 'null'], description: 'Arabic name when it appears' },
          title: { type: ['string', 'null'] },
          email: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'] },
          department: { type: ['string', 'null'] },
          manager_ref: { type: ['string', 'null'], description: 'ref of their direct manager when that manager is in this list' },
          manager_name: { type: ['string', 'null'], description: 'name of the direct manager when written but not in this list' },
          confidence: { type: 'number', description: '0-1: how sure you are about this person and their manager' },
          unsure: { type: 'array', items: { type: 'string', enum: ['name', 'title', 'email', 'phone', 'manager'] } },
        },
      },
    },
  },
} as const;

const PROMPT = `You read a company's team from an org chart picture, a staff spreadsheet, a PDF or a pasted list (Arabic,
English or both; Saudi companies). Return every PERSON once (never departments or vacant boxes as people).
- Org charts: a line from a box above means that box is the direct manager. Assistants beside a box report to it.
- Spreadsheets: find the columns whatever they're called (الاسم، المسمى الوظيفي، المدير المباشر، القسم، الجوال،
  البريد / Name, Title, Line manager, Reports to, Dept, Mobile, Email). Employee numbers are not names.
- Keep names exactly as written. If a manager is named in a row and that person is in the list, use manager_ref.
- Phones: copy as written. Emails: lowercase.
- Mark in "unsure" any field you guessed or could not read well; lower confidence for blurry or ambiguous parts.
- company_name: only if the document clearly shows it.`;

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const body = (await req.json().catch(() => ({}))) as {
    /** server-only dry run (x-cron-secret): read as this profile, return the draft without saving it */
    test_as?: string;
    action?: string;
    text?: string;
    file?: { name?: string; mime?: string; base64?: string };
    source?: string;
    draft_id?: string;
    people?: DraftPerson[];
  };
  const cron = Deno.env.get('CRON_SECRET');
  const dry = !!cron && req.headers.get('x-cron-secret') === cron && !!body.test_as;
  const { db, profileId } = dry ? { db: adminClient(), profileId: body.test_as! } : await getCaller(req);
  if (dry && body.action !== 'read') throw new HttpError(400, 'Dry runs only read');
  if (body.action === 'apply') return json(await apply(db, profileId, body.draft_id ?? '', body.people ?? []));
  if (body.action !== 'read') throw new HttpError(400, 'Unknown action');

  // ── what to read ──
  const parts: Record<string, unknown>[] = [];
  let source: 'photo' | 'file' | 'paste' | 'chat' = body.source === 'chat' ? 'chat' : 'paste';
  if (body.file?.base64) {
    const name = body.file.name ?? 'file';
    const mime = (body.file.mime ?? '').toLowerCase();
    const bytes = Uint8Array.from(atob(body.file.base64), (c) => c.charCodeAt(0));
    if (bytes.length > MAX_BYTES) throw new HttpError(413, 'The file is too big (6 MB at most)');
    if (mime.startsWith('image/')) {
      source = 'photo';
      parts.push({ type: 'input_image', image_url: `data:${mime};base64,${body.file.base64}`, detail: 'high' });
    } else if (mime === 'application/pdf' || /\.pdf$/i.test(name)) {
      source = 'file';
      parts.push({ type: 'input_file', filename: name, file_data: `data:application/pdf;base64,${body.file.base64}` });
    } else if (/\.(xlsx|xls|csv|ods)$/i.test(name) || /sheet|excel|csv/.test(mime)) {
      source = 'file';
      const wb = XLSX.read(bytes, { type: 'array' });
      const text = (wb.SheetNames as string[]).map((s: string) => `### ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s], { blankrows: false })}`).join('\n\n');
      parts.push({ type: 'input_text', text: text.slice(0, 120_000) });
    } else if (/^text\//.test(mime) || /\.txt$/i.test(name)) {
      source = 'file';
      parts.push({ type: 'input_text', text: new TextDecoder().decode(bytes).slice(0, 120_000) });
    } else throw new HttpError(415, 'I read photos, PDF, Excel and CSV. For Word, save it as PDF first.');
  }
  if (body.text?.trim()) parts.push({ type: 'input_text', text: body.text.trim().slice(0, 60_000) });
  if (!parts.length) throw new HttpError(400, 'Send a photo, a file or a list');

  // ── read it ──
  const model = Deno.env.get('IMPORT_MODEL') ?? 'gpt-4.1';
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      instructions: PROMPT,
      input: [{ role: 'user', content: parts }],
      text: { format: { type: 'json_schema', name: 'team', strict: true, schema: SCHEMA } },
    }),
  });
  if (!res.ok) {
    console.error('team-import model', res.status, (await res.text()).slice(0, 400));
    throw new HttpError(502, 'I couldn’t read it this time, try again');
  }
  const out = (await res.json()) as { output?: { type: string; content?: { type: string; text?: string }[] }[]; output_text?: string };
  const raw = out.output_text ?? out.output?.flatMap((o) => o.content ?? []).find((c) => c.type === 'output_text')?.text ?? '{}';
  const parsed = JSON.parse(raw) as { company_name: string | null; people: (Omit<DraftPerson, 'manager_id' | 'existing_id' | 'role'> & { manager_name: string | null })[] };

  // ── match with who's already in Muntej, tidy phones and emails, guess roles ──
  const { data: me } = await db.from('profiles').select('account_id').eq('id', profileId).single();
  const { data: existing } = await db.from('profiles').select('id, full_name, full_name_ar, email, phone').eq('account_id', me!.account_id).neq('status', 'deleted');
  const people = matchPeople(parsed.people, existing ?? []);
  if (dry) return json({ draft: { source, people, company_name: parsed.company_name } });

  const { data: draft, error } = await db
    .from('team_drafts')
    .insert({ account_id: me!.account_id, created_by: profileId, source, people, company_name: parsed.company_name })
    .select()
    .single();
  if (error) throw new HttpError(500, error.message);
  await phCapture([
    {
      distinctId: profileId,
      event: 'team_import_read',
      properties: { source, people: people.length, existing: people.filter((p) => p.existing_id).length, unsure: people.filter((p) => p.unsure.length).length },
    },
  ]);
  return json({ draft });
});

const norm = (s: string | null | undefined) =>
  (s ?? '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Saudi mobile in the stored format: 9665XXXXXXXX (05… / +966… / 966… / 5…) */
export function saudiPhone(p: string | null | undefined): string | null {
  const d = (p ?? '').replace(/[٠-٩]/g, (x) => String(x.charCodeAt(0) - 0x660)).replace(/\D/g, '');
  if (!d) return null;
  if (/^9665\d{8}$/.test(d)) return d;
  if (/^05\d{8}$/.test(d)) return `966${d.slice(1)}`;
  if (/^5\d{8}$/.test(d)) return `966${d}`;
  if (/^009665\d{8}$/.test(d)) return d.slice(2);
  return d.length >= 8 ? d : null;
}

type Existing = { id: string; full_name: string; full_name_ar: string | null; email: string | null; phone: string | null };

function matchPeople(list: (Omit<DraftPerson, 'manager_id' | 'existing_id' | 'role'> & { manager_name: string | null })[], existing: Existing[]): DraftPerson[] {
  const refs = new Set(list.map((p) => p.ref));
  const byName = (name: string | null | undefined) => {
    const n = norm(name);
    if (!n) return null;
    return existing.find((e) => norm(e.full_name) === n || norm(e.full_name_ar) === n) ?? null;
  };
  const people: DraftPerson[] = list.map((p) => {
    const email = p.email?.trim().toLowerCase() || null;
    const phone = saudiPhone(p.phone);
    const same =
      (email && existing.find((e) => e.email?.toLowerCase() === email)) ||
      (phone && existing.find((e) => e.phone === phone)) ||
      byName(p.full_name) ||
      byName(p.full_name_ar);
    // the manager named in the row: someone in this list, else someone already in Muntej
    let managerRef = p.manager_ref && refs.has(p.manager_ref) && p.manager_ref !== p.ref ? p.manager_ref : null;
    if (!managerRef && p.manager_name) managerRef = list.find((x) => x.ref !== p.ref && (norm(x.full_name) === norm(p.manager_name) || norm(x.full_name_ar) === norm(p.manager_name)))?.ref ?? null;
    const managerId = !managerRef && p.manager_name ? (byName(p.manager_name)?.id ?? null) : null;
    return {
      ref: p.ref,
      full_name: p.full_name.trim(),
      full_name_ar: p.full_name_ar?.trim() || null,
      title: p.title?.trim() || null,
      email,
      phone,
      department: p.department?.trim() || null,
      manager_ref: managerRef,
      manager_id: managerId,
      existing_id: same ? same.id : null,
      role: 'employee',
      confidence: Math.max(0, Math.min(1, p.confidence ?? 0.7)),
      unsure: [...new Set([...(p.unsure ?? []), ...(p.manager_name && !managerRef && !managerId ? ['manager'] : [])])],
    };
  });
  // people others report to are managers
  const leads = new Set(people.map((p) => p.manager_ref).filter(Boolean));
  for (const p of people) if (leads.has(p.ref)) p.role = 'manager';
  return people;
}

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
