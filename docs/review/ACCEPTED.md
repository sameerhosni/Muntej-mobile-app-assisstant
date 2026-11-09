# Accepted reviews

Every test release needs the code reviewed first by the `muntej-reviewer` agent (`.claude/agents/muntej-reviewer.md`)
against `docs/review/RULES.md` and the owner's request: review → fix → review again until it says ACCEPT. Then one line
is added here; `scripts/ship.mjs` refuses to release code that changed after the last accepted commit (only
`docs/review/` and `docs/BACKLOG.md` may change after it).

Line format: ``- `<commit>` · <date> · ACCEPT · <what was reviewed>``

