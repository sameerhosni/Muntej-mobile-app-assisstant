# Deploying Muntej (for a developer on the team)

Owner, 10 Nov: "let's deploy everything on github so essam can deploy it". This page is everything needed to release
Muntej from your own PC. Nothing secret is in the repository: you get the keys from Sameer (see "Access you need").

## What Muntej is made of

| Part | Where | How it goes out |
|---|---|---|
| Mobile app (Expo / React Native) | `app/`, `src/` | over-the-air update (EAS Update) to a channel, or a new build |
| Server functions (Supabase Edge Functions, Deno) | `supabase/functions/` | `supabase functions deploy` |
| Database (Postgres) | `supabase/migrations/` | applied in order by `scripts/db-apply.ps1` |
| Android builds | `.github/workflows/android-build.yml` | GitHub Actions (tag `android-test-*` / `android-production-*`) |
| iPhone builds | `.github/workflows/ios-build.yml` | GitHub Actions (tag `ios-test-*` = TestFlight test build, `ios-production-*` = App Store build) |

Supabase project ref: `katwiedukkvssuxbjbqf`. Expo project: Muntej (owner: Sameer's Expo account).

**Channels.** `preview` = Muntej Test (the Android test app, and the iPhone TestFlight test build). `production` = the
store apps. Test releases only ever go to `preview`; `--live` republishes the same tested update to `production`.

## Access you need (ask Sameer)

1. **GitHub**: collaborator on `sameerhosni/Muntej-mobile-app-assisstant`.
2. **Supabase**: a personal access token with access to the project → user environment variable `SUPABASE_ACCESS_TOKEN`.
3. **Expo**: membership of the Expo project, and an access token → user environment variable `EXPO_TOKEN`.
4. The database password is not needed: migrations go through the Supabase API with your access token.

Never commit any of these. Server keys (OpenAI, WhatsApp, Resend, Google, Microsoft…) live in Supabase secrets, set
with the `scripts/set-*.ps1` scripts; you don't need them to release.

## One-time setup (Windows)

```powershell
git clone https://github.com/sameerhosni/Muntej-mobile-app-assisstant.git
cd Muntej-mobile-app-assisstant
npm ci
# a company network that inspects TLS: Node must trust the Windows certificates
[Environment]::SetEnvironmentVariable('NODE_OPTIONS', '--use-system-ca', 'User')
```

Check it builds: `npx tsc --noEmit` (no output = fine).

## The rules before any release (CLAUDE.md, docs/review/)

1. Every change is committed. `scripts/ship.mjs` refuses uncommitted code.
2. The change was reviewed: the `muntej-reviewer` agent said **ACCEPT**, and that line is in `docs/review/ACCEPTED.md`
   (`- \`<commit>\` · <date> · ACCEPT · <what>`). Ship refuses code changed after the last accepted commit.
3. QA must be green: `npm run qa` (it runs inside ship too). Re-run once if a single AI-judged check flakes.
4. One release at a time. Don't commit while a release is running (ship stops if HEAD moves).
5. New user-facing text needs Hindi: `npm run i18n:hi` (QA fails otherwise).

## Release to Muntej Test

```powershell
npm run ship -- "what changed, in one line"
```

It runs, and stops at the first failure: review check → QA → database changes → server functions that changed →
app update to `preview` (Muntej Test) → backlog line → push to GitHub → moves the `testing` tag.

Testers get the app update after closing and reopening the app twice. New features stay testers-only
(`features.testing`) until live.

## Go live (only after Sameer approves the test)

```powershell
npm run ship -- --live
```

Republishes the exact tested update to `production`, switches the tested features on for everyone, and pushes.

## Builds

- **Android Muntej Test APK**: `npm run ship -- "…" --build`, or push a tag `android-test-<anything>`.
- **iPhone TestFlight test build** (gets Muntej Test updates): push a tag `ios-test-<anything>`, or Actions → iOS build →
  Run workflow → `testflight`. It is uploaded to App Store Connect → TestFlight; add testers there (Internal Testing).
  Never submit this build for App Store review.
- **iPhone App Store build**: tag `ios-production-<anything>` (Actions secrets `EXPO_TOKEN`, `ASC_KEY_ID`,
  `ASC_ISSUER_ID`, `ASC_KEY_P8` are already set in the repository).

## If something fails

- `fetch failed` / Cloudflare 520 in QA: network, run again.
- A deploy asks for confirmation: ship already passes `--yes`.
- A migration with Arabic text looks garbled: apply it with `Get-Content -Encoding UTF8` (db-apply does).
- WhatsApp stops answering: Meta app → WhatsApp → Configuration → "Subscribe webhooks" must be ON.
