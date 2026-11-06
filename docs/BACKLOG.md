# Muntej backlog

Everything started or promised that is **not finished yet**. Pick items from here to run later; when something is
done, move it to "Done" at the bottom with the date. Anything left unfinished in a session gets added here.

Last updated: 2026-11-06

**Kept up to date automatically:** every `npm run ship` adds its release to Done with the date; Claude adds anything left unfinished (and moves finished items to Done) before each release.

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
| 1.7 | **App Store link in invitations** | Invitations, the join page and the download button now open Google Play. Add the App Store link next to it once the iPhone app is live; until then someone on an iPhone can't download from the invitation. | Waits for the App Store |
| 1.8 | **Exposed secrets** | Delete the Expo tokens pasted in chat (three, the newest on 27 Oct is in the EXPO_TOKEN env var: make a new one and tell Claude) in Expo → Access tokens; rotate the SMTP app password that was pasted earlier; **change the Intercom password** (sales@muntej.app) that was pasted on 25 Oct. | — |
| 1.9 | **Intercom support chat** (Saree3 → "Talk to the Muntej team") | In Intercom: Settings → Installation → copy the **Android** (and iOS) API key; Settings → Security → turn on identity verification and copy its **secret**. Run `scripts/set-intercom-keys.ps1` (hidden prompts). Then a new build (2.5). Optional: Messenger colors + greeting. After it's installed, apply `docs/support-chat-announcement.sql` as a migration so Saree3 announces it. | Built (app + `support-identity` deployed); waits for keys + build |
| 1.10 | **WhatsApp report templates** (muntej_report, muntej_action; ar + en, Utility) | Submitted to Meta on 26 Oct, waiting for approval. Until approved, people who haven't written to Muntej's WhatsApp in the last 24 h get the reports by push only. Check: whatsapp setup with {"templates": true, "waba": "1359354379602818"} (lists their status). | Waiting for Meta |
| 1.11 | **Intercom chat inside the app** | Done differently (26 Oct): Intercom's Android SDK froze on an empty screen, so it was removed; the chat is Intercom's web Messenger inside the app (screen 57, web view, from version 1.2.0). Unread badge on the phone is not available this way. Optional: Messenger → Install → secure the messenger (identity verification). | Built, test in 1.2.0 |
| 1.12 | **Push when the Muntej team replies** (support chat) | Intercom → Settings → Integrations → Developer Hub → New app → Webhooks: URL https://katwiedukkvssuxbjbqf.supabase.co/functions/v1/intercom-webhook, topic conversation.admin.replied. Then run scripts/set-intercom-webhook-secret.ps1 with the app's Client secret. Function deployed and waiting. | Waiting for setup |
| 1.13 | **WhatsApp invite template** (muntej_join, ar + en, Utility) | Submitted 26 Oct, waiting for Meta. Until approved, invites fall back to email (when the person has one). The first version (muntej_invite) was rejected because it carried a PIN: Meta allows codes only in authentication templates. | Waiting for Meta |
| 1.14 | **WhatsApp sign-in code by template** (muntej_code, authentication) | Meta refused to create it: this business account needs permission for authentication templates (business verification in Meta Business Settings). Not blocking: people get their code by sending «رمز الدخول» to Muntej's number (the app opens it), and Saree3 replies. | Needs Meta business verification |
| 1.15 | **Read the company directory** (Build your team → Connect your system) | Google Workspace: add the scope admin.directory.user.readonly to the OAuth consent screen (Google Cloud → APIs & Services → Data access) and enable the Admin SDK API; needs a Workspace admin to sign in. Microsoft 365: set the Azure app keys (1.6) and add the delegated permission User.Read.All (admin consent). Jisr: no public API for us yet; the Jisr Excel export works through Upload a file. | Built, needs setup |
| 1.16 | **Go live on Google Play** | Play Console account (25 USD + identity; an Organization account skips the 12-testers × 14-days test), create the app, upload the .aab from the GitHub release to Internal testing, then listing / App content / Data safety from docs/store/google-play.md with graphics from store/android/, Production → send for review. Then a service-account JSON so later uploads go by themselves. Review login for App access: play-review@muntej.app + the code in REVIEW_LOGIN_CODE (demo company from scripts/store/review-seed.sql). Optional: an alias for play-review@muntej.app in Google Workspace so its code emails stop bouncing. | On hold by owner (28 Oct): Internal testing is live; Production / Send for review waits until a batch of enhancements is done |
| 1.17 | **New Expo token** | The one in EXPO_TOKEN stopped working on 27 Oct (deleted?): app updates and builds are blocked. Make one in expo.dev → Access tokens, give it to Claude (saved as the user env var and the GitHub secret). Then ship the waiting app changes: authenticator option removed from Sign-in & security (no one has it any more: removed on the server already), code screen asks for the fingerprint. | Blocked |
| 1.18 | **iPhone app in the App Store** | Build 1 (1.0) uploaded from Mohammed's Mac on 2 Nov and processed. Left: someone with App Manager access fills the listing, privacy answers, review sign-in and screenshots from [docs/store/app-store.md](store/app-store.md) (our API key is read-only), then Submit for Review. | Waits for the App Store Connect form |
| 1.19 | **Report emails are off for now** | muntej.app is verified and the sender is sales@muntej.app. On the owner's call (5 Nov) only invitations and sign-in codes go by email; set the secret REPORT_EMAILS to on to bring the daily and weekly reports back. The email channel still shows in Alerts settings meanwhile. | Off until the owner asks |

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
| 3.0 | **Added to a company, on a real phone:** Add someone who already uses Muntej: they should get a push and the card on top, Open takes them in and you hear they joined. Share a join link with someone who has no mobile or email. Checked on the web build and against the database, not yet on a phone. Known gap: someone who joined by link and signs out can't sign in again until they have a mobile or email on their profile. |
| 3.01 | **Arabic and English on a real Android phone:** Arabic on the right, English sentences on the left, no cut letters ("مدير"), Reject all shows its bar. Checked on the web build only |
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
| 3.12 | Fingerprint on version 1.3.0 (Play install): Home offer «تبي تفتح منتج ببصمتك؟», then sign out → «ادخل ببصمتي» goes straight in. Sign-in is now fingerprint, email code or WhatsApp only (authenticator step removed 27 Oct) |
| 3.13 | Team → «تحديد»: pick several people and delete; deleting a manager deletes their team after the confirm; Restore brings the whole group back (Select bar on Android) |
| 3.14 | Proof optional by default + «اطلب إثبات» on a task; late tile shows only unfinished tasks; «خلصت متأخرة» / «انرسلت متأخرة» labels |
| 3.15 | Admin setup chat with Saree3 (screen 63): sign up with a new email → company card → team by voice / photo / file → first task → Home; leave halfway → Home card resumes. Tested on web with a test company (Najm, khalid@najm-logistics.test) |
| 3.16 | Manager / employee setup chat (screen 63): invited person signs in → confirm role, manager and team → how to reach you → fingerprint (phone) → first task with وصلت / أحتاج وقت / مساعدة → manager: who joined + remind → Home. Tested on web as test Faisal (manager) and Saad (employee) in the Najm test company; fingerprint only on a phone |
| 3.17 | Onboarding on WhatsApp + reminders: an invited person who writes to Muntej's number is signed in by it and set up there (صح / فيه غلط → first task or team reminder); whoever invited them hears «X في منتج الحين 🎉»; the daily 09:30 job nudges setups left halfway (day 1 and 3, from 29 Oct on) and resends unopened invites (day 1 and 3). Tested in simulation with test Maha (fake mobile 966500000777) |

## 4. Later ideas (not started)

| # | Item |
|---|------|
| 4.1 | Meeting bot for any platform (Zoom, Teams, Meet) via a paid meeting-bot service |
| 4.2 | ~~Rename "Tasks from email"~~ done: "Tasks from your tools" (24 Oct) |
| 4.3 | Connect your tools: show every linked account of the same tool (today the card status shows the first one) |
| 4.4 | Follow-ups scheduled before 23 Oct keep the old text; only new tasks get Saree3's new voice |
| 4.5 | Clear "you deleted your account" message on sign-in (today a generic error) and let a manager re-add someone who left |
| 4.7 | Onboarding: a «كمّل هنا في الواتساب» button on the WhatsApp invite itself (needs a new template version once muntej_join is approved), and set-up status (set up / not yet) next to invite status on the Team list |
| 4.8 | Better company name from the email domain ("najm-logistics" → "Najm Logistics"; today the dash stays) in the sign-up trigger |
| 4.9 | **Hindi: a Hindi speaker should read the main screens** before it's advertised (all 4,167 strings are machine translated). Hindi WhatsApp templates still need submitting to Meta through the `whatsapp` setup action; until approved, the English template goes out with the Hindi text inside |
| 4.10 | Translate more than tasks: chat and direct messages, proof notes and comments still stay in the words they were written in |
| 4.11 | The task screen doesn't show the description or definition of done, so their translations aren't visible there yet |
| 4.12 | Tasks listed under a connected tool (`useToolTasks`) and in lists that come straight from database functions still show the original title |
| 4.13 | Demo picker: Faisal (966500000002) signs in to a login with no profile, so he sees "not added yet" and no tasks (found 5 Nov, not caused by translation) |

## 5. Cleanup

| # | Item |
|---|------|
| 5.1 | Invite-code tables and functions are unused since codes were dropped (`invite_codes`, `invite_joins`, `invite_attempts`, `create_invite_code`, `redeem_invite`…): drop them in a migration |
| 5.2 | Side sessions started earlier (chat table card, logo, review countdown) are idle: confirm nothing is left unmerged |

---

## Done

(move finished items here with the date)

- 2026-11-06 · Arabic task messages can't swap who gave the task and who received it (server: connect, intake, muntej-chat, public-api, sync-sources, whatsapp)
- 2026-11-05 · Muntej in Hindi: a language people can choose, with Arabic staying the default (server: admin-login, autopilot, connect, daily-summary, delete-account, intake, intercom-webhook, invite, localize-text, muntej-chat, onboarding-nudges, parse-task, phone-auth, public-api, quick-login, send-followups, speak, suggest-skills, suggest-steps, support-identity, sync-sources, team-alerts, team-import, transcribe, translate-task, verify-proof, webhook-dispatch, whatsapp · app update 1.0.0)
- 2026-11-05 · Tasks reach each person in their language, with the original one tap away (server: autopilot, daily-summary, intercom-webhook, muntej-chat, onboarding-nudges, send-followups, sync-sources, team-alerts, translate-task, whatsapp · app update 1.0.0)
- 2026-11-05 · Decisions and task buttons answer at once; Saree3 stops showing a false error on polite replies (server: muntej-chat · app update 1.0.0)
- 2026-11-05 · Main buttons always show their label; invitations open Google Play; report emails off for now; admins can delete their account; Saree3 spots more duplicates and dates every task it just made (server: daily-summary, delete-account, muntej-chat, quick-login · app update 1.0.0)
- 2026-11-04 · Active means really signed in; direct messages go to the right person; Arabic reads right to left; Reject all shows progress (server: connect, intake, invite, muntej-chat, onboarding-nudges, public-api, sync-sources, whatsapp · app update 1.0.0)
- 2026-11-04 · People added to a company are really told; Team shows who knows (server: admin-login, autopilot, daily-summary, intercom-webhook, invite, muntej-chat, onboarding-nudges, phone-auth, quick-login, send-followups, sync-sources, team-alerts, whatsapp · app update 1.0.0)
- 2026-11-04 · Chat makes a real task per person, counts match Home, QA checks real cases (server: connect, daily-summary, intake, muntej-chat, public-api, sync-sources, whatsapp · app update 1.0.0)
- 2026-11-04 · Chats: your own asks to others are not your tasks (server: connect, intake, public-api, sync-sources, whatsapp)
- 2026-11-04 · Email and chat bring only work asked of you (server: connect, intake, public-api, sync-sources, whatsapp)
- 2026-11-04 · Email and chat bring only work asked of you (server: connect, intake, public-api, sync-sources, whatsapp)
- 2026-11-02 · Support replies notify at once, chat stays on tasks (server: intercom-webhook, muntej-chat)
- 2026-11-02 · Chat asks one sharp question for vague tasks, clear errors with auto retry, full month tab label, WhatsApp needs your number (server: muntej-chat · app update 1.0.0)
- 2026-11-02 · Clearer scroll-down hint in Saree3's tour (app update 1.0.0)
- 2026-11-02 · Setup chat understands a no instead of naming the company no (app update 1.0.0)
- 2026-11-02 · Tapping a notification never shows Page could not be found (server: autopilot, daily-summary, intercom-webhook, muntej-chat, onboarding-nudges, send-followups, sync-sources, team-alerts · app update 1.0.0)
- 2026-11-02 · Super admin signs in as supermuntej: password + code on email (server: admin-login, phone-auth · app update 1.0.0)
- 2026-11-02 · WhatsApp: a tapped button acts in the account it belongs to (server: whatsapp)
- 2026-11-02 · Manager alerts reach WhatsApp: decisions, work to review, help asked (server: autopilot, daily-summary, intercom-webhook, muntej-chat, onboarding-nudges, send-followups, sync-sources, team-alerts · app update 1.0.0)
- 2026-11-02 · No fake numbers for new users; updates never restart mid-onboarding (app update 1.0.0)
- 2026-11-01 · Setup chat: employees can fix their name, one welcome message (app update 1.0.0)
- 2026-11-01 · Team: no duplicate people, recording indicator, Team title and tags (server: connect, muntej-chat, team-import · app update 1.0.0)
- 2026-11-01 · Store version 1.0.0 (app update 1.0.0)
- 2026-10-29 · Onboarding release 3: setup on WhatsApp, joined notices, daily reminders (server: autopilot, daily-summary, intercom-webhook, invite, muntej-chat, onboarding-nudges, send-followups, sync-sources, team-alerts, whatsapp · app update 1.3.0)
- 2026-10-29 · Onboarding release 2: manager and employee setup chat (app update 1.3.0)
- 2026-10-29 · Onboarding release 1: admin setup chat with Saree3 (app update 1.3.0)
- 2026-10-29 · Arabic by default + language button; How should I reach you?; WhatsApp numbered list (server: autopilot, daily-summary, intercom-webhook, muntej-chat, send-followups, sync-sources, team-alerts, whatsapp · app update 1.3.0)
- 2026-10-28 · Add on a found task: expired sign-in is refreshed and retried; plain error otherwise (server: autopilot, connect, daily-summary, intake, intercom-webhook, muntej-chat, public-api, send-followups, sync-sources, team-alerts, whatsapp · app update 1.3.0)
- 2026-10-29 · Arabic by default with an English / العربية button before sign-in; "How should I reach you?" (App / WhatsApp / Both) in Settings; WhatsApp: tasks found in tools as one numbered list, approve / ignore all or by numbers (app update + server)
- 2026-10-28 · Add on a found task no longer fails with "non-2xx status code": an expired sign-in is refreshed and retried once; other failures say so plainly (app update)
- 2026-10-28 · Chats aren't tasks: call / meeting set-ups, answered asks and someone's own work list are no longer tasks; in a chat a teammate gets work only when named (server only, live)
- 2026-10-28 · "Your steps in Muntej" moves for everyone: recorded for admins too, and your own tasks count (opened, moved, finished) (server only, live)
- 2026-10-28 · WhatsApp: one report per number (the account you work in, same as the chat); "What needs me" also lists the team's late tasks (server only, live)
- 2026-10-28 · Sign-in is fingerprint, email code or WhatsApp only; code screen offers the fingerprint; shorter WhatsApp report (server: daily-summary, quick-login · app update 1.3.0)
- 2026-10-28 · Short WhatsApp report: one message (counts + up to 3 things that need you + buttons); full report stays in email (server only, live)
- 2026-10-27 · Backlog updates itself on every release
- 2026-10-27 · Fingerprint-only sign-in, Home fingerprint offer, "Sign-in & security" row
- 2026-10-27 · `npm run ship` one-step release; Android builds on GitHub (1.3.0 APK built)
- 2026-10-27 · Delete several people / a whole team with restore; proof optional; late vs finished late
- 2026-10-26 · QA robot (`npm run qa`)
