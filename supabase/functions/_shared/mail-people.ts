// People from your mail (owner, 6 Nov: "once we connect Google tools, saree3 should import all users email found in
// tasks and suggest to add it to the account org structure under one of the existing users or skip the user").
// Everyone in what Muntej read for you (Gmail From / To / Cc, Meet organiser and invitees, Google Chat people) who
// isn't in your team yet becomes one team draft (source 'mail') for Review your team (screen 62):
//   - colleagues: your company's email domain (or Google Chat), suggested under the teammate they mail with most, else you
//   - outside the company (clients, suppliers): set to skip, shown apart
//   - you, people already in the team, no-reply senders and anyone you skipped before are left out
// Read as the caller (RLS: only their own items); a name with no email is looked up in their Gmail (at most 10).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { emailFromMailbox } from './connections.ts';
import { HttpError } from './http.ts';
import { phCapture } from './posthog.ts';
import { adminClient } from './push.ts';
import { matchPeople, type Draft, type DraftPerson } from './team-reader.ts';

const ITEMS = 300;
// each lookup searches Gmail (about 10 calls): few, so the list comes quickly (owner, 8 Nov: "it still loading a lot")
const LOOKUPS = 3;
const PUBLIC = /^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|msn|aol|proton|protonmail)\.[a-z.]+$/;
const ROBOT = /(^|[._-])(no-?reply|do-?not-?reply|notifications?|notify|mailer|bounces?|newsletter|news|alerts?|calendar|support|help|billing|invoice|marketing|info|hello|team)([._-]|@)|@(.*\.)?(google|googlemail|facebook|linkedin|slack|zoom|microsoft|notion|atlassian|github)\.com$/i;

/** items: every message they're in (for who they work with); talks: the ones that were a real exchange with you */
type Seen = { name: string | null; email: string | null; items: Set<string>; talks: Set<string>; direct: boolean };
/** someone you really deal with: two real exchanges, or a direct chat */
const TALKS = 2;

const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
export const nameKey = (s: string) => `name:${s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`;
const domainOf = (email: string) => email.split('@')[1] ?? '';
const clean = (s: string) => s.replace(/^["'\s]+|["'\s]+$/g, '').trim();

/** "A" <a@x>, b@y, "C, D" <c@z> → name + email pairs (a header's value) */
function addresses(value: string): { name: string | null; email: string | null }[] {
  const out: { name: string | null; email: string | null }[] = [];
  for (const m of value.matchAll(/(?:"([^"]*)"|([^,<>"]*?))\s*<([^<>\s]+@[^<>\s]+)>|([^\s,<>"]+@[^\s,<>"]+)/g)) {
    const email = lower(m[3] ?? m[4]);
    const name = clean(m[1] ?? m[2] ?? '');
    if (email) out.push({ name: name && !name.includes('@') ? name : null, email });
  }
  return out;
}

/** how someone appears in a message: only some of these mean you really deal with them */
type Role = 'from' | 'to' | 'cc' | 'meet' | 'dm' | 'group';
type Found = { name: string | null; email: string | null; role: Role };

/** everyone named in one item, from the lines the providers write (google.ts) */
export function peopleInItem(source: string, body: string): Found[] {
  const head = body.split('\n\n')[0] ?? '';
  const out: Found[] = [];
  for (const line of head.split('\n')) {
    const m = /^(From|To|Cc|Organiser|Invited):\s*(.+)$/i.exec(line.trim());
    if (!m) continue;
    const kind = m[1].toLowerCase();
    const role: Role = kind === 'from' ? 'from' : kind === 'to' ? 'to' : kind === 'cc' ? 'cc' : 'meet';
    const found = addresses(m[2]);
    // Meet invitees can be plain names
    if (!found.length && role === 'meet') for (const n of m[2].split(',')) if (clean(n) && !/room|قاعة|\(\d+\)/i.test(n)) out.push({ name: clean(n), email: null, role });
    out.push(...found.map((f) => ({ ...f, role })));
  }
  if (source === 'google_chat') {
    const dm = /Direct message between:\s*(.+)/.exec(body);
    for (const n of dm?.[1].split(',') ?? []) if (clean(n)) out.push({ name: clean(n), email: null, role: 'dm' });
    for (const m of body.matchAll(/^\[[^\]]*\]\s+([^:\n]{2,60}):/gm)) if (clean(m[1]) !== 'Someone') out.push({ name: clean(m[1]), email: null, role: dm ? 'dm' : 'group' });
  }
  return out;
}

/** a real exchange with them (owner, 8 Nov: "11 users... I didn't even speak to this number"): they wrote to you, you
 *  wrote to them (one to three people, not a mailing), a meeting together or a direct chat. A Cc, a long To list or a
 *  group chat line is not */
function talked(f: Found, all: Found[], mine: Set<string>): boolean {
  if (f.role === 'from' || f.role === 'meet' || f.role === 'dm') return true;
  if (f.role !== 'to') return false;
  const fromMe = all.some((x) => x.role === 'from' && !!x.email && mine.has(x.email));
  return fromMe && all.filter((x) => x.role === 'to').length <= 3;
}

export async function peopleFromMail(db: SupabaseClient, profileId: string, opts: { countOnly?: boolean } = {}) {
  const { data: lead } = await db.rpc('can_lead');
  if (!lead) throw new HttpError(403, 'Only managers and admins can change the team');
  // in testing until the owner approves it (features.testing): only testers have it
  const { data: on } = await db.rpc('feature_on', { p_key: 'team_from_mail' });
  if (on === false) throw new HttpError(403, 'Not available yet');
  const { data: me } = await db.from('profiles').select('id, account_id, email, role, manager_id, full_name, full_name_ar').eq('id', profileId).single();
  if (!me) throw new HttpError(404, 'No profile');
  const [{ data: team }, { data: items }, { data: skips }, { data: conns }] = await Promise.all([
    db.from('profiles').select('id, full_name, full_name_ar, email, phone, manager_id, status').eq('account_id', me.account_id).neq('status', 'deleted'),
    db.from('incoming_items').select('id, source, body').eq('owner_id', profileId).order('received_at', { ascending: false, nullsFirst: false }).limit(ITEMS),
    db.from('team_mail_skips').select('key').eq('created_by', profileId),
    db.from('connections').select('account_label').eq('profile_id', profileId),
  ]);
  const people = team ?? [];
  const mine = new Set([lower(me.email), ...(conns ?? []).map((c) => lower(c.account_label as string)).filter((x) => x.includes('@'))].filter(Boolean));
  const skipped = new Set((skips ?? []).map((s) => s.key as string));
  const teamEmail = new Map(people.filter((p) => p.email).map((p) => [lower(p.email), p.id as string]));
  // the company's own domains: the team's and yours (never gmail.com and the like, never Muntej's own sign-in domains)
  const domains = new Set([...teamEmail.keys(), ...mine].map(domainOf).filter((d) => d && !PUBLIC.test(d) && !/muntej\.(invalid|app)$/.test(d)));

  // you, by name too (owner, 8 Nov: "you get my email which does not make sense"): a chat or meeting gives only a name,
  // and "Sameer Hosni" there is "S Hosni" here. Your profile names, plus the names your own addresses carry in mail.
  const myNames = new Set([me.full_name, me.full_name_ar].filter(Boolean).map((n) => nameKey(n as string)));
  const parsed = (items ?? []).map((it) => ({ it, found: peopleInItem(it.source as string, (it.body as string) ?? '') }));
  for (const { found } of parsed) for (const f of found) if (f.email && f.name && mine.has(f.email)) myNames.add(nameKey(f.name));
  const words = (k: string) => k.slice(5).split(' ').filter(Boolean);
  const isMe = (name: string | null) => {
    if (!name) return false;
    const k = nameKey(name);
    if (myNames.has(k)) return true;
    const w = words(k);
    // same last name and the same first letter: "S Hosni" ≈ "Sameer Hosni"
    return [...myNames].some((m) => {
      const v = words(m);
      return w.length >= 2 && v.length >= 2 && w.at(-1) === v.at(-1) && w[0][0] === v[0][0] && (w[0].length === 1 || v[0].length === 1 || w[0] === v[0]);
    });
  };

  // everyone, and who they appear with
  const seen = new Map<string, Seen>();
  const withTeam = new Map<string, Map<string, number>>();
  for (const { it, found } of parsed) {
    const here = new Set<string>();
    for (const f of found) {
      const tid = f.email ? teamEmail.get(f.email) : undefined;
      if (tid) here.add(tid);
    }
    for (const f of found) {
      if (f.email && (mine.has(f.email) || teamEmail.has(f.email) || ROBOT.test(f.email))) continue;
      if (!f.email && !f.name) continue;
      if (isMe(f.name)) continue;
      const key = f.email ?? nameKey(f.name!);
      const s = seen.get(key) ?? { name: null, email: f.email, items: new Set(), talks: new Set(), direct: false };
      if (f.name && (!s.name || f.name.length > s.name.length)) s.name = f.name;
      s.items.add(it.id as string);
      if (talked(f, found, mine)) s.talks.add(it.id as string);
      if (f.role === 'dm') s.direct = true;
      seen.set(key, s);
      const co = withTeam.get(key) ?? new Map<string, number>();
      for (const tid of here) co.set(tid, (co.get(tid) ?? 0) + 1);
      withTeam.set(key, co);
    }
  }
  // one person known by name (Chat) and by email (Gmail) is the same: keep the one with the email
  for (const [key, s] of [...seen]) {
    if (!key.startsWith('name:')) continue;
    const twin = [...seen.values()].find((x) => x.email && x.name && nameKey(x.name) === key);
    if (twin) {
      s.items.forEach((i) => twin.items.add(i));
      s.talks.forEach((i) => twin.talks.add(i));
      twin.direct ||= s.direct;
      seen.delete(key);
    }
  }
  // only people you really deal with
  for (const [key, s] of [...seen]) if (!s.direct && s.talks.size < TALKS) seen.delete(key);

  // who you may put people under: you, and your branch (admins: anyone)
  const admin = me.role === 'admin' || me.role === 'super_admin';
  const below = (id: string) => {
    for (let p = people.find((x) => x.id === id), hops = 0; p && hops < 30; p = people.find((x) => x.id === p!.manager_id), hops++)
      if (p.manager_id === profileId) return true;
    return false;
  };
  const allowed = new Set(people.filter((p) => p.id !== profileId && (admin || below(p.id as string))).map((p) => p.id as string));

  // matched against the team by name too («فيصل» / "Faisal"), then sorted: colleagues first, most seen first
  const list = [...seen.entries()]
    .filter(([key]) => !skipped.has(key))
    .map(([key, s], i) => ({ key, s, ref: `m${i + 1}` }))
    .filter(({ s }) => !!(s.name || s.email));
  const matched = matchPeople(
    list.map(({ s, ref }) => ({
      ref,
      full_name: s.name ?? s.email!.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      full_name_ar: null,
      title: null,
      email: s.email,
      phone: null,
      department: null,
      manager_ref: null,
      manager_name: null,
      confidence: 0.7,
      unsure: [],
    })),
    people as Parameters<typeof matchPeople>[1],
  );
  let out: (DraftPerson & { outside: boolean; seen_in: number; key: string })[] = matched
    .map((p, i) => {
      const { key, s } = list[i];
      const outside = !!s.email && !domains.has(domainOf(s.email));
      const co = [...(withTeam.get(key) ?? new Map<string, number>())].filter(([id]) => allowed.has(id)).sort((a, b) => b[1] - a[1]);
      const boss = co[0]?.[1] ? co[0][0] : null;
      return {
        ...p,
        // the email decides (owner, 8 Nov: "check email first and don't mention duplicates"): an address already in the
        // team was left out above; any other address is someone new, so no "is this the same person?" question
        ...(s.email ? { maybe: undefined, is_new: true } : {}),
        manager_id: boss,
        outside,
        seen_in: s.items.size,
        key,
        skip: outside,
        confidence: boss && co[0][1] >= 2 ? 0.85 : 0.6,
        unsure: [...new Set([...p.unsure, ...(s.email ? [] : ['email']), ...(boss && co[0][1] >= 2 ? [] : ['manager'])])],
      };
    })
    .filter((p) => !p.existing_id)
    .sort((a, b) => Number(a.outside) - Number(b.outside) || b.seen_in - a.seen_in);

  if (opts.countOnly) return { count: out.filter((p) => !p.outside).length, outside: out.filter((p) => p.outside).length };

  // a name with no email (Google Chat): their address from your Gmail, then checked against the team again
  const admin_ = adminClient();
  let looked = 0;
  for (const p of out) {
    if (p.email || p.outside || looked >= LOOKUPS) continue;
    looked++;
    const email = await emailFromMailbox(admin_, profileId, p.full_name, me.email).catch(() => null);
    if (!email) continue;
    if (teamEmail.has(email) || mine.has(email)) p.existing_id = teamEmail.get(email) ?? profileId;
    else {
      p.email = email;
      p.unsure = p.unsure.filter((u) => u !== 'email');
      if (!domains.has(domainOf(email)) && domains.size) p.outside = p.skip = true;
    }
  }
  out = out.filter((p) => !p.existing_id);

  const { data: draft, error } = await db
    .from('team_drafts')
    .insert({ account_id: me.account_id, created_by: profileId, source: 'mail', people: out, company_name: null })
    .select()
    .single();
  if (error) throw new HttpError(500, error.message);
  await db.from('activity_log').insert({
    actor_type: 'muntej',
    actor_id: profileId,
    subject_id: profileId,
    action: 'team_from_mail',
    summary: `Found ${out.filter((p) => !p.outside).length} colleagues and ${out.filter((p) => p.outside).length} people outside the company in your mail`,
    summary_ar: `لقيت ${out.filter((p) => !p.outside).length} زميل و${out.filter((p) => p.outside).length} من برّا الشركة في إيميلاتك`,
    reason: 'People in the mail and chats Muntej read for you who are not in the team yet',
    undoable: false,
  });
  await phCapture([{ distinctId: profileId, event: 'team_import_read', properties: { source: 'mail', people: out.length, outside: out.filter((p) => p.outside).length, looked_up: looked } }]);
  return { draft: draft as Draft };
}

/** whoever was left out of a mail draft is never suggested again */
export async function rememberSkips(db: SupabaseClient, profileId: string, people: (DraftPerson & { key?: string })[]) {
  const keys = people.filter((p) => p.skip).map((p) => p.key ?? (p.email ? lower(p.email) : nameKey(p.full_name)));
  if (keys.length) await db.from('team_mail_skips').upsert(keys.map((key) => ({ created_by: profileId, key })), { onConflict: 'created_by,key', ignoreDuplicates: true });
}
