// public-api — Muntej's REST API for other systems (ERP / CRM / HR, Odoo, Zoho, internal tools), versioned under /v1.
// Docs: docs/api/README.md · contract: docs/api/openapi.yaml
//   auth          Authorization: Bearer mjk_…  (or X-API-Key). Keys are per account, made by an admin (create_api_key);
//                 only their SHA-256 hash is stored. Each key has scopes and a per-minute limit.
//   acting as     the admin who made the key: tasks are created through create_task_as with the same follow-up plan
//                 as the app (buildPlan), people through upsert_person_as, so every rule of the account applies
//   idempotency   POST with an Idempotency-Key header: a retry within 24 h gets the first answer back
//   errors        { "error": { "code": "…", "message": "…" } } with the right HTTP status
//   audit         every write is logged in activity_log (actor_type 'agent', reason "API key <name>")
// Deployed with --no-verify-jwt (callers aren't Supabase users; the key is checked here).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { requireEnv } from '../_shared/http.ts';
import { buildPlan } from '../_shared/followup-plan.ts';
import { ingestMessage, type Creator } from '../_shared/intake-core.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};
const STATUSES = ['draft', 'assigned', 'in_progress', 'blocked', 'submitted', 'returned', 'done', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const PROOF = ['none', 'any', 'file', 'image', 'link'];
const EVENTS = ['task.created', 'task.updated', 'task.done', 'decision.created', 'decision.resolved'];
const OPEN = ['assigned', 'in_progress', 'blocked', 'submitted', 'returned'];
const TASK_COLS =
  'id, title, description, status, priority, due_at, owner_id, assigner_id, helper_id, progress, definition_of_done, proof_required, budget, source, created_at, updated_at, closed_at';

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
const reply = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

type Key = { id: string; account_id: string; name: string; scopes: string[]; actor_id: string; rate_per_min: number };

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function authenticate(admin: SupabaseClient, req: Request): Promise<Key> {
  const auth = req.headers.get('authorization') ?? '';
  const raw = (auth.startsWith('Bearer ') ? auth.slice(7) : req.headers.get('x-api-key') ?? '').trim();
  if (!raw.startsWith('mjk_')) throw new ApiError(401, 'unauthorized', 'Send your API key as "Authorization: Bearer mjk_…"');
  const { data: key } = await admin
    .from('api_keys')
    .select('id, account_id, name, scopes, actor_id, rate_per_min')
    .eq('key_hash', await sha256Hex(raw))
    .is('revoked_at', null)
    .maybeSingle();
  if (!key) throw new ApiError(401, 'unauthorized', 'Unknown or revoked API key');
  const { data: count } = await admin.rpc('api_hit', { p_key: key.id });
  if ((count as number) > key.rate_per_min) throw new ApiError(429, 'rate_limited', `Limit is ${key.rate_per_min} requests a minute`);
  await admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id);
  return key as Key;
}

const need = (key: Key, scope: string) => {
  if (!key.scopes.includes(scope)) throw new ApiError(403, 'forbidden', `This key lacks the "${scope}" scope`);
};

/** everyone in the key's account (visible people only) */
async function accountPeople(admin: SupabaseClient, key: Key) {
  const { data } = await admin
    .from('profiles')
    .select('id, full_name, full_name_ar, email, role, title, manager_id, status, locale')
    .eq('account_id', key.account_id)
    .eq('hidden', false);
  return (data ?? []) as {
    id: string;
    full_name: string;
    full_name_ar: string | null;
    email: string | null;
    role: string;
    title: string | null;
    manager_id: string | null;
    status: string;
    locale: string | null;
  }[];
}

async function audit(admin: SupabaseClient, key: Key, action: string, en: string, ar: string, taskId?: string | null) {
  await admin.from('activity_log').insert({
    actor_type: 'agent',
    actor_id: key.actor_id,
    subject_id: key.actor_id,
    task_id: taskId ?? null,
    action,
    summary: en,
    summary_ar: ar,
    reason: `API key "${key.name}"`,
    undoable: false,
  });
}

function body<T>(raw: unknown): T {
  if (!raw || typeof raw !== 'object') throw new ApiError(400, 'invalid_body', 'Send a JSON object');
  return raw as T;
}
const str = (v: unknown, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const isoOrNull = (v: unknown, field: string) => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw new ApiError(400, 'invalid_field', `${field} must be an ISO 8601 date-time`);
  return new Date(v).toISOString();
};

// ─── handlers ────────────────────────────────────────────────────────────────

async function listTasks(admin: SupabaseClient, key: Key, url: URL) {
  need(key, 'tasks:read');
  const ids = (await accountPeople(admin, key)).map((p) => p.id);
  let q = admin.from('tasks').select(TASK_COLS).in('assigner_id', ids).order('updated_at', { ascending: false });
  const status = url.searchParams.get('status');
  if (status) {
    if (!STATUSES.includes(status)) throw new ApiError(400, 'invalid_field', `status must be one of ${STATUSES.join(', ')}`);
    q = q.eq('status', status);
  }
  const owner = url.searchParams.get('owner');
  if (owner) q = q.eq('owner_id', await personId(admin, key, owner));
  const since = url.searchParams.get('updated_since');
  if (since) q = q.gte('updated_at', isoOrNull(since, 'updated_since')!);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50));
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0);
  const { data, error } = await q.range(offset, offset + limit - 1);
  if (error) throw new ApiError(500, 'server_error', error.message);
  return reply({ data, limit, offset });
}

async function getTask(admin: SupabaseClient, key: Key, id: string) {
  need(key, 'tasks:read');
  const t = await taskInAccount(admin, key, id);
  const { data: steps } = await admin.from('subtasks').select('id, title, done, position').eq('task_id', id).order('position');
  return reply({ data: { ...t, steps: steps ?? [] } });
}

async function taskInAccount(admin: SupabaseClient, key: Key, id: string) {
  const { data: t } = await admin.from('tasks').select(TASK_COLS).eq('id', id).maybeSingle();
  if (!t) throw new ApiError(404, 'not_found', 'No such task');
  const ids = new Set((await accountPeople(admin, key)).map((p) => p.id));
  if (!ids.has(t.assigner_id as string)) throw new ApiError(404, 'not_found', 'No such task');
  return t as Record<string, unknown>;
}

/** an id or an email of someone in the account → their profile id */
async function personId(admin: SupabaseClient, key: Key, idOrEmail: string) {
  const people = await accountPeople(admin, key);
  const v = idOrEmail.trim().toLowerCase();
  const p = people.find((x) => x.id === v || (x.email ?? '').toLowerCase() === v);
  if (!p) throw new ApiError(400, 'unknown_person', `Nobody "${idOrEmail}" in this account`);
  return p.id;
}

async function createTask(admin: SupabaseClient, key: Key, raw: unknown) {
  need(key, 'tasks:write');
  const b = body<Record<string, unknown>>(raw);
  const title = str(b.title, 200);
  if (!title) throw new ApiError(400, 'invalid_field', 'title is required');
  const priority = (str(b.priority) ?? 'medium') as string;
  if (!PRIORITIES.includes(priority)) throw new ApiError(400, 'invalid_field', `priority must be one of ${PRIORITIES.join(', ')}`);
  const proof = (str(b.proof_required) ?? 'none') as string;
  if (!PROOF.includes(proof)) throw new ApiError(400, 'invalid_field', `proof_required must be one of ${PROOF.join(', ')}`);
  const dueAt = isoOrNull(b.due_at, 'due_at');
  const people = await accountPeople(admin, key);
  const ownerRef = str(b.owner_id) ?? str(b.owner_email);
  const ownerId = ownerRef ? await personId(admin, key, ownerRef) : null;
  const owner = people.find((p) => p.id === ownerId);
  const actor = people.find((p) => p.id === key.actor_id);
  const ar = owner?.locale === 'ar';
  const first = (p?: { full_name: string; full_name_ar: string | null }) => (p ? ((ar && p.full_name_ar) || p.full_name).split(' ')[0] : null);
  // the same follow-up plan the app makes: Saree3 takes it from here
  const followup_plan = ownerId
    ? buildPlan({
        title,
        dueAt,
        ownerFirstName: first(owner),
        ownerArabic: ar,
        self: ownerId === key.actor_id,
        assignerFirstName: first(actor),
        priority,
      })
    : [];
  const { data: id, error } = await admin.rpc('create_task_as', {
    p: {
      title,
      owner_id: ownerId,
      due_at: dueAt,
      priority,
      definition_of_done: str(b.definition_of_done, 1000),
      budget: str(b.budget, 100),
      source: 'agent',
      transcript: str(b.description, 4000),
      followup_plan,
    },
    actor: key.actor_id,
  });
  if (error) throw new ApiError(400, 'cannot_create', error.message);
  if (proof !== 'none') await admin.from('tasks').update({ proof_required: proof }).eq('id', id);
  const ext = str(b.external_ref, 200);
  if (ext) await admin.from('tasks').update({ source_ref: ext }).eq('id', id);
  await audit(admin, key, 'api_task_created', `API created "${title}"`, `أنشأ الـAPI «${title}»`, id as string);
  return reply({ data: await taskInAccount(admin, key, id as string) }, 201);
}

async function updateTask(admin: SupabaseClient, key: Key, id: string, raw: unknown) {
  need(key, 'tasks:write');
  const t = await taskInAccount(admin, key, id);
  const b = body<Record<string, unknown>>(raw);
  const patch: Record<string, unknown> = {};
  if (b.status !== undefined) {
    if (typeof b.status !== 'string' || !STATUSES.includes(b.status)) throw new ApiError(400, 'invalid_field', `status must be one of ${STATUSES.join(', ')}`);
    patch.status = b.status;
    if (b.status === 'done') patch.closed_at = new Date().toISOString();
  }
  if (b.due_at !== undefined) patch.due_at = isoOrNull(b.due_at, 'due_at');
  if (b.priority !== undefined) {
    if (typeof b.priority !== 'string' || !PRIORITIES.includes(b.priority)) throw new ApiError(400, 'invalid_field', `priority must be one of ${PRIORITIES.join(', ')}`);
    patch.priority = b.priority;
  }
  const ownerRef = str(b.owner_id) ?? str(b.owner_email);
  if (ownerRef) patch.owner_id = await personId(admin, key, ownerRef);
  if (b.title !== undefined) {
    const title = str(b.title, 200);
    if (!title) throw new ApiError(400, 'invalid_field', 'title cannot be empty');
    patch.title = title;
  }
  if (!Object.keys(patch).length) throw new ApiError(400, 'invalid_body', 'Nothing to change: send status, due_at, priority, owner_id / owner_email or title');
  const { error } = await admin.from('tasks').update(patch).eq('id', id);
  if (error) throw new ApiError(400, 'cannot_update', error.message);
  await audit(admin, key, 'api_task_updated', `API changed "${t.title}": ${Object.keys(patch).join(', ')}`, `عدّل الـAPI «${t.title}»`, id);
  return reply({ data: await taskInAccount(admin, key, id) });
}

async function listPeople(admin: SupabaseClient, key: Key) {
  need(key, 'people:read');
  const people = (await accountPeople(admin, key)).filter((p) => p.status !== 'deleted');
  return reply({
    data: people.map((p) => ({ id: p.id, name: p.full_name, name_ar: p.full_name_ar, email: p.email, role: p.role, title: p.title, manager_id: p.manager_id })),
  });
}

async function invitePerson(admin: SupabaseClient, key: Key, raw: unknown) {
  need(key, 'people:write');
  const b = body<Record<string, unknown>>(raw);
  const email = str(b.email, 200)?.toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, 'invalid_field', 'A valid email is required');
  const role = str(b.role) ?? 'employee';
  if (!['employee', 'manager'].includes(role)) throw new ApiError(400, 'invalid_field', 'role must be employee or manager');
  const managerRef = str(b.manager_id) ?? str(b.manager_email);
  const { data: id, error } = await admin.rpc('upsert_person_as', {
    p: {
      full_name: str(b.name, 120) ?? email.split('@')[0].replace(/[._-]+/g, ' '),
      ...(str(b.name_ar, 120) ? { full_name_ar: str(b.name_ar, 120) } : {}),
      ...(str(b.title, 120) ? { title: str(b.title, 120) } : {}),
      email,
      role,
      manager_id: managerRef ? await personId(admin, key, managerRef) : key.actor_id,
    },
    actor: key.actor_id,
  });
  if (error) throw new ApiError(/already used/i.test(error.message) ? 409 : 400, /already used/i.test(error.message) ? 'already_exists' : 'cannot_invite', error.message);
  await audit(admin, key, 'api_person_added', `API added ${email}`, `أضاف الـAPI ${email}`);
  return reply({ data: { id, email, role, signs_in_with: email } }, 201);
}

async function listDecisions(admin: SupabaseClient, key: Key, url: URL) {
  need(key, 'decisions:read');
  const ids = (await accountPeople(admin, key)).map((p) => p.id);
  let q = admin
    .from('decisions')
    .select('id, type, status, title, title_ar, task_id, requested_by, manager_id, recommendation, recommendation_ar, details, created_at, resolved_at')
    .in('manager_id', ids)
    .order('created_at', { ascending: false })
    .limit(100);
  const status = url.searchParams.get('status');
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new ApiError(500, 'server_error', error.message);
  return reply({ data });
}

async function sendMessage(admin: SupabaseClient, key: Key, raw: unknown) {
  need(key, 'messages:write');
  const b = body<Record<string, unknown>>(raw);
  const text = str(b.text, 20_000);
  if (!text) throw new ApiError(400, 'invalid_field', 'text is required');
  const people = await accountPeople(admin, key);
  // whose "Your tools" it lands in (default: the key's admin)
  const forRef = str(b.for_email) ?? str(b.for_id);
  const forId = forRef ? await personId(admin, key, forRef) : key.actor_id;
  const team = people.filter((p) => p.status === 'active');
  const { data: open } = await admin
    .from('tasks')
    .select('id, title, owner_id')
    .in('status', OPEN)
    .in('owner_id', team.map((p) => p.id));
  const create: Creator = async (p) => {
    const { data, error } = await admin.rpc('create_task_as', { p, actor: forId });
    if (error) throw new Error(error.message);
    return data as string;
  };
  const item = await ingestMessage(admin, {
    profileId: forId,
    text,
    source: 'api',
    externalId: str(b.external_id, 200) ?? undefined,
    sender: str(b.sender, 200) ?? key.name,
    subject: str(b.subject, 300),
    receivedAt: isoOrNull(b.received_at, 'received_at'),
    team: team.map((p) => ({ id: p.id, full_name: p.full_name, full_name_ar: p.full_name_ar, title: p.title, skills: [] })) as never,
    open: (open ?? []) as never,
    create,
    confirmFirst: true,
  });
  await audit(admin, key, 'api_message_in', `API sent a message (${item.suggestions.length} task(s) found)`, `أرسل الـAPI رسالة (${item.suggestions.length} مهام)`);
  return reply(
    {
      data: {
        id: item.id,
        duplicate: !!item.duplicate_message,
        tasks_found: item.suggestions.map((s) => ({ title: s.title, owner_id: s.owner_id, due_at: s.due_at, priority: s.priority, state: s.state })),
        waiting_for_ok_in: 'Your tools',
      },
    },
    202,
  );
}

async function createWebhook(admin: SupabaseClient, key: Key, raw: unknown) {
  need(key, 'webhooks:write');
  const b = body<Record<string, unknown>>(raw);
  const url = str(b.url, 1000);
  if (!url || !/^https:\/\//.test(url)) throw new ApiError(400, 'invalid_field', 'url must start with https://');
  const events = Array.isArray(b.events) ? (b.events as unknown[]).filter((e): e is string => typeof e === 'string') : EVENTS;
  const bad = events.filter((e) => !EVENTS.includes(e));
  if (bad.length || !events.length) throw new ApiError(400, 'invalid_field', `events must be some of ${EVENTS.join(', ')}`);
  const secret = 'whsec_' + [...crypto.getRandomValues(new Uint8Array(24))].map((x) => x.toString(16).padStart(2, '0')).join('');
  const { data, error } = await admin
    .from('webhooks')
    .insert({ account_id: key.account_id, url, events, secret, created_by_key: key.id })
    .select('id, url, events, created_at')
    .single();
  if (error) throw new ApiError(400, 'cannot_create', error.message);
  await audit(admin, key, 'api_webhook_added', `API added a webhook to ${new URL(url).host}`, `أضاف الـAPI ويب هوك لـ ${new URL(url).host}`);
  // the secret is shown once: it signs every delivery (X-Muntej-Signature)
  return reply({ data: { ...data, secret } }, 201);
}

async function listWebhooks(admin: SupabaseClient, key: Key) {
  need(key, 'webhooks:write');
  const { data } = await admin.from('webhooks').select('id, url, events, active, created_at').eq('account_id', key.account_id).eq('active', true);
  return reply({ data });
}

async function deleteWebhook(admin: SupabaseClient, key: Key, id: string) {
  need(key, 'webhooks:write');
  const { data } = await admin.from('webhooks').update({ active: false }).eq('id', id).eq('account_id', key.account_id).select('id');
  if (!data?.length) throw new ApiError(404, 'not_found', 'No such webhook');
  return reply(null, 204);
}

// ─── router ──────────────────────────────────────────────────────────────────

async function route(admin: SupabaseClient, key: Key, req: Request, url: URL, path: string[]): Promise<Response> {
  const [v, res, id] = path;
  if (v !== 'v1') throw new ApiError(404, 'not_found', 'Use /v1/…');
  const m = req.method;
  const json = async () => {
    try {
      return await req.json();
    } catch {
      throw new ApiError(400, 'invalid_body', 'Body must be JSON');
    }
  };
  if (res === 'tasks' && !id && m === 'GET') return listTasks(admin, key, url);
  if (res === 'tasks' && !id && m === 'POST') return createTask(admin, key, await json());
  if (res === 'tasks' && id && m === 'GET') return getTask(admin, key, id);
  if (res === 'tasks' && id && m === 'PATCH') return updateTask(admin, key, id, await json());
  if (res === 'people' && !id && m === 'GET') return listPeople(admin, key);
  if (res === 'people' && !id && m === 'POST') return invitePerson(admin, key, await json());
  if (res === 'decisions' && !id && m === 'GET') return listDecisions(admin, key, url);
  if (res === 'messages' && !id && m === 'POST') return sendMessage(admin, key, await json());
  if (res === 'webhooks' && !id && m === 'POST') return createWebhook(admin, key, await json());
  if (res === 'webhooks' && !id && m === 'GET') return listWebhooks(admin, key);
  if (res === 'webhooks' && id && m === 'DELETE') return deleteWebhook(admin, key, id);
  throw new ApiError(404, 'not_found', `No ${m} /${path.join('/')}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  // path after the function name: /public-api/v1/tasks/… → ['v1', 'tasks', …]
  const parts = url.pathname.split('/').filter(Boolean);
  const at = parts.indexOf('public-api');
  const path = at >= 0 ? parts.slice(at + 1) : parts;
  const key0 = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const admin = createClient(requireEnv('SUPABASE_URL'), key0, { auth: { persistSession: false } });
  try {
    if (!path.length || (path.length === 1 && path[0] === 'v1'))
      return reply({ name: 'Muntej API', version: 'v1', docs: 'https://muntej.app/docs/api' });
    const key = await authenticate(admin, req);
    // a retried POST with the same Idempotency-Key gets the first answer
    const idem = req.method === 'POST' ? req.headers.get('idempotency-key')?.slice(0, 200) : null;
    if (idem) {
      const { data: seen } = await admin.from('api_idempotency').select('status, response').eq('key_id', key.id).eq('idem_key', idem).maybeSingle();
      if (seen) return reply(seen.response, seen.status);
    }
    const res = await route(admin, key, req, url, path);
    if (idem && res.status < 500) {
      const copy = await res.clone().text();
      await admin
        .from('api_idempotency')
        .upsert({ key_id: key.id, idem_key: idem, status: res.status, response: copy ? JSON.parse(copy) : {} });
    }
    return res;
  } catch (e) {
    if (e instanceof ApiError) return reply({ error: { code: e.code, message: e.message } }, e.status);
    console.error('public-api', e);
    return reply({ error: { code: 'server_error', message: 'Something went wrong on our side' } }, 500);
  }
});
