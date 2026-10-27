# Google Play release — Muntej (sa.muntej.app)

Everything Play Console asks for, ready to paste. Arabic is the main listing (Saudi users); English is the second.

## Links
| Field | Value |
|---|---|
| Privacy policy | https://nizamy-muntej.expo.app/privacy.html |
| Account deletion (web) | https://nizamy-muntej.expo.app/delete-account.html |
| Support / contact email | sales@muntej.app |
| Website | https://muntej.app (when live; until then the privacy URL) |

## Store listing

**App name** (30): `منتج – مساعد المهام` · EN: `Muntej – Task Assistant`

**Short description** (80)
- AR: `قل المهمة وانساها: منتج يسلّمها لفريقك، يتابعها، ويرجع لك بالنتيجة.`
- EN: `Say the task and forget it. Muntej hands it off, follows up and reports back.`

**Full description** (4000)

AR:
```
منتج مساعدك التنفيذي الذكي. تقول المهمة بصوتك أو تكتبها، وسريع (مساعدك في منتج) يتكفّل بالباقي:
يعرف مين الأنسب يسويها، يسلّمها له، يتابعه بلطف، يجمع الإثبات، ويرجع لك بالنتيجة. أنت تتخذ القرار بس.

• قل المهمة وانساها: بالصوت أو بالكتابة، وتصير مهمة كاملة بموعد ومسؤول.
• متابعة بدونك: سريع يذكّر ويتابع، وما يزعجك إلا إذا احتجت تقرر.
• أدواتك في مكان واحد: يقرا جيميل وقوقل شات واجتماعات ميت والواتساب، ويطلّع لك المهام توافق عليها بضغطة.
• لمحة يومك: كم مفتوحة، كم متأخرة، ووش يحتاجك، في صفحة وحدة.
• ملخص الصباح: دقيقة وتعرف وين وصل فريقك.
• للموظف: يعرف بالضبط وش المطلوب، ويحدّث بضغطة، وشغله ينشاف.

منتج مو أداة إدارة مشاريع: ما فيه لوحات ولا أعمدة. أنت العقل، ومنتج يتولّى الباقي.
```

EN:
```
Muntej is your AI chief of staff. Say a task or type it, and Saree3 (your assistant in Muntej) takes it from there:
he picks the right person, hands it off, follows up kindly, collects the proof and reports back. You only decide.

• Say it and forget it: by voice or text, it becomes a full task with an owner and a due date.
• Follow-ups without you: Saree3 reminds and chases, and only comes to you when a decision is needed.
• All your tools in one place: reads Gmail, Google Chat, Meet and WhatsApp, and brings you the tasks to OK with one tap.
• Your day at a glance: open, late and what needs you, on one page.
• Morning brief: one minute to know where your team stands.
• For employees: clear asks, one-tap updates, and work that gets seen.

Muntej is not a project-management tool: no boards, no columns. You're the brain; Muntej handles the rest.
```

**Category:** Productivity · **Tags:** task management, team, assistant, productivity
**Graphics needed:** icon 512×512 (assets/icon.png scaled), feature graphic 1024×500, 2–8 phone screenshots
(suggested: Home "لمحة اليوم", a task from Google Chat with Approve, WhatsApp voice note → task, the tool page, Saree3's popup).

## App content (Policy → App content)

**Ads:** No ads.

**App access:** Restricted. Reviewers need a test login:
- Create a reviewer account (e.g. `review@muntej.app`) in a demo company with sample data.
- Sign-in is by email code: give the reviewer the code path that works for them (the temporary shared code, or a fixed
  code for that one address). Put the steps in "Instructions".

**Content rating questionnaire (IARC):** Category "Utility, Productivity, Communication or Other". Answer **No** to
violence, sexuality, language, drugs, gambling. **Yes** to "users can interact / exchange content" (team chat, comments)
and "shares user's location": **No**. Expected rating: Everyone / 3+.

**Target audience:** 18 and over (work tool). Not designed for children.

**News app:** No. **COVID tracing:** No. **Government app:** No. **Financial features:** None.

## Data safety form
Data is encrypted in transit: **Yes**. Users can request deletion: **Yes** (in app + web link above).
No data is sold. No data is used for ads.

| Data type | Collected | Shared* | Purpose | Optional? |
|---|---|---|---|---|
| Name | Yes | No | App functionality, Account management | Required |
| Email address | Yes | No | App functionality, Account management | Required |
| Phone number | Yes | No | App functionality (WhatsApp) | Optional |
| User IDs | Yes | No | App functionality, Account management | Required |
| Emails (messages) | Yes | No | App functionality (finding tasks in connected Gmail/Outlook) | Optional |
| Other in-app messages | Yes | No | App functionality (tasks, comments, chat with Saree3, support chat) | Required |
| Voice or sound recordings | Yes (processed to text, not stored) | No | App functionality | Optional |
| Photos / Files and docs | Yes | No | App functionality (proof of work) | Optional |
| Calendar events | Yes | No | App functionality (meeting tasks) | Optional |
| App interactions | Yes | No | Analytics, App functionality | Required |
| Crash logs / diagnostics | No | | | |
| Device or other IDs | Yes (push token) | No | App functionality (notifications) | Required |
| Location, contacts, financial, health | No | | | |

*"Shared" means given to a third party for its own use. Our processors (Supabase, OpenAI, Expo, Intercom, Meta,
email provider) act for us, which Google does not count as sharing.

## Permissions to explain if asked
- Microphone (RECORD_AUDIO): saying a task by voice.
- Notifications (POST_NOTIFICATIONS): reminders, decisions, the morning brief.
- Photos / files: attaching proof of done work.

## Release path (updated 27 Oct)
**Ready:** the .aab is built on GitHub (`npm run ship -- "msg" --store`, or a tag `android-production-*`), signed with
the Expo keystore, and attached to a GitHub release. Graphics are in `store/android/` (`node scripts/store/graphics.mjs`
remakes them): icon-512.png, feature-graphic.png, 1-home … 5-team.png (1080×2160). Privacy + deletion pages are live.

**Owner (account, payment and identity are yours to do):**
1. https://play.google.com/console/signup: one-time 25 USD and identity check. Prefer an **Organization** account
   (needs the company's D-U-N-S number): a **Personal** account must first run a closed test with 12 testers for
   14 days before Production opens.
2. Create app → name `منتج – مساعد المهام`, default language Arabic, App, Free; accept the declarations.
3. Testing → **Internal testing** → Create release → upload the .aab from the GitHub release (accept Play App Signing)
   → add your email as tester → Roll out. Install from the test link to check.
4. Store listing (texts above, graphics from store/android/), App content and Data safety (answers above), then
   **Production** → Create release → the same .aab → Send for review (a new app usually takes 1–7 days).
5. Hands-free uploads later: Play Console → Setup → API access → a service account with "Release manager" → its JSON
   key to Claude; `eas submit --platform android` then uploads each new .aab.

After that, app changes reach the store app over the air on the **production** channel (`npm run ship`); a new store
upload is only needed for native changes (`npm run ship -- "msg" --store`).

## Before public release (not blocking internal testing)
- Google OAuth verification for the Gmail / Chat / Meet scopes (restricted scopes need a security assessment) — see
  backlog 1.3. Until then, Google sign-in for those tools shows "unverified app" and is capped at 100 users.
