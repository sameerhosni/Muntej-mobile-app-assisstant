// muntej-chat — the conversational task assistant ("talk to Muntej").
// Input: { message: string, source?: 'voice' | 'text', focus_task_id? } | { apply: { task_id, patch }, lang }
//      | { apply_org: { patch }, lang } (Confirm on a team-change card → upsert_person as the caller).
//      | { apply_objective: { op: 'create'|'update'|'cancel'|'distribute', objective_id, patch }, lang }
//        (Confirm on an objective card → upsert_objective / cancel_objective / distribute_tasks as the caller).
// Team changes ("add Reem under Khalid", "Noura left") are never applied from a message: the reply carries
// payload.org_proposal and the user confirms it. Objective changes work the same way (payload.objective_proposal).
// New tasks are linked to the best-fitting active objective (link_task) when they clearly belong to one.
// One continuous chat per person (chat_messages). Each message is either small talk / a question (reply only),
// a new task (created right away via create_task_with_plan, the card has Undo/Edit), or an update to a recent task
// (update_task_from_chat). Everything runs as the caller (RLS), so Muntej only sees and touches what they can.
// Status ("I finished it", "it's blocked", "reopen it") → set_task_status: done closes it for the assigner / anyone above
// the owner, and sends it for review (submitted) when only the owner says it. Changes to many tasks at once ("mark all
// my tasks done", "move all high-priority tasks to Sunday") come as payload.bulk_proposal; Confirm → { apply_bulk }
// → bulk_update_tasks, and { undo_log_id } puts them back within 5 minutes.
// A new task for several people asks first (payload.people_choice → { apply_create: { task, owner_ids, mode } });
// one that looks like an open task asks first too (payload.duplicate → { apply_create: { task, force: true } }).
// Repeating work ("standup every Monday") comes as payload.recurring_proposal; Confirm → { apply_recurring } →
// upsert_recurring (a pg_cron job creates each task ahead of time). Skip / pause / resume / stop run right away.
// "8 hours of work" sets estimate_hours and, with no date said, a due date in working days (Sun–Thu).
// Every open task carries a predicted finish (owner's queue ÷ daily hours × their past speed) on its card.
// When the owner's Muntej engine API is ready, this function is the one place to swap it in.
import { z } from 'npm:zod@4.6.7';
import { getCaller, HttpError, json, requireEnv, serve, type Caller } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';
import { deliverPending } from '../_shared/notify.ts';

/** Push the alerts this request just created (assignments, reviews, changes for someone else) right away
 *  instead of waiting for the every-minute job; settings and quiet hours apply. Never fails the request. */
async function deliverNow() {
  await deliverPending(adminClient()).catch((e) => console.error('alert delivery failed', e));
}
import { buildPlan } from '../_shared/followup-plan.ts';

const Priority = z.enum(['low', 'medium', 'high', 'urgent']);
// the proof the finished work must show (tasks.proof_required): checked before it can be sent for review
const Proof = z.enum(['none', 'any', 'file', 'image', 'link']);

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
  objective_id: z.string().nullable().describe('id from objectives (status active) when the task clearly belongs to one, else null'),
  also_for_ids: z.array(z.string()).describe('Other people named for this same work besides owner_id (ids from team); [] when one person'),
  estimate_hours: z.number().nullable().describe('Hours of work when the user says it ("8 hours of work", "takes two days" = 16), else null'),
  proof: Proof.describe('What the finished work must show, see PROOF'),
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
  objective_id: z.string().nullable().describe('Link the task to this objective (id from objectives); null = unchanged'),
  unlink_objective: z.boolean().describe('true only when the user wants the task taken out of its objective'),
  estimate_hours: z.number().nullable().describe('New estimate in hours ("it takes 12 hours"); null = unchanged'),
  proof: Proof.nullable().describe('New proof rule when the user asks ("needs a photo", "no proof needed"); null = unchanged'),
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

// every key is required by strict mode; null = "unchanged" (update) / "not said" (create)
const ObjectiveFields = z.object({
  title: z.string().nullable().describe('Objective title in the user language'),
  title_ar: z.string().nullable().describe('Arabic title when the user wrote in Arabic or you can write it well'),
  description: z.string().nullable(),
  owner_id: z.string().nullable().describe('Accountable person, id from team'),
  start_at: z.string().nullable().describe('ISO 8601 datetime with +03:00 offset'),
  due_at: z.string().nullable().describe('ISO 8601 datetime with +03:00 offset'),
});

// accounts (multi-tenant): open a new company account (super admin), work in another account, list them
const AccountChange = z.object({
  op: z.enum(['create', 'switch', 'list']),
  account_id: z.string().nullable().describe('id from accounts, for switch'),
  name: z.string().nullable().describe('new account (company) name in Latin letters, for create'),
  name_ar: z.string().nullable().describe('the name in Arabic letters when you can write it'),
  admin_full_name: z.string().nullable().describe("the new account's admin, Latin letters"),
  admin_full_name_ar: z.string().nullable(),
  admin_email: z.string().nullable(),
});

const ObjectiveChange = z.object({
  op: z.enum(['create', 'update', 'cancel', 'distribute']),
  objective_id: z.string().nullable().describe('id from objectives; null only for create'),
  fields: ObjectiveFields,
});

const TaskStatusChange = z.enum(['done', 'in_progress', 'blocked', 'reopen']);

// every key is required by strict mode; null / [] = "not said" (create) or "unchanged" (update)
const RecurringFields = z.object({
  title: z.string().nullable(),
  owner_id: z.string().nullable().describe('id from team'),
  rotation_ids: z.array(z.string()).describe('People who take turns, in order (ids from team); [] = no rotation'),
  freq: z.enum(['daily', 'weekdays', 'weekly', 'monthly']).nullable().describe('weekdays = every working day Sun–Thu'),
  every: z.number().nullable().describe('Every N days/weeks/months (2 = every other); null = 1'),
  weekdays: z.array(z.number()).describe('weekly: 0 = Sunday … 6 = Saturday; [] = unchanged / the start day'),
  month_day: z.number().nullable().describe('monthly: 1-31, -1 = last day'),
  time_of_day: z.string().nullable().describe('"HH:MM" 24h Riyadh time; null = 17:00'),
  starts_on: z.string().nullable().describe('YYYY-MM-DD'),
  ends_on: z.string().nullable().describe('YYYY-MM-DD'),
  priority: Priority.nullable(),
  definition_of_done: z.string().nullable(),
  estimate_hours: z.number().nullable(),
});

const RecurringChange = z.object({
  op: z.enum(['create', 'update', 'skip_next', 'pause', 'resume', 'stop']),
  recurring_id: z.string().nullable().describe('id from recurring; null only for create'),
  fields: RecurringFields,
  pause_until: z.string().nullable().describe('YYYY-MM-DD, only for pause'),
});

const StatusChange = z.object({
  task_id: z.string(),
  status: TaskStatusChange,
  note: z.string().nullable().describe('What the user said about it (e.g. what is blocking it), else null'),
});

// every key is required by strict mode; false / null = "don't filter on this"
const BulkFilter = z.object({
  mine_only: z.boolean().describe('Only tasks the user owns ("my tasks")'),
  owner_id: z.string().nullable().describe("Only this person's tasks (id from team)"),
  assigned_by_me: z.boolean().describe('Only tasks the user assigned to others'),
  priority: Priority.nullable(),
  late_only: z.boolean(),
  due_before: z.string().nullable().describe('ISO 8601; only tasks due before this'),
  title_contains: z.string().nullable().describe('A word the task titles share, e.g. "security"'),
  objective_id: z.string().nullable(),
});

const BulkChange = z.object({
  filter: BulkFilter,
  task_ids: z.array(z.string()).describe('Explicit task ids when the user listed the tasks; [] = use filter'),
  change: z.object({
    kind: z.enum(['status', 'due', 'priority', 'owner', 'cancel', 'delete']),
    status: TaskStatusChange.nullable(),
    due_at: z.string().nullable().describe('ISO 8601 datetime with +03:00 offset'),
    priority: Priority.nullable(),
    owner_id: z.string().nullable(),
  }),
});

// a question about several people / tasks → a small table; the server adds what Muntej did and the one-tap next step
const BriefRow = z.object({
  person_id: z.string().nullable().describe('id from team when the row is about a person, else null'),
  task_id: z.string().nullable().describe('id from open_tasks when the row is about one task, else null'),
  status: z.enum(['late', 'blocked', 'overloaded', 'at_risk', 'unassigned', 'on_track', 'star']),
  metric: z.string().describe('the key number, very short: "58h / 40h", "1 day late", "6 done · 92% on time"'),
  note: z.string().describe('one short clause in the user language: the task name or the reason'),
});
const Brief = z.object({
  headline: z.string().describe('one line counting what matters, e.g. "2 need attention · 4 on track" / "٢ يحتاجون انتباه · ٤ ماشين تمام"'),
  rows: z.array(BriefRow).describe('max 6, problems first'),
});

const ChatOutput = z.object({
  language: z.enum(['en', 'ar']),
  reply: z.string(),
  action: z.enum(['none', 'create', 'update', 'status', 'bulk', 'recurring', 'cancel', 'delete', 'org', 'objective', 'account']),
  task: NewTask.nullable().describe('Only when action = create'),
  update: TaskUpdate.nullable().describe('Only when action = update; null fields mean "unchanged"'),
  target_task_id: z.string().nullable().describe('Only when action = cancel or delete'),
  org: OrgChange.nullable().describe('Only when action = org'),
  objective: ObjectiveChange.nullable().describe('Only when action = objective'),
  account: AccountChange.nullable().describe('Only when action = account'),
  status_change: StatusChange.nullable().describe('Only when action = status'),
  bulk: BulkChange.nullable().describe('Only when action = bulk'),
  recurring: RecurringChange.nullable().describe('Only when action = recurring'),
  suggestions: z.array(z.string()).describe('0-3 optional next steps, each a short ready-to-send message in the user language'),
  candidates: z.array(z.string()).describe('Only with action none: 2-3 task ids when the user wants to change a task but several tasks fit'),
  brief: Brief.nullable().describe('Only with action none, for questions about several people or tasks'),
});
type ChatOutput = z.infer<typeof ChatOutput>;

const { $schema: _ignored, ...RESPONSE_SCHEMA } = z.toJSONSchema(ChatOutput) as Record<string, unknown>;

// Frozen system prompt (no per-request data) so the provider can cache the prefix.
const SYSTEM = `You are Muntej, a friendly, sharp AI task assistant for people in Saudi companies. You chat with ONE user (anyone: manager or employee; employees can manage others too). Promise: "create it and forget it" — they talk normally, you turn work into tasks, pick the right person, and follow up for them.

Each turn, choose ONE action:
- "none": small talk (hi, thanks) and questions ("what's late?", "who is free?"). Answer questions from the provided open_tasks/team data only; never invent facts.
  TEAM QUESTIONS ("how is Faisal doing?", "who's overloaded?", "top performers this month", "risks in Khalid's team", "who knows Selenium?"): answer in 1-3 short sentences from team[].stats, skills, title and the org tree (manager_id / reports; "Khalid's team" = everyone below Khalid, any depth). Quote the real numbers (done, on-time %, late, open, hours, achievements); never invent or estimate a number that is not in the data. stats = null means the user cannot see that person's tasks: say so instead of guessing. Top performers: rank by done_this_month, then on_time_pct, then achievements. Overloaded: stats.overloaded or open_estimate_hours above weekly_hours. People who left are in former_team: mention them only when asked.
- BRIEF: when a question's answer covers several people or tasks (team status, who is late / blocked / overloaded / free, risks, top performers, "what needs me today", what's on someone's plate, objectives at risk), fill brief: headline = one counting line; rows (max 6) = problems first (late, blocked, overloaded, at_risk, unassigned), then on_track / star only when the question is about everyone or about performance. Each row: person_id and/or task_id from the lists, status, metric (the real number from the data) and note (task name or reason). Then the reply is ONE short sentence that does not repeat the rows (e.g. "Here's your team today:" / "هذا وضع فريقك اليوم:"). Never claim you reminded or changed anything: the server adds what Muntej already did and the one-tap fix to each row. brief = null for small talk, for one-person / one-task answers and for every other action.
- "create": the message asks for work to be done ("I need someone to…", "we have to…", "remind me to…", "خل أحد…"). Create it IMMEDIATELY, even if details are vague — the user can Undo, and gaps are filled later in the chat. Never ask a clarifying question instead of creating: write the best short title you can from what was said, and mention the open points (which one, when, what "done" means) in the reply as things they can add. Only the title is required: owner, due date, what "done" means, priority details and budget may all be null and filled later. Only use "none" for work if you cannot even name the task.
  WHO: if the user names someone (loose match: first names, Arabic/English spellings, "me"/"I'll do it" = the user), use them. Otherwise pick the best fit from team (never former_team) using, in order: skill level and years in the skills the work needs, title, recent_tasks similar to this one, then the lower load (stats.open / open_estimate_hours vs weekly_hours; avoid people marked overloaded or with late tasks when someone similar is free). Put the data-based reason in owner_reason (one short clause, user's language, e.g. "Selenium 4/5, 3 years, only 2 open tasks"). If nobody clearly fits, still CREATE it with owner_id null (unassigned) and in the reply suggest who could take it or ask them to name someone; never hold the task back for a missing owner.
- "org": the user wants to change the team itself (people, not tasks): add someone ("add Reem as QA engineer under Khalid, 5 years, Selenium and API testing" → op "add", person_id null, fields full_name, full_name_ar when you can write it, title + title_ar, manager_id, years_experience, skills_detail), move someone ("move Saad under Maha" → op "move", fields.manager_id), change details ("Faisal is now an admin" → role; "Khalid works 35 hours a week" → weekly_capacity_hours; "Noura knows Docker now" → skills_detail with just that skill; op "update"), or someone left / came back ("Noura left the company" → op "status", status "deleted"). Fill ONLY the fields that change, all others null. person_id must come from team or former_team. Nothing is saved until the user confirms on a card: the server writes the reply, so keep yours short.
  OBJECTIVE LINK: objectives lists the company objectives the user can see (each task can belong to one). On create, set task.objective_id to the active objective the task clearly belongs to (same topic, client, project or deliverable; owner in that objective's team is a hint, never enough on its own); if none clearly fits, null — never force a link. When you link it, say so in the reply ("added to objective «X»" / "وحطيتها تحت هدف «X»").
- "account": ACCOUNTS (companies using Muntej). "Create an account for Al-Rajhi Trading, admin Ali ali@rajhi.com" → op "create" with name (+ name_ar when you can), admin_full_name (+ _ar), admin_email (only when user.is_super_admin; otherwise action none and say only the super admin opens accounts). "Switch to / open / work in Al-Rajhi" → op "switch" with account_id from accounts. "Show my accounts" / "which accounts" → op "list". The server writes the reply. Adding PEOPLE to the current account is still "org" (op add, with their email so they get an invite).
- "objective": the user wants to create, change, cancel or spread out an OBJECTIVE (a bigger goal with a start and end date that tasks roll up to): "new objective: launch the Riyadh branch by end of March" → op "create" with fields.title (+ title_ar when you can), due_at, start_at (null = from now), owner_id (null = the user), description; "move objective X to April" / "make Khalid accountable for X" / "rename X" → op "update" with only the changing fields; "cancel objective X" → op "cancel"; "spread / distribute X's tasks over its time" → op "distribute". objective_id must come from objectives (null only for create). Nothing is saved until the user confirms on a card: the server writes the reply, so keep yours short. Changing an objective's dates also moves its open tasks inside the new window.
- OBJECTIVE QUESTIONS ("how are our objectives?", "which objectives are at risk?", "what's blocking objective X?", "كيف أهدافنا؟"): action "none", answer in 1-3 short sentences from objectives[] only: progress_pct (tasks done) vs time_used_pct (time passed), tasks.late, tasks.unassigned, at_risk, and issues (late, unassigned, blocked, outside_window = tasks due after the objective ends or before it starts). Name the real tasks/people in issues; never invent numbers. An objective with no tasks yet is a risk when time is passing. Suggest a fix when obvious (assign the unassigned task, move a date, distribute).
- "update": the message adds or changes details of a task already in the conversation (e.g. "make it Thursday", "add Saad to help", "the deliverable is a test report", "budget 5k", "give it to Maha"). "Put it under objective X" → update.objective_id; "take it out of the objective" → update.unlink_objective true (otherwise false). Target the most recent task in recent_chat_tasks unless the user clearly means another one (then use that task's id from recent_chat_tasks or open_tasks). Only set the fields that change; leave the rest null. The user may point at another task by its title, client or owner ("move the lease task to Thursday", "مهمة فيصل خلها بكرة"): match it in recent_chat_tasks or open_tasks.
- FOCUS: when focused_task is given, the user opened the chat on that task: every change, cancel or delete targets focused_task (use its id), and questions are about it, unless they clearly name a different task.
- WHICH ONE: when the user wants to change a task by describing it (title, client, owner, any detail) and two or more tasks in open_tasks fit equally, use action "none", put their ids in candidates (max 3) and ask which one in the reply. If exactly one fits, use "update" with its id (the app will ask the user to confirm when it is not the task being discussed). If NO task fits (e.g. it was cancelled or never existed), use "none" and say you couldn't find it; never pick an unrelated task.
- "status": the user says ONE task's state changed: finished ("I finished the report", "خلصت", "mark it done", "it's done") → done; started ("I'm on it", "بديت فيها") → in_progress; stuck ("it's blocked, waiting for the client", "واقفة") → blocked (put the reason in note); "reopen it" / "not done yet" → reopen. Target = focused_task, else the task being discussed, else the one they describe (same WHICH ONE rules). Never use "update" or "none" for this. The server words the reply (closed vs sent for review), so keep yours short.
- "bulk": the user wants the SAME change on several tasks at once: "mark all my tasks done", "خلص كل مهامي", "move all high-priority tasks to Sunday", "give all Faisal's tasks to Noura", "cancel all overdue tasks", "delete the security tasks". Fill bulk.filter (mine_only for "my tasks", owner_id for someone's tasks, assigned_by_me, priority, late_only, due_before, title_contains, objective_id) OR bulk.task_ids when they listed specific tasks, and bulk.change (kind status + status / due + due_at / priority + priority / owner + owner_id / cancel / delete). Nothing changes until the user confirms on a preview card that lists the tasks: the server writes the reply. Use "status"/"update"/"cancel" instead when exactly one task is meant.
- SEVERAL PEOPLE: when a new task names more than one person ("for Ahmed, Sarah and Ali", "لفيصل وعبدالله"), use "create" with the first person as owner_id and the others in task.also_for_ids; the server asks the user whether it's one task each or one shared task. Otherwise also_for_ids = [].
- "recurring": work that REPEATS ("standup every Monday 10:00 for Faisal", "monthly report on the 1st", "every other Tuesday", "كل يوم أحد", "rotate weekly between Faisal and Noura") → op "create" with fields (title, owner_id or rotation_ids, freq, every, weekdays, month_day, time_of_day, starts_on/ends_on when said, priority, definition_of_done, estimate_hours). Changing an existing schedule from recurring[] ("move all future standups to Tuesday", "make it 9am") → op "update" with only the changing fields (+ recurring_id). "Skip next Monday's standup" → skip_next; "pause the standup for 2 weeks" → pause + pause_until; "start it again" → resume; "stop the monthly report" → stop. Questions about them ("what repeats?") → "none" and answer from recurring[]. Nothing is created until the user confirms the schedule on a card: the server writes the reply.
- PROOF: on create, set task.proof to what the finished work should show: a document, report, deck, design, contract or sheet → "file"; a website, page, ticket or online item → "link"; on-site or physical work (installed, delivered, cleaned, printed, visited) → "image"; client- or executive-facing deliverables without a clear form → "any"; quick internal asks, calls, reminders and personal to-dos → "none". On update, set update.proof only when the user asks for or drops a proof requirement.
- ESTIMATES: when the user says how long work takes ("8 hours of work", "takes two days" = 16 h), put it in task.estimate_hours / update.estimate_hours; the server turns it into a due date in working days (after the owner's current workload) when no date was said — then leave due_at null (never work the date out yourself), do NOT call the due date missing and don't mention a date: the server adds it to your reply. Each open task has likely_done (Muntej's prediction from the owner's queue and past speed) and likely_late_days: use them for "when will X be done?" / "what will be late?" questions, saying it's an estimate.
- "cancel": the user wants a task stopped ("cancel it", "الغها", "ما نحتاجها"). Put its id in target_task_id (most recent task unless another is meant).
- "delete": the user wants a task removed completely ("delete it", "احذفها"). Put its id in target_task_id. Deleting needs one tap to confirm, so say you've shown it and they just need to confirm. Prefer "cancel" when they only mean it's no longer needed.

Writing rules:
- language = the language of the user's latest message. Write reply, title, owner_reason, goal, definition_of_done and helper_reason in it. Arabic → warm Saudi (Najdi/Hijazi) conversational Arabic, never Egyptian or formal MSA: use شي، ثاني، الحين، وش، أبي/تبي، زين، عشان (not حاجة، تاني، دلوقتي، إيه، عايز، كده). Example: "تمام، سجلتها لنورة…".
- reply: 1–3 short sentences, human and warm, no lists, no ids. After a create: say what you added and for whom + why, then mention what's still missing (due date, what "done" means; budget only when the work clearly costs money) and that they can just say or type it. After an update: confirm what changed and what is still missing, if anything. Never say you created or changed something unless action says so (with action "none" you created and changed nothing).
- suggestions: after create or update, 2-3 useful next steps the user might want, written as the exact short message they would send (e.g. "خلها يوم الخميس", "أضف نورة تساعده", "المطلوب تقرير اختبار" / "Make it due Thursday", "Add Noura to help"). Prefer filling what is missing (due date, what done means, owner), then helpful extras (a helper, priority). Never repeat what is already set. When the task has no objective and an active objective could fit, one suggestion may link it ("Link it to «X»" / "اربطها بهدف «X»"). After a question answered with a brief: 2 short follow-up questions the user may ask next (e.g. "Who's free this week?" / "مين فاضي هالأسبوع؟"). Empty for small talk, other questions, cancel, delete, org and objective.
- PENDING CARDS: if the user just says "yes"/"confirm"/"تمام" to a change waiting on a card, use "none" and tell them to tap Confirm on the card.
- ids (owner_id, helper_id, workspace_id, task_id, person_id, manager_id, objective_id) must come from the provided lists, else null.
- task and update are null unless action is create / update; org is null unless action is org; objective is null unless action is objective; status_change only with status; bulk only with bulk; recurring only with recurring.
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
  objective_id: string | null;
};
const TASK_COLS =
  'id, title, owner_id, helper_id, assigner_id, status, priority, due_at, definition_of_done, budget, goal, estimate_hours, closed_at, created_at, updated_at, objective_id';

type ObjectiveRow = {
  id: string;
  title: string;
  title_ar: string | null;
  description: string | null;
  owner_id: string | null;
  workspace_id: string | null;
  start_at: string;
  due_at: string;
  status: 'active' | 'achieved' | 'missed' | 'cancelled';
  created_by: string;
};
const OBJECTIVE_COLS = 'id, title, title_ar, description, owner_id, workspace_id, start_at, due_at, status, created_by';
/** keys upsert_objective accepts from a chat proposal (the RPC enforces who may change what) */
const OBJECTIVE_KEYS = ['title', 'title_ar', 'description', 'owner_id', 'start_at', 'due_at'] as const;

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
  /** the super admin's viewing seat in an account: never part of the team */
  hidden: boolean;
};
const PERSON_COLS =
  'id, full_name, full_name_ar, role, title, title_ar, skills, skills_detail, locale, manager_id, status, years_experience, weekly_capacity_hours, phone, email, whatsapp_connected, telegram_connected, hidden';

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
    /** the user tapped Confirm on a proposed objective change: run upsert/cancel/distribute as them */
    apply_objective?: { op: string; objective_id: string | null; patch: Record<string, unknown> | null };
    /** Apply tapped on a bulk preview card: the ticked task ids + the change */
    apply_bulk?: { ids: string[]; change: Record<string, unknown> };
    /** Undo tapped after a status or bulk change (within 5 minutes) */
    undo_log_id?: string;
    /** a choice on a people / duplicate card: create without asking again */
    apply_create?: { task: Record<string, unknown>; owner_ids?: string[]; mode?: 'separate' | 'shared'; force?: boolean };
    /** Confirm tapped on a recurring schedule card: upsert_recurring as the caller */
    apply_recurring?: { recurring_id: string | null; patch: Record<string, unknown> };
    /** one-tap fix(es) on a team brief row: "Move to Faisal", "+2 days" (Undo for 5 minutes) */
    apply_brief?: { source_id: string; items: BriefApplyItem[] };
    /** Undo after "Do all" on a brief (one log per change) */
    undo_log_ids?: string[];
    lang?: string;
  };
  const message = (body.message ?? '').trim();
  const source = body.source === 'voice' ? 'voice' : 'text';

  if (body.apply_org) return await applyOrg(db, profileId, body.apply_org.patch, body.lang === 'ar');
  if (body.apply_objective) return await applyObjective(db, profileId, body.apply_objective, body.lang === 'ar');
  if (body.apply_bulk) return await applyBulk(db, profileId, body.apply_bulk, body.lang === 'ar');
  if (body.undo_log_id) return await undoChange(db, profileId, body.undo_log_id, body.lang === 'ar');
  if (body.apply_recurring) return await applyRecurring(db, profileId, body.apply_recurring, body.lang === 'ar');
  if (body.apply_brief) return await applyBrief(db, profileId, body.apply_brief, body.lang === 'ar');
  if (body.undo_log_ids) return await undoMany(db, profileId, body.undo_log_ids, body.lang === 'ar');
  // no user message of its own: Confirm / a choice on a card
  const tapped = !!body.apply || !!body.apply_create;

  if (!message && !tapped) throw new HttpError(400, 'Say or type something first');
  if (message.length > 4000) throw new HttpError(413, 'That message is too long');

  // ── context (all RLS-scoped to the caller) ──
  const since90 = new Date(Date.now() - 90 * DAY).toISOString();
  const [{ data: history }, { data: people }, { data: tasks }, { data: workspaces }, { data: achievementRows }, { data: objectiveRows }] = await Promise.all([
    db.from('chat_messages').select('role, content, task_id, action, created_at').order('created_at', { ascending: false }).limit(20),
    db.from('profiles').select(PERSON_COLS),
    db.from('tasks').select(TASK_COLS).order('created_at', { ascending: false }).limit(500),
    db.from('workspaces').select('id, name, name_ar, goal'),
    db.from('achievements').select('profile_id, title, title_ar, achieved_at').gte('achieved_at', since90).order('achieved_at', { ascending: false }).limit(300),
    // RLS: only objectives the caller can see; a missing table (not migrated yet) just means none
    db.from('objectives').select(OBJECTIVE_COLS).neq('status', 'cancelled').order('due_at', { ascending: true }).limit(200),
  ]);
  // repeating schedules the caller can see (a missing table just means none)
  const { data: recurringRows } = await db.from('recurring_tasks').select(RECURRING_COLS).eq('status', 'active').limit(50);
  // accounts this login can work in (my_accounts: all of them for the super admin)
  const { data: accountRows } = await db.rpc('my_accounts');
  const myAccounts = (accountRows ?? []) as MyAccount[];
  const recurring = (recurringRows ?? []) as RecurringRow[];
  // everyone (incl. people who left) for names and org changes; `team` = people who can still get work
  const everyone = (people ?? []) as PersonRow[];
  const team = everyone.filter((p) => p.status !== 'deleted' && !p.hidden);
  const allTasks = (tasks ?? []) as TaskRow[];
  const nameOf = (id: string | null) => (id ? everyone.find((p) => p.id === id)?.full_name ?? null : null);
  const open = allTasks.filter((t) => ACTIVE.includes(t.status));

  // ── predicted finish: the owner's queue (open tasks due earlier) + this one, at their daily hours × past speed ──
  const perDayOf = (id: string | null) => {
    const w = id ? everyone.find((p) => p.id === id)?.weekly_capacity_hours : null;
    return w ? Math.max(1, Math.min(12, Number(w) / 5)) : 8;
  };
  const speedCache = new Map<string, { speed: number; samples: number; defaultHours: number }>();
  const speedOf = (ownerId: string) => {
    const hit = speedCache.get(ownerId);
    if (hit) return hit;
    const perDay = perDayOf(ownerId);
    const cutoff120 = Date.now() - 120 * DAY;
    const done = allTasks.filter((t) => t.owner_id === ownerId && t.status === 'done' && t.closed_at && Date.parse(t.closed_at) >= cutoff120);
    const ratios = done
      .filter((t) => t.estimate_hours && Number(t.estimate_hours) > 0)
      .map((t) => workingHoursBetween(new Date(t.created_at), new Date(t.closed_at!), perDay) / Number(t.estimate_hours));
    const ests = allTasks.filter((t) => t.owner_id === ownerId && t.estimate_hours).map((t) => Number(t.estimate_hours));
    const r = {
      speed: ratios.length >= 3 ? Math.min(3, Math.max(0.5, median(ratios))) : 1,
      samples: ratios.length,
      defaultHours: ests.length >= 3 ? median(ests) : 4,
    };
    speedCache.set(ownerId, r);
    return r;
  };
  /** hours of open work already on someone's plate (estimates, else their usual size) */
  const queueHoursOf = (ownerId: string | null, except?: string) => {
    if (!ownerId) return 0;
    const { defaultHours } = speedOf(ownerId);
    return open
      .filter((x) => x.owner_id === ownerId && x.id !== except && x.status !== 'submitted')
      .reduce((sum, x) => sum + (x.estimate_hours ? Number(x.estimate_hours) : defaultHours), 0);
  };
  const predict = (t: TaskRow): { at: string; confidence: number; late_days: number } | null => {
    if (!t.owner_id || !ACTIVE.includes(t.status) || t.status === 'submitted') return null;
    const { speed, samples, defaultHours } = speedOf(t.owner_id);
    const hoursOf = (x: TaskRow) => (x.estimate_hours ? Number(x.estimate_hours) : defaultHours);
    const due = t.due_at ? Date.parse(t.due_at) : null;
    const queue = open
      .filter((x) => x.id !== t.id && x.owner_id === t.owner_id && x.status !== 'submitted' && x.due_at && (due == null || Date.parse(x.due_at) < due))
      .reduce((sum, x) => sum + hoursOf(x), 0);
    const at = addWorkingHours(new Date(), (queue + hoursOf(t)) * speed, perDayOf(t.owner_id));
    const confidence = samples >= 5 && t.estimate_hours ? 80 : samples >= 2 || t.estimate_hours ? 60 : 40;
    const late = due != null && at.getTime() > due ? Math.ceil((at.getTime() - due) / DAY) : 0;
    return { at: at.toISOString(), confidence, late_days: late };
  };

  // objectives the caller can see (not cancelled); `liveObjectives` = the ones tasks may still be linked to
  const objectives = (objectiveRows ?? []) as ObjectiveRow[];
  const objectiveById = new Map(objectives.map((o) => [o.id, o]));
  const liveObjectives = objectives.filter((o) => o.status === 'active' || o.status === 'missed');
  const objectiveTitle = (id: string | null, ar = false) => {
    const o = id ? objectiveById.get(id) : null;
    return o ? ((ar ? o.title_ar : null) ?? o.title) : null;
  };
  /** what each task entry in the context carries about its objective */
  const objectiveOf = (t: TaskRow) => ({ objective_id: t.objective_id, objective: objectiveTitle(t.objective_id) });

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
      ...objectiveOf(t),
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

  // ── objectives: progress (tasks done) vs time used, and what is in the way — from the tasks the caller can see ──
  const canEditObjective = (o: ObjectiveRow) =>
    o.owner_id === profileId || o.created_by === profileId || (!!o.owner_id && (amAdmin || isBelow(o.owner_id, profileId)));
  const objectiveSummary = (o: ObjectiveRow) => {
    const linked = allTasks.filter((t) => t.objective_id === o.id && t.status !== 'cancelled');
    const done = linked.filter((t) => t.status === 'done').length;
    const openLinked = linked.filter((t) => t.status !== 'done');
    const lateTasks = openLinked.filter((t) => t.due_at && new Date(t.due_at) < now);
    const unassigned = openLinked.filter((t) => !t.owner_id);
    const blocked = openLinked.filter((t) => t.status === 'blocked');
    const start = new Date(o.start_at).getTime();
    const end = new Date(o.due_at).getTime();
    const outside = openLinked.filter((t) => t.due_at && (new Date(t.due_at).getTime() > end || new Date(t.due_at).getTime() < start));
    const progress = linked.length ? Math.round((done / linked.length) * 100) : 0;
    const timeUsed = Math.min(100, Math.max(0, Math.round(((now.getTime() - start) / Math.max(end - start, 1)) * 100)));
    const atRisk =
      o.status === 'missed' ||
      (o.status === 'active' &&
        (lateTasks.length > 0 || (linked.length ? timeUsed - progress >= 25 : timeUsed >= 30) || outside.length > 0));
    const titled = (ts: TaskRow[], withOwner = true) =>
      ts.slice(0, 3).map((t) => (withOwner && t.owner_id ? `${t.title} (${firstName(t.owner_id)})` : t.title));
    return {
      id: o.id,
      title: o.title,
      title_ar: o.title_ar,
      owner: nameOf(o.owner_id),
      owner_id: o.owner_id,
      start_at: o.start_at,
      due_at: o.due_at,
      status: o.status,
      can_edit: canEditObjective(o),
      tasks: { total: linked.length, done, open: openLinked.length, late: lateTasks.length, unassigned: unassigned.length },
      progress_pct: progress,
      time_used_pct: timeUsed,
      at_risk: atRisk,
      issues: {
        late: titled(lateTasks),
        unassigned: titled(unassigned, false),
        blocked: titled(blocked),
        outside_window: titled(outside),
      },
    };
  };
  // active first (soonest end), then missed; max 20 keeps the prompt small
  const contextObjectives = [
    ...liveObjectives.filter((o) => o.status === 'active'),
    ...liveObjectives.filter((o) => o.status === 'missed'),
  ]
    .slice(0, 20)
    .map(objectiveSummary);

  const context = {
    current_time_riyadh: `${riyadhNow} (${now.toISOString()} UTC)`,
    user: { id: profileId, name: nameOf(profileId), role: meRow?.role ?? null, is_super_admin: meRow?.role === 'super_admin' },
    // the accounts this login can work in (all of them for the super admin); active = the one this chat is in
    accounts: myAccounts.map((a) => ({ id: a.id, name: a.name, name_ar: a.name_ar, people: a.people, member: a.member, active: a.active })),
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
          ...objectiveOf(focus),
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
      estimate_hours: t.estimate_hours,
      likely_done: predict(t)?.at ?? null,
      likely_late_days: predict(t)?.late_days ?? 0,
      ...objectiveOf(t),
    })),
    objectives: contextObjectives,
    recurring: recurring.map((r) => ({
      id: r.id,
      title: r.title,
      schedule: scheduleText(r, false),
      owner: nameOf(r.owner_id),
      rotation: r.rotation.map((id) => nameOf(id)),
      next_due_at: r.next_due_at,
      paused_until: r.paused_until,
      skip_next: r.skip_next,
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
        objective_id: str('objective_id'),
        unlink_objective: a.unlink_objective === true,
        estimate_hours: typeof a.estimate_hours === 'number' ? a.estimate_hours : null,
        proof: (str('proof_required') as z.infer<typeof Proof> | null) ?? null,
      },
      target_task_id: null,
      org: null,
      objective: null,
      status_change: null,
      bulk: null,
      recurring: null,
      suggestions: [],
      candidates: [],
      brief: null,
      account: null,
    };
  } else if (body.apply_create?.task) {
    // a choice on a people / duplicate card: the task as proposed, created without asking again
    const ar = body.lang === 'ar';
    const a = body.apply_create.task;
    const str = (k: string) => (typeof a[k] === 'string' && a[k] ? (a[k] as string) : null);
    const pr = str('priority');
    parsed = {
      language: ar ? 'ar' : 'en',
      reply: ar ? 'تم، سجلتها.' : 'Done, added.',
      action: 'create',
      task: {
        title: str('title') ?? (ar ? 'مهمة جديدة' : 'New task'),
        owner_id: str('owner_id'),
        owner_reason: str('owner_reason'),
        helper_id: str('helper_id'),
        helper_reason: null,
        due_at: str('due_at'),
        priority: (pr === 'low' || pr === 'high' || pr === 'urgent' ? pr : 'medium') as 'low' | 'medium' | 'high' | 'urgent',
        goal: str('goal'),
        definition_of_done: str('definition_of_done'),
        budget: str('budget'),
        workspace_id: str('workspace_id'),
        objective_id: str('objective_id'),
        also_for_ids: [],
        estimate_hours: typeof a.estimate_hours === 'number' ? a.estimate_hours : null,
        proof: (str('proof') as z.infer<typeof Proof> | null) ?? 'none',
      },
      update: null,
      target_task_id: null,
      org: null,
      objective: null,
      status_change: null,
      bulk: null,
      recurring: null,
      suggestions: [],
      candidates: [],
      brief: null,
      account: null,
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
  // cards that ask before anything is saved
  let bulkProposal: BulkProposal | null = null;
  let peopleChoice: Record<string, unknown> | null = null;
  let duplicate: Record<string, unknown> | null = null;
  // several tasks created at once (one task each)
  let createdList: { id: string; title: string; owner_name: string | null; due_at: string | null }[] = [];
  // a status change done right away: the card offers Undo with this activity_log row
  let undoLogId: string | null = null;
  // "8 hours → due Tue 17:00 (working days)", appended to the reply
  let estimateNote: string | null = null;
  // a repeating schedule waiting for Confirm
  let recurringProposal: RecurringProposal | null = null;
  const ar0 = parsed.language === 'ar';
  const canClose = (t: TaskRow) =>
    t.assigner_id === profileId ||
    (!!t.owner_id && (amAdmin || isBelow(t.owner_id, profileId))) ||
    (t.owner_id === profileId && t.assigner_id === profileId);
  const canChange = (t: TaskRow) => t.owner_id === profileId || canClose(t);
  const displayName = (id: string | null) => {
    const p = id ? everyone.find((x) => x.id === id) : null;
    return p ? ((ar0 ? p.full_name_ar : null) ?? p.full_name) : null;
  };
  const fmtDue = (iso: string) =>
    new Intl.DateTimeFormat(ar0 ? 'ar-SA' : 'en-GB', {
      timeZone: 'Asia/Riyadh',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));

  const estimateLine = (hours: number, autoDue: string | null) =>
    autoDue
      ? ar0
        ? `(${hours} ساعة شغل ← التسليم ${fmtDue(autoDue)} بأيام العمل)`
        : `(${hours} h of work → due ${fmtDue(autoDue)}, working days)`
      : ar0
        ? `(سجلت التقدير: ${hours} ساعة)`
        : `(Estimate saved: ${hours} h)`;

  /** the preview card for one change on many tasks; tasks the user may not change are left out (counted) */
  const buildBulk = (rows: TaskRow[], change: BulkChangeT['change']): BulkProposal | null => {
    const kind = change.kind;
    const items: BulkItem[] = [];
    let skipped = 0;
    for (const t of rows.slice(0, 100)) {
      let to: string | null = null;
      if (kind === 'status') {
        if (change.status === 'done') {
          if (canClose(t)) to = 'done';
          else if (t.owner_id === profileId) to = 'submitted';
        } else if (canChange(t)) to = change.status === 'reopen' ? 'in_progress' : change.status;
      } else if (kind === 'delete') {
        to = t.assigner_id === profileId || (!!t.owner_id && (amAdmin || isBelow(t.owner_id, profileId))) ? 'deleted' : null;
      } else if (kind === 'cancel') to = canChange(t) ? 'cancelled' : null;
      else to = canChange(t) ? t.status : null;
      if (!to) {
        skipped++;
        continue;
      }
      items.push({ id: t.id, title: t.title, owner_name: displayName(t.owner_id), due_at: t.due_at, status: t.status, to_status: to });
    }
    if (!items.length) return null;
    const c: Record<string, unknown> = { kind };
    if (kind === 'status') c.status = change.status;
    if (kind === 'due') c.due_at = change.due_at;
    if (kind === 'priority') c.priority = change.priority;
    if (kind === 'owner') c.owner_id = change.owner_id;
    const statusLabel = ar0
      ? { done: 'تعليمها خالصة', in_progress: 'قيد التنفيذ', blocked: 'واقفة', reopen: 'إعادة فتحها' }
      : { done: 'Mark done', in_progress: 'Mark in progress', blocked: 'Mark blocked', reopen: 'Reopen' };
    const label =
      kind === 'status'
        ? statusLabel[change.status ?? 'done']
        : kind === 'due'
          ? (ar0 ? 'الموعد ← ' : 'Due → ') + fmtDue(change.due_at!)
          : kind === 'priority'
            ? (ar0 ? 'الأولوية ← ' : 'Priority → ') + change.priority
            : kind === 'owner'
              ? (ar0 ? 'المسؤول ← ' : 'Owner → ') + (displayName(change.owner_id) ?? '')
              : kind === 'cancel'
                ? (ar0 ? 'إلغاؤها' : 'Cancel')
                : ar0
                  ? 'حذفها نهائياً (ما تقدر تتراجع)'
                  : "Delete for good (can't be undone)";
    return { change: c, label, items, skipped, review: items.filter((i) => i.to_status === 'submitted').length };
  };
  const bulkReply = (b: BulkProposal | null, found: number) => {
    if (!b) {
      if (found) return ar0 ? 'لقيت مهام بس ما تقدر تغيّرها، تخص غيرك.' : "I found matching tasks, but they're not yours to change.";
      return ar0 ? 'ما لقيت مهام تطابق هذا.' : "I couldn't find any tasks matching that.";
    }
    const n = b.items.length;
    const review = b.review ? (ar0 ? ` منها ${b.review} بتروح للمراجعة أول.` : ` ${b.review} of them will go for review first.`) : '';
    const skip = b.skipped ? (ar0 ? ` وتركت ${b.skipped} ما تقدر تغيّرها.` : ` I left out ${b.skipped} you can't change.`) : '';
    return ar0
      ? `لقيت ${n} ${n === 1 ? 'مهمة' : 'مهام'} — ${b.label}. شيل الصح عن اللي تبي تخليها، وبعدين اضغط تطبيق.${review}${skip}`
      : `I found ${n} task${n === 1 ? '' : 's'} — ${b.label}. Untick any you want to keep as they are, then tap Apply.${review}${skip}`;
  };

  /** same work already open? (word overlap on the title; a different named owner needs a closer match) */
  const findDuplicate = (title: string, ownerId: string | null) => {
    const words = (x: string) =>
      new Set(
        x
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 1),
      );
    const a = words(title);
    if (a.size === 0) return null;
    let best: { t: TaskRow; score: number } | null = null;
    for (const t of open) {
      const b = words(t.title);
      const inter = [...a].filter((w) => b.has(w)).length;
      const score = inter / (a.size + b.size - inter || 1);
      const need = ownerId && t.owner_id && ownerId !== t.owner_id ? 0.85 : 0.6;
      if (score >= need && (!best || score > best.score)) best = { t, score };
    }
    return best?.t ?? null;
  };

  /** link (or unlink, objectiveId null) a task as the caller and log it; `why` goes to activity_log.reason */
  const linkTask = async (
    tRow: { id: string; title: string; owner_id: string | null },
    objectiveId: string | null,
    previous: string | null,
    why: string | null,
  ) => {
    const task = tRow.id;
    const { error } = await db.rpc('link_task', { p_task: task, p_objective: objectiveId });
    if (error) return error.message;
    const title = tRow.title.slice(0, 120);
    const oTitle = objectiveTitle(objectiveId ?? previous);
    const oTitleAr = objectiveTitle(objectiveId ?? previous, true);
    const { error: logError } = await db.from('activity_log').insert({
      actor_type: 'user',
      actor_id: profileId,
      subject_id: tRow.owner_id ?? profileId,
      task_id: task,
      action: objectiveId ? 'task_linked_objective' : 'task_unlinked_objective',
      summary: objectiveId ? `Linked "${title}" to objective "${oTitle}"` : `Took "${title}" out of objective "${oTitle}"`,
      summary_ar: objectiveId ? `ربطت "${title}" بهدف "${oTitleAr}"` : `طلّعت "${title}" من هدف "${oTitleAr}"`,
      reason: why,
      undoable: true,
      undo_payload: { task_id: task, objective_id: previous },
    });
    if (logError) console.error('objective link log failed', logError);
    return null;
  };
  const linkable = (id: string | null) => (id && liveObjectives.some((o) => o.id === id) ? id : null);

  /** create one task as the caller (+ its follow-up plan, + objective link); returns its id */
  const createOne = async (t: Omit<NewTaskT, 'objective_id' | 'also_for_ids' | 'estimate_hours'>, wantObjective: string | null) => {
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
    const { data, error } = await db.rpc('create_task_with_plan', { p: { ...t, followup_plan, source, transcript: message || null } });
    if (error) throw new HttpError(400, error.message);
    const id = data as string;
    if (t.proof && t.proof !== 'none') await db.from('tasks').update({ proof_required: t.proof }).eq('id', id);
    // only active objectives get new work (a missed one is linked by asking explicitly)
    const objective = wantObjective && liveObjectives.some((o) => o.id === wantObjective && o.status === 'active') ? wantObjective : null;
    if (objective) {
      const failed = await linkTask({ id, title: t.title, owner_id: t.owner_id }, objective, null, 'Muntej matched the new task to this objective');
      if (failed) console.error('auto-link to objective failed', failed);
    }
    return id;
  };

  if (parsed.action === 'create' && parsed.task) {
    const { objective_id: wantObjective, also_for_ids: alsoFor, estimate_hours: estRaw, ...t } = parsed.task;
    const est = estRaw && estRaw > 0 && estRaw <= 2000 ? estRaw : null;
    const estDue = !!est && !t.due_at;
    t.owner_id = person(t.owner_id);
    t.helper_id = person(t.helper_id);
    if (t.workspace_id && !wsIds.has(t.workspace_id)) t.workspace_id = null;
    if (t.due_at && Number.isNaN(Date.parse(t.due_at))) t.due_at = null;
    if (estDue) t.due_at = dueFromHours(est! + queueHoursOf(person(t.owner_id)), perDayOf(person(t.owner_id)));
    const ac = body.apply_create;
    const others = ac ? [] : [...new Set((alsoFor ?? []).map(person).filter((x): x is string => !!x && x !== t.owner_id))];
    const dup = ac ? null : findDuplicate(t.title, t.owner_id);
    const proposed = { ...t, objective_id: wantObjective, estimate_hours: est };
    if (others.length && t.owner_id) {
      // several people: one task each, or one shared task? (nothing saved yet)
      const people = [t.owner_id, ...others].map((id) => ({ id, name: displayName(id) }));
      peopleChoice = { task: proposed, people, can_share: people.length === 2 };
      const names = people.map((x) => x.name?.split(' ')[0]).filter(Boolean) as string[];
      const list = names.length > 1 ? `${names.slice(0, -1).join(ar0 ? '، ' : ', ')}${ar0 ? ' و' : ' and '}${names.at(-1)}` : (names[0] ?? '');
      // a task has one owner + one helper, so "shared" only exists for two people
      const lead = names[0] ?? '';
      parsed.reply =
        people.length === 2
          ? ar0
            ? `«${t.title}» لـ${list}: تبيها مهمة لكل واحد، ولا مهمة وحدة يشتركون فيها؟`
            : `"${t.title}" for ${list}: one task each, or one shared task?`
          : ar0
            ? `«${t.title}» لـ${list}: أسوي مهمة لكل واحد، ولا بس لـ${lead}؟`
            : `"${t.title}" for ${list}: one task each, or only ${lead}?`;
      parsed.suggestions = [];
    } else if (dup) {
      const dupRow = dup as unknown as Record<string, unknown>;
      duplicate = {
        task: proposed,
        existing: { id: dup.id, title: dup.title, owner_name: displayName(dup.owner_id), due_at: dup.due_at, status: dup.status },
        // "Update it instead": the new details that would change the open task
        patch: Object.fromEntries(
          Object.entries({
            owner_id: t.owner_id,
            due_at: t.due_at,
            priority: t.priority !== 'medium' ? t.priority : null,
            definition_of_done: t.definition_of_done,
            budget: t.budget,
            goal: t.goal,
          }).filter(([k, v]) => v != null && v !== dupRow[k]),
        ),
      };
      const who = dup.owner_id ? ` (${displayName(dup.owner_id)})` : '';
      parsed.reply = ar0
        ? `فيه مهمة مفتوحة تشبهها: «${dup.title}»${who}. أسوي وحدة جديدة، ولا أحدّث اللي موجودة؟`
        : `There's already an open task like this: "${dup.title}"${who}. Create a new one anyway, or update the existing one?`;
      parsed.suggestions = [];
    } else if (ac?.owner_ids?.length) {
      // chosen on the people card
      const ids = ac.owner_ids.map(person).filter((x): x is string => !!x);
      const shared = ac.mode === 'shared' && ids.length === 2;
      const batches = shared ? [{ ...t, owner_id: ids[0], helper_id: ids[1] }] : ids.map((id) => ({ ...t, owner_id: id }));
      for (const b of batches) {
        const id = await createOne(b, wantObjective);
        createdList.push({ id, title: b.title, owner_name: displayName(b.owner_id), due_at: b.due_at });
      }
      taskId = createdList[0]?.id ?? null;
      action = 'created';
      parsed.reply = shared
        ? ar0
          ? `تم، سجلتها لـ${displayName(ids[0])} و${displayName(ids[1])} يساعده.`
          : `Done: ${displayName(ids[0])} owns it and ${displayName(ids[1])} helps.`
        : ar0
          ? `تم، سويت ${batches.length} مهام، وحدة لكل واحد.`
          : `Done: ${batches.length} tasks, one each.`;
      // one shared task shows its normal card
      if (shared) createdList = [];
    } else {
      taskId = await createOne(t, wantObjective);
      if (est) {
        const { error } = await db.from('tasks').update({ estimate_hours: est }).eq('id', taskId);
        if (error) console.error('estimate save failed', error);
        estimateNote = estimateLine(est, estDue ? t.due_at : null);
      }
      ownerReason = t.owner_reason;
      ownerChanged = !!t.owner_id;
      action = 'created';
    }
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
    if (u.proof) patch.proof_required = u.proof;
    // hours of work: saved on the task; with no due date (now or in this message) it also sets one in working days
    const est = u.estimate_hours && u.estimate_hours > 0 && u.estimate_hours <= 2000 ? u.estimate_hours : null;
    const target0 = taskById.get(u.task_id);
    if (est) {
      patch.estimate_hours = est;
      if (!patch.due_at && !target0?.due_at) {
        const who = (patch.owner_id as string) ?? target0?.owner_id ?? null;
        patch.due_at = dueFromHours(est + queueHoursOf(who, u.task_id), perDayOf(who));
      }
    }
    // objective link: undefined = unchanged, string = link, null = take it out (applied with link_task, not the patch)
    const before = taskById.get(u.task_id);
    const currentObjective = before?.objective_id ?? null;
    let objectiveTarget: string | null | undefined = undefined;
    if (u.unlink_objective) objectiveTarget = currentObjective ? null : undefined;
    else if (linkable(u.objective_id) && u.objective_id !== currentObjective) objectiveTarget = u.objective_id;
    const changes = Object.keys(patch).length > 0 || objectiveTarget !== undefined;
    // direct when the user picked the task (focus / Confirm) or it's the one just discussed; otherwise propose
    const direct = !!body.apply || u.task_id === focus?.id || u.task_id === lastTurnTaskId;
    if (changes && !direct) {
      taskId = u.task_id;
      proposedPatch = {
        ...patch,
        ...(objectiveTarget === undefined ? {} : objectiveTarget ? { objective_id: objectiveTarget } : { unlink_objective: true }),
      };
      ownerReason = patch.owner_id ? u.owner_reason : null;
    } else if (changes) {
      const { estimate_hours: estPatch, proof_required: proofPatch, ...rpcPatch } = patch;
      if (proofPatch) {
        const { error } = await db.from('tasks').update({ proof_required: proofPatch }).eq('id', u.task_id);
        if (error) throw new HttpError(400, error.message);
      }
      if (Object.keys(rpcPatch).length) {
        const { error } = await db.rpc('update_task_from_chat', { p_task: u.task_id, patch: rpcPatch });
        if (error) throw new HttpError(400, error.message);
      }
      if (estPatch) {
        const { error } = await db.from('tasks').update({ estimate_hours: estPatch }).eq('id', u.task_id);
        if (error) throw new HttpError(400, error.message);
        estimateNote = estimateLine(estPatch as number, (rpcPatch.due_at as string) ?? null);
      }
      if (objectiveTarget !== undefined && before) {
        const failed = await linkTask(before, objectiveTarget, currentObjective, body.apply ? 'Confirmed in the chat' : 'Asked in the chat');
        if (failed) throw new HttpError(400, failed);
      }
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

  // ── status of one task: changed right away (Undo on the card) ──
  if (parsed.action === 'status' && parsed.status_change) {
    const sc = parsed.status_change;
    const tid = focus?.id ?? (taskIds.has(sc.task_id) ? sc.task_id : null);
    const t = tid ? taskById.get(tid)! : null;
    if (!t) {
      parsed.reply = ar0 ? 'ما لقيت المهمة اللي تقصدها، وش اسمها؟' : "I couldn't find that task. What's it called?";
    } else {
      // one clear task: change it now (anyone allowed — owner, assigner, any manager above — no extra ask);
      // the card offers Undo and the owner is told (push + Alerts)
      const { data, error } = await db.rpc('set_task_status', { p_task: t.id, p_status: sc.status, p_note: sc.note });
      if (error) throw new HttpError(400, error.message);
      const result = data as string;
      taskId = t.id;
      action = 'updated';
      const { data: log } = await db
        .from('activity_log')
        .select('id')
        .eq('task_id', t.id)
        .eq('action', 'task_status_changed')
        .eq('actor_id', profileId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      undoLogId = (log?.id as string | undefined) ?? null;
      const reviewer = displayName(t.assigner_id !== profileId ? t.assigner_id : (meRow?.manager_id ?? null));
      const title = t.title;
      const replies: Record<string, [string, string]> = {
        done: [`Done ✅ "${title}" is closed.`, `تم ✅ قفلت «${title}».`],
        submitted: [
          `Nice! "${title}" is sent to ${reviewer ?? 'your manager'} for review. I'll tell you when it's approved.`,
          `حلو! أرسلت «${title}» ${reviewer ? `لـ${reviewer} ` : ''}يراجعها، وأعلمك إذا اعتمدها.`,
        ],
        blocked: sc.note
          ? [`Got it, "${title}" is blocked (${sc.note}). I've noted it so whoever can help sees it.`, `سجلت إن «${title}» واقفة (${sc.note}). كتبتها عشان يشوفها اللي يقدر يساعد.`]
          : [`Got it, "${title}" is blocked. What's in the way? I'll tell whoever can help.`, `سجلت إن «${title}» واقفة. وش اللي موقفها؟ أبلّغ اللي يقدر يساعد.`],
        in_progress: [`OK, "${title}" is in progress.`, `تمام، «${title}» صارت قيد التنفيذ.`],
      };
      const r = replies[result] ?? [`Done, "${title}" is open again.`, `تم، «${title}» رجعت مفتوحة.`];
      parsed.reply = ar0 ? r[1] : r[0];
      parsed.suggestions = [];
      // the owner (when it's someone else's task) and the reviewer (submitted) are told through alerts:
      // the activity_log and reviews triggers write them, deliverNow() below pushes them
    }
  }

  // ── the same change on many tasks: always a preview first ──
  if (parsed.action === 'bulk' && parsed.bulk) {
    const b = parsed.bulk;
    const ch = b.change;
    if (ch.kind === 'owner') ch.owner_id = person(ch.owner_id);
    if (ch.due_at && Number.isNaN(Date.parse(ch.due_at))) ch.due_at = null;
    const incomplete =
      (ch.kind === 'status' && !ch.status) ||
      (ch.kind === 'due' && !ch.due_at) ||
      (ch.kind === 'priority' && !ch.priority) ||
      (ch.kind === 'owner' && !ch.owner_id);
    if (incomplete) {
      parsed.reply = ar0 ? 'وش التغيير اللي تبيه بالضبط؟' : 'What exactly should I change on them?';
    } else {
      const pool = allTasks.filter((t) => {
        if (ch.kind === 'status') {
          if (ch.status === 'reopen') return t.status === 'done' || t.status === 'submitted';
          if (ch.status === 'done') return t.status !== 'done' && t.status !== 'cancelled';
          return ACTIVE.includes(t.status) && t.status !== ch.status;
        }
        if (ch.kind === 'delete') return true;
        return ACTIVE.includes(t.status);
      });
      const f = b.filter;
      const word = f.title_contains?.toLowerCase().trim();
      const before = f.due_before && !Number.isNaN(Date.parse(f.due_before)) ? Date.parse(f.due_before) : null;
      const picked = b.task_ids.length
        ? pool.filter((t) => b.task_ids.includes(t.id))
        : pool.filter(
            (t) =>
              (!f.mine_only || t.owner_id === profileId) &&
              (!f.owner_id || t.owner_id === f.owner_id) &&
              (!f.assigned_by_me || (t.assigner_id === profileId && t.owner_id !== profileId)) &&
              (!f.priority || t.priority === f.priority) &&
              (!f.late_only || (!!t.due_at && new Date(t.due_at) < now)) &&
              (!before || (!!t.due_at && Date.parse(t.due_at) < before)) &&
              (!word || t.title.toLowerCase().includes(word)) &&
              (!f.objective_id || t.objective_id === f.objective_id),
          );
      bulkProposal = buildBulk(picked, ch);
      parsed.reply = bulkReply(bulkProposal, picked.length);
    }
    parsed.suggestions = [];
  }

  // ── repeating work: create / change → a card to confirm; skip / pause / resume / stop → right away ──
  if (parsed.action === 'recurring' && parsed.recurring) {
    const rc = parsed.recurring;
    const known = rc.recurring_id ? recurring.find((r) => r.id === rc.recurring_id) : null;
    if (rc.op === 'create' || rc.op === 'update') {
      const r = proposeRecurring(rc, known ?? null, { person, nameOf: displayName, ar: ar0 });
      if ('error' in r) parsed.reply = r.error;
      else {
        recurringProposal = r.proposal;
        parsed.reply = r.reply;
      }
    } else if (!known) {
      parsed.reply = ar0 ? 'ما لقيت المهمة المتكررة اللي تقصدها.' : "I couldn't find that recurring task.";
    } else {
      const until = rc.op === 'pause' && rc.pause_until && /^\d{4}-\d{2}-\d{2}$/.test(rc.pause_until) ? rc.pause_until : null;
      if (rc.op === 'pause' && !until) {
        parsed.reply = ar0 ? 'أوقفها لين متى؟' : 'Pause it until when?';
      } else {
        const { error } = await db.rpc('recurring_action', { p_id: known.id, p_action: rc.op, p_until: until });
        if (error) throw new HttpError(400, error.message);
        const next = known.next_due_at ? fmtDue(known.next_due_at) : '';
        const title = known.title;
        const lines: Record<string, [string, string]> = {
          skip_next: [`OK, I'll skip the next "${title}" (${next}).`, `تمام، بتخطى «${title}» الجاية (${next}).`],
          pause: [`Paused "${title}" until ${until}.`, `وقّفت «${title}» لين ${until}.`],
          resume: [`"${title}" is back on.`, `رجّعت «${title}» تشتغل.`],
          stop: [`Stopped "${title}". No more new ones.`, `أوقفت «${title}». ما راح تنضاف مهام جديدة.`],
        };
        parsed.reply = ar0 ? lines[rc.op][1] : lines[rc.op][0];
      }
    }
    parsed.suggestions = [];
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

  // ── objective change: never applied from a message, only proposed (the user confirms on a card → apply_objective) ──
  let objectiveProposal: ObjectiveProposal | null = null;
  if (parsed.action === 'objective') {
    const ar = parsed.language === 'ar';
    const r = parsed.objective
      ? proposeObjective(parsed.objective, {
          objectives: liveObjectives,
          team,
          meId: profileId,
          amAdmin,
          isBelow,
          canEdit: canEditObjective,
          openCount: (id) => open.filter((t) => t.objective_id === id).length,
          nameOf: (id) => {
            const p = id ? everyone.find((x) => x.id === id) : null;
            return p ? ((ar ? p.full_name_ar : null) ?? p.full_name) : null;
          },
          ar,
        })
      : { error: ar ? 'ما فهمت وش تبي تغيّر في الهدف، وضّح لي أكثر؟' : "I didn't catch the objective change. Can you say it another way?" };
    if ('error' in r) parsed.reply = r.error;
    else {
      objectiveProposal = r.proposal;
      parsed.reply = r.reply;
    }
    parsed.suggestions = [];
  }

  // ── accounts: create (super admin), switch, list — done right away, the server words the reply ──
  let accountPayload: Record<string, unknown> | null = null;
  if (parsed.action === 'account' && parsed.account) {
    const r = await runAccount(db, parsed.account, myAccounts, meRow?.role === 'super_admin', parsed.language === 'ar');
    parsed.reply = r.reply;
    accountPayload = r.payload;
    parsed.suggestions = [];
  }

  // ── task card snapshot ──
  let payload: Record<string, unknown> | null = null;
  if (recurringProposal) {
    payload = { recurring_proposal: recurringProposal };
  } else if (bulkProposal) {
    payload = { bulk_proposal: bulkProposal };
  } else if (peopleChoice) {
    payload = { people_choice: peopleChoice };
  } else if (duplicate) {
    payload = { duplicate };
  } else if (createdList.length > 1) {
    payload = { created_list: createdList };
  } else if (orgProposal) {
    payload = { org_proposal: orgProposal };
  } else if (objectiveProposal) {
    payload = { objective_proposal: objectiveProposal };
  } else if (taskId) {
    const { data: row } = await db.from('tasks').select(TASK_COLS).eq('id', taskId).single();
    if (row) {
      const t = row as TaskRow;
      const ar = parsed.language === 'ar';
      let suggestions = action === 'created' || action === 'updated' ? parsed.suggestions.slice(0, 3) : [];
      // the date was just set from the estimate: don't offer to set one
      if (estimateNote && t.due_at) suggestions = suggestions.filter((x) => !/deadline|due|موعد|تسليم/i.test(x));
      // no objective yet: offer one link when there is an obvious candidate and the model didn't already
      if (suggestions.length < 3 && (action === 'created' || action === 'updated') && !t.objective_id) {
        const active = liveObjectives.filter((o) => o.status === 'active');
        const already = suggestions.some((s) => /objective|هدف/i.test(s) || active.some((o) => s.includes(o.title) || (o.title_ar && s.includes(o.title_ar))));
        // one active objective, or exactly one owned by this task's owner
        const ownerMatches = t.owner_id ? active.filter((o) => o.owner_id === t.owner_id) : [];
        const pick = active.length === 1 ? active[0] : ownerMatches.length === 1 ? ownerMatches[0] : null;
        if (pick && !already) {
          const title = (ar ? pick.title_ar : null) ?? pick.title;
          suggestions = [...suggestions, ar ? `اربطها بهدف «${title}»` : `Link it to «${title}»`];
        }
      }
      // the receipt's "next check-in": Muntej's next scheduled follow-up on it (not the hand-off message itself)
      const { data: nextFollowup } = await db
        .from('followups')
        .select('scheduled_at')
        .eq('task_id', t.id)
        .eq('status', 'scheduled')
        .gt('scheduled_at', new Date(Date.now() + 60_000).toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      payload = {
        next_check_at: nextFollowup?.scheduled_at ?? null,
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
        objective_id: t.objective_id,
        objective_title: objectiveTitle(t.objective_id, ar),
        estimate_hours: t.estimate_hours,
        prediction: predict(t),
        suggestions,
        ...(confirmDelete ? { confirm_delete: true } : {}),
        ...(undoLogId ? { undo_log_id: undoLogId } : {}),
        ...(proposedPatch
          ? {
              confirm_update: true,
              proposed_patch: proposedPatch,
              proposed_owner_name: nameOf((proposedPatch.owner_id as string) ?? null),
              ...(proposedPatch.objective_id ? { proposed_objective_title: objectiveTitle(proposedPatch.objective_id as string, ar) } : {}),
            }
          : {}),
      };
    }
  } else if (parsed.action === 'none' && parsed.candidates.length >= 2) {
    // several tasks fit the description: let the user pick one (the app re-sends the message focused on it)
    const picks = parsed.candidates.filter((id) => taskById.has(id)).slice(0, 3).map((id) => {
      const t = taskById.get(id)!;
      return { id, title: t.title, owner_name: nameOf(t.owner_id), due_at: t.due_at };
    });
    if (picks.length >= 2) payload = { candidates: picks, original_message: message };
  } else if (parsed.action === 'none' && parsed.brief?.rows.length) {
    const brief = await buildBrief(parsed.brief, parsed.language === 'ar');
    if (brief.rows.length) {
      payload = { brief, suggestions: parsed.suggestions.slice(0, 2) };
      // the table says it all: keep the reply to one short lead-in line
      const lead = parsed.reply.split(/(?<=[.!؟?:])\s+/)[0].trim();
      parsed.reply = lead.length && lead.length <= 90 ? lead : parsed.language === 'ar' ? 'هذا وضع فريقك اليوم:' : "Here's your team today:";
    }
  }

  /**
   * The model's table → rows the app can show and act on. For each problem row on someone else's task the caller
   * manages, Muntej does the safe part itself (a reminder / check-in, at most once a day per task, logged) and offers
   * ONE change for a tap (move it to the teammate with the most free time, or 2 more working days). Never applied here.
   */
  async function buildBrief(raw: z.infer<typeof Brief>, ar: boolean): Promise<BriefOut> {
    const admin = adminClient();
    const fn = (id: string | null) => {
      const p = id ? byId.get(id) : undefined;
      return p ? ((ar && p.full_name_ar) || p.full_name).split(' ')[0] : null;
    };
    const canManage = (t: TaskRow) => t.assigner_id === profileId || amAdmin || (!!t.owner_id && isBelow(t.owner_id, profileId));
    // hours already promised to someone by an earlier row of this same brief ("Do all" must not pile everything on one person)
    const reserved = new Map<string, number>();
    const freeOf = (id: string) => Number(byId.get(id)?.weekly_capacity_hours ?? 40) - queueHoursOf(id) - (reserved.get(id) ?? 0);
    const hoursOfTask = (t: TaskRow) => (t.estimate_hours ? Number(t.estimate_hours) : t.owner_id ? speedOf(t.owner_id).defaultHours : 4);
    /** the teammate (same manager as the owner, or the caller's own reports) with the most free hours for this task */
    const freestFor = (t: TaskRow) => {
      const boss = (t.owner_id && byId.get(t.owner_id)?.manager_id) || profileId;
      let best: { id: string; free: number } | null = null;
      for (const p of team) {
        if (p.id === t.owner_id || p.status !== 'active' || p.manager_id !== boss || !seesTasksOf(p.id)) continue;
        const free = freeOf(p.id);
        if (free - hoursOfTask(t) >= 4 && (!best || free > best.free)) best = { id: p.id, free };
      }
      return best;
    };
    const late = (t: TaskRow) => !!t.due_at && Date.parse(t.due_at) < now.getTime();
    const prRank: Record<string, number> = { low: 0, medium: 1, high: 2, urgent: 3 };
    /** the task a person row is about: late first, then blocked; overloaded → the least urgent one */
    const taskForPerson = (pid: string, status: string, used: Set<string>) => {
      const mine = open.filter((t) => t.owner_id === pid && t.status !== 'submitted' && !used.has(t.id));
      if (status === 'overloaded')
        return mine
          .filter((t) => !late(t))
          .sort((a, b) => prRank[a.priority] - prRank[b.priority] || Date.parse(b.due_at ?? '2999-01-01') - Date.parse(a.due_at ?? '2999-01-01'))[0];
      if (status === 'blocked') return mine.find((t) => t.status === 'blocked');
      return mine.filter(late).sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!))[0] ?? mine.find((t) => t.status === 'blocked');
    };

    const rows: BriefOut['rows'] = [];
    const used = new Set<string>();
    for (const r of raw.rows.slice(0, 6)) {
      let task = r.task_id ? taskById.get(r.task_id) ?? null : null;
      if (task && (!ACTIVE.includes(task.status) || used.has(task.id))) task = null;
      const pid = r.person_id && byId.has(r.person_id) ? r.person_id : (task?.owner_id ?? null);
      if (!task && pid && ['late', 'blocked', 'overloaded', 'at_risk'].includes(r.status)) task = taskForPerson(pid, r.status, used) ?? null;
      if (!pid && !task) continue;
      if (task) used.add(task.id);
      // the model sometimes repeats the task name as the note
      let note = r.note.trim();
      if (task && (note === task.title || note.includes(task.title))) note = note.replace(task.title, '').replace(/^[\s·:،,-]+|[\s·:،,-]+$/g, '');
      rows.push({
        key: `${pid ?? '-'}:${task?.id ?? '-'}:${r.status}`,
        status: r.status,
        person_id: pid,
        person_name: fn(pid),
        task_id: task?.id ?? null,
        task_title: task?.title ?? null,
        metric: r.metric,
        note,
        auto: null,
        action: null,
      });
    }

    // ── what Muntej already did today on these tasks (autopilot or an earlier brief) ──
    const dayStart = new Date(Date.UTC(riyadh.getUTCFullYear(), riyadh.getUTCMonth(), riyadh.getUTCDate()) - 3 * 3_600_000).toISOString();
    const ids = rows.map((r) => r.task_id).filter((x): x is string => !!x);
    const { data: markRows } = ids.length
      ? await admin.from('autopilot_marks').select('key, task_id, created_at').in('task_id', ids).gte('created_at', dayStart)
      : { data: [] };
    const doneToday = new Map<string, string>();
    for (const m of (markRows ?? []) as { key: string; task_id: string; created_at: string }[]) {
      if (/^(chase|blocked|step|brief):/.test(m.key) && !doneToday.has(m.task_id)) doneToday.set(m.task_id, m.created_at);
    }

    const me = fn(profileId) ?? '';
    const meAr = (byId.get(profileId)?.full_name_ar ?? byId.get(profileId)?.full_name ?? '').split(' ')[0];
    let sent = 0;
    for (const row of rows) {
      const t = row.task_id ? taskById.get(row.task_id)! : null;
      if (!t || t.owner_id === profileId || !canManage(t)) continue;
      if (!['late', 'blocked', 'overloaded', 'at_risk', 'unassigned'].includes(row.status)) continue;

      // the safe part, by Muntej itself
      if (t.owner_id && row.status !== 'unassigned') {
        const at = doneToday.get(t.id);
        if (at) row.auto = { kind: row.status === 'blocked' ? 'checked_in' : 'reminded', at, now: false };
        else if (sent < 5) {
          const text =
            row.status === 'blocked'
              ? {
                  message: `${me} asked about "${t.title}". What's blocking it? Tell me who or what you're waiting for, and I'll chase it.`,
                  message_ar: `${meAr} سأل عن «${t.title}». وش اللي موقفها؟ قل لي مين أو وش تنتظر وأنا ألاحقه.`,
                }
              : row.status === 'overloaded'
                ? {
                    message: `Your plate looks full this week. Is "${t.title}" still on track? If something should move, tell me and I'll sort it with ${me}.`,
                    message_ar: `جدولك مليان هالأسبوع. «${t.title}» ماشية؟ لو فيه شي لازم ينتقل قل لي وأرتبه مع ${meAr}.`,
                  }
                : {
                    message: `${me} asked about "${t.title}"${t.due_at ? ` (due ${new Date(t.due_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Riyadh', weekday: 'long', day: 'numeric', month: 'short' })})` : ''}. Where is it now? If you need more time or help, reply and I'll sort it.`,
                    message_ar: `${meAr} سأل عن «${t.title}». وين وصلت؟ لو تحتاج وقت أو مساعدة رد علي وأنا أتصرف.`,
                  };
          const { error: fe } = await admin
            .from('followups')
            .insert({ task_id: t.id, recipient_id: t.owner_id, scheduled_at: now.toISOString(), channel: 'push', status: 'scheduled', ...text });
          if (!fe) {
            sent++;
            const dayKey = riyadh.toISOString().slice(0, 10);
            await admin.from('autopilot_marks').insert({ key: `brief:${t.id}:${dayKey}`, task_id: t.id, profile_id: t.owner_id });
            await admin.from('activity_log').insert({
              actor_type: 'muntej',
              subject_id: t.owner_id,
              task_id: t.id,
              action: row.status === 'blocked' ? 'checked_in' : 'reminded',
              summary: `${row.status === 'blocked' ? 'Asked' : 'Reminded'} ${fn(t.owner_id)} about "${t.title}"`,
              summary_ar: `${row.status === 'blocked' ? 'سأل' : 'ذكّر'} ${fn(t.owner_id)} عن «${t.title}»`,
              reason: `${me} asked about the team in the chat`,
              undoable: false,
            });
            row.auto = { kind: row.status === 'blocked' ? 'checked_in' : 'reminded', at: now.toISOString(), now: true };
          }
        }
      }

      // the change, for one tap
      if (row.status === 'blocked') continue;
      const to = freestFor(t);
      if (to) {
        reserved.set(to.id, (reserved.get(to.id) ?? 0) + hoursOfTask(t));
        row.action = { kind: 'owner', task_id: t.id, owner_id: to.id, to_name: fn(to.id), free_hours: Math.round(to.free), due_at: null };
      } else if (row.status === 'late' || row.status === 'at_risk') {
        const due = workingDaysAhead17(now.getTime(), 2);
        row.action = { kind: 'due', task_id: t.id, owner_id: null, to_name: null, free_hours: null, due_at: new Date(due).toISOString() };
      }
    }
    return { headline: raw.headline, rows };
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
    if (proposedPatch.objective_id) {
      const o = objectiveTitle(proposedPatch.objective_id as string, ar);
      parts.push(ar ? `تتبع هدف «${o}»` : `objective → «${o}»`);
    }
    if (proposedPatch.unlink_objective) parts.push(ar ? 'تطلع من هدفها' : 'out of its objective');
    parsed.reply = ar
      ? `تقصد مهمة «${t.title}»${owner ? ` (${owner})` : ''}؟ بعدّل: ${parts.join('، ')}. أكّد لي وأسويها.`
      : `Do you mean "${t.title}"${owner ? ` (${owner})` : ''}? I'll change: ${parts.join(', ')}. Confirm and I'll do it.`;
  }

  if (accountPayload) payload = accountPayload;

  if (estimateNote && (action === 'created' || action === 'updated')) parsed.reply = `${parsed.reply} ${estimateNote}`;

  // ── save both messages (user first, so ordering is stable) ──
  // a Confirm tap / card choice has no user message of its own
  let userMsg: unknown = null;
  if (!tapped) {
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

  // ── tell the people this changed things for (new owner, reviewer, …): alerts written by the triggers ──
  await deliverNow();

  // "switch to X": only now, once both messages are saved under the current account's profile (saving them after
  // the switch would be refused: the chat would belong to a profile in the other account)
  const switchTo = (accountPayload?.account_switched as { id?: string } | undefined)?.id;
  if (switchTo) {
    const { error: e3 } = await db.rpc('switch_account', { p_account: switchTo });
    if (e3) throw new HttpError(400, e3.message);
  }

  return json({ messages: userMsg ? [userMsg, botMsg] : [botMsg] });
});

// ─── working hours (Riyadh, Sunday–Thursday, the day starts 08:00) ───────────────

const RIYADH_MS = 3 * 3_600_000;
const WORK_START_HOUR = 8;

/** start + `hours` of work, counting only working time (perDay hours from 08:00, Sun–Thu). */
function addWorkingHours(start: Date, hours: number, perDay: number): Date {
  let t = start.getTime() + RIYADH_MS; // Riyadh wall clock, read with getUTC*
  let left = Math.max(0, hours);
  for (let i = 0; i < 2000; i++) {
    const d = new Date(t);
    const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), WORK_START_HOUR);
    const dayEnd = dayStart + perDay * 3_600_000;
    const dow = d.getUTCDay();
    if (dow === 5 || dow === 6 || t >= dayEnd) {
      t = dayStart + DAY;
      continue;
    }
    if (t < dayStart) t = dayStart;
    const avail = (dayEnd - t) / 3_600_000;
    if (left <= avail) return new Date(t + left * 3_600_000 - RIYADH_MS);
    left -= avail;
    t = dayStart + DAY;
  }
  return new Date(t - RIYADH_MS);
}

/** working hours between two moments (same rules as addWorkingHours) */
function workingHoursBetween(a: Date, b: Date, perDay: number): number {
  let t = a.getTime() + RIYADH_MS;
  const end = b.getTime() + RIYADH_MS;
  let sum = 0;
  for (let i = 0; i < 400 && t < end; i++) {
    const d = new Date(t);
    const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), WORK_START_HOUR);
    const dayEnd = dayStart + perDay * 3_600_000;
    const dow = d.getUTCDay();
    if (dow !== 5 && dow !== 6) sum += Math.max(0, Math.min(end, dayEnd) - Math.max(t, dayStart)) / 3_600_000;
    t = dayStart + DAY - WORK_START_HOUR * 3_600_000; // next midnight
  }
  return sum;
}

/** due date for `hours` of work starting now: 17:00 (Riyadh) on the working day it would be finished */
function dueFromHours(hours: number, perDay: number): string {
  const finish = new Date(addWorkingHours(new Date(), hours, perDay).getTime() + RIYADH_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  const endHour = Math.max(17, Math.ceil(WORK_START_HOUR + perDay));
  return `${finish.getUTCFullYear()}-${pad(finish.getUTCMonth() + 1)}-${pad(finish.getUTCDate())}T${pad(Math.min(endHour, 23))}:00:00+03:00`;
}

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function fmtRiyadh(iso: string, ar: boolean) {
  return new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-GB', {
    timeZone: 'Asia/Riyadh',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

// ─── recurring tasks ──────────────────────────────────────────────────────────────

const RECURRING_COLS =
  'id, title, owner_id, rotation, freq, every, weekdays, month_day, time_of_day, starts_on, ends_on, next_due_at, paused_until, skip_next, priority, definition_of_done, estimate_hours, last_task_id';
type RecurringRow = {
  id: string;
  title: string;
  owner_id: string | null;
  rotation: string[];
  freq: 'daily' | 'weekdays' | 'weekly' | 'monthly';
  every: number;
  weekdays: number[];
  month_day: number | null;
  time_of_day: string;
  starts_on: string;
  ends_on: string | null;
  next_due_at: string | null;
  paused_until: string | null;
  skip_next: boolean;
  priority: string;
  definition_of_done: string | null;
  estimate_hours: number | null;
  last_task_id: string | null;
};
type RecurringProposal = {
  op: 'create' | 'update';
  recurring_id: string | null;
  title: string;
  /** exactly what apply_recurring sends to upsert_recurring (minus id) */
  patch: Record<string, unknown>;
  summary_lines: string[];
};
/** keys upsert_recurring accepts from a chat proposal */
const RECURRING_KEYS = [
  'title', 'owner_id', 'rotation', 'priority', 'definition_of_done', 'estimate_hours',
  'freq', 'every', 'weekdays', 'month_day', 'time_of_day', 'starts_on', 'ends_on',
] as const;

const DAY_NAMES = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
};

/** "Every Monday at 10:00", "Every workday at 08:30", "Monthly on the 1st at 17:00" (+ Arabic) */
function scheduleText(
  r: Pick<RecurringRow, 'freq' | 'every' | 'weekdays' | 'month_day' | 'time_of_day'> & { starts_on?: string | null },
  ar: boolean,
): string {
  const time = (r.time_of_day ?? '17:00').slice(0, 5);
  const every = r.every && r.every > 1 ? r.every : 1;
  const days = (r.weekdays ?? []).map((d) => DAY_NAMES[ar ? 'ar' : 'en'][d]).filter(Boolean);
  const dayList = days.join(ar ? ' و' : ' & ');
  if (r.freq === 'weekdays') return ar ? `كل يوم عمل (أحد–خميس) الساعة ${time}` : `Every workday (Sun–Thu) at ${time}`;
  if (r.freq === 'daily') return ar ? (every > 1 ? `كل ${every} أيام الساعة ${time}` : `كل يوم الساعة ${time}`) : every > 1 ? `Every ${every} days at ${time}` : `Every day at ${time}`;
  if (r.freq === 'monthly') {
    const md = r.month_day ?? 1;
    const dayTxt = md === -1 ? (ar ? 'آخر يوم' : 'the last day') : ar ? `يوم ${md}` : `the ${md}${md === 1 || md === 21 || md === 31 ? 'st' : md === 2 || md === 22 ? 'nd' : md === 3 || md === 23 ? 'rd' : 'th'}`;
    return ar
      ? `${every > 1 ? `كل ${every} شهور` : 'كل شهر'} ${dayTxt} الساعة ${time} (الجمعة والسبت ← الأحد)`
      : `${every > 1 ? `Every ${every} months` : 'Monthly'} on ${dayTxt} at ${time} (Fri/Sat → Sunday)`;
  }
  const on = dayList || (ar ? 'نفس يوم البداية' : 'the start day');
  return ar
    ? `${every === 2 ? 'كل أسبوعين' : every > 2 ? `كل ${every} أسابيع` : 'كل أسبوع'} يوم ${on} الساعة ${time}`
    : `${every === 2 ? 'Every other week' : every > 2 ? `Every ${every} weeks` : 'Every week'} on ${on} at ${time}`;
}

/** Turns the model's recurring change into a card; nothing is saved until Confirm (→ applyRecurring). */
function proposeRecurring(
  rc: z.infer<typeof RecurringChange>,
  known: RecurringRow | null,
  ctx: { person: (id: string | null) => string | null; nameOf: (id: string | null) => string | null; ar: boolean },
): { proposal: RecurringProposal; reply: string } | { error: string } {
  const { ar } = ctx;
  const f = rc.fields;
  if (rc.op === 'update' && !known) return { error: ar ? 'ما لقيت المهمة المتكررة اللي تقصدها.' : "I couldn't find that recurring task." };
  const patch: Record<string, unknown> = {};
  const title = (f.title?.trim() || known?.title || '').slice(0, 200);
  if (!title) return { error: ar ? 'وش اسم المهمة اللي تتكرر؟' : "What's the repeating task called?" };
  if (f.title?.trim() && f.title.trim() !== known?.title) patch.title = f.title.trim();
  const owner = ctx.person(f.owner_id);
  if (owner) patch.owner_id = owner;
  const rotation = [...new Set(f.rotation_ids.map(ctx.person).filter((x): x is string => !!x))];
  if (rotation.length >= 2) {
    patch.rotation = rotation;
    patch.owner_id = rotation[0];
  }
  const freq = f.freq ?? known?.freq ?? null;
  if (!freq) return { error: ar ? 'كل كم مرة تتكرر؟ يومياً، أسبوعياً ولا شهرياً؟' : 'How often should it repeat: daily, weekly or monthly?' };
  if (f.freq) patch.freq = f.freq;
  if (f.every && f.every >= 1) patch.every = Math.min(12, Math.round(f.every));
  const weekdays = [...new Set(f.weekdays.map((d) => Math.round(d)).filter((d) => d >= 0 && d <= 6))].sort();
  if (weekdays.length) patch.weekdays = weekdays;
  if (f.month_day && (f.month_day === -1 || (f.month_day >= 1 && f.month_day <= 31))) patch.month_day = Math.round(f.month_day);
  else if (rc.op === 'create' && freq === 'monthly') patch.month_day = 1;
  if (f.time_of_day && /^\d{1,2}:\d{2}$/.test(f.time_of_day)) patch.time_of_day = f.time_of_day.padStart(5, '0');
  const isDate = (x: string | null) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x);
  if (isDate(f.starts_on)) patch.starts_on = f.starts_on;
  if (isDate(f.ends_on)) patch.ends_on = f.ends_on;
  if (f.priority) patch.priority = f.priority;
  if (f.definition_of_done) patch.definition_of_done = f.definition_of_done;
  if (f.estimate_hours && f.estimate_hours > 0) patch.estimate_hours = f.estimate_hours;
  if (rc.op === 'create') patch.title = title;
  if (rc.op === 'update' && Object.keys(patch).length === 0) return { error: ar ? 'وش تبي تغيّر فيها؟' : 'What should I change about it?' };

  const merged = {
    freq,
    every: (patch.every as number) ?? known?.every ?? 1,
    weekdays: (patch.weekdays as number[]) ?? known?.weekdays ?? [],
    month_day: (patch.month_day as number) ?? known?.month_day ?? null,
    time_of_day: (patch.time_of_day as string) ?? known?.time_of_day ?? '17:00',
  };
  const schedule = scheduleText(merged, ar);
  const rot = (patch.rotation as string[] | undefined) ?? (known?.rotation.length ? known.rotation : null);
  const who = rot
    ? (ar ? 'بالتناوب: ' : 'Taking turns: ') + rot.map((id) => ctx.nameOf(id)?.split(' ')[0]).join(ar ? ' ← ' : ' → ')
    : (patch.owner_id ?? known?.owner_id)
      ? (ar ? 'المسؤول: ' : 'Owner: ') + ctx.nameOf((patch.owner_id as string) ?? known!.owner_id)
      : ar
        ? 'بدون مسؤول (حدد واحد لاحقاً)'
        : 'No owner yet (you can name one later)';
  const lines = [schedule, who];
  if (patch.starts_on) lines.push((ar ? 'تبدأ: ' : 'Starts: ') + patch.starts_on);
  if (patch.ends_on) lines.push((ar ? 'تنتهي: ' : 'Ends: ') + patch.ends_on);
  if (patch.estimate_hours) lines.push((ar ? 'التقدير: ' : 'Estimate: ') + patch.estimate_hours + (ar ? ' ساعة' : ' h'));
  if (patch.definition_of_done) lines.push((ar ? 'تعتبر خالصة: ' : 'Done when: ') + patch.definition_of_done);
  lines.push(
    freq === 'daily' || freq === 'weekdays'
      ? ar ? 'أسويها الليلة اللي قبلها وأذكّر المسؤول.' : 'I create each one the evening before and remind the owner.'
      : ar ? 'أسوي كل وحدة قبل موعدها بـ٣ أيام وأذكّر المسؤول.' : 'I create each one 3 days ahead and remind the owner.',
  );
  const reply =
    rc.op === 'create'
      ? ar
        ? `بسوي «${title}» تتكرر: ${schedule}. أكّد وأنا أتكفل فيها كل مرة.`
        : `I'll set up "${title}" to repeat: ${schedule}. Confirm and I'll handle every one.`
      : ar
        ? `بعدّل «${title}»: ${schedule}. أكّد التعديل؟`
        : `I'll change "${title}": ${schedule}. Confirm?`;
  return { proposal: { op: rc.op === 'update' ? 'update' : 'create', recurring_id: known?.id ?? null, title, patch, summary_lines: lines }, reply };
}

/** Confirm on a recurring card: upsert_recurring as the caller, then say when the next one is. */
async function applyRecurring(
  db: Caller['db'],
  profileId: string,
  raw: { recurring_id: string | null; patch: Record<string, unknown> },
  ar: boolean,
): Promise<Response> {
  const src = raw?.patch ?? {};
  const patch: Record<string, unknown> = {};
  for (const k of RECURRING_KEYS) if (k in src) patch[k] = src[k];
  if (raw?.recurring_id) {
    if (!UUID.test(raw.recurring_id)) throw new HttpError(400, 'Nothing to save');
    patch.id = raw.recurring_id;
  }
  if (Object.keys(patch).length <= (patch.id ? 1 : 0)) throw new HttpError(400, 'Nothing to save');

  const { data: id, error } = await db.rpc('upsert_recurring', { p: patch });
  if (error) throw new HttpError(400, error.message);
  await deliverNow();
  const { data: row } = await db.from('recurring_tasks').select(RECURRING_COLS).eq('id', id as string).single();
  const r = row as RecurringRow | null;
  const next = r?.next_due_at ? fmtRiyadh(r.next_due_at, ar) : null;
  const made = !!r?.last_task_id;
  const reply = r
    ? ar
      ? `تم ✅ «${r.title}» تتكرر ${scheduleText(r, true)}.${made ? ' أول وحدة انضافت للمهام.' : ''}${next ? ` الجاية: ${next}.` : ''}`
      : `Done ✅ "${r.title}" repeats ${scheduleText(r, false).replace(/^E/, 'e')}.${made ? ' The first one is already in the task list.' : ''}${next ? ` Next: ${next}.` : ''}`
    : ar
      ? 'تم، انحفظت.'
      : 'Done, saved.';

  const { data: botMsg, error: e2 } = await db
    .from('chat_messages')
    .insert({
      profile_id: profileId,
      role: 'assistant',
      content: reply,
      task_id: null,
      action: 'none',
      payload: { recurring_done: { id, title: r?.title ?? '', next_due_at: r?.next_due_at ?? null } },
    })
    .select()
    .single();
  if (e2) throw new HttpError(500, e2.message);
  return json({ messages: [botMsg] });
}

// ─── status + bulk changes ───────────────────────────────────────────────────────

type NewTaskT = z.infer<typeof NewTask>;
type BulkChangeT = z.infer<typeof BulkChange>;
type BulkItem = { id: string; title: string; owner_name: string | null; due_at: string | null; status: string; to_status: string };
type BulkProposal = {
  /** exactly what apply_bulk sends to bulk_update_tasks */
  change: Record<string, unknown>;
  /** one line for the card, in the conversation language */
  label: string;
  items: BulkItem[];
  /** matching tasks left out because the user may not change them */
  skipped: number;
  /** how many go to review (submitted) instead of closing */
  review: number;
};

const BULK_KINDS = ['status', 'due', 'priority', 'owner', 'cancel', 'delete'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Apply tapped on a bulk preview: run bulk_update_tasks as the caller and report what happened (Undo for 5 min). */
async function applyBulk(
  db: Caller['db'],
  profileId: string,
  raw: { ids: string[]; change: Record<string, unknown> },
  ar: boolean,
): Promise<Response> {
  const ids = Array.isArray(raw?.ids) ? raw.ids.filter((x) => typeof x === 'string' && UUID.test(x)).slice(0, 100) : [];
  const src = raw?.change ?? {};
  const kind = typeof src.kind === 'string' ? src.kind : '';
  if (!ids.length || !BULK_KINDS.includes(kind)) throw new HttpError(400, 'Nothing to change');
  const change: Record<string, unknown> = { kind };
  for (const k of ['status', 'due_at', 'priority', 'owner_id']) if (typeof src[k] === 'string') change[k] = src[k];

  const { data, error } = await db.rpc('bulk_update_tasks', { p_ids: ids, p_change: change });
  if (error) throw new HttpError(400, error.message);
  const r = data as {
    log_id: string | null;
    ok: { id: string; title: string; status: string; owner_id: string | null }[];
    failed: { id: string; title: string | null; error: string }[];
  };
  const submitted = r.ok.filter((x) => x.status === 'submitted').length;

  // the people whose tasks someone else changed are told through alerts (one per task, grouped into one push)
  await deliverNow();
  const changed = r.ok.length - submitted;

  const parts: string[] = [];
  if (kind === 'delete') parts.push(ar ? `حذفت ${r.ok.length}` : `${r.ok.length} deleted`);
  else if (changed) parts.push(ar ? `تم تعديل ${changed}` : `${changed} updated`);
  if (submitted) parts.push(ar ? `${submitted} راحت للمراجعة` : `${submitted} sent for review`);
  if (r.failed.length) parts.push(ar ? `${r.failed.length} ما تعدّلت` : `${r.failed.length} couldn't be changed`);
  const reply = r.ok.length
    ? (ar ? 'تم ✅ ' : 'Done ✅ ') + parts.join(ar ? '، ' : ', ') + '.'
    : ar
      ? 'ما قدرت أعدّل ولا وحدة منها.'
      : "I couldn't change any of them.";

  const { data: botMsg, error: e2 } = await db
    .from('chat_messages')
    .insert({
      profile_id: profileId,
      role: 'assistant',
      content: reply,
      task_id: null,
      action: 'none',
      payload: {
        bulk_done: {
          log_id: kind === 'delete' ? null : r.log_id,
          kind,
          ok: r.ok.length,
          submitted,
          failed: r.failed.map((f) => ({ title: f.title, error: f.error })),
          undo_until: new Date(Date.now() + 5 * 60_000).toISOString(),
        },
      },
    })
    .select()
    .single();
  if (e2) throw new HttpError(500, e2.message);
  return json({ messages: [botMsg] });
}

/** Undo tapped on a status / bulk result: undo_task_changes as the caller (its own 5-minute check). */
async function undoChange(db: Caller['db'], profileId: string, logId: string, ar: boolean): Promise<Response> {
  if (!UUID.test(logId)) throw new HttpError(400, 'Nothing to undo');
  const { data, error } = await db.rpc('undo_task_changes', { p_log: logId });
  if (error) throw new HttpError(400, error.message);
  const n = data as number;
  const reply = ar ? `رجّعتها زي ما كانت (${n} ${n === 1 ? 'مهمة' : 'مهام'}).` : `Undone: ${n} task${n === 1 ? '' : 's'} back as they were.`;
  const { data: botMsg, error: e2 } = await db
    .from('chat_messages')
    .insert({ profile_id: profileId, role: 'assistant', content: reply, task_id: null, action: 'none', payload: { undo_done: { log_id: logId } } })
    .select()
    .single();
  if (e2) throw new HttpError(500, e2.message);
  return json({ messages: [botMsg] });
}

// ─── team brief: table answers, what Muntej did, one-tap fixes ──────────────────

type BriefStatus = z.infer<typeof BriefRow>['status'];
type BriefAction = {
  kind: 'owner' | 'due';
  task_id: string;
  owner_id: string | null;
  to_name: string | null;
  free_hours: number | null;
  due_at: string | null;
};
type BriefOut = {
  headline: string;
  rows: {
    /** stable id of the row: an applied fix is matched back to it */
    key: string;
    status: BriefStatus;
    person_id: string | null;
    person_name: string | null;
    task_id: string | null;
    task_title: string | null;
    metric: string;
    note: string;
    /** what Muntej did by itself (now = in this answer, else earlier today) */
    auto: { kind: 'reminded' | 'checked_in'; at: string; now: boolean } | null;
    action: BriefAction | null;
  }[];
};
type BriefApplyItem = { key: string; kind: 'owner' | 'due'; task_id: string; owner_id?: string | null; due_at?: string | null };

/** 17:00 Riyadh, `days` working days (Sun–Thu) after t */
function workingDaysAhead17(t: number, days: number): number {
  const day = (x: number) => new Date(x + RIYADH_MS).getUTCDay();
  let m = t;
  for (let i = 0; i < days; ) {
    m += DAY;
    if (day(m) !== 5 && day(m) !== 6) i++;
  }
  const l = new Date(m + RIYADH_MS);
  l.setUTCHours(17, 0, 0, 0);
  return l.getTime() - RIYADH_MS;
}

/** One tap (or "Do all") on a brief: each fix through bulk_update_tasks as the caller, so the usual rules and Undo apply. */
async function applyBrief(
  db: Caller['db'],
  profileId: string,
  raw: { source_id: string; items: BriefApplyItem[] },
  ar: boolean,
): Promise<Response> {
  const items = (Array.isArray(raw?.items) ? raw.items : [])
    .filter((x) => x && UUID.test(x.task_id) && (x.kind === 'owner' ? !!x.owner_id && UUID.test(x.owner_id) : x.kind === 'due' && !!x.due_at))
    .slice(0, 6);
  if (!items.length) throw new HttpError(400, 'Nothing to change');

  const logIds: string[] = [];
  const keys: string[] = [];
  const lines: string[] = [];
  const failed: { title: string | null; error: string }[] = [];
  const names = new Map<string, string>();
  const ownerIds = items.map((x) => x.owner_id).filter((x): x is string => !!x);
  if (ownerIds.length) {
    const { data } = await db.from('profiles').select('id, full_name, full_name_ar').in('id', ownerIds);
    for (const p of (data ?? []) as { id: string; full_name: string; full_name_ar: string | null }[])
      names.set(p.id, ((ar && p.full_name_ar) || p.full_name).split(' ')[0]);
  }
  const dayFmt = (iso: string) =>
    new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-GB', { timeZone: 'Asia/Riyadh', weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(iso));

  for (const it of items) {
    const change = it.kind === 'owner' ? { kind: 'owner', owner_id: it.owner_id } : { kind: 'due', due_at: it.due_at };
    const { data, error } = await db.rpc('bulk_update_tasks', { p_ids: [it.task_id], p_change: change });
    if (error) {
      failed.push({ title: null, error: error.message });
      continue;
    }
    const r = data as { log_id: string | null; ok: { title: string }[]; failed: { title: string | null; error: string }[] };
    failed.push(...r.failed.map((f) => ({ title: f.title, error: f.error })));
    if (!r.ok.length) continue;
    if (r.log_id) logIds.push(r.log_id);
    keys.push(it.key);
    const title = r.ok[0].title;
    lines.push(
      it.kind === 'owner'
        ? ar
          ? `«${title}» ← ${names.get(it.owner_id!) ?? ''}`
          : `"${title}" → ${names.get(it.owner_id!) ?? ''}`
        : ar
          ? `«${title}» لين ${dayFmt(it.due_at!)}`
          : `"${title}" due ${dayFmt(it.due_at!)}`,
    );
  }
  // the new owners / the people whose dates moved are told through the usual alerts
  await deliverNow();

  const reply = lines.length
    ? (ar ? 'تم ✅ ' : 'Done ✅ ') + lines.join(ar ? '، ' : '; ') + '.'
    : ar
      ? 'ما قدرت أسويها.'
      : "I couldn't do that.";
  const { data: botMsg, error: e2 } = await db
    .from('chat_messages')
    .insert({
      profile_id: profileId,
      role: 'assistant',
      content: reply,
      task_id: null,
      action: 'none',
      payload: {
        bulk_done: {
          log_id: logIds[0] ?? null,
          log_ids: logIds,
          kind: 'brief',
          ok: lines.length,
          submitted: 0,
          failed,
          undo_until: new Date(Date.now() + 5 * 60_000).toISOString(),
          brief: { source_id: raw.source_id, keys },
        },
      },
    })
    .select()
    .single();
  if (e2) throw new HttpError(500, e2.message);
  return json({ messages: [botMsg] });
}

/** Undo after "Do all": every log of that tap (each with its own 5-minute check). */
async function undoMany(db: Caller['db'], profileId: string, raw: string[], ar: boolean): Promise<Response> {
  const ids = (Array.isArray(raw) ? raw : []).filter((x) => typeof x === 'string' && UUID.test(x)).slice(0, 6);
  if (!ids.length) throw new HttpError(400, 'Nothing to undo');
  let n = 0;
  for (const id of ids) {
    const { data, error } = await db.rpc('undo_task_changes', { p_log: id });
    if (error) throw new HttpError(400, error.message);
    n += data as number;
  }
  const reply = ar ? `رجّعتها زي ما كانت (${n} ${n === 1 ? 'مهمة' : 'مهام'}).` : `Undone: ${n} task${n === 1 ? '' : 's'} back as they were.`;
  const { data: botMsg, error: e2 } = await db
    .from('chat_messages')
    .insert({ profile_id: profileId, role: 'assistant', content: reply, task_id: null, action: 'none', payload: { undo_done: { log_id: ids[0], log_ids: ids } } })
    .select()
    .single();
  if (e2) throw new HttpError(500, e2.message);
  return json({ messages: [botMsg] });
}

// ─── accounts by conversation ───────────────────────────────────────────────────

type MyAccount = { id: string; name: string; name_ar: string | null; status: string; people: number; member: boolean; active: boolean };

/**
 * Emails a Muntej invitation (Supabase Auth "invite", sent through the project's SMTP: sales@muntej.app) and creates
 * their login, which handle_new_user links to every profile with that email. An email that already has a login
 * (someone joining a second account) gets no email: the new account simply shows up in their Settings.
 */
async function inviteByEmail(email: string, name: string | null): Promise<'invited' | 'has_login' | 'failed'> {
  const { error } = await adminClient().auth.admin.inviteUserByEmail(email, { data: { full_name: name ?? undefined } });
  if (!error) return 'invited';
  if (/already|registered|exists/i.test(error.message)) return 'has_login';
  console.error('invite failed', email, error.message);
  return 'failed';
}

const accountLabel = (a: Pick<MyAccount, 'name' | 'name_ar'>, ar: boolean) => (ar && a.name_ar) || a.name;

async function runAccount(
  db: Caller['db'],
  a: z.infer<typeof AccountChange>,
  accounts: MyAccount[],
  superAdmin: boolean,
  ar: boolean,
): Promise<{ reply: string; payload: Record<string, unknown> | null }> {
  const say = (en: string, arText: string) => (ar ? arText : en);

  if (a.op === 'list') {
    if (!accounts.length) return { reply: say("You're not in any account yet.", 'للحين ما أنت في أي حساب.'), payload: null };
    const lines = accounts.map(
      (x) => `${x.active ? '● ' : '○ '}${accountLabel(x, ar)} (${x.people} ${say('people', 'شخص')})${x.member ? '' : say(' · viewing only', ' · مشاهدة فقط')}`,
    );
    return { reply: `${say('Your accounts:', 'حساباتك:')}\n${lines.join('\n')}`, payload: null };
  }

  if (a.op === 'switch') {
    const target = accounts.find((x) => x.id === a.account_id);
    if (!target) return { reply: say("I couldn't find that account. Say \"show my accounts\" to see them.", 'ما لقيت هالحساب. قل "وريني حساباتي" وأعرضها لك.'), payload: null };
    if (target.active) return { reply: say(`You're already in ${accountLabel(target, false)}.`, `أنت أصلاً في ${accountLabel(target, true)}.`), payload: null };
    // the switch itself happens after this turn's messages are saved (they belong to the account the chat is in now)
    return {
      reply: say(`Done, you're now working in ${accountLabel(target, false)}.`, `تم، الحين أنت شغال في ${accountLabel(target, true)}.`),
      payload: { account_switched: { id: target.id, name: accountLabel(target, ar) } },
    };
  }

  // create: the super admin only (create_account checks it again)
  if (!superAdmin) return { reply: say('Only the super admin can open new accounts.', 'فتح الحسابات الجديدة للمسؤول العام بس.'), payload: null };
  if (!a.name || !a.admin_email)
    return { reply: say("What's the company's name and its admin's email?", 'وش اسم الشركة وإيميل المسؤول فيها؟'), payload: null };
  const { data, error } = await db.rpc('create_account', {
    p_name: a.name,
    p_name_ar: a.name_ar,
    p_admin_name: a.admin_full_name,
    p_admin_name_ar: a.admin_full_name_ar,
    p_admin_email: a.admin_email,
  });
  if (error) return { reply: say(`I couldn't create it: ${error.message}`, `ما قدرت أنشئه: ${error.message}`), payload: null };
  const made = data as { account_id: string; admin_email: string };
  const invite = await inviteByEmail(made.admin_email, a.admin_full_name);
  const admin = (ar ? a.admin_full_name_ar : null) ?? a.admin_full_name ?? made.admin_email;
  const sent =
    invite === 'invited'
      ? say(` I emailed ${made.admin_email} an invitation.`, ` وأرسلت دعوة على ${made.admin_email}.`)
      : invite === 'has_login'
        ? say(` ${admin} already uses Muntej, so the new account shows up in their Settings.`, ` ${admin} يستخدم منتج أصلاً، فالحساب الجديد يطلع له في الإعدادات.`)
        : say(` The invitation email didn't go out; ${admin} can still sign in with ${made.admin_email}.`, ` ما انرسلت الدعوة، بس ${admin} يقدر يدخل بإيميله ${made.admin_email}.`);
  return {
    reply:
      say(`Done, "${a.name}" is open with ${admin} as its admin.`, `تم، فتحت حساب «${a.name_ar ?? a.name}» والمسؤول فيه ${admin}.`) +
      sent +
      say(' Say "switch to ' + a.name + '" to look inside.', ` قل "بدّل لـ${a.name_ar ?? a.name}" وتدخل تشوفه.`),
    payload: { account_created: { id: made.account_id, name: a.name } },
  };
}

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
  await deliverNow();

  const { data: person } = await db.from('profiles').select('full_name, full_name_ar, email, user_id').eq('id', id as string).single();
  const name = person ? ((ar ? person.full_name_ar : null) ?? person.full_name) : '';
  // a new person with an email and no login yet gets an invitation email (sales@muntej.app)
  const invite = isNew && person?.email && !person.user_id ? await inviteByEmail(person.email, person.full_name) : null;
  const invited =
    invite === 'invited'
      ? ar
        ? ` وأرسلت له دعوة على ${person!.email}.`
        : ` I emailed ${person!.email} an invitation.`
      : '';
  const reply = isNew
    ? ar
      ? `تم، أضفت ${name} للفريق.${invited}`
      : `Done, ${name} is now on the team.${invited}`
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

// ─── objectives by conversation ─────────────────────────────────────────────────

type ObjectiveChange = z.infer<typeof ObjectiveChange>;
type ObjectiveOp = ObjectiveChange['op'];
type ObjectiveProposal = {
  op: ObjectiveOp;
  objective_id: string | null;
  /** display title in the conversation language */
  title: string;
  /** exactly what apply_objective sends to upsert_objective (only the keys that change; empty for cancel / distribute) */
  patch: Record<string, unknown>;
  /** human lines for the card, in the conversation language */
  summary_lines: string[];
};

const OBJECTIVE_OPS: readonly ObjectiveOp[] = ['create', 'update', 'cancel', 'distribute'];

const OBJ_LABELS = {
  en: { title: 'Title', title_ar: 'Arabic title', description: 'Description', owner_id: 'Accountable', start_at: 'Starts', due_at: 'Ends', status: 'Status' },
  ar: { title: 'العنوان', title_ar: 'العنوان بالعربي', description: 'الوصف', owner_id: 'المسؤول', start_at: 'يبدأ', due_at: 'ينتهي', status: 'الحالة' },
} as const;

function isoOrNull(s: string | null | undefined) {
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function fmtDay(iso: string, ar: boolean) {
  return new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-GB', {
    timeZone: 'Asia/Riyadh',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

/** Turns the model's objective change into a proposal the user confirms (or a readable reason it can't be done). */
function proposeObjective(
  change: ObjectiveChange,
  ctx: {
    objectives: ObjectiveRow[];
    team: PersonRow[];
    meId: string;
    amAdmin: boolean;
    isBelow: (target: string, boss: string) => boolean;
    canEdit: (o: ObjectiveRow) => boolean;
    openCount: (objectiveId: string) => number;
    nameOf: (id: string | null) => string | null;
    ar: boolean;
  },
): { proposal: ObjectiveProposal; reply: string } | { error: string } {
  const { ar } = ctx;
  const say = (en: string, arText: string) => ({ error: ar ? arText : en });
  const label = OBJ_LABELS[ar ? 'ar' : 'en'];
  const arrow = ar ? '←' : '→';
  const sep = ar ? '، ' : ', ';
  const f = change.fields;
  const lines: string[] = [];
  const patch: Record<string, unknown> = {};
  const who = (id: string | null) => (id === ctx.meId ? (ar ? 'أنت' : 'You') : ctx.nameOf(id) ?? (ar ? 'ما أحد' : 'Nobody'));
  const ownerAllowed = (id: string) => id === ctx.meId || ctx.amAdmin || ctx.isBelow(id, ctx.meId);
  const notInTeam = () => say("I couldn't find that person in the team. Who is accountable?", 'ما لقيت هالشخص في الفريق. مين المسؤول عن الهدف؟');
  const notYours = () => say('You can only make yourself or people in your team accountable.', 'تقدر تخلي المسؤول أنت أو أحد من فريقك بس.');
  const badWindow = () => say('The end date must be after the start.', 'تاريخ النهاية لازم يكون بعد البداية.');
  const nowMs = Date.now();

  if (change.op === 'create') {
    const title = f.title?.trim() || f.title_ar?.trim();
    if (!title) return say('What should the objective be called?', 'وش اسم الهدف؟');
    const due = isoOrNull(f.due_at);
    if (!due) return say('By when should this objective be reached?', 'لين متى لازم يتحقق الهدف؟');
    const start = isoOrNull(f.start_at);
    if (Date.parse(due) <= (start ? Date.parse(start) : nowMs)) return badWindow();
    let owner: string | null = null;
    if (f.owner_id) {
      if (!ctx.team.some((p) => p.id === f.owner_id)) return notInTeam();
      if (!ownerAllowed(f.owner_id)) return notYours();
      owner = f.owner_id;
    }
    patch.title = title;
    lines.push(`${label.title}: ${title}`);
    const titleAr = f.title_ar?.trim();
    if (titleAr && titleAr !== title) {
      patch.title_ar = titleAr;
      lines.push(`${label.title_ar}: ${titleAr}`);
    }
    if (owner) patch.owner_id = owner;
    lines.push(`${label.owner_id}: ${who(owner ?? ctx.meId)}`);
    if (start) patch.start_at = start;
    lines.push(`${label.start_at}: ${start ? fmtDay(start, ar) : ar ? 'من اليوم' : 'Today'}`);
    patch.due_at = due;
    lines.push(`${label.due_at}: ${fmtDay(due, ar)}`);
    const description = f.description?.trim();
    if (description) {
      patch.description = description;
      lines.push(`${label.description}: ${description}`);
    }
    const shown = (ar ? titleAr : null) || title;
    return {
      proposal: { op: 'create', objective_id: null, title: shown, patch, summary_lines: lines },
      reply: ar
        ? `بسوي هدف «${shown}» ينتهي ${fmtDay(due, ar)}، والمسؤول ${who(owner ?? ctx.meId)}. أكّد لي وأحفظه.`
        : `I'll create the objective «${shown}», ending ${fmtDay(due, ar)}, with ${who(owner ?? ctx.meId)} accountable. Confirm and I'll save it.`,
    };
  }

  const o = ctx.objectives.find((x) => x.id === change.objective_id);
  if (!o) return say("I couldn't find that objective. Which one do you mean?", 'ما لقيت هالهدف. أي هدف تقصد؟');
  const shown = (ar ? o.title_ar : null) ?? o.title;
  if (!ctx.canEdit(o))
    return say('Only the objective owner, its creator or their manager can change it.', 'الهدف يعدّله المسؤول عنه أو اللي سواه أو مديرهم بس.');
  const openTasks = ctx.openCount(o.id);

  if (change.op === 'cancel') {
    lines.push(`${label.status}: ${ar ? 'نشط' : 'Active'} ${arrow} ${ar ? 'ملغي' : 'Cancelled'}`);
    if (openTasks) lines.push(ar ? `مهامه المفتوحة (${openTasks}) تبقى مثل ما هي` : `Its ${openTasks} open tasks stay as they are`);
    return {
      proposal: { op: 'cancel', objective_id: o.id, title: shown, patch: {}, summary_lines: lines },
      reply: ar ? `بلغي هدف «${shown}». أكّد لي وألغيه.` : `I'll cancel the objective «${shown}». Confirm and I'll do it.`,
    };
  }

  if (change.op === 'distribute') {
    if (!openTasks) return say(`«${shown}» has no open tasks to spread out.`, `هدف «${shown}» ما فيه مهام مفتوحة أوزّعها.`);
    if (Date.parse(o.due_at) <= nowMs)
      return say(`«${shown}» has already ended. Move its end date first.`, `هدف «${shown}» انتهى وقته. غيّر تاريخ نهايته أول.`);
    const from = Date.parse(o.start_at) > nowMs ? o.start_at : new Date(nowMs).toISOString();
    lines.push(
      ar
        ? `أوزّع ${openTasks} مهام مفتوحة بالتساوي من ${fmtDay(from, ar)} إلى ${fmtDay(o.due_at, ar)}`
        : `Spread ${openTasks} open tasks evenly from ${fmtDay(from, ar)} to ${fmtDay(o.due_at, ar)}`,
    );
    lines.push(ar ? 'مواعيدها ومتابعاتها تتعدّل معها' : 'Their due dates and follow-ups move with them');
    return {
      proposal: { op: 'distribute', objective_id: o.id, title: shown, patch: {}, summary_lines: lines },
      reply: ar
        ? `بوزّع مهام هدف «${shown}» على مدته. أكّد لي وأسويها.`
        : `I'll spread the tasks of «${shown}» across its time. Confirm and I'll do it.`,
    };
  }

  // ── update: only the fields that change ──
  for (const k of ['title', 'title_ar', 'description'] as const) {
    const v = f[k]?.trim();
    if (v && v !== (o[k] ?? '')) {
      patch[k] = v;
      lines.push(k === 'description' || !o[k] ? `${label[k]}: ${v}` : `${label[k]}: ${o[k]} ${arrow} ${v}`);
    }
  }
  if (f.owner_id && f.owner_id !== o.owner_id) {
    if (!ctx.team.some((p) => p.id === f.owner_id)) return notInTeam();
    if (!ownerAllowed(f.owner_id)) return notYours();
    patch.owner_id = f.owner_id;
    lines.push(`${label.owner_id}: ${who(o.owner_id)} ${arrow} ${who(f.owner_id)}`);
  }
  const start = isoOrNull(f.start_at);
  const due = isoOrNull(f.due_at);
  if (start && Date.parse(start) !== Date.parse(o.start_at)) patch.start_at = start;
  if (due && Date.parse(due) !== Date.parse(o.due_at)) patch.due_at = due;
  if (patch.start_at || patch.due_at) {
    const s = (patch.start_at as string | undefined) ?? o.start_at;
    const d = (patch.due_at as string | undefined) ?? o.due_at;
    if (Date.parse(d) <= Date.parse(s)) return badWindow();
    if (patch.start_at) lines.push(`${label.start_at}: ${fmtDay(o.start_at, ar)} ${arrow} ${fmtDay(s, ar)}`);
    if (patch.due_at) lines.push(`${label.due_at}: ${fmtDay(o.due_at, ar)} ${arrow} ${fmtDay(d, ar)}`);
  }
  if (!Object.keys(patch).length) return say("Nothing to change, that's already how it is.", 'ما فيه شي يتغيّر، هو كذا أصلاً.');
  const changed = lines.join(sep);
  if ((patch.start_at || patch.due_at) && openTasks)
    lines.push(ar ? `${openTasks} مهام مفتوحة تتحرك مواعيدها عشان تناسب المدة الجديدة` : `${openTasks} open tasks get re-timed to fit the new dates`);
  return {
    proposal: { op: 'update', objective_id: o.id, title: shown, patch, summary_lines: lines },
    reply: ar
      ? `هذا التعديل على هدف «${shown}»: ${changed}. أكّد لي وأحفظه.`
      : `Here's the change for «${shown}»: ${changed}. Confirm and I'll save it.`,
  };
}

/** Confirm tapped on an objective change: run the RPC as the user (it enforces permissions) and log the result in the chat. */
async function applyObjective(
  db: Caller['db'],
  profileId: string,
  req: { op: string; objective_id: string | null; patch: Record<string, unknown> | null },
  ar: boolean,
): Promise<Response> {
  const op = req.op as ObjectiveOp;
  if (!OBJECTIVE_OPS.includes(op)) throw new HttpError(400, 'Unknown objective change');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // only the keys upsert_objective takes from a chat proposal, each checked
  const src = req.patch && typeof req.patch === 'object' && !Array.isArray(req.patch) ? req.patch : {};
  const patch: Record<string, unknown> = {};
  for (const k of OBJECTIVE_KEYS) if (k in src) patch[k] = src[k];
  for (const k of ['title', 'title_ar', 'description'] as const)
    if (k in patch && (typeof patch[k] !== 'string' || !(patch[k] as string).trim())) delete patch[k];
  for (const k of ['start_at', 'due_at'] as const) {
    if (!(k in patch)) continue;
    const iso = typeof patch[k] === 'string' ? isoOrNull(patch[k] as string) : null;
    if (!iso) throw new HttpError(400, ar ? 'التاريخ مو واضح' : 'That date is not valid');
    patch[k] = iso;
  }
  if ('owner_id' in patch) {
    const owner = patch.owner_id;
    const missing = ar ? 'ما لقيت المسؤول في الفريق' : "That person isn't in your team";
    if (typeof owner !== 'string' || !uuid.test(owner)) throw new HttpError(400, missing);
    const { data: p } = await db.from('profiles').select('id').eq('id', owner).neq('status', 'deleted').maybeSingle();
    if (!p) throw new HttpError(400, missing);
  }

  let id: string;
  let count: number | null = null;
  if (op === 'create') {
    if (!patch.title || !patch.due_at) throw new HttpError(400, ar ? 'الهدف يحتاج اسم وتاريخ نهاية' : 'An objective needs a title and an end date');
    const { data, error } = await db.rpc('upsert_objective', { p: patch });
    if (error) throw new HttpError(400, error.message);
    id = data as string;
  } else {
    const notFound = ar ? 'ما لقيت الهدف' : 'Objective not found';
    if (!req.objective_id || !uuid.test(req.objective_id)) throw new HttpError(400, notFound);
    const { data: found } = await db.from('objectives').select('id').eq('id', req.objective_id).maybeSingle();
    if (!found) throw new HttpError(400, notFound);
    id = req.objective_id;
    if (op === 'update') {
      if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to save');
      const { error } = await db.rpc('upsert_objective', { p: { id, ...patch } });
      if (error) throw new HttpError(400, error.message);
    } else if (op === 'cancel') {
      const { error } = await db.rpc('cancel_objective', { p_objective: id });
      if (error) throw new HttpError(400, error.message);
    } else {
      const { data, error } = await db.rpc('distribute_tasks', { p_objective: id });
      if (error) throw new HttpError(400, error.message);
      count = typeof data === 'number' ? data : null;
    }
  }

  const { data: o } = await db.from('objectives').select('title, title_ar').eq('id', id).maybeSingle();
  const title = o ? ((ar ? o.title_ar : null) ?? o.title) : '';
  const replies: Record<ObjectiveOp, [string, string]> = {
    create: [`Done, the objective «${title}» is set.`, `تم، سويت هدف «${title}».`],
    update: [`Done, «${title}» is updated.`, `تم، عدّلت هدف «${title}».`],
    cancel: [`Done, «${title}» is cancelled.`, `تم، ألغيت هدف «${title}».`],
    distribute: [
      count != null ? `Done, spread ${count} tasks across «${title}».` : `Done, the tasks of «${title}» are spread across its time.`,
      count != null ? `تم، وزّعت ${count} مهام على مدة هدف «${title}».` : `تم، وزّعت مهام هدف «${title}» على مدته.`,
    ],
  };
  const reply = replies[op][ar ? 1 : 0];

  const { data: botMsg, error: e2 } = await db
    .from('chat_messages')
    .insert({
      profile_id: profileId,
      role: 'assistant',
      content: reply,
      task_id: null,
      action: 'none',
      payload: { objective_done: { objective_id: id, title, op, ...(count != null ? { count } : {}) } },
    })
    .select()
    .single();
  if (e2) throw new HttpError(500, e2.message);
  return json({ messages: [botMsg] });
}
