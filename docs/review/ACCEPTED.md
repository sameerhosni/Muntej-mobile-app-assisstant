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
