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

## Release path
1. Build the Android App Bundle (.aab): `eas build --platform android --profile production` (signing managed by EAS,
   Play App Signing on).
2. Play Console → Testing → **Internal testing** → create release → upload the .aab → add testers (emails) → roll out.
3. Fill the listing + App content above; then **Production** (or Closed testing first if the account is a personal
   one created after Nov 2023: 12 testers × 14 days).
4. Later uploads can go automatically: a Play service-account JSON key → `eas submit --platform android`.
5. Over-the-air updates for the store app go to the **production** channel (`publish-update.ps1 -Channel production`).

## Before public release (not blocking internal testing)
- Google OAuth verification for the Gmail / Chat / Meet scopes (restricted scopes need a security assessment) — see
  backlog 1.3. Until then, Google sign-in for those tools shows "unverified app" and is capped at 100 users.
