// muntej-chat — the conversational task assistant ("talk to Muntej").
// Input: { message: string, source?: 'voice' | 'text' }.
// One continuous chat per person (chat_messages). Each message is either small talk / a question (reply only),
// a new task (created right away via create_task_with_plan, the card has Undo/Edit), or an update to a recent task
// (update_task_from_chat). Everything runs as the caller (RLS), so Muntej only sees and touches what they can.
// When the owner's Muntej engine API is ready, this function is the one place to swap it in.
import { z } from 'npm:zod@4.6.7';
import { getCaller, HttpError, json, requireEnv, serve } from '../_shared/http.ts';
import { sendPush } from '../_shared/push.ts';
import { buildPlan } from '../_shared/followup-plan.ts';

const Priority = z.enum(['low', 'medium', 'high', 'urgent']);

const NewTask = z.object({
  title: z.string(),
  owner_id: z.string().nullable(),
  owner_reason: z.string().nullable().describe('Why this person, one short clause, e.g. "QA skills and did the last 2 test runs"'),
  helper_id: z.string().nullable(),
  helper_reason: z.string().nullable(),
  due_at: z.string().nullable().describe('ISO 8601 datetime with +03:00 offset'),
  priority: Priority,
  goal: z.string().nullable(),
  definition_of_done: z.string().nullable(),
  budget: z.string().nullable(),
  workspace_id: z.string().nullable(),
});

const TaskUpdate = z.object({
  task_id: z.string(),
  title: z.string().nullable(),
  owner_id: z.string().nullable(),
  owner_reason: z.string().nullable(),
  helper_id: z.string().nullable(),
  due_at: z.string().nullable().describe('ISO 8601 datetime with +03:00 offset'),
  priority: Priority.nullable(),
  goal: z.string().nullable(),
  definition_of_done: z.string().nullable(),
  budget: z.string().nullable(),
});

const ChatOutput = z.object({
  language: z.enum(['en', 'ar']),
  reply: z.string(),
  action: z.enum(['none', 'create', 'update']),
  task: NewTask.nullable().describe('Only when action = create'),
  update: TaskUpdate.nullable().describe('Only when action = update; null fields mean "unchanged"'),
});
type ChatOutput = z.infer<typeof ChatOutput>;

const { $schema: _ignored, ...RESPONSE_SCHEMA } = z.toJSONSchema(ChatOutput) as Record<string, unknown>;

// Frozen system prompt (no per-request data) so the provider can cache the prefix.
const SYSTEM = `You are Muntej, a friendly, sharp AI task assistant for people in Saudi companies. You chat with ONE user (anyone: manager or employee; employees can manage others too). Promise: "create it and forget it" — they talk normally, you turn work into tasks, pick the right person, and follow up for them.

Each turn, choose ONE action:
- "none": small talk (hi, thanks) and questions ("what's late?", "who is free?"). Answer questions from the provided open_tasks/team data only; never invent facts.
- "create": the message asks for work to be done ("I need someone to…", "we have to…", "remind me to…", "خل أحد…"). Create it IMMEDIATELY, even if details are vague — the user can Undo, and gaps are filled later in the chat. Never ask a clarifying question instead of creating: write the best short title you can from what was said, and mention the open points (which one, when, what "done" means) in the reply as things they can add. Only the title is required: owner, due date, what "done" means, priority details and budget may all be null and filled later. Only use "none" for work if you cannot even name the task.
  WHO: if the user names someone (loose match: first names, Arabic/English spellings, "me"/"I'll do it" = the user), use them. Otherwise pick the best fit from team using, in order: skills and title that match the work, recent_tasks similar to this one, then the lowest open_tasks load. Put the reason in owner_reason (one short clause, user's language). If nobody clearly fits, still CREATE it with owner_id null (unassigned) and in the reply suggest who could take it or ask them to name someone; never hold the task back for a missing owner.
- "update": the message adds or changes details of a task already in the conversation (e.g. "make it Thursday", "add Saad to help", "the deliverable is a test report", "budget 5k", "give it to Maha"). Target the most recent task in recent_chat_tasks unless the user clearly means another one (then use that task's id from recent_chat_tasks or open_tasks). Only set the fields that change; leave the rest null.

Writing rules:
- language = the language of the user's latest message. Write reply, title, owner_reason, goal, definition_of_done and helper_reason in it. Arabic → warm Saudi (Najdi/Hijazi) conversational Arabic, never Egyptian or formal MSA: use شي، ثاني، الحين، وش، أبي/تبي، زين، عشان (not حاجة، تاني، دلوقتي، إيه، عايز، كده). Example: "تمام، سجلتها لنورة…".
- reply: 1–3 short sentences, human and warm, no lists, no ids. After a create: say what you added and for whom + why, then mention what's still missing (due date, what "done" means; budget only when the work clearly costs money) and that they can just say or type it. After an update: confirm what changed and what is still missing, if anything. Never say you created or changed something unless action says so.
- ids (owner_id, helper_id, workspace_id, task_id) must come from the provided lists, else null.
- Dates: resolve relative dates against current_time_riyadh. Saudi work week is Sunday–Thursday. "Before Thursday" = Thursday 17:00; no time said → 17:00. ISO 8601 with +03:00.
- priority: urgent only for today/ASAP/ضروري/عاجل; high for client or executive deadlines within a week; low if "no rush"; else medium.
- definition_of_done: one concrete, checkable sentence only if it can be inferred; otherwise null (it becomes a missing item). goal: business goal/client in 1–4 words or null. budget: only if money/resources are mentioned.
- The follow-up plan is built by the server; you never write it.`;

const ACTIVE = ['draft', 'assigned', 'in_progress', 'blocked', 'submitted', 'returned'];

type TaskRow = {
  id: string;
  title: string;
  owner_id: string | null;
  helper_id: string | null;
  assigner_id: string;
  status: string;
  priority: string;
  due_at: string | null;
  definition_of_done: string | null;
  budget: string | null;
  goal: string | null;
  created_at: string;
};
const TASK_COLS = 'id, title, owner_id, helper_id, assigner_id, status, priority, due_at, definition_of_done, budget, goal, created_at';

function missingOf(t: Pick<TaskRow, 'owner_id' | 'due_at' | 'definition_of_done' | 'budget'>) {
  const m: string[] = [];
  if (!t.owner_id) m.push('owner');
  if (!t.due_at) m.push('due');
  if (!t.definition_of_done) m.push('definition_of_done');
  if (!t.budget) m.push('budget');
  return m;
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const { db, profileId } = await getCaller(req);

  const body = (await req.json().catch(() => ({}))) as { message?: string; source?: string };
  const message = (body.message ?? '').trim();
  const source = body.source === 'voice' ? 'voice' : 'text';
  if (!message) throw new HttpError(400, 'Say or type something first');
  if (message.length > 4000) throw new HttpError(413, 'That message is too long');

  // ── context (all RLS-scoped to the caller) ──
  const [{ data: history }, { data: people }, { data: tasks }, { data: workspaces }] = await Promise.all([
    db.from('chat_messages').select('role, content, task_id, action, created_at').order('created_at', { ascending: false }).limit(20),
    db.from('profiles').select('id, full_name, full_name_ar, role, title, skills, locale'),
    db.from('tasks').select(TASK_COLS).order('created_at', { ascending: false }).limit(400),
    db.from('workspaces').select('id, name, name_ar, goal'),
  ]);
  const team = people ?? [];
  const allTasks = (tasks ?? []) as TaskRow[];
  const nameOf = (id: string | null) => (id ? team.find((p) => p.id === id)?.full_name ?? null : null);
  const open = allTasks.filter((t) => ACTIVE.includes(t.status));

  const chat = (history ?? []).slice().reverse();
  const recentIds = [...new Set(chat.filter((m) => m.task_id).map((m) => m.task_id as string).reverse())].slice(0, 3);
  const recentChatTasks = recentIds
    .map((id) => allTasks.find((t) => t.id === id))
    .filter((t): t is TaskRow => !!t && t.status !== 'cancelled')
    .map((t) => ({
      id: t.id,
      title: t.title,
      owner: nameOf(t.owner_id),
      due_at: t.due_at,
      priority: t.priority,
      definition_of_done: t.definition_of_done,
      budget: t.budget,
      missing: missingOf(t),
    }));

  const now = new Date();
  const riyadhNow = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  const context = {
    current_time_riyadh: `${riyadhNow} (${now.toISOString()} UTC)`,
    user: { id: profileId, name: nameOf(profileId) },
    team: team.map((p) => ({
      id: p.id,
      name: p.full_name,
      name_ar: p.full_name_ar,
      is_me: p.id === profileId,
      role: p.role,
      title: p.title,
      skills: p.skills,
      prefers: p.locale,
      open_tasks: open.filter((t) => t.owner_id === p.id).length,
      recent_tasks: allTasks.filter((t) => t.owner_id === p.id).slice(0, 5).map((t) => t.title),
    })),
    recent_chat_tasks: recentChatTasks,
    open_tasks: open.slice(0, 30).map((t) => ({
      id: t.id,
      title: t.title,
      owner: nameOf(t.owner_id),
      status: t.status,
      due_at: t.due_at,
      late: !!t.due_at && new Date(t.due_at) < now,
    })),
    workspaces: workspaces ?? [],
  };

  const conversation = chat.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.role === 'assistant' && m.action !== 'none' ? `${m.content}\n[${m.action} task ${m.task_id}]` : m.content,
  }));

  // ── ask the model ──
  // gpt-4.1: ~2-4 s replies with good Saudi Arabic; gpt-5-mini was 5-12 s (its reasoning step) for the same quality
  const model = Deno.env.get('CHAT_MODEL') ?? 'gpt-4.1';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      ...(/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: Deno.env.get('CHAT_REASONING') ?? 'low' } : {}),
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'system', content: `Context:\n${JSON.stringify(context)}` },
        ...conversation,
        { role: 'user', content: message },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'muntej_chat', strict: true, schema: RESPONSE_SCHEMA } },
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error('OpenAI error', res.status, detail);
    if (res.status === 429) throw new HttpError(429, 'Muntej is busy, try again in a moment');
    if (res.status === 401) throw new HttpError(500, 'AI key is invalid (OPENAI_API_KEY)');
    throw new HttpError(502, `AI error ${res.status}`);
  }
  const out = (await res.json()) as { choices?: { message?: { content?: string | null; refusal?: string | null } }[] };
  const msg = out.choices?.[0]?.message;
  if (msg?.refusal) throw new HttpError(422, 'Muntej could not process that request');
  let parsed: ChatOutput;
  try {
    const r = ChatOutput.safeParse(JSON.parse(msg?.content ?? ''));
    if (!r.success) throw new Error('schema');
    parsed = r.data;
  } catch {
    throw new HttpError(502, 'Muntej got confused, try rephrasing');
  }

  // ── act ──
  const teamIds = new Set(team.map((p) => p.id));
  const wsIds = new Set((workspaces ?? []).map((w) => w.id));
  const taskIds = new Set(allTasks.map((t) => t.id));
  const person = (id: string | null) => (id && teamIds.has(id) ? id : null);

  let action: 'none' | 'created' | 'updated' = 'none';
  let taskId: string | null = null;
  let ownerReason: string | null = null;
  let ownerChanged = false;

  if (parsed.action === 'create' && parsed.task) {
    const t = parsed.task;
    t.owner_id = person(t.owner_id);
    t.helper_id = person(t.helper_id);
    if (t.workspace_id && !wsIds.has(t.workspace_id)) t.workspace_id = null;
    if (t.due_at && Number.isNaN(Date.parse(t.due_at))) t.due_at = null;
    const owner = team.find((p) => p.id === t.owner_id);
    const helper = team.find((p) => p.id === t.helper_id);
    const ownerArabic = owner ? owner.locale === 'ar' || parsed.language === 'ar' : parsed.language === 'ar';
    const first = (p?: { full_name: string; full_name_ar: string | null }) =>
      p ? ((ownerArabic ? p.full_name_ar : null) ?? p.full_name).split(' ')[0] : null;
    const followup_plan = buildPlan({
      title: t.title,
      dueAt: t.due_at,
      ownerFirstName: first(owner),
      ownerArabic,
      self: t.owner_id === profileId,
      helperFirstName: first(helper),
    });
    const { data, error } = await db.rpc('create_task_with_plan', { p: { ...t, followup_plan, source, transcript: message } });
    if (error) throw new HttpError(400, error.message);
    taskId = data as string;
    ownerReason = t.owner_reason;
    ownerChanged = !!t.owner_id;
    action = 'created';
  } else if (parsed.action === 'update' && parsed.update && taskIds.has(parsed.update.task_id)) {
    const u = parsed.update;
    const patch: Record<string, unknown> = {};
    if (u.title) patch.title = u.title;
    if (person(u.owner_id)) patch.owner_id = u.owner_id;
    if (person(u.helper_id)) patch.helper_id = u.helper_id;
    if (u.due_at && !Number.isNaN(Date.parse(u.due_at))) patch.due_at = u.due_at;
    if (u.priority) patch.priority = u.priority;
    if (u.goal) patch.goal = u.goal;
    if (u.definition_of_done) patch.definition_of_done = u.definition_of_done;
    if (u.budget) patch.budget = u.budget;
    if (Object.keys(patch).length) {
      const { error } = await db.rpc('update_task_from_chat', { p_task: u.task_id, patch });
      if (error) throw new HttpError(400, error.message);
      taskId = u.task_id;
      ownerReason = patch.owner_id ? u.owner_reason : null;
      ownerChanged = !!patch.owner_id;
      action = 'updated';

      // A task created without an owner has no follow-up plan yet: build it now that someone owns it.
      if (patch.owner_id) {
        const { count } = await db.from('followups').select('id', { count: 'exact', head: true }).eq('task_id', u.task_id);
        if (!count) {
          const before = allTasks.find((t) => t.id === u.task_id)!;
          const owner = team.find((p) => p.id === patch.owner_id);
          const ownerArabic = owner?.locale === 'ar' || parsed.language === 'ar';
          const plan = buildPlan({
            title: (patch.title as string) ?? before.title,
            dueAt: (patch.due_at as string) ?? before.due_at,
            ownerFirstName: owner ? ((ownerArabic ? owner.full_name_ar : null) ?? owner.full_name).split(' ')[0] : null,
            ownerArabic,
            self: patch.owner_id === profileId,
          });
          const { error: planError } = await db.from('followups').insert(
            plan.map((s) => ({
              task_id: u.task_id,
              recipient_id: patch.owner_id,
              scheduled_at: s.at,
              channel: s.channel,
              message: s.message,
              status: 'scheduled',
            })),
          );
          if (planError) console.error('follow-up plan for late owner failed', planError);
        }
      }
    }
  }

  // ── task card snapshot ──
  let payload: Record<string, unknown> | null = null;
  if (taskId) {
    const { data: row } = await db.from('tasks').select(TASK_COLS).eq('id', taskId).single();
    if (row) {
      const t = row as TaskRow;
      payload = {
        id: t.id,
        title: t.title,
        owner_id: t.owner_id,
        owner_name: nameOf(t.owner_id),
        owner_reason: ownerReason,
        helper_name: nameOf(t.helper_id),
        due_at: t.due_at,
        priority: t.priority,
        definition_of_done: t.definition_of_done,
        budget: t.budget,
        status: t.status,
        missing: missingOf(t),
      };
    }
  }

  // ── save both messages (user first, so ordering is stable) ──
  const { data: userMsg, error: e1 } = await db
    .from('chat_messages')
    .insert({ profile_id: profileId, role: 'user', content: message })
    .select()
    .single();
  if (e1) throw new HttpError(500, e1.message);
  const { data: botMsg, error: e2 } = await db
    .from('chat_messages')
    .insert({ profile_id: profileId, role: 'assistant', content: parsed.reply, task_id: taskId, action, payload })
    .select()
    .single();
  if (e2) throw new HttpError(500, e2.message);

  // ── tell the new owner (never the user themself); a failed push must not fail the chat ──
  const ownerId = payload?.owner_id as string | null | undefined;
  if (ownerChanged && ownerId && ownerId !== profileId) {
    const owner = team.find((p) => p.id === ownerId);
    const ar = owner?.locale === 'ar';
    const me = team.find((p) => p.id === profileId);
    const from = ((ar ? me?.full_name_ar : null) ?? me?.full_name)?.split(' ')[0] ?? 'Muntej';
    const due = payload?.due_at
      ? new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-GB', { timeZone: 'Asia/Riyadh', weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(payload.due_at as string))
      : null;
    const title = payload?.title as string;
    await sendPush([ownerId], {
      title: ar ? `${from} سند لك مهمة` : `${from} assigned you a task`,
      body: due ? (ar ? `${title} · التسليم ${due}` : `${title} · due ${due}`) : title,
      data: { taskId },
    }).catch((e) => console.error('assign push failed', e));
  }

  return json({ messages: [userMsg, botMsg] });
});
