// muntej-chat — the conversational task assistant ("talk to Muntej").
// Input: { message: string, source?: 'voice' | 'text', focus_task_id? } | { apply: { task_id, patch }, lang }
//      | { apply_org: { patch }, lang } (Confirm on a team-change card → upsert_person as the caller).
// Team changes ("add Reem under Khalid", "Noura left") are never applied from a message: the reply carries
// payload.org_proposal and the user confirms it.
// One continuous chat per person (chat_messages). Each message is either small talk / a question (reply only),
// a new task (created right away via create_task_with_plan, the card has Undo/Edit), or an update to a recent task
// (update_task_from_chat). Everything runs as the caller (RLS), so Muntej only sees and touches what they can.
// When the owner's Muntej engine API is ready, this function is the one place to swap it in.
import { z } from 'npm:zod@4.6.7';
import { getCaller, HttpError, json, requireEnv, serve, type Caller } from '../_shared/http.ts';
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

const Role = z.enum(['super_admin', 'admin', 'manager', 'employee']);
const PersonStatus = z.enum(['active', 'pending', 'deleted']);

const SkillInput = z.object({
  name: z.string(),
  level: z.number().nullable().describe('1-5 (1 beginner … 5 expert); 0 = remove this skill; null = unknown'),
  years: z.number().nullable(),
  notes: z.string().nullable(),
});

// every key is required by strict mode; null = "unchanged"
const OrgFields = z.object({
  full_name: z.string().nullable().describe('Name in Latin letters'),
  full_name_ar: z.string().nullable().describe('Name in Arabic letters'),
  title: z.string().nullable().describe('Job title in English'),
  title_ar: z.string().nullable().describe('Job title in Arabic'),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  role: Role.nullable(),
  manager_id: z.string().nullable().describe('id of the new manager, from team'),
  weekly_capacity_hours: z.number().nullable(),
  years_experience: z.number().nullable(),
  skills_detail: z.array(SkillInput).nullable().describe('Only the skills to add or change (merged into the existing list); level 0 removes one'),
  whatsapp_connected: z.boolean().nullable(),
  telegram_connected: z.boolean().nullable(),
  status: PersonStatus.nullable().describe('"deleted" = left the company'),
});

const OrgChange = z.object({
  op: z.enum(['add', 'update', 'move', 'status']),
  person_id: z.string().nullable().describe('id from team / former_team; null only for add'),
  fields: OrgFields,
});

const ChatOutput = z.object({
  language: z.enum(['en', 'ar']),
  reply: z.string(),
  action: z.enum(['none', 'create', 'update', 'cancel', 'delete', 'org']),
  task: NewTask.nullable().describe('Only when action = create'),
  update: TaskUpdate.nullable().describe('Only when action = update; null fields mean "unchanged"'),
  target_task_id: z.string().nullable().describe('Only when action = cancel or delete'),
  org: OrgChange.nullable().describe('Only when action = org'),
  suggestions: z.array(z.string()).describe('0-3 optional next steps, each a short ready-to-send message in the user language'),
  candidates: z.array(z.string()).describe('Only with action none: 2-3 task ids when the user wants to change a task but several tasks fit'),
});
type ChatOutput = z.infer<typeof ChatOutput>;

const { $schema: _ignored, ...RESPONSE_SCHEMA } = z.toJSONSchema(ChatOutput) as Record<string, unknown>;

// Frozen system prompt (no per-request data) so the provider can cache the prefix.
const SYSTEM = `You are Muntej, a friendly, sharp AI task assistant for people in Saudi companies. You chat with ONE user (anyone: manager or employee; employees can manage others too). Promise: "create it and forget it" — they talk normally, you turn work into tasks, pick the right person, and follow up for them.

Each turn, choose ONE action:
- "none": small talk (hi, thanks) and questions ("what's late?", "who is free?"). Answer questions from the provided open_tasks/team data only; never invent facts.
  TEAM QUESTIONS ("how is Faisal doing?", "who's overloaded?", "top performers this month", "risks in Khalid's team", "who knows Selenium?"): answer in 1-3 short sentences from team[].stats, skills, title and the org tree (manager_id / reports; "Khalid's team" = everyone below Khalid, any depth). Quote the real numbers (done, on-time %, late, open, hours, achievements); never invent or estimate a number that is not in the data. stats = null means the user cannot see that person's tasks: say so instead of guessing. Top performers: rank by done_this_month, then on_time_pct, then achievements. Overloaded: stats.overloaded or open_estimate_hours above weekly_hours. People who left are in former_team: mention them only when asked.
- "create": the message asks for work to be done ("I need someone to…", "we have to…", "remind me to…", "خل أحد…"). Create it IMMEDIATELY, even if details are vague — the user can Undo, and gaps are filled later in the chat. Never ask a clarifying question instead of creating: write the best short title you can from what was said, and mention the open points (which one, when, what "done" means) in the reply as things they can add. Only the title is required: owner, due date, what "done" means, priority details and budget may all be null and filled later. Only use "none" for work if you cannot even name the task.
  WHO: if the user names someone (loose match: first names, Arabic/English spellings, "me"/"I'll do it" = the user), use them. Otherwise pick the best fit from team (never former_team) using, in order: skill level and years in the skills the work needs, title, recent_tasks similar to this one, then the lower load (stats.open / open_estimate_hours vs weekly_hours; avoid people marked overloaded or with late tasks when someone similar is free). Put the data-based reason in owner_reason (one short clause, user's language, e.g. "Selenium 4/5, 3 years, only 2 open tasks"). If nobody clearly fits, still CREATE it with owner_id null (unassigned) and in the reply suggest who could take it or ask them to name someone; never hold the task back for a missing owner.
- "org": the user wants to change the team itself (people, not tasks): add someone ("add Reem as QA engineer under Khalid, 5 years, Selenium and API testing" → op "add", person_id null, fields full_name, full_name_ar when you can write it, title + title_ar, manager_id, years_experience, skills_detail), move someone ("move Saad under Maha" → op "move", fields.manager_id), change details ("Faisal is now an admin" → role; "Khalid works 35 hours a week" → weekly_capacity_hours; "Noura knows Docker now" → skills_detail with just that skill; op "update"), or someone left / came back ("Noura left the company" → op "status", status "deleted"). Fill ONLY the fields that change, all others null. person_id must come from team or former_team. Nothing is saved until the user confirms on a card: the server writes the reply, so keep yours short.
- "update": the message adds or changes details of a task already in the conversation (e.g. "make it Thursday", "add Saad to help", "the deliverable is a test report", "budget 5k", "give it to Maha"). Target the most recent task in recent_chat_tasks unless the user clearly means another one (then use that task's id from recent_chat_tasks or open_tasks). Only set the fields that change; leave the rest null. The user may point at another task by its title, client or owner ("move the lease task to Thursday", "مهمة فيصل خلها بكرة"): match it in recent_chat_tasks or open_tasks.
- FOCUS: when focused_task is given, the user opened the chat on that task: every change, cancel or delete targets focused_task (use its id), and questions are about it, unless they clearly name a different task.
- WHICH ONE: when the user wants to change a task by describing it (title, client, owner, any detail) and two or more tasks in open_tasks fit equally, use action "none", put their ids in candidates (max 3) and ask which one in the reply. If exactly one fits, use "update" with its id (the app will ask the user to confirm when it is not the task being discussed). If NO task fits (e.g. it was cancelled or never existed), use "none" and say you couldn't find it; never pick an unrelated task.
- "cancel": the user wants a task stopped ("cancel it", "الغها", "ما نحتاجها"). Put its id in target_task_id (most recent task unless another is meant).
- "delete": the user wants a task removed completely ("delete it", "احذفها"). Put its id in target_task_id. Deleting needs one tap to confirm, so say you've shown it and they just need to confirm. Prefer "cancel" when they only mean it's no longer needed.

Writing rules:
- language = the language of the user's latest message. Write reply, title, owner_reason, goal, definition_of_done and helper_reason in it. Arabic → warm Saudi (Najdi/Hijazi) conversational Arabic, never Egyptian or formal MSA: use شي، ثاني، الحين، وش، أبي/تبي، زين، عشان (not حاجة، تاني، دلوقتي، إيه، عايز، كده). Example: "تمام، سجلتها لنورة…".
- reply: 1–3 short sentences, human and warm, no lists, no ids. After a create: say what you added and for whom + why, then mention what's still missing (due date, what "done" means; budget only when the work clearly costs money) and that they can just say or type it. After an update: confirm what changed and what is still missing, if anything. Never say you created or changed something unless action says so (with action "none" you created and changed nothing).
- suggestions: after create or update, 2-3 useful next steps the user might want, written as the exact short message they would send (e.g. "خلها يوم الخميس", "أضف نورة تساعده", "المطلوب تقرير اختبار" / "Make it due Thursday", "Add Noura to help"). Prefer filling what is missing (due date, what done means, owner), then helpful extras (a helper, priority). Never repeat what is already set. Empty for small talk, questions, cancel, delete and org.
- ids (owner_id, helper_id, workspace_id, task_id, person_id, manager_id) must come from the provided lists, else null.
- task and update are null unless action is create / update; org is null unless action is org.
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
  estimate_hours: number | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};
const TASK_COLS =
  'id, title, owner_id, helper_id, assigner_id, status, priority, due_at, definition_of_done, budget, goal, estimate_hours, closed_at, created_at, updated_at';

type Skill = { name: string; level: number | null; years: number | null; notes: string | null };
type PersonRow = {
  id: string;
  full_name: string;
  full_name_ar: string | null;
  role: string;
  title: string | null;
  title_ar: string | null;
  skills: string[] | null;
  skills_detail: Skill[] | null;
  locale: string | null;
  manager_id: string | null;
  status: string;
  years_experience: number | null;
  weekly_capacity_hours: number | null;
  phone: string | null;
  email: string | null;
  whatsapp_connected: boolean;
  telegram_connected: boolean;
};
const PERSON_COLS =
  'id, full_name, full_name_ar, role, title, title_ar, skills, skills_detail, locale, manager_id, status, years_experience, weekly_capacity_hours, phone, email, whatsapp_connected, telegram_connected';

/** keys upsert_person accepts from a chat proposal (the RPC itself enforces who may change what) */
const ORG_KEYS = [
  'id',
  'full_name',
  'full_name_ar',
  'title',
  'title_ar',
  'phone',
  'email',
  'role',
  'manager_id',
  'weekly_capacity_hours',
  'years_experience',
  'skills_detail',
  'whatsapp_connected',
  'telegram_connected',
  'status',
] as const;

const DAY = 86_400_000;

/** "Selenium 4/5 3y" */
function skillLine(s: Skill) {
  return [s.name, s.level ? `${s.level}/5` : null, s.years ? `${s.years}y` : null].filter(Boolean).join(' ');
}

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

  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    source?: string;
    /** the chat was opened on this task (Tasks list / row mic): changes go straight to it */
    focus_task_id?: string;
    /** the user tapped Confirm on a proposed change: apply it without asking the model */
    apply?: { task_id: string; patch: Record<string, unknown> };
    /** the user tapped Confirm on a proposed team change: run upsert_person as them */
    apply_org?: { patch: Record<string, unknown> };
    lang?: string;
  };
  const message = (body.message ?? '').trim();
  const source = body.source === 'voice' ? 'voice' : 'text';

  if (body.apply_org) return await applyOrg(db, profileId, body.apply_org.patch, body.lang === 'ar');

  if (!message && !body.apply) throw new HttpError(400, 'Say or type something first');
  if (message.length > 4000) throw new HttpError(413, 'That message is too long');

  // ── context (all RLS-scoped to the caller) ──
  const since90 = new Date(Date.now() - 90 * DAY).toISOString();
  const [{ data: history }, { data: people }, { data: tasks }, { data: workspaces }, { data: achievementRows }] = await Promise.all([
    db.from('chat_messages').select('role, content, task_id, action, created_at').order('created_at', { ascending: false }).limit(20),
    db.from('profiles').select(PERSON_COLS),
    db.from('tasks').select(TASK_COLS).order('created_at', { ascending: false }).limit(500),
    db.from('workspaces').select('id, name, name_ar, goal'),
    db.from('achievements').select('profile_id, title, title_ar, achieved_at').gte('achieved_at', since90).order('achieved_at', { ascending: false }).limit(300),
  ]);
  // everyone (incl. people who left) for names and org changes; `team` = people who can still get work
  const everyone = (people ?? []) as PersonRow[];
  const team = everyone.filter((p) => p.status !== 'deleted');
  const allTasks = (tasks ?? []) as TaskRow[];
  const nameOf = (id: string | null) => (id ? everyone.find((p) => p.id === id)?.full_name ?? null : null);
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

  const taskById = new Map(allTasks.map((t) => [t.id, t]));
  const focus = body.focus_task_id && taskById.has(body.focus_task_id) ? taskById.get(body.focus_task_id)! : null;
  // the task the conversation was just about: follow-ups like "make it Thursday" may change it without asking
  const lastTurnTaskId = [...chat].reverse().find((m) => m.role === 'assistant')?.task_id ?? null;

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

  // ── per-person stats (last 90 days, from the tasks the caller can see) ──
  const meRow = everyone.find((p) => p.id === profileId);
  const amAdmin = meRow?.role === 'admin' || meRow?.role === 'super_admin';
  const byId = new Map(everyone.map((p) => [p.id, p]));
  const isBelow = (target: string, boss: string) => {
    const seen = new Set<string>();
    let cur = byId.get(target)?.manager_id ?? null;
    while (cur && !seen.has(cur)) {
      if (cur === boss) return true;
      seen.add(cur);
      cur = byId.get(cur)?.manager_id ?? null;
    }
    return false;
  };
  // task visibility follows the branch rules: stats for anyone else would be partial, so they get none
  const seesTasksOf = (id: string) => id === profileId || amAdmin || isBelow(id, profileId);
  const riyadh = new Date(now.getTime() + 3 * 3_600_000);
  const monthStart = Date.UTC(riyadh.getUTCFullYear(), riyadh.getUTCMonth(), 1) - 3 * 3_600_000;
  const cutoff = now.getTime() - 90 * DAY;
  const achievements = (achievementRows ?? []) as { profile_id: string; title: string; title_ar: string | null; achieved_at: string }[];

  const statsOf = (p: PersonRow) => {
    if (!seesTasksOf(p.id)) return null;
    const mine = allTasks.filter((t) => t.owner_id === p.id);
    const closedAt = (t: TaskRow) => new Date(t.closed_at ?? t.updated_at).getTime();
    const done = mine.filter((t) => t.status === 'done' && closedAt(t) >= cutoff);
    const withDue = done.filter((t) => t.due_at);
    const onTime = withDue.filter((t) => closedAt(t) <= new Date(t.due_at!).getTime()).length;
    const openMine = mine.filter((t) => ACTIVE.includes(t.status));
    const late = openMine.filter((t) => t.due_at && new Date(t.due_at) < now);
    const estimated = openMine.filter((t) => t.estimate_hours != null);
    const openHours = estimated.length ? estimated.reduce((s, t) => s + Number(t.estimate_hours), 0) : null;
    const weekly = p.weekly_capacity_hours != null ? Number(p.weekly_capacity_hours) : null;
    // estimates when we have them; otherwise a plain count heuristic (more than ~1 open task per 5 weekly hours)
    const overloaded =
      openHours != null && weekly ? openHours > weekly : openMine.length > Math.max(5, Math.round((weekly ?? 40) / 5));
    const ach = achievements.filter((a) => a.profile_id === p.id);
    const risks: string[] = [];
    if (late.length) risks.push(`late: ${late.slice(0, 3).map((t) => t.title).join('; ')}`);
    if (overloaded) risks.push(openHours != null ? `overloaded: ${openHours}h open vs ${weekly}h/week` : `overloaded: ${openMine.length} open tasks`);
    return {
      done_90d: done.length,
      done_this_month: done.filter((t) => closedAt(t) >= monthStart).length,
      on_time_pct: withDue.length ? Math.round((onTime / withDue.length) * 100) : null,
      late_now: late.length,
      open: openMine.length,
      open_estimate_hours: openHours,
      overloaded,
      achievements_90d: ach.length,
      recent_achievements: ach.slice(0, 3).map((a) => a.title),
      risks,
    };
  };

  const firstName = (id: string | null) => nameOf(id)?.split(' ')[0] ?? null;

  const context = {
    current_time_riyadh: `${riyadhNow} (${now.toISOString()} UTC)`,
    user: { id: profileId, name: nameOf(profileId), role: meRow?.role ?? null },
    team: team.map((p) => ({
      id: p.id,
      name: p.full_name,
      name_ar: p.full_name_ar,
      is_me: p.id === profileId,
      role: p.role,
      status: p.status,
      title: p.title,
      manager_id: p.manager_id,
      manager: firstName(p.manager_id),
      reports: team.filter((x) => x.manager_id === p.id).map((x) => x.full_name.split(' ')[0]),
      years_experience: p.years_experience,
      skills: (p.skills_detail ?? []).length
        ? (p.skills_detail ?? []).slice(0, 8).map(skillLine)
        : (p.skills ?? []).slice(0, 8),
      weekly_hours: p.weekly_capacity_hours,
      prefers: p.locale,
      open_tasks: open.filter((t) => t.owner_id === p.id).length,
      recent_tasks: allTasks.filter((t) => t.owner_id === p.id).slice(0, 4).map((t) => t.title),
      stats: statsOf(p),
    })),
    former_team: everyone.filter((p) => p.status === 'deleted').slice(0, 30).map((p) => ({ id: p.id, name: p.full_name, title: p.title })),
    focused_task: focus
      ? {
          id: focus.id,
          title: focus.title,
          owner: nameOf(focus.owner_id),
          status: focus.status,
          due_at: focus.due_at,
          priority: focus.priority,
          definition_of_done: focus.definition_of_done,
          budget: focus.budget,
          goal: focus.goal,
          missing: missingOf(focus),
        }
      : null,
    recent_chat_tasks: recentChatTasks,
    open_tasks: open.slice(0, 60).map((t) => ({
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

  let parsed: ChatOutput;
  if (body.apply && taskById.has(body.apply.task_id)) {
    // Confirm tapped on a proposed change: no model call, same apply path as a direct update.
    const ar = body.lang === 'ar';
    const a = body.apply.patch ?? {};
    const str = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : null);
    parsed = {
      language: ar ? 'ar' : 'en',
      reply: ar ? 'تم، عدّلتها.' : 'Done, updated.',
      action: 'update',
      task: null,
      update: {
        task_id: body.apply.task_id,
        title: str('title'),
        owner_id: str('owner_id'),
        owner_reason: null,
        helper_id: str('helper_id'),
        due_at: str('due_at'),
        priority: str('priority') as 'low' | 'medium' | 'high' | 'urgent' | null,
        goal: str('goal'),
        definition_of_done: str('definition_of_done'),
        budget: str('budget'),
      },
      target_task_id: null,
      org: null,
      suggestions: [],
      candidates: [],
    };
  } else {
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
        // anchor the turn on the focused task so the reply talks about it (the saved message stays as typed)
        { role: 'user', content: focus ? `[Focused task: "${focus.title}" (id ${focus.id}). This message is about this task only.]
${message}` : message },
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
  try {
    const r = ChatOutput.safeParse(JSON.parse(msg?.content ?? ''));
    if (!r.success) throw new Error('schema');
    parsed = r.data;
  } catch {
    throw new HttpError(502, 'Muntej got confused, try rephrasing');
  }
  }

  // ── act ──
  const teamIds = new Set(team.map((p) => p.id));
  const wsIds = new Set((workspaces ?? []).map((w) => w.id));
  const taskIds = new Set(allTasks.map((t) => t.id));
  const person = (id: string | null) => (id && teamIds.has(id) ? id : null);

  let action: 'none' | 'created' | 'updated' | 'cancelled' = 'none';
  let confirmDelete = false;
  let taskId: string | null = null;
  let ownerReason: string | null = null;
  let ownerChanged = false;
  // a change to a task picked by description waits for the user's Confirm
  let proposedPatch: Record<string, unknown> | null = null;

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
  } else if (parsed.action === 'update' && parsed.update && (focus || taskIds.has(parsed.update.task_id))) {
    const u = parsed.update;
    // the user opened the chat on a task: that task is the target, whatever the model picked
    if (focus && !body.apply) u.task_id = focus.id;
    const patch: Record<string, unknown> = {};
    if (u.title) patch.title = u.title;
    if (person(u.owner_id)) patch.owner_id = u.owner_id;
    if (person(u.helper_id)) patch.helper_id = u.helper_id;
    if (u.due_at && !Number.isNaN(Date.parse(u.due_at))) patch.due_at = u.due_at;
    if (u.priority) patch.priority = u.priority;
    if (u.goal) patch.goal = u.goal;
    if (u.definition_of_done) patch.definition_of_done = u.definition_of_done;
    if (u.budget) patch.budget = u.budget;
    // direct when the user picked the task (focus / Confirm) or it's the one just discussed; otherwise propose
    const direct = !!body.apply || u.task_id === focus?.id || u.task_id === lastTurnTaskId;
    if (Object.keys(patch).length && !direct) {
      taskId = u.task_id;
      proposedPatch = patch;
      ownerReason = patch.owner_id ? u.owner_reason : null;
    } else if (Object.keys(patch).length) {
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

  // cancel runs now; delete only shows the card in a confirm state (one tap in the app actually deletes it)
  const target = focus?.id ?? (parsed.target_task_id && taskIds.has(parsed.target_task_id) ? parsed.target_task_id : null);
  if ((parsed.action === 'cancel' || parsed.action === 'delete') && target) {
    taskId = target;
    if (parsed.action === 'cancel') {
      const { error } = await db.rpc('cancel_task', { p_task: taskId });
      if (error) throw new HttpError(400, error.message);
      action = 'cancelled';
    } else {
      confirmDelete = true;
    }
  }

  // ── team change: never applied from a message, only proposed (the user confirms on a card → apply_org) ──
  let orgProposal: OrgProposal | null = null;
  if (parsed.action === 'org') {
    const r = parsed.org
      ? proposeOrg(parsed.org, everyone, meRow ?? null, amAdmin, isBelow, parsed.language === 'ar')
      : { error: parsed.language === 'ar' ? 'ما فهمت وش التعديل على الفريق، وضّح لي أكثر؟' : "I didn't catch the team change. Can you say it another way?" };
    if ('error' in r) parsed.reply = r.error;
    else {
      orgProposal = r.proposal;
      parsed.reply = r.reply;
    }
    parsed.suggestions = [];
  }

  // ── task card snapshot ──
  let payload: Record<string, unknown> | null = null;
  if (orgProposal) {
    payload = { org_proposal: orgProposal };
  } else if (taskId) {
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
        assigner_id: t.assigner_id,
        missing: missingOf(t),
        suggestions: action === 'created' || action === 'updated' ? parsed.suggestions.slice(0, 3) : [],
        ...(confirmDelete ? { confirm_delete: true } : {}),
        ...(proposedPatch ? { confirm_update: true, proposed_patch: proposedPatch, proposed_owner_name: nameOf((proposedPatch.owner_id as string) ?? null) } : {}),
      };
    }
  } else if (parsed.action === 'none' && parsed.candidates.length >= 2) {
    // several tasks fit the description: let the user pick one (the app re-sends the message focused on it)
    const picks = parsed.candidates.filter((id) => taskById.has(id)).slice(0, 3).map((id) => {
      const t = taskById.get(id)!;
      return { id, title: t.title, owner_name: nameOf(t.owner_id), due_at: t.due_at };
    });
    if (picks.length >= 2) payload = { candidates: picks, original_message: message };
  }

  // a proposal must never read as done: the server words the question, naming the task it found
  if (proposedPatch && taskId) {
    const t = taskById.get(taskId)!;
    const ar = parsed.language === 'ar';
    const owner = nameOf(t.owner_id);
    const parts: string[] = [];
    const fmt = (iso: string) =>
      new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-GB', { timeZone: 'Asia/Riyadh', weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
    if (proposedPatch.due_at) parts.push(ar ? `الموعد ← ${fmt(proposedPatch.due_at as string)}` : `due → ${fmt(proposedPatch.due_at as string)}`);
    if (proposedPatch.owner_id) parts.push(ar ? `المسؤول ← ${nameOf(proposedPatch.owner_id as string)}` : `owner → ${nameOf(proposedPatch.owner_id as string)}`);
    if (proposedPatch.helper_id) parts.push(ar ? `المساعد ← ${nameOf(proposedPatch.helper_id as string)}` : `helper → ${nameOf(proposedPatch.helper_id as string)}`);
    if (proposedPatch.priority) parts.push(ar ? 'الأولوية' : `priority → ${proposedPatch.priority}`);
    if (proposedPatch.title) parts.push(ar ? 'العنوان' : 'title');
    if (proposedPatch.definition_of_done) parts.push(ar ? 'وش يعتبر خالص' : 'what done means');
    if (proposedPatch.budget) parts.push(ar ? 'الميزانية' : 'budget');
    if (proposedPatch.goal) parts.push(ar ? 'الهدف' : 'goal');
    parsed.reply = ar
      ? `تقصد مهمة «${t.title}»${owner ? ` (${owner})` : ''}؟ بعدّل: ${parts.join('، ')}. أكّد لي وأسويها.`
      : `Do you mean "${t.title}"${owner ? ` (${owner})` : ''}? I'll change: ${parts.join(', ')}. Confirm and I'll do it.`;
  }

  // ── save both messages (user first, so ordering is stable) ──
  // a Confirm tap has no user message of its own
  let userMsg: unknown = null;
  if (!body.apply) {
    const { data, error: e1 } = await db
      .from('chat_messages')
      .insert({ profile_id: profileId, role: 'user', content: message })
      .select()
      .single();
    if (e1) throw new HttpError(500, e1.message);
    userMsg = data;
  }
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

  return json({ messages: userMsg ? [userMsg, botMsg] : [botMsg] });
});

// ─── team changes by conversation ───────────────────────────────────────────────

type OrgChange = z.infer<typeof OrgChange>;
type OrgProposal = {
  op: OrgChange['op'];
  person_id: string | null;
  person_name: string;
  /** exactly what apply_org sends to upsert_person (only the keys that change; id for an existing person) */
  patch: Record<string, unknown>;
  /** human lines for the card, in the conversation language */
  summary_lines: string[];
};

const LABELS = {
  en: {
    full_name: 'Name', full_name_ar: 'Arabic name', title: 'Title', title_ar: 'Arabic title', phone: 'Mobile', email: 'Email',
    role: 'Role', manager_id: 'Manager', weekly_capacity_hours: 'Weekly hours', years_experience: 'Experience',
    skills_detail: 'Skills', whatsapp_connected: 'WhatsApp', telegram_connected: 'Telegram', status: 'Status',
  },
  ar: {
    full_name: 'الاسم', full_name_ar: 'الاسم بالعربي', title: 'المسمى', title_ar: 'المسمى بالعربي', phone: 'الجوال', email: 'الإيميل',
    role: 'الصلاحية', manager_id: 'المدير', weekly_capacity_hours: 'ساعات الأسبوع', years_experience: 'الخبرة',
    skills_detail: 'المهارات', whatsapp_connected: 'واتساب', telegram_connected: 'تيليجرام', status: 'الحالة',
  },
} as const;
const ROLE_LABEL: Record<'en' | 'ar', Record<string, string>> = {
  en: { super_admin: 'Super admin', admin: 'Admin', manager: 'Manager', employee: 'Employee' },
  ar: { super_admin: 'مدير النظام', admin: 'مسؤول', manager: 'مدير', employee: 'موظف' },
};
const STATUS_LABEL: Record<'en' | 'ar', Record<string, string>> = {
  en: { active: 'Active', pending: 'Invited', deleted: 'Left the company' },
  ar: { active: 'نشط', pending: 'بانتظار الدخول', deleted: 'ترك الشركة' },
};

/** Turns the model's team change into a proposal the user confirms (or a readable reason it can't be done). */
function proposeOrg(
  org: OrgChange,
  everyone: PersonRow[],
  me: PersonRow | null,
  amAdmin: boolean,
  isBelow: (target: string, boss: string) => boolean,
  ar: boolean,
): { proposal: OrgProposal; reply: string } | { error: string } {
  const L = ar ? 'ar' : 'en';
  const say = (en: string, arText: string) => ({ error: ar ? arText : en });
  const label = LABELS[L];
  const arrow = ar ? '←' : '→';
  const nm = (p: Pick<PersonRow, 'full_name' | 'full_name_ar'>) => (ar ? p.full_name_ar ?? p.full_name : p.full_name);
  const f = org.fields;
  const isNew = org.op === 'add';
  if (!me) return say("I couldn't find your profile.", 'ما لقيت ملفك.');

  const target = isNew ? null : everyone.find((p) => p.id === org.person_id) ?? null;
  if (!isNew && !target) return say("I couldn't find that person in the team. Who do you mean?", 'ما لقيت هالشخص في الفريق. مين تقصد؟');

  const patch: Record<string, unknown> = {};
  const lines: string[] = [];
  const line = (k: keyof typeof label, to: string, from?: string | null) =>
    lines.push(from && !isNew ? `${label[k]}: ${from} ${arrow} ${to}` : `${label[k]}: ${to}`);

  // ── text fields ──
  for (const k of ['full_name', 'full_name_ar', 'title', 'title_ar'] as const) {
    const v = f[k]?.trim();
    if (v && v !== (target?.[k] ?? '')) {
      patch[k] = v;
      line(k, v, target?.[k]);
    }
  }
  if (isNew && !patch.full_name && patch.full_name_ar) patch.full_name = patch.full_name_ar;
  if (isNew && !patch.full_name) return say('What is their name?', 'وش اسمه؟');

  if (f.phone) {
    const v = f.phone.replace(/[^0-9]/g, '');
    if (v.length >= 9 && v !== (target?.phone ?? '')) {
      patch.phone = v;
      line('phone', v, target?.phone);
    }
  }
  if (f.email) {
    const v = f.email.trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v !== (target?.email ?? '')) {
      patch.email = v;
      line('email', v, target?.email);
    }
  }
  if (f.role && f.role !== target?.role) {
    patch.role = f.role;
    line('role', ROLE_LABEL[L][f.role], target ? ROLE_LABEL[L][target.role] : null);
  }

  // ── manager (a new person goes under the user unless told otherwise) ──
  const managerId = f.manager_id ?? (isNew ? me.id : null);
  if (managerId && managerId !== target?.manager_id) {
    const boss = everyone.find((p) => p.id === managerId && p.status !== 'deleted');
    if (!boss) return say("I couldn't find the new manager in the team. Who should they report to?", 'ما لقيت المدير الجديد في الفريق. مين يكون مديره؟');
    if (target && (boss.id === target.id || isBelow(boss.id, target.id)))
      return say('Someone cannot report to themselves or to a person below them.', 'ما يصير الشخص يرجع لنفسه أو لأحد تحته.');
    patch.manager_id = boss.id;
    const old = target?.manager_id ? everyone.find((p) => p.id === target.manager_id) : null;
    line('manager_id', boss.id === me.id ? (ar ? 'أنت' : 'You') : nm(boss), old ? nm(old) : null);
  }

  if (f.weekly_capacity_hours != null && f.weekly_capacity_hours > 0 && f.weekly_capacity_hours <= 84) {
    const v = Math.round(f.weekly_capacity_hours * 2) / 2;
    if (v !== Number(target?.weekly_capacity_hours ?? NaN)) {
      patch.weekly_capacity_hours = v;
      const h = (n: number) => (ar ? `${n} ساعة` : `${n}h`);
      line('weekly_capacity_hours', h(v), target?.weekly_capacity_hours != null ? h(Number(target.weekly_capacity_hours)) : null);
    }
  }
  if (f.years_experience != null && f.years_experience >= 0 && f.years_experience <= 60) {
    const v = Math.round(f.years_experience * 2) / 2;
    if (v !== Number(target?.years_experience ?? NaN)) {
      patch.years_experience = v;
      const y = (n: number) => (ar ? `${n} سنوات` : `${n} years`);
      line('years_experience', y(v), target?.years_experience != null ? y(Number(target.years_experience)) : null);
    }
  }

  // ── skills: merge the mentioned ones into the existing list (level 0 removes) ──
  if (f.skills_detail?.length) {
    const merged: Skill[] = (target?.skills_detail ?? []).map((s) => ({ ...s }));
    const shown: string[] = [];
    for (const s of f.skills_detail) {
      const name = s.name.trim();
      if (!name) continue;
      const i = merged.findIndex((x) => x.name.trim().toLowerCase() === name.toLowerCase());
      if (s.level === 0) {
        if (i >= 0) {
          merged.splice(i, 1);
          shown.push(ar ? `حذف ${name}` : `remove ${name}`);
        }
        continue;
      }
      const level = s.level != null ? Math.min(5, Math.max(1, Math.round(s.level))) : null;
      const years = s.years != null && s.years >= 0 && s.years <= 60 ? s.years : null;
      const next: Skill = {
        name,
        level: level ?? (i >= 0 ? merged[i].level : null),
        years: years ?? (i >= 0 ? merged[i].years : null),
        notes: s.notes?.trim() || (i >= 0 ? merged[i].notes : null),
      };
      if (i >= 0) {
        const old = merged[i];
        if (old.level === next.level && old.years === next.years && old.notes === next.notes) continue;
        merged[i] = next;
      } else merged.push(next);
      shown.push(next.level ? `${name} (${next.level})` : name);
    }
    if (shown.length) {
      patch.skills_detail = merged;
      lines.push(`${label.skills_detail}: ${shown.join(ar ? '، ' : ', ')}`);
    }
  }

  for (const k of ['whatsapp_connected', 'telegram_connected'] as const) {
    const v = f[k];
    if (v != null && v !== (target?.[k] ?? false)) {
      patch[k] = v;
      line(k, v ? (ar ? 'مربوط' : 'Connected') : ar ? 'غير مربوط' : 'Not connected');
    }
  }
  if (f.status && f.status !== target?.status && !(isNew && f.status === 'deleted')) {
    patch.status = f.status;
    line('status', STATUS_LABEL[L][f.status], target ? STATUS_LABEL[L][target.status] : null);
  }

  if (!Object.keys(patch).length) return say("Nothing to change, that's already how it is.", 'ما فيه شي يتغيّر، هو كذا أصلاً.');

  // ── the same rules upsert_person enforces, checked early so the user isn't asked to confirm something that will fail ──
  const self = !isNew && target!.id === me.id;
  const canLead = amAdmin || me.role === 'manager' || everyone.some((p) => p.manager_id === me.id && p.status !== 'deleted');
  if (self && !amAdmin) {
    if (Object.keys(patch).some((k) => k !== 'skills_detail' && k !== 'years_experience'))
      return say('You can only change your own skills and experience.', 'تقدر تعدّل مهاراتك وخبرتك بس.');
  } else if (!amAdmin) {
    if (!canLead) return say('Only managers and admins can change the team.', 'تعديل الفريق للمدراء والمسؤولين بس.');
    if (!isNew && !isBelow(target!.id, me.id)) return say('You can only change people in your own team.', 'تقدر تعدّل على اللي تحتك في الفريق بس.');
    const m = patch.manager_id as string | undefined;
    if (m && m !== me.id && !isBelow(m, me.id))
      return say('You can only move people within your own team.', 'تقدر تنقل الناس داخل فريقك بس.');
  }
  const adminRole = (r?: string | null) => r === 'admin' || r === 'super_admin';
  if (me.role !== 'super_admin') {
    if (adminRole(patch.role as string) || (target && adminRole(target.role) && 'role' in patch))
      return say('Only a super admin can give or change admin roles.', 'صلاحيات المسؤول يعطيها مدير النظام بس.');
    if (target && adminRole(target.role) && target.id !== me.id)
      return say('Only a super admin can change an admin.', 'التعديل على المسؤولين لمدير النظام بس.');
  }

  const personName = isNew
    ? ar
      ? ((patch.full_name_ar as string | undefined) ?? (patch.full_name as string))
      : (patch.full_name as string)
    : nm(target!);
  const list = lines.join(ar ? '، ' : ', ');
  const reply = isNew
    ? ar
      ? `بضيف ${personName} للفريق: ${list}. أكّد لي وأحفظه.`
      : `I'll add ${personName} to the team: ${list}. Confirm and I'll save it.`
    : ar
      ? `هذا التعديل على ${personName}: ${list}. أكّد لي وأحفظه.`
      : `Here's the change for ${personName}: ${list}. Confirm and I'll save it.`;

  return {
    proposal: {
      op: org.op,
      person_id: target?.id ?? null,
      person_name: personName,
      patch: target ? { id: target.id, ...patch } : patch,
      summary_lines: lines,
    },
    reply,
  };
}

/** Confirm tapped on a team change: run upsert_person as the user (it enforces permissions) and log the result in the chat. */
async function applyOrg(db: Caller['db'], profileId: string, raw: unknown, ar: boolean): Promise<Response> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'Nothing to save');
  const src = raw as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const k of ORG_KEYS) if (k in src) patch[k] = src[k];
  const isNew = !patch.id;
  if (Object.keys(patch).length <= (isNew ? 0 : 1)) throw new HttpError(400, 'Nothing to save');

  const { data: id, error } = await db.rpc('upsert_person', { p: patch });
  if (error) throw new HttpError(400, error.message);

  const { data: person } = await db.from('profiles').select('full_name, full_name_ar').eq('id', id as string).single();
  const name = person ? ((ar ? person.full_name_ar : null) ?? person.full_name) : '';
  const reply = isNew
    ? ar
      ? `تم، أضفت ${name} للفريق.`
      : `Done, ${name} is now on the team.`
    : patch.status === 'deleted'
      ? ar
        ? `تم، سجّلت إن ${name} ترك الشركة.`
        : `Done, ${name} is marked as having left.`
      : ar
        ? `تم، حدّثت بيانات ${name}.`
        : `Done, ${name} is updated.`;

  const { data: botMsg, error: e2 } = await db
    .from('chat_messages')
    .insert({
      profile_id: profileId,
      role: 'assistant',
      content: reply,
      task_id: null,
      action: 'none',
      payload: { org_done: { person_id: id, person_name: name } },
    })
    .select()
    .single();
  if (e2) throw new HttpError(500, e2.message);
  return json({ messages: [botMsg] });
}
