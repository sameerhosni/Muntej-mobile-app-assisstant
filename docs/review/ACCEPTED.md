# Accepted reviews

Every test release needs the code reviewed first by the `muntej-reviewer` agent (`.claude/agents/muntej-reviewer.md`)
against `docs/review/RULES.md` and the owner's request: review → fix → review again until it says ACCEPT. Then one line
is added here; `scripts/ship.mjs` refuses to release code that changed after the last accepted commit (only
`docs/review/` and `docs/BACKLOG.md` may change after it).

Line format: ``- `<commit>` · <date> · ACCEPT · <what was reviewed>``

- `f5dd367` · 2026-11-09 · ACCEPT · Decisions batch (header option 1, already-done via finish_from_decision, no spinner, assignable people, DM work to the right person, invited people keep tasks + reminders). 5 passes: 8 → 4 → 1 → 1 → 0 findings; rules R92–R94 added.
- `dd883ba` · 2026-11-10 · ACCEPT · Super admin: no notifications from the console seat, system dashboard (band + Overview/Companies/Health), WhatsApp follows the company seat, company + own/team tags, one line for push and WhatsApp. 3 passes: 3 → 1 → 0 findings; rules R95–R97 added.
- `291772f` · 2026-11-10 · ACCEPT · WhatsApp: a typed answer to «رجّعها» / «رد عليه» goes to the seat that asked, before the AI check. 3 passes: 2 → 1 → 0 findings; rules R98–R100.
- `a7e74c7` · 2026-11-10 · ACCEPT · Tools bring only your work (hand-offs, reply-close via close_by_reply, thread context), questions answered on WhatsApp («جاوب», free-text dates, quick buttons), internal-note leak fixed, AI on by default (iPhone asks once), need-you count = «وش يحتاجني», release guard, iPhone Muntej Test build, deploy guide. 5 passes: 7 → 3 → 4 → 2 → 0 findings; rules R101–R109.
- `a0f1d23` · 2026-11-10 · ACCEPT · QA only: budget-answer cases write the question directly; reply-button check follows the testers switch. 1 pass.
- `29f8bea` · 2026-11-10 · ACCEPT · Chat: old / closed tasks listed from the data, only on a request to see them, your own, which-one for two of a name (chips settle it). 6 passes: 6 → 5 → 1 → 2 → 1 → 0 findings; rules R110–R114.
- `9bfb339` · 2026-11-10 · ACCEPT · Tools alert names its tasks and comes as their cards; «ايه هي؟» shows exactly what Muntej just sent, on any seat, every branch tested. 4 passes: 5 → 2 → 2 → 0 findings; rules R115–R117.
- `426a828` · 2026-11-10 · ACCEPT · QA only: «ايه هي؟» branch steps match the task by its tag. 1 pass.
- `9c15b49` · 2026-11-10 · ACCEPT · Tools cards say who asked (a person, never a place), when, where, their words, the due date and who it's for; QA closed-list check looks for the list. 2 passes: 2 → 0 findings; rules R118–R119.
- `b0b7054` · 2026-11-10 · ACCEPT · QA run fixes: own sent mail listed as hand-offs, settled step order, false-claim check skips only real question words, idea flow reports page errors, raw answer error logged. 2 passes: 1 → 0 findings; rule R120.
- `4ba1b24` · 2026-11-10 · ACCEPT · WhatsApp tools list as a drop-down (rows with who · when · due, a tap opens the card, pages keep their numbers), due-date buttons never repeat. 3 passes: 4 → 4 → 0 findings; rules R121–R124.
- `b525fd3` · 2026-11-10 · ACCEPT · Task page shows the details and the doer's question with «جاوب» (answer-detail, giver/admin, testers first); own asks never wait on your list (same-first-name safe, DM other person found); ideas and their files take the server's seat. 4 passes: 7 → 2 → 1 → 0 findings; rules R125–R129.
