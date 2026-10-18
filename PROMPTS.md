# Muntej — Claude Code prompt playbook

## How to use (read once)
1. Unzip this kit into an empty folder, e.g. `C:\Users\<you>\muntej-app\`, open a terminal there and run `claude`.
2. Paste the prompts **in order**, one at a time. Wait until each one is finished, tested and committed.
3. After each prompt is done, type `/clear` before the next one (keeps Claude fast and cheap; CLAUDE.md is re-read automatically).
4. Each prompt starts in plan mode: Claude proposes a plan → you reply "go" (or correct it).
5. Test on your phone with **Expo Go** (scan the QR code from `npx expo start`).
6. If something breaks: paste the error and say "fix this, keep the scope small".

Accounts you need before Prompt 01: Supabase (free), Anthropic API key, Expo account. (Sprint 2: Meta WhatsApp Cloud API, Resend.)

---

## PROMPT 00 — Project setup
```
Read CLAUDE.md, docs/BRD.md and design/TOKENS.md. Look at all images in design/screens.
Plan first, then build:
1. Create an Expo + TypeScript + Expo Router app in this folder (keep docs/ and design/ as they are).
2. Add theme tokens from design/TOKENS.md in src/theme/tokens.ts, load Inter, Tajawal and IBM Plex Mono.
3. Add i18n (en + ar) with RTL switching, and a language toggle in a simple Settings screen.
4. Create the navigation shell: bottom tabs Home / Autopilot / Decisions / Brief (see design/screens/01-Home.png),
   plus empty placeholder routes for all 24 screens named by number (e.g. app/14-task-detail.tsx).
5. Add a reusable UI kit matching the mockups: Screen, Card, Button (primary/outline), Chip, Toggle, Avatar,
   ProgressBar, StatTile, SectionTitle, BottomCTA.
Then run the app, fix type errors, and commit "setup: expo shell, theme, i18n, ui kit".
```

## PROMPT 01 — Backend & data model
```
Plan first, then build the Supabase backend:
- Tables: profiles (role manager/employee, manager_id), workspaces, workspace_members, tasks (title, owner, assigner,
  workspace, due_at, start_at, priority, status, clarity_score, definition_of_done, source, expected_close_at),
  subtasks, evidence (file/image/voice/link, storage path), followups (scheduled_at, channel, message, status),
  reviews (round, rating, note, decision), decisions (type, recommendation, status), activity_log (actor, action,
  reason, undoable), achievements, agents (prompt, recipe json, schedule, autonomy, enabled), agent_runs,
  notification_prefs, sources (type, status).
- Row Level Security: employees see only their own tasks/data; managers see their team. Employee-level summaries and
  achievements visible only to the employee and their direct manager.
- Phone OTP auth screens (simple, match the dark style).
- Seed script with the sample team from CLAUDE.md and ~30 realistic tasks.
- Typed data hooks in src/lib/api using TanStack Query.
Run migrations locally, test sign-in with the seed users, commit "backend: schema, RLS, auth, seed".
```

---

# SPRINT 1 — Core "Create & Forget"

## PROMPT S1-1 — Home (01) + Capture (02)
```
Build screens 01 Home and 02 Capture to match design/screens/01-Home.png and 02-Capture.png
(exact layout values are in design/html/Main.dc.html and Capture.dc.html).
- Home: greeting, "Muntej is handling N tasks" card with 3 stats, decisions banner (links to 04), "right now" list from
  activity_log, big mic button.
- Mic: record audio (expo-av) → Edge Function `transcribe` → Edge Function `parse-task` (Claude API) that returns JSON
  {title, owner_id, due_at, priority, helper_id, goal, definition_of_done, followup_plan[]} using the team list.
  Also support typed input.
- Capture screen shows what was understood + the follow-up plan timeline; "Done, forget it" saves the task and its
  followups; "Edit" allows changing any field.
Test with an English and an Arabic sentence. Commit.
```

## PROMPT S1-2 — Follow-up engine + Autopilot (03) + Employee chat (06)
```
Build the follow-up engine and screens 03 Autopilot and 06 Employee chat (see their PNGs and html files).
- Scheduled Edge Function (cron every 15 min) that sends due followups as push notifications + in-app chat messages,
  respecting quiet hours (prayer times placeholder table, after 9 PM, Friday). Log every action to activity_log.
- Employee chat: task cards arrive as messages; quick replies 25% / 50% / 75% / Done; Done asks for evidence upload.
  Replies update the task and notify the manager only if needed.
- Autopilot: read-only feed grouped by Today / Yesterday with filters (All, Follow-ups, Updates, Escalations)
  and "time saved today".
Write messages in a friendly tone (Saudi conversational Arabic when language is ar). Commit.
```

## PROMPT S1-3 — Decisions (04)
```
Build screen 04 Decisions (design/screens/04-Decisions.png).
- A decision is created when: an employee asks for an extension, a task is predicted late, or a reply is ambiguous.
- Edge Function `recommend` (Claude) adds a short recommendation + reason to each decision.
- Cards with Approve / Decline / voice reply; on approve, apply the change, notify the employee, log it.
- Empty state: "Nothing else needs you. I'm on it." Show the pending count on the tab badge. Commit.
```

## PROMPT S1-4 — Task detail (14): clarity, AI split, evidence
```
Build screen 14 Task detail (design/screens/14-TaskDetail.png).
- Clarity rate 0–100% from 4 checks (owner, due date, definition of done, budget/resources) with a ring chart;
  "Ask <manager>" button sends a question for the missing item and updates the score when answered.
- "Split with AI": Edge Function returns 3–6 subtasks with owners; user can accept; checkboxes update progress.
- Evidence: attach file / photo / voice note / link to Supabase Storage; thumbnails grid.
- Source badge (e.g. "From: Teams meeting") and "Submit for review" button. Commit.
```

## PROMPT S1-5 — Review loop (15)
```
Build screen 15 Review loop (design/screens/15-Review.png).
- Thread grouped by rounds: employee submission (with evidence) → manager rating 1–5 stars + criteria chips
  (Quality, On time, Communication) → Approve & close OR Send back with note (text or voice).
- Send back starts a new round and Muntej follows up automatically; Approve closes the task, sends a thank-you,
  stores the rating for performance and creates an achievement record. Commit.
```

## PROMPT S1-6 — Alerts (18) + Sprint 1 QA
```
Build screen 18 Alerts (design/screens/18-Alerts.png): channels (Push, Email, WhatsApp-disabled-until-sprint-2, Teams-later),
6 alert rules with toggles, quiet hours card, escalation rule (no reply in 24h → 2 reminders → alert manager).
Wire email via Resend. Then do a Sprint 1 QA pass:
run through the full flow manager → employee → review → close on two devices, fix bugs, check RTL Arabic on every
Sprint 1 screen, and write docs/SPRINT1_QA.md with what was tested. Commit "sprint 1 complete".
```

---

# SPRINT 2 — Capture everywhere & insights

## PROMPT S2-1 — Sources (12) + WhatsApp + Email capture
```
Build screen 12 Sources (design/screens/12-Sources.png) with connect/disconnect tiles and today's counts.
Implement first: WhatsApp (Meta Cloud API webhook → parse-task) and Email (forward-to address via Resend inbound).
Dedupe tasks (same owner + similar title within 48h). Status updates are sent back to the source thread.
Other tiles (Teams, Slack, Google Chat, Jira, Azure DevOps) show "Coming soon" with a waitlist toggle.
Sticky note: camera → Claude vision → tasks. Commit.
```

## PROMPT S2-2 — Note Taker (13) + Promise Catcher (07)
```
Build screens 13 Note Taker and 07 Promise Catcher.
- MVP: record an in-room meeting in the app (or upload an audio file) → transcribe → Edge Function `extract-promises`
  returns commitments {who, task, due, quote, timestamp}. Show the consent notice before recording; delete audio after
  extraction.
- Promise Catcher lists them with confirm / skip / confirm all; confirmed ones become tasks with followups.
- Meeting bots (Zoom/Meet/Teams) and external devices: UI toggles only + a TODO integration note. Commit.
```

## PROMPT S2-3 — Evidence progress (10) + Reverse follow-up (09)
```
Build screens 10 and 09.
- Evidence progress: estimate progress from signals we have (subtasks done, evidence uploaded, last activity date,
  similar past tasks) vs self-reported %; when the gap is large, show "Offer help" which sends a supportive message
  and logs it.
- Reverse follow-up: employee sees items they wait on (tasks blocked by others, pending approvals with their manager),
  with wait time; "Nudge politely" sends a neutral reminder from Muntej. Commit.
```

## PROMPT S2-4 — Dashboard (16), Summaries (17), Weekly brief (05)
```
Build screens 16, 17 and 05.
- Dashboard: Daily / Weekly / Monthly tabs; KPIs (completed, on-time %, avg rating, avg clarity) with delta vs previous
  period; grouped bar chart current vs previous; one AI insight sentence.
- Summaries: tabs Project / Product / Employee; "Summarize in one tap" → Edge Function builds a 4-bullet summary from
  data; Listen (text-to-speech), PDF export, Share. Employee tab drafts feedback the manager can edit and send.
- Weekly brief: generated every Thursday 2 PM, audio player, hours saved, team pulse bars, one suggestion with accept.
Commit "sprint 2 complete" after a QA pass and docs/SPRINT2_QA.md.
```

---

# SPRINT 3 — Workspaces, fairness & agents

## PROMPT S3-1 — Workspaces (19) + New workspace (20)
```
Build screens 19 and 20.
- Workspaces list: name, color, members, health (on track / needs attention from task data), wins this week.
- New workspace from one sentence → Edge Function suggests name, goal, roles and members with match % + reason
  (skills tags, past tasks, current load). Toggle members, create, notify them.
- Auto-route new tasks to a workspace by name/context. No boards or columns anywhere. Commit.
```

## PROMPT S3-2 — Achievements (21) + Roadmap (24)
```
Build screens 21 and 24.
- Achievements: lanes by workspace OR by employee, week / month / quarter zoom, tap a dot for details + evidence;
  employee lanes visible only to that employee and their direct manager.
- Roadmap: Projects / Tasks toggle; 8-week timeline with today line; bars show start date (above) and expected close date
  (below); AI forecast colors on track / at risk / delay stripes; tap → card with suggestion and "Apply".
  Everything is computed from tasks — no dragging or manual editing. Commit.
```

## PROMPT S3-3 — Load Radar (11) + Polite Pushback (08)
```
Build screens 11 and 08.
- Load: hours per person this week from task estimates; on assignment show each person's load and the impact of the
  new task, recommended person first with reason.
- Pushback: on a new task the employee can tap "My plate is full" → preview of the neutral priority question Muntej
  will send to the manager → send → manager reply reassigns or reprioritizes automatically. Commit.
```

## PROMPT S3-4 — Agents (22) + New agent (23)
```
Build screens 22 and 23.
- New agent: user writes a prompt → Edge Function converts it into a recipe JSON {trigger: schedule|event, find, do[],
  notify} validated with zod → show the recipe → "Test now" runs it in dry-run and shows the output → autonomy choice
  "Ask me first time" / "Always run" → enable.
- Agent runner: cron + event hooks execute enabled recipes, write agent_runs and activity_log; every run is undoable.
- Agents list with toggles, last run and counts. Commit.
```

## PROMPT S3-5 — Final hardening & store builds
```
Final pass: performance check on low-end Android, empty/error/loading states on all 24 screens, full Arabic RTL review,
accessibility labels, analytics events for the success metrics in docs/BRD.md, PDPL checklist in docs/PRIVACY.md,
then configure EAS and produce internal test builds for iOS (TestFlight) and Android. Commit "v1.0 release candidate".
```

---

## Handy one-liners
- Match a screen to the design: `Compare app/<screen> with design/screens/<NN>.png and fix every visual difference.`
- Arabic check: `Switch to Arabic and fix every RTL or text overflow issue on <screen>.`
- Stuck: `Explain the error in simple words, propose 2 options, recommend one.`
- Before a demo: `Reset and reseed the database with the demo team, then list the exact click path for the CEO demo.`
