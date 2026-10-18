# Muntej — project rules for Claude Code

## What we are building
Muntej is an AI task assistant (mobile app) for managers and employees in Saudi SMEs and enterprises.
Core promise: **"Create it and forget it."** The manager creates a task once (voice or text); Muntej assigns it,
follows up, collects evidence and reports. The manager only sees decisions and exceptions.
Muntej is NOT a project-management tool: no boards, no columns, no manual Gantt editing.

Read before any work:
- `docs/BRD.md` — requirements, 24 screens, 3 sprints
- `design/v2/html/*.dc.html` — **current UI (v2, light theme)**: 37 screens, `<Name>.dc.html` English and `<Name>AR.dc.html` Arabic;
  exact layout/colors/sizes (reference only, do not ship this format). Screen list + sprint per screen: `design/v2/canvas.json` titles.
- `design/TOKENS.md` — colors, fonts, spacing (v2)
- `design/screens/*.png`, `design/html/` — superseded v1 dark designs (history only)

## Tech stack (do not change without asking)
- Expo (React Native) + TypeScript + Expo Router (tabs + stacks)
- Supabase: Auth (phone OTP), Postgres, Storage (evidence files), Edge Functions (AI + jobs), Realtime
- AI: OpenAI API called ONLY from Supabase Edge Functions (never from the app). Key in env `OPENAI_API_KEY`; model via `PARSE_MODEL` (default `gpt-5-mini`). (Switched from Claude on 2026-10-18 by owner's decision: OpenAI account has credits.)
- Speech-to-text: Edge Function wrapping an STT provider that supports Saudi Arabic (configurable via env; currently OpenAI `gpt-4o-transcribe`)
- Notifications: Expo Notifications (push) + email via Resend; WhatsApp via Meta WhatsApp Cloud API (Sprint 2)
- State/data: TanStack Query; forms: react-hook-form + zod
- i18n: i18next with `en` and `ar`; Arabic must render RTL (I18nManager). Saudi conversational Arabic for user-facing messages.

## Conventions
- Folders: `app/` (routes), `src/components`, `src/features/<feature>`, `src/lib`, `supabase/migrations`, `supabase/functions`
- Every screen file header comment: `// Screen NN · Name — see design/v2/html/<Name>.dc.html`
- All strings via i18n keys, no hard-coded text. All colors via `src/theme/tokens.ts`.
- Every AI action Muntej takes is written to `activity_log` (who, what, why, undoable).
- Touch targets ≥ 44px. Light theme (v2) is the default; keep colors in tokens so a dark theme can be added later.
- Seed script with realistic sample data (Ahmed = manager; Faisal, Abdullah, Noura, Khalid, Saad, Maha = team).

## Working rules
1. Start every feature in plan mode: propose the plan, wait for my OK, then build.
2. Small steps: one feature at a time; run the app and type-check (`npx tsc --noEmit`) before saying done.
3. After each feature: list what changed, how to test it on the phone, then `git commit` with a clear message.
4. If something in the BRD is unclear, ask me ONE question instead of guessing.
5. Never put secrets in the app code. Never delete data without asking.
