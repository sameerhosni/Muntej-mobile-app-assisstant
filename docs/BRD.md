# Muntej Mobile — BRD (v1.0, Oct 2026)

## Overview
Muntej is an AI task assistant for managers and employees. The manager creates a task once (voice/text);
Muntej assigns, follows up, collects evidence and reports. The manager only steps in for decisions.
- Primary user: Manager (wants results without chasing people)
- Secondary user: Employee (receives tasks, updates in one tap, gets credit)
- Principle: assistant, not a PM tool — no boards, columns or manual Gantt.

## Sprint plan
| Sprint | Theme | Screens | Exit criteria |
|---|---|---|---|
| 1 | Core "Create & Forget" | 01, 02, 03, 04, 06, 14, 15, 18 | 5 pilot managers send tasks unprompted for 14 days; 70% tasks closed with evidence |
| 2 | Capture everywhere & insights | 12, 13, 07, 10, 09, 16, 17, 05 | 40% of tasks enter automatically; managers open dashboard 3×/week |
| 3 | Workspaces, fairness & agents | 19, 20, 21, 24, 11, 08, 22, 23 | First paying customer; enterprise paid pilot |

## Screens
### Sprint 1
- **01 Home** — Voice-first. Big mic to capture a task, live count of tasks Muntej is handling, what it is doing now, number of decisions waiting.
- **02 Capture** — Shows what AI understood from one sentence (owner, due, priority, helper, goal) + follow-up plan. "Done, forget it" or Edit.
- **03 Autopilot** — Read-only feed of actions Muntej took (reminders, updates received, meetings set, tasks closed) + time saved.
- **04 Decisions** — Only exceptions (extension requests, delay risk), each with an AI recommendation and one-tap approve/reject or voice reply.
- **06 Employee chat** — Employee gets tasks/follow-ups in chat (in-app or WhatsApp); updates with one tap (25/50/75/Done) or sends the deliverable.
- **14 Task detail** — Clarity rate (owner, due, definition of done, budget) with "ask manager" for missing info; AI split into subtasks; evidence attachments (file, image, voice).
- **15 Review loop** — Employee submits; manager rates 1–5 stars and approves or returns with a note; repeats by round until approved; rating logged to performance.
- **18 Alerts** — Channels (Push, Email, WhatsApp, Teams), rule toggles, quiet hours (prayer times, after hours, Ramadan), escalation after 24h no reply.

### Sprint 2
- **12 Sources** — Connect WhatsApp, Email, Meetings, Teams, Slack, Google Chat, Jira, Azure DevOps, sticky-note scan. No duplicates; status syncs back.
- **13 Note Taker** — Auto-join bots (Zoom, Meet, Teams) + recording devices; live task capture; attendees notified; audio deleted after extraction.
- **07 Promise Catcher** — After a meeting, every spoken commitment becomes a suggested task with quote + timestamp. Confirm / skip / confirm all.
- **10 Evidence progress** — Progress estimated from real signals (file activity, sections done, data received), not self-report; Muntej offers help when stuck.
- **09 Reverse follow-up** — Employee sees what they are waiting on (incl. manager) and asks Muntej to nudge politely.
- **16 Dashboard** — Daily/weekly/monthly KPIs (completed, on-time %, rating, clarity) vs previous period, trend chart, one AI insight.
- **17 Summaries** — One-tap summary for project / product / employee (listen, PDF, share); AI-drafted employee feedback the manager can send.
- **05 Weekly brief** — 60-sec audio summary, hours saved, team pulse, one predictive suggestion.

### Sprint 3
- **19 Workspaces** — Each product = workspace with members, health, weekly wins. Tasks routed to workspaces automatically.
- **20 New workspace** — Describe in one sentence; AI suggests team with match % + reason (skills, history, capacity).
- **21 Achievements** — Timeline of actual wins by workspace or by employee; week/month/quarter zoom; evidence per win. Employee view visible only to the employee and direct manager.
- **24 Roadmap** — Auto-built from tasks: projects & tasks with start date and expected close date, AI delay forecast, one-tap fix.
- **11 Load Radar** — On assignment, shows each person's load + impact of the new task; recommends best fit.
- **08 Polite Pushback** — Employee taps "My plate is full"; Muntej asks the manager a priority question on their behalf.
- **22 Agents** — Routines that run automatically (scheduled or event-based), toggles, run history.
- **23 New agent** — User writes a prompt → recipe (when / find / do / notify) → test run → autonomy: "ask me first time" or "always run".

## Non-functional
Arabic (RTL) + English; iOS + Android; WhatsApp as full employee channel; Saudi PDPL compliance & explicit recording consent;
every Muntej action logged and undoable; employee-level data visible only to the employee and direct manager.

## Success metrics
North star: times a manager had to ask anyone about a task (target 0). Also: tasks sent unprompted/manager/week,
avg clarity & on-time %, follow-up hours saved.
