// Reading a team from anything (owner, 26 Oct: "the org structure is the hook"): a photo of an org chart, an Excel /
// CSV / PDF file, a pasted list or a sentence ("Faisal leads sales with Abdullah and Saad") → people with their
// managers, matched with who's already in Muntej. Used by team-import (Build your team) and muntej-chat ("team").
// Images and PDFs go to the model as they are; Excel / CSV are turned into text first (SheetJS).
// Env: OPENAI_API_KEY, IMPORT_MODEL (default gpt-4.1: reads Arabic org charts well).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
// SheetJS (Excel / CSV reading)
import * as XLSX from 'npm:xlsx@0.18.5';
import { HttpError, requireEnv } from './http.ts';
import { phCapture } from './posthog.ts';

export type DraftPerson = {
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

export type ReadInput = { text?: string; file?: { name?: string; mime?: string; base64?: string }; source?: string; dry?: boolean };
export type Draft = { id?: string; source: string; people: DraftPerson[]; company_name: string | null };

/** read whatever was given into a draft; saved in team_drafts (as the caller) unless dry */
export async function readTeam(db: SupabaseClient, profileId: string, body: ReadInput): Promise<Draft> {
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

  if (body.dry) return { source, people, company_name: parsed.company_name };
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
  return draft as Draft;
}

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

export function matchPeople(list: (Omit<DraftPerson, 'manager_id' | 'existing_id' | 'role'> & { manager_name: string | null })[], existing: Existing[]): DraftPerson[] {
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
