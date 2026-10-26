# Muntej backlog

Everything started or promised that is **not finished yet**. Pick items from here to run later; when something is
done, move it to "Done" at the bottom with the date. Anything left unfinished in a session gets added here.

Last updated: 2026-10-23

---

## 1. Needs the owner (accounts, keys, settings outside the app)

| # | Item | What's left | Code status |
|---|------|-------------|-------------|
| 1.1 | **WhatsApp voice notes → tasks** (number 0115209855) | Meta setup: business app + WhatsApp, add 0115209855 (voice-call verification; must not be on the WhatsApp app), permanent token, run `scripts/set-whatsapp-keys.ps1`, paste webhook URL + verify token in Meta, subscribe to `messages`. Then test end to end. | Built and deployed (`supabase/functions/whatsapp`, WhatsApp card on Connect your tools) |
| 1.2 | **Google Meet transcripts → tasks** | Google Cloud → enable **Google Meet REST API**; reconnect Google in the app ("Allow" on the Meet line); Workspace plan with transcripts; host turns on Transcripts / Take notes with Gemini. Test end to end. | Built and deployed |
| 1.2b | **Google Chat → tasks** | Google Cloud → enable **Google Chat API**; its **Configuration** tab: app name "Muntej", avatar URL, description, uncheck "Interactive features", Visibility = your domain, Save. OAuth consent screen → Data access → add chat.spaces.readonly, chat.messages.readonly, chat.memberships.readonly. Then in the app: Connected tools → Google → "Allow" on the Chat line. Workspace accounts only. Test end to end. | Built and deployed |
| 1.2c | **Public API v1 + webhooks go-live** | Built, **not applied/deployed** (waits for the owner): apply `supabase/migrations/20261024200000_public_api.sql`; deploy `public-api` (--no-verify-jwt via config) and `webhook-dispatch`; create a key (`create_api_key`). Then: an admin screen in Settings to make / revoke keys (today: RPC only), invitation email for people added through the API, optional custom domain api.muntej.app. Docs: docs/api/README.md, docs/api/openapi.yaml, docs/design/HLD.md + LLD.md. | Built, not deployed |
| 1.2d | **Muntej add-on inside Google Meet** | Waits for the owner's Workspace setup: Google Cloud → enable **Google Workspace Marketplace SDK** → App configuration → Meet add-on (side panel URL from us) → publish privately to muntej.app. Then build the panel: "Start task listener" (Saree3 reads that meeting's transcript right when it ends + one push), live quick-add by voice / text in the panel with owner + date, sign-in with the connected Google account. Truly live listening needs Google's **Meet Media API Developer Preview** (apply; weeks). Public listing for other companies needs Google review. | Planned |
| 1.3 | **Google sign-in for everyone** | Google Cloud → Branding: add authorized domain `muntej.app`, Save → Audience: **Publish app**. Later: Google verification (Gmail is a restricted scope → security assessment) to remove the "unverified app" warning and the 100-user cap. In test mode refresh tokens expire every 7 days. | Done in code |
| 1.4 | **Code emails land in spam** | Add DNS TXT on muntej.app: `v=spf1 include:_spf.google.com include:spf.brevo.com ~all`. Then turn the shared code off. | — |
| 1.5 | **Shared sign-in code 123456** | On for every existing person until **6 Nov 2026** (`QUICK_LOGIN_ALL`). Turn off once 1.4 works: `scripts/enable-quick-login.ps1 -Off`. | Temporary |
| 1.6 | **Microsoft 365 / Outlook / Teams** | Azure app registration, run `scripts/set-microsoft-keys.ps1`. Card shows "needs setup" until then. | Built |
| 1.7 | **Download page on muntej.app** | Host `website/index.html` on muntej.app; then replace the Expo build link (`DOWNLOAD_URL` in `src/features/invite/api.ts`, `supabase/functions/muntej-chat`, `supabase/templates/invite.html`). | Page built |
| 1.8 | **Exposed secrets** | Delete the Expo tokens pasted in chat (two) in Expo → Access tokens; rotate the SMTP app password that was pasted earlier; **change the Intercom password** (sales@muntej.app) that was pasted on 25 Oct. | — |
| 1.9 | **Intercom support chat** (Saree3 → "Talk to the Muntej team") | In Intercom: Settings → Installation → copy the **Android** (and iOS) API key; Settings → Security → turn on identity verification and copy its **secret**. Run `scripts/set-intercom-keys.ps1` (hidden prompts). Then a new build (2.5). Optional: Messenger colors + greeting. After it's installed, apply `docs/support-chat-announcement.sql` as a migration so Saree3 announces it. | Built (app + `support-identity` deployed); waits for keys + build |
| 1.10 | **WhatsApp report templates** (muntej_report, muntej_action; ar + en, Utility) | Submitted to Meta on 26 Oct, waiting for approval. Until approved, people who haven't written to Muntej's WhatsApp in the last 24 h get the reports by push only. Check: whatsapp setup with {"templates": true, "waba": "1359354379602818"} (lists their status). | Waiting for Meta |
| 1.11 | **Intercom chat inside the app** | Done differently (26 Oct): Intercom's Android SDK froze on an empty screen, so it was removed; the chat is Intercom's web Messenger inside the app (screen 57, web view, from version 1.2.0). Unread badge on the phone is not available this way. Optional: Messenger → Install → secure the messenger (identity verification). | Built, test in 1.2.0 |

## 2. Needs a new app build (can't come by over-the-air update)

| # | Item |
|---|------|
| 2.1 | Muntej logo as the notification icon (configured in `app.json`, shows gray until a build) |
| 2.2 | Copy buttons + "Paste code" on the sign-in code screen (`expo-clipboard`) |
| 2.3 | Photo / file proof (`expo-image-picker`, `expo-document-picker`) |
| 2.4 | New app icon and splash |
| 2.5 | Intercom Messenger (`@intercom/intercom-react-native`, keys from EAS env via `app.config.js`): after 1.9 |

Build: `scripts/build-android.ps1` (needs an Expo token in the Terminal).

**2026-10-23: built** (build ff6a1108, all four inside). Left: install it on the phones and confirm, then move 2.1–2.4 to Done. Also point the download links (`DOWNLOAD_URL`, invite email, website) at this build.

## 3. To test on a phone (built, not verified end to end)

| # | Item |
|---|------|
| 3.1 | Saree3's setup guide (owner + invited member), the setup bar on main screens, the 10:00 setup reminder |
| 3.2 | One-time screen tips (Home, Chat, Tasks, Tasks from email, task page, Team, Decisions, More) |
| 3.3 | Tasks from email: owner / time / priority / details from the email, 3 email accounts, Gmail switches |
| 3.4 | Invite by email + WhatsApp message; chat "invite Faisal on WhatsApp" |
| 3.5 | Weekly summary read aloud (`speak` function) |
| 3.6 | Shorter chat replies with one next step |
| 3.7 | Reset onboarding / screen tips on the test accounts (salsabilsamir@gmail.com, sales@nizamy.app) to try the new guide |
| 3.8 | Saree3's guided walkthrough on Home, Tasks, Tasks from email, task page, Team, Decisions (highlight lines up with the element; "Show me how" demos; "Teach me this page") |
| 3.9 | Notification background is drawn by Android (dark in dark mode): only the icon and name color are ours (Muntej purple, in the new build) |
| 3.10 | Muntej from WhatsApp: chat as you (questions, new task, move / give a task with Confirm), "وش يحتاجني" cards (approve a decision, approve / send back a review with a note, Done / Need time / Need help), forwarded message → Approve / Ignore, "تقرير". Tested as dry runs only (nothing sent). |
| 3.11 | Three reports a day on WhatsApp (08:00 / 13:00 / 17:30): full report + buttons inside the 24 h window, the template outside it |

## 4. Later ideas (not started)

| # | Item |
|---|------|
| 4.1 | Meeting bot for any platform (Zoom, Teams, Meet) via a paid meeting-bot service |
| 4.2 | ~~Rename "Tasks from email"~~ done: "Tasks from your tools" (24 Oct) |
| 4.3 | Connect your tools: show every linked account of the same tool (today the card status shows the first one) |
| 4.4 | Follow-ups scheduled before 23 Oct keep the old text; only new tasks get Saree3's new voice |
| 4.5 | Clear "you deleted your account" message on sign-in (today a generic error) and let a manager re-add someone who left |

## 5. Cleanup

| # | Item |
|---|------|
| 5.1 | Invite-code tables and functions are unused since codes were dropped (`invite_codes`, `invite_joins`, `invite_attempts`, `create_invite_code`, `redeem_invite`…): drop them in a migration |
| 5.2 | Side sessions started earlier (chat table card, logo, review countdown) are idle: confirm nothing is left unmerged |

---

## Done

(move finished items here with the date)
