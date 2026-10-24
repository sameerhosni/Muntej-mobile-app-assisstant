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
| 1.3 | **Google sign-in for everyone** | Google Cloud → Branding: add authorized domain `muntej.app`, Save → Audience: **Publish app**. Later: Google verification (Gmail is a restricted scope → security assessment) to remove the "unverified app" warning and the 100-user cap. In test mode refresh tokens expire every 7 days. | Done in code |
| 1.4 | **Code emails land in spam** | Add DNS TXT on muntej.app: `v=spf1 include:_spf.google.com include:spf.brevo.com ~all`. Then turn the shared code off. | — |
| 1.5 | **Shared sign-in code 123456** | On for every existing person until **6 Nov 2026** (`QUICK_LOGIN_ALL`). Turn off once 1.4 works: `scripts/enable-quick-login.ps1 -Off`. | Temporary |
| 1.6 | **Microsoft 365 / Outlook / Teams** | Azure app registration, run `scripts/set-microsoft-keys.ps1`. Card shows "needs setup" until then. | Built |
| 1.7 | **Download page on muntej.app** | Host `website/index.html` on muntej.app; then replace the Expo build link (`DOWNLOAD_URL` in `src/features/invite/api.ts`, `supabase/functions/muntej-chat`, `supabase/templates/invite.html`). | Page built |
| 1.8 | **Exposed secrets** | Delete the Expo tokens pasted in chat (two) in Expo → Access tokens; rotate the SMTP app password that was pasted earlier. | — |

## 2. Needs a new app build (can't come by over-the-air update)

| # | Item |
|---|------|
| 2.1 | Muntej logo as the notification icon (configured in `app.json`, shows gray until a build) |
| 2.2 | Copy buttons + "Paste code" on the sign-in code screen (`expo-clipboard`) |
| 2.3 | Photo / file proof (`expo-image-picker`, `expo-document-picker`) |
| 2.4 | New app icon and splash |

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
