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
- `ae4d4fa` · 2026-11-10 · ACCEPT · Send an idea no longer waits on the loaded profile; the voice and send failures log the real reason. 2 passes: 2 → 0 findings; rule R130.
- `b994e34` · 2026-11-11 · ACCEPT · Cancel a task in one tap (row ✕ and page Cancel by the server's rule, «تلغيها؟» then 6 s «رجّعها», bring back from the cancelled task), «اطلب إلغاءها» as its own alert with [ألغها]/[خلّها], cancel settles waiting decisions and requests. 3 passes: 7 → 5 → 0 findings; rules R131–R133.
- `74c3cee` · 2026-11-11 · ACCEPT · A found task in full before deciding (short names, full card, «لغيري» by the assign rule, already done via set_task_status_as, change date, full message, undo only its own tap within 5 min), the same in Your tools, testers first. 3 passes: 11 → 3 → 0 findings; rules R134–R137.
- `2f07451` · 2026-11-11 · ACCEPT · One «يحتاجك» (option 2): the Decisions tab with filters holds everything waiting on you; one SQL list (needs_you_items) behind the tab, badge, Home, Tasks, WhatsApp and the report; testers first. 3 passes: 10 → 4 → 0 findings; rules R138–R140.
- `94f8f4c` · 2026-11-11 · ACCEPT · Nouran's four (owner approved A–D): asks you can't give go to your manager as a request, «لما تخلصها» on the task page (giver-only), Meet reads attended meetings + why-zero line, no pull spinner unless pulled; testers first. 3 passes: 10 → 3 → 0 findings; rules R141–R145.
- `a3585fe` · 2026-11-11 · ACCEPT · Follow-up from the ship's QA: the «يحتاجك» number is the shared list's length everywhere; the request QA step sets the QA number. 1 pass: 0 findings.
- `98bf020` · 2026-11-11 · ACCEPT · The «يحتاجك» number waits for the shared list everywhere (no partial count, Home tile «…»). 3 passes: 1 → 1 → 0 findings.
- `26082a6` · 2026-11-11 · ACCEPT · QA only: the «يحتاجك» flow's WhatsApp step sets QA_PHONE on the manager. 1 pass: 0 findings.
- `be0ccf8` · 2026-11-11 · ACCEPT · QA split: core + changed areas on test releases, --full before --live (HEAD must be the tested code), inbox/network second try listed. 3 passes: 9 → 1 → 0 findings; rule R146.
- `72cc592` · 2026-11-12 · ACCEPT · Apple 11 Nov: sign-in 'start free' wording, every sign-in failure shows its cause with a ref and reaches client_errors (kept on the phone offline), background audio off. 3 passes: 9 → 1 → 0 findings; rules R147, R148.
- `a22e655` · 2026-11-12 · ACCEPT · Read now you can follow: starts on the server and answers at once, one line per source (Gmail ✓ · Chat ✓ · Meet …), «خلصت ✓» even after leaving, one read at a time, 300 s budget, plain errors. 3 passes: 6 → 1 → 0 findings; rules R149, R150, R151.
- `4c89261` · 2026-11-12 · ACCEPT · «يحتاجك» number waits for the shared list everywhere (tab, Tasks, employee home, Glance, SimpleHome, title); a dropped request shows no number. 2 passes: 1 → 0 findings.
- `32b745e` · 2026-11-12 · ACCEPT · QA: browser network drops count as blips (one second try, our own 500s still fail); Tasks «يحتاجك» check waits for its line. 1 pass: 0 findings.
- `0fce3e3` · 2026-11-12 · ACCEPT · QA only: a hung or dropped request to our server counts as a network blip (one second try); network failures in their own list, aborts ignored; a hung idea send ends inside its own check. 2 passes: 2 → 0 findings; rule R152.
- `538fc93` · 2026-11-12 · ACCEPT · Docs only: Apple review status (.md and Word), rule R149→R152 renumber carried into ACCEPTED.md. 2 passes: 1 → 0 findings; rule R153.
