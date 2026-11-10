# Muntej release review rules

This is the rulebook the code-review agent checks before every Muntej release (Expo app + Supabase server, Arabic first).
Every rule comes from a mistake that really happened in this project: the owner's complaint, the commit that fixed it, or a QA case.
Every new owner complaint adds a rule here (and a DB-judged case in `scripts/qa/cases.mjs`) before the fix ships.
Read a diff against every area it touches; a rule that fails blocks the release until it is fixed or the owner agrees.
Last updated: 2026-11-09.

---

## 1. Honesty of the chat and the AI

### R1 · Never say "done" unless the database changed
- **Why:** 2 Nov, Hoda's chat replayed in QA: Saree3 said tasks were made or changed when nothing changed; 5 Nov "Saree3 can't claim work it didn't do" (10e544e, 6a999a8).
- **Check:** any new reply path in `muntej-chat` / `whatsapp` that says تم / سويت / عدّلت / done / created must come after a successful write and use its result. The `CLAIMS_DONE` false-claim guard must still run on every reply.

### R2 · Never mention a card, button or link that isn't in the payload
- **Why:** 9 Nov, Nouran's screenshot "start hallucinating?": a «ايه» was told to "press Confirm on the card" and there was no card (499b4dc).
- **Check:** reply text that says بطاقة / card / اضغط / tap must ship with the matching payload key (`*_proposal`, `*_choice`, `confirm_*`). The prompt must not tell the model to mention cards on its own.

### R3 · Never claim a link to something that wasn't saved
- **Why:** 9 Nov (N14): "nothing in the UI shows that this task belongs to this objective". The objective card was never confirmed, but the chat said the task was under it (8e1e72c).
- **Check:** "under objective X", "linked to X" and "added to X" are said only when the id exists in the DB. When it doesn't exist, the reply must say so («ما ربطتها…»).

### R4 · A polite closing is not a false claim
- **Why:** 5 Nov: «ما يحتاج شي ثاني» and «تمام» got "I couldn't do it, nothing changed", because the guard read «تمام» as «تم» (023644c, 5e6ff04).
- **Check:** guard regexes need word boundaries. «تمام، على راحتك» must not match and «تم، سويتها» must match (QA "Saying nothing else is needed gets no error"). A reply that quotes real task titles is not a claim.

### R5 · Decide facts in code, not by trusting the model
- **Why:** 9 Nov: QA caught the chat still guessing «فيصل» when there were two Faisals, and "who is my boss" was answered wrong once even with the data given (620bcf6, 327b9a3).
- **Check:** ambiguity ("which one?"), permissions, counts and org facts (boss, team) are worked out on the server and returned as data or a forced answer. A prompt line asking the model to "be careful" is not a fix.

### R6 · Answer what's in scope, and say plainly what isn't
- **Why:** 9 Nov: closed tasks "can't be shown", and asking the manager for a budget approval was called out of scope (499b4dc). 2 Nov: out-of-scope asks must get one playful "I only do tasks" line and never a claim of setting something up (6e15871).
- **Check:** changes to scope rules must keep approvals, budget asks and closed tasks (`closed_tasks`) in scope. Out-of-scope replies offer to make it a task and claim nothing.

### R7 · Errors are a clear sentence in the person's language, with one retry
- **Why:** 28 Oct: the owner saw "Edge Function returned a non-2xx status code" (an expired sign-in), and 2 Nov the chat showed the server's English error (9b706ba, 734025e).
- **Check:** app calls to functions refresh on 401 and retry once, then show i18n text. Model refusals, malformed replies and 5xx errors retry once. No raw `error.message` is shown in the UI.

### R8 · Act only on what was really heard
- **Why:** 19 Oct: the transcriber invented names and sentences from silence. 22 Oct: noise turned into four "Contact X" steps that were added without asking (bc34012, 3a51794).
- **Check:** voice input shows "I heard: …" and waits for OK before writing. Very short recordings are dropped, and transcripts that only echo the name hints are rejected.

### R9 · AI is on unless the person turned it off; the iPhone app asks once first
- **Why:** 8 Nov, Apple 5.1.1(i)/5.1.2(i): an AI permission screen was added, and every OpenAI path checks it (ebffb28). 10 Nov, the owner: "AI should be allowed by default … no need to ask for permissions except the user stopped it so give him clear notification of this"; he picked "ask once on iPhone only" (migration 20261110140000).
- **Check:** every new or changed edge-function path that calls OpenAI checks `ai_allowed` (on unless `ai_consent = false`) and returns 403 `ai_consent_required` (or skips) when it is off; the iPhone app keeps its assistant off until the person answers the one-time screen; turning it off sends the one `ai_off` notice. The app never calls OpenAI directly.
### R10 · Send the AI only the person's own account
- **Why:** 22 Oct privacy fix: tool syncs gave the AI every company's people and open tasks (0111c68).
- **Check:** queries that build prompts are scoped to the caller's account and visibility, never a service-role select across accounts.

### R11 · Several people means one real task each, and later changes hit all of them
- **Why:** 4–5 Nov, Hoda's chat: one task for everyone with a junk title («حسب تخصصه»), and "make it Thursday" changed only the first task (10e544e, 2ae4b62).
- **Check:** chat create paths with several owners use `task.each` (a different title per field). "Make it X" after a create updates every task made in that turn. QA chat cases stay green.

### R12 · Update an existing task, don't make a duplicate
- **Why:** 4 Nov: "update Saad's task" created a new one. 5 Nov: duplicates were missed when Arabic words differed only by a glued و or ال (10e544e, a06bfc2).
- **Check:** duplicate and update matching normalises Arabic (و / ال / hamza / ة). Changes to matching keep the QA "Update Saad's task" case green.

---

## 2. Who owns, sees and can change a task

### R13 · Permission rules live in the database, so every channel follows them
- **Why:** 8 Nov: "give to your team and your level" was put in a DB check (`can_assign_to` trigger) so chat, mail, meetings and WhatsApp all obey it. People pickers use `assignable_people` (0d53d11).
- **Check:** no new permission logic only in the app or only in one function. A new write path must go through the RPC or trigger that enforces the rule. Refused writes must save nothing.

### R14 · Visibility: yours, your team's, what your team gave, what names you; admins see everything
- **Why:** 8 Nov, the owner: "Everyone should see his tasks and his team tasks only and other tasks he is mentioned in…" ("keep admin all") (0d53d11).
- **Check:** RLS changes on `tasks` keep the five `rules` QA cases green. `mentioned_ids` is filled by its trigger, not by the app. The team is worked out once per query, not per row (e213def: 203 ms down to 13 ms).

### R15 · Only whoever gave the task (or someone above, or an admin) can cancel it, and there is one Cancel
- **Why:** 9 Nov: "I should not be able to cancel a task I didn't create" and "make it only one option". Delete became Cancel, the record stays, and WhatsApp lost Delete (499b4dc).
- **Check:** every cancel or close button (app, chat card, WhatsApp) is shown only when `cancel_task` would allow it. When anyone else asks, the chat names who can. No hard delete of tasks.

### R16 · Done follows the task's rule: review by default, closes by itself, or closes when the giver is below you
- **Why:** 9 Nov (N3): no choice between auto-close and review. Also 9 Nov: "why should I send it to review?" when someone below him had to approve his work (243aee4, ecc5a95).
- **Check:** status changes go through `set_task_status`, which handles `closes_itself`, a doer above the giver, and admins. The owner can never approve their own work (6904451).

### R17 · Every role has working buttons on the task page
- **Why:** 9 Nov (N2): "I can't change the task status, I only have one CTA غيرها مع منتج". She was only the giver. 8 Nov: «اسأل» showed to the giver, and two taps set the task to 100% (d5ec1c7, d7eee3a).
- **Check:** a new or changed task-page bar must be tried as doer, giver, someone above and admin. Every button does a real server action for that role. "Ask" sends a question and fills nothing in.

### R18 · Act in the account the item belongs to, not the login's default account
- **Why:** 2 Nov: one number in two accounts, and WhatsApp taps answered "not found". 22 Oct: "switch to X" saved the chat under the wrong account and RLS refused it. 9 Nov: WhatsApp answered as the login that hadn't allowed AI (992e68f, 9a04ac6, 5b9f8f7).
- **Check:** code that resolves a profile from `user_id` or a phone number when several profiles exist must pick it from the task / decision / item. Account switches happen last in a turn.

### R19 · An empty seat looks at the person's other accounts
- **Why:** 9 Nov: Nouran's oldest (default) seat was empty, so the chat said she had no manager or team. 23 Oct: the super admin gave a task in an account with only himself, and nobody was told (fc2f684, 985de20).
- **Check:** "who is my boss/team", owner lookup and name hints use `you_in_other_accounts` or every account the person really belongs to (not the super admin's hidden seats). A task with no owner in a one-person account offers to switch.

### R20 · When a name fits two people, ask; never guess
- **Why:** 9 Nov (N10/N15): «نوران…» went to Nouranemira when Sameer meant N Emira. A DM went to a look-alike login (216c4fe, 9247e23).
- **Check:** owner resolution compares first names and initials across the team. If the message doesn't settle it, return a "which one?" choice and make no task. Keep QA "A name that fits two people is asked" and "not a look-alike login" green.

### R21 · Match people already in the team across Arabic and English
- **Why:** 1 Nov: reading a team made duplicate people («سمير» = Sameer, «فيصل الحربي» = Faisal Al-Harbi) (dc6ece0).
- **Check:** every team or people reader goes through the shared matcher. Unsure matches are asked ("Is this Sameer?"), and the server never adds an unanswered one.

### R22 · Invited (pending) people are part of the team and keep their tasks
- **Why:** 9 Nov: "tasks to non added users should be still on their side till they be active and remind them". Pending people were left out when reading tools, so their tasks had no owner (6795fea, 9247e23).
- **Check:** team lists given to readers include `pending`. Nothing reassigns or drops a pending person's tasks. `onboarding-nudges` reminds them every 2 days and logs it.

### R23 · "Active" means really signed in
- **Why:** 5 Nov: "You added 3 active but no one received the invitation yet…". Sending the invite made a login, and that alone said active (6a999a8).
- **Check:** status moves to `active` only on a real sign-in or opening the company. Delete then restore must not mark someone as joined.

### R24 · Test every RPC as an employee too
- **Why:** 1 Nov: "My name is wrong" failed every time for employees because `upsert_person` is managers-only. 22 Oct: admins couldn't save their own name (21e28ba, e136956).
- **Check:** a new flow for everyone must not call a manager-only RPC. Use an own-row RPC (like `set_my_name`). Role checks apply only to the fields that need them.

### R25 · Server functions check the caller's rights, not only the sign-in
- **Why:** QA invite cases: an employee must not get a colleague's join link (403), and someone in another company must not change a task ("Task not found") (90a98d6, 396f137).
- **Check:** every new edge-function action and `security definer` RPC checks the caller's role and account against the target row. Add a refused case to QA.

### R26 · "View as" changes only the screens, and the store review login stays a manager
- **Why:** 5 Nov: recording with the review login showed no Decisions, because the admin was in employee view (8b70cfc, 4cefc58).
- **Check:** view-as never changes server rights. Seed or role changes keep the review login a manager with a decision to show.

---

## 3. Tasks read from email, chats and meetings

### R27 · Only work asked of you or your team becomes a task
- **Why:** 4 and 8 Nov: "Still you are reading all emails regardless if it is task for me or not". Agent reports, sales pitches, cold outreach and newsletters became tasks (425c16a, 10e544e).
- **Check:** reader prompt or code changes keep the QA inbox "Not a task" cases green. System mail is skipped by headers and sender, and the message kind is decided first.

### R28 · In a direct message, what you ask goes to the other person, and what they ask stays yours
- **Why:** 5 Nov: "These 2 tasks are assigned to nouran I am sure". The DM cards said Sameer (6a999a8).
- **Check:** DM readers write "Direct message between: A, B". Code guards the owner and the model's pick never overrides it.

### R29 · Meeting tasks go only to people in the meeting; mail names the teammate or it's not theirs
- **Why:** 8 Nov: "this meeting was with Mohamed badawy… get tasks for them not any other persons". 28 Oct: the "only teammate" fallback gave chat work to the wrong person (254bbcb, f6bab21).
- **Check:** no fallback owner. A teammate gets work only when the source names them or they attended. Work for outside people keeps `owner_name` and `outside`.

### R30 · Your own asks to others are not your tasks, and news about others is not a task
- **Why:** 25 Oct and 4 Nov: own requests in chats, others' leave or done news, and shared articles became tasks (f87d4bd, d78159a, 497f433).
- **Check:** reader rules keep these exclusions. A manager keeps only approve / decide / sign / attend / reply work, and other work goes to the best fit, never the manager by default.

### R31 · A task from a tool says who sent it
- **Why:** 9 Nov: "why many tasks with no assignee, from where you get it" (ecc5a95).
- **Check:** paths that create tasks from tools set `tasks.external_from` and `source`. The task page shows «من: X · إيميل», never «لسه ما أحد».

### R32 · Never guess an email or a person from part of a name, and never suggest you to yourself
- **Why:** 5 Nov: "+ Add Nouran" opened an empty box. QA: "QA Nouran" must not match an address without her first name. 8 Nov: "Sameer Hosni" (him) was suggested to himself (6a999a8, 80b61f9).
- **Check:** email lookups need the full name or first name in the address. Self-matching covers chat names and initials («A. QA» = "Ahmed QA").

### R33 · Team from mail: Add or No on each person, outside people apart, and No is final
- **Why:** 8 Nov: "approve or reject one by one and keep emails out of the company domain" (e5f18f6).
- **Check:** undecided people come back next time, a No is never asked again, and Add asks "under whom" before adding.

---

## 4. Alerts and notifications

### R34 · One alert per action, and none to yourself (any seat of your login)
- **Why:** 9 Nov (N11): "I get notifications for actions I did as well", and the question arrived twice (25efa4d). 23 Oct: a new task sent two pushes (eb8611e).
- **Check:** a new alert kind that has its own message must be added to the skip list of the generic "changed for you" trigger. Alert inserts skip every profile of the actor's `user_id`.

### R35 · Claim alerts before sending them
- **Why:** 26 Oct: 5 pushes for 2 alerts at 7:00, because overlapping runs sent the same rows (1659523).
- **Check:** senders set `delivered_at` where still null (claim), then send only what they claimed. No direct `sendPush` outside `_shared/notify.ts` (3a49011).

### R36 · Prayer time holds everyday alerts only; work waiting on someone goes at once
- **Why:** 9 Nov (N21): review requests at 2:48 pm waited for Asr and arrived at 3:12, "send them at once". 2 Nov: support replies were held till morning (89bbbc7, 6e15871).
- **Check:** new kinds that wait on a person (review, question, decision, support reply) are added to `PRAYER_SKIP_KINDS`. After hours and Friday still hold everything else.

### R37 · Push only what needs a person now
- **Why:** 26 Oct: "Muntej should do it and only notify for critical / high risks or achievements" (fdeaffc, 2f4cabd).
- **Check:** a new push kind must say if it is an exception (always pushes) or everyday (counted against the budget). Tool sync, ladder nudges and wins go to the brief or Alerts, not a push.

### R38 · A tapped notification opens a real screen
- **Why:** 2 Nov: the grouped "N updates" push opened "Page could not be found" because its route was named `alerts`, not `/18-alerts` (a7d7511).
- **Check:** push `data.url` values are real route paths, and unknown links go Home. New routes are checked in QA `Open …`.

### R39 · Alerts go out in the reader's language
- **Why:** 23 Oct: an Arabic user got English pushes because the profile language was set only at sign-up. 5 Nov: "send task in english, but the recipient gets it in arabic" (c1065bd, 0763ce6).
- **Check:** alerts carry `title_ar`, use the translated task title, and wait at most 2 minutes for the translation (then send the original). Hindi is translated centrally in `_shared/push.ts` and `_shared/wa.ts`.

### R40 · Only offer a channel that can actually reach the person
- **Why:** 2 Nov: WhatsApp showed as "on" without a mobile number. 26 Oct: people added but not signed in were told "not linked" (f349c02, a7f3fbc).
- **Check:** channel toggles and rules depend on a linked phone or push token. Unreachable people get how to sign in.

### R41 · Reports don't go by email for now
- **Why:** 5 Nov: "i don't need email notifications for tasks, only the invitation to join the account for now" (18bba99).
- **Check:** report code doesn't add email unless the secret `REPORT_EMAILS` is `on`. QA "Reports send no email" must turn email on first, so it can't pass for the wrong reason (af9a995).

---

## 5. WhatsApp

### R42 · A question on WhatsApp shows how to answer, and the answer reaches who asked
- **Why:** 9 Nov (N17/N21): the manager answered on WhatsApp, "it said done, nothing changed on her side", and the message didn't say how to reply (0a20ceb).
- **Check:** new replyable kinds go in `REPLYABLE` with a «💬 رد عليه» button. The next message is saved with `add_task_comment` and alerts the other side.

### R43 · WhatsApp buttons follow the same rules as the app
- **Why:** 9 Nov: WhatsApp still had a Delete button after Cancel became giver-only. 2 Nov: taps went to the wrong account (499b4dc, 992e68f).
- **Check:** every WhatsApp action calls the same RPC as the app, signed in as the sender (a short-lived real session), with the profile taken from the item.

### R44 · One number in two logins: answer as the right profile, and send one report
- **Why:** 28 Oct: a number on several accounts got reports about different accounts than its buttons. 9 Nov: it answered as the login without AI permission (dcf8a7e, 5b9f8f7).
- **Check:** use `waProfileFor` (last used) for reports, and prefer the profile that allowed AI when none was tapped. Keep the QA source check.

### R45 · Respect the 24-hour window
- **Why:** 26 Oct: cards inside the window, an approved template outside it. Reports end with an OK button that keeps the window open. Nudges go on WhatsApp only inside the window (3664911, a7f3fbc, d788c82).
- **Check:** new outbound WhatsApp messages check the window. Outside it they use an approved template, never free text that Meta drops.

### R46 · Show that Muntej is working
- **Why:** 9 Nov: "I need some indication here that WhatsApp is working or thinking or reading" (8b47867, 2afdb9f, f05635f).
- **Check:** `handle()` calls `waTyping` first, then the «👀 قريت رسالتك» step line comes before the chat call, with a "still working" line after 6 s. Thanks and one-word OKs get none.

### R47 · Answer Meta at once, and verify the signature
- **Why:** 23 Oct: the webhook checks X-Hub-Signature-256 and works after the 200 (`EdgeRuntime.waitUntil`) so Meta never retries a slow voice note (877a9e8).
- **Check:** webhook changes keep the signature check and do no slow work before the 200.

### R48 · The WhatsApp number lives only on the Cloud API
- **Why:** 3–9 Nov outage: the number was likely added to a colleague's phone, and the "Subscribe webhooks" switch was off. Dry QA checks passed for two days (memory notes, 98d991d, 58d5c4d).
- **Check:** keep QA "Muntej's WhatsApp number is alive at Meta". Never put 0115209855 in docs or seed data as a phone to register.

---

## 6. Arabic, RTL and languages

### R49 · Every string goes through i18n, in en and ar, plus Hindi
- **Why:** CLAUDE.md rule. From 5 Nov, QA fails "Every app string has Hindi" without `npm run i18n:hi` (af7b7b8).
- **Check:** no hard-coded user text in `app/` or `src/`. New keys exist in en and ar, and `hi.generated.ts` is updated. Placeholders and plurals are unchanged (`scripts/check-strings.js`).

### R50 · Arabic is the default, and Hindi is only a choice
- **Why:** 29 Oct: the app starts in Arabic. 5 Nov: "arabic is the main". New people still start in Arabic (a2a5981, af7b7b8).
- **Check:** use `prefersArabic`, not `locale !== 'en'`. New profiles get `locale = 'ar'`.

### R51 · Speak as Saree3: Saudi, warm, short
- **Why:** 26 Oct, validation clients: "all content in the app seems clearly AI" (7f9f5c4).
- **Check:** new Arabic strings follow `docs/SAREE3_VOICE.md`: no «تم بنجاح» or «حدث خطأ», errors are on him, at most one emoji. Security, legal and data text stays exact.

### R52 · Text direction follows the app language, on Android too
- **Why:** 24 Oct: Arabic lines starting with a Latin name jumbled on Android. 5 Nov: "Text in Arabic should be rtl and English ltr" (81f8507, c1065bd, 6a999a8).
- **Check:** text uses `AppText` (which adds the RLM), not raw `Text`. No hard-coded `textAlign: 'left'` or `writingDirection` that ignores the language.

### R53 · Never put two names side by side with only an emoji or punctuation between them
- **Why:** 5 Nov, "Why iam receiving this": «هلا Sameer 👋 Nouran عطاك مهمة» displayed swapped. 1 Nov: "!" next to an Arabic name read like an extra letter (ce7960f, d79b2b8, 21e28ba).
- **Check:** Arabic templates keep a word between two `${name}` values. Titles and names inside Arabic lines are bidi-isolated (84fffc2, 2a98cb5).

### R54 · Arabic must not be clipped on Android
- **Why:** 22–23 Oct and 1–2 Nov: the last word or letter was cut («يتوفر», «مدير» → «مدي», «هالشهر» → «هالشه») (71fbdc9, ce9d584, dc6ece0, 734025e).
- **Check:** `AppText` keeps `textBreakStrategy="simple"` and its side padding. Chips and tabs don't fix a width on Arabic text. Look at the screenshots for cut text.

### R55 · Arabic counts and plurals are right
- **Why:** «2 أشياء» → «شيئين» (ce6bc40); «وصلت مهمة / مهمتين / N مهام» (1659523); plurals fell back to English (da0bf1f).
- **Check:** counts use i18next plural keys (zero/one/two/few/many/other in ar), never number + one fixed noun.

### R56 · Gregorian dates, 0–9 digits, and read Arabic digits that people type
- **Why:** 25 Oct: server dates came out Hijri (ar-SA default). 26 Oct: the Arabic-Indic zero looked like the separator dot. 26 Oct: Paste code silently failed on Arabic digits (0709cac, 8679aac, 084cd04).
- **Check:** server `toLocale*` calls set the Gregorian calendar and Latin digits. Parsers of codes and number lists accept ٠–٩ and spaces.

---

## 7. UI

### R57 · Show the owner a mockup before building UI
- **Why:** 8 Nov: "From now if I asked for any UI updates show me example so I can decide before proceeding" (memory; e.g. cde2ee3 "option 1").
- **Check:** a UI diff has a mockup the owner picked (in `design/examples` or noted in the commit). If not, stop and ask.

### R58 · No design or demo numbers shown as real
- **Why:** 2 Nov: new users saw the design's sample numbers. 9 Nov (N5): Busy showed 3 fixed tiles ("30 s", "awkward talks"). 9 Nov (N7): Thanks was a demo that saved nothing (d9d6cab, 9a8dee0, 2063765).
- **Check:** no literal stats in screens. Empty data shows real zeros and `EmptyCard`, and any example is marked with `SampleTag`. A screen that looks like it sends must write to the DB.

### R59 · Buttons never stretch on Android
- **Why:** 23 Oct: the tip button and the empty-Tasks button ran down the screen. 8 Nov: "Asked to make task completed and design crashed" when Undo grew into a tall pill (736f947, 06ec3f5, 7c1e322).
- **Check:** no `flex: 1` button inside a column. `CardButton` under another button is `stacked`. Gradients are an absolute-fill background, not what sizes the button.

### R60 · Main buttons always show their label
- **Why:** 5 Nov: "Empty button and I don't know what to do". The gradient didn't paint, and the label was white on nothing (18bba99).
- **Check:** a gradient button has a solid token colour under the gradient (QA "A task's main button keeps its label readable").

### R61 · Loading, empty and error states on every screen, and loaders stop
- **Why:** 8 Nov: tool page loaders never stopped. 9 Nov: the Decisions header was empty while cards loaded (b01e58c, 83bcf73).
- **Check:** every query-driven screen handles loading (`LoadingCard`), empty and error, and spinners stop on error.

### R62 · A tap answers at once
- **Why:** 5 Nov: "Everything takes time to be applied". 9 Nov: "loading again for seconds after assigning" (023644c, 3be228e).
- **Check:** decisions and task buttons are optimistic and roll back with a message on failure. No pull-to-refresh spinner on a save, and no waiting on a full refetch.

### R63 · Anything that shows a task can be tapped to open it
- **Why:** 9 Nov (N16): «تنتظر منهم» showed "a task that is pending, but unclickable" (e23c409).
- **Check:** new task rows and cards are `Pressable` and open `14-task-detail?id=`.

### R64 · A tab tap opens the tab fresh
- **Why:** 9 Nov (N13): tapping المهام from the chat opened an empty, old filtered list (`?ids=` stuck) (5d1b6f0).
- **Check:** params from deep links or Saree3 links (`ids`, `filter`) are cleared on a tab press.

### R65 · Nothing floats over buttons, titles or the keyboard
- **Why:** 23 Oct: floating Saree3 sat on the Add / Edit / Ignore buttons. 9 Nov: the header needed room for his button. 22 Oct: on Android the chat box stayed under the keyboard (71ed96a, cde2ee3, 9a04ac6).
- **Check:** new screens with bottom buttons hide or offset Saree3. Forms use `KeyboardAvoidingView` with "padding" on Android.

### R66 · Titles, dates and filters are never cut or squeezed
- **Why:** 23 Oct: the message date was cut ("الخميس، 22 أكتوبر · 6…"). 1 Nov: the Team title became a column of letters. 5 Nov: filters were cut instead of wrapping (94542d7, dc6ece0, 6a999a8).
- **Check:** no `numberOfLines={1}` on dates or key info. Rows of chips wrap. Test at 375 px wide in Arabic and Hindi (QA checks no horizontal overflow).

### R67 · Touch targets ≥ 44 px, and colours only from tokens
- **Why:** CLAUDE.md conventions. A dark theme must stay possible.
- **Check:** no hex colours outside `src/theme/tokens.ts`. Pressables are ≥ 44 high, or have hitSlop.

### R68 · An overlay or one failing request can't blank the app
- **Why:** 22 Oct: sending feedback blanked the app (`.catch` on a Supabase request, which has none), and an overlay render error caused a white screen (c9a94e8, b9a18e1).
- **Check:** overlays sit in `QuietBoundary`. Supabase calls use `{ error }` or try/await, not `.catch`.

### R69 · Every new feature is announced and starts in testing
- **Why:** 23 Oct, asked twice: "anything new added, Saree3 should highlight it…". 6 Nov: test before live (memory; 28b64bb, 6c8fa72).
- **Check:** a new user-facing feature has a `features` row (`testing = true`, en/ar benefit), a `FEATURE_PLACES` entry, a `TourTarget`, and `feature_on('<key>')` on its server actions.

### R70 · Older builds never crash on new native code, and updates never restart mid-flow
- **Why:** 25–26 Oct: the Intercom native SDK crashed builds without the module. 2 Nov: an OTA restart closed onboarding by itself (cf1ec82, 6589d0b, d9d6cab).
- **Check:** native modules are guarded by build or availability. The update restart stays deferred during sign-in, onboarding, setup chat and recording.

---

## 8. Data and migrations

### R71 · Never delete data without asking; cancel keeps the record
- **Why:** CLAUDE.md rule 5. Undo cancels and never deletes (d725484). A member who deletes their account leaves their tasks in place (6ffbbb6). Cancel replaced Delete (499b4dc).
- **Check:** no `delete from tasks/profiles/...` in app paths or migrations without the owner's OK. Deleting people uses status `deleted` with restore.

### R72 · Every action Muntej takes is logged in activity_log
- **Why:** CLAUDE.md convention (who, what, why, undoable). Busy taken back, reminders and moved tasks are all logged (0ad8a45, fdeaffc).
- **Check:** a new autopilot, AI or server action writes an `activity_log` row with its reason and undo data.

### R73 · Database functions must reference columns that exist
- **Why:** 4 Nov: "Request proof" was broken for every manager since 29 Oct (`column "account_id" does not exist`) (396f137).
- **Check:** plpgsql changes pass the QA plpgsql_check sweep. Be careful with columns tasks don't have (`account_id`).

### R74 · Apply migrations as UTF-8
- **Why:** 26 Oct: an Arabic What's new row was stored garbled and the owner saw it (memory; also 1473427 for SMTP subjects).
- **Check:** use `Get-Content -Raw -Encoding UTF8`. After Arabic data, `title_ar like '%Ø%'` must return no rows.

### R75 · Values used everywhere come from one trigger or rule
- **Why:** 8 Nov: budget made clarity under 100% in some places but not others, so clarity became a trigger. 4 Nov: chat, Home and the morning report gave different late counts (75b90b9, 10e544e).
- **Check:** counts and scores reuse the shared rule. Late = past due and not finished; submitted is not late (1e7962a, 0870ed1). Budget is never "missing".

### R76 · Race-safe writes
- **Why:** 23 Oct: two checks saving the same message failed the whole sync. 5 Nov: a translation request during a translation was forgotten (06ec3f5, addac6b).
- **Check:** unique conflicts return the existing row. Jobs claim work (claim/release, `delivered_at`) and a sweep retries lost work.

### R77 · Clean text before saving
- **Why:** 8 Nov: an invisible NUL character in an answer stopped the chat from saving (9561961).
- **Check:** model output and imported text are stripped of control characters before insert.

### R78 · Secrets stay on the server
- **Why:** CLAUDE.md rule 5. WhatsApp checks show which app owns the token but never the token itself (039b17e).
- **Check:** no keys in app code, `EXPO_PUBLIC_*` or logs. New secrets go through `supabase secrets` or Vault.

---

## 9. Release process

### R79 · Every complaint becomes a DB-judged QA case before the fix
- **Why:** 4 Nov: "enhance the testing tool… to be more accurate and mature". The old QA only checked that things responded (memory; 10e544e).
- **Check:** a fix commit for a complaint adds or extends a case in `scripts/qa/*.mjs` that judges the DB result. Cases restore what they changed (70c67e5) and can't pass for the wrong reason (af9a995).

### R80 · QA green before any ship
- **Why:** 28 Oct: "why are you not creating a tool to test any enhancement before applying it". Blank buttons and a broken first sign-in reached the phone (ce6bc40).
- **Check:** `node scripts/qa/run.mjs` is all green (delivery warnings allowed). For flaky LLM cases, green twice. Android-only bugs need a source check, because the web can't show them (7c1e322).

### R81 · deno-check every changed edge function and everything that imports it
- **Why:** 24 Oct: a duplicate `const` in `_shared/intake-core.ts` took down email reading, chat and WhatsApp for about 20 minutes (88c850e).
- **Check:** a diff under `supabase/functions/_shared` lists every importer and passes `deno check` with 0 errors.

### R82 · Server code is live before the QA cases that need it
- **Why:** 5 Nov: ship runs QA before migrations, so new cases failed until their migration and functions were deployed (memory).
- **Check:** apply migrations and deploy functions first, then ship. Only one ship at a time.

### R83 · Test release first; live only when the owner says so
- **Why:** 6 Nov: "Uploading all new enhancements directly to the live is not the best option" (6c8fa72).
- **Check:** `ship.mjs "msg"` goes to Muntej Test. `--live` is never run without the owner's approval in chat. When working through a comment list, ship once at the end (9 Nov memory).

### R84 · The backlog moves with the code
- **Why:** 23 and 27 Oct: "one page called backlog", "auto update the backlog" (memory).
- **Check:** the release commit updates `docs/BACKLOG.md` (in testing, done, what's left).

### R85 · Nothing in a release needs the owner at the PC
- **Why:** 27 Oct: a GitHub sign-in window on the PC blocked work until he was back at the desk (memory).
- **Check:** owner steps are phone links or codes. Builds go through GitHub Actions. Bump the version only together with a build.

---

## 10. Complete the journey (both sides of every flow)

### R86 · Agreeing to "busy" moves the task and tells the asker
- **Why:** 9 Nov (N6): "although I refused the task or said I was busy it is still showing on my tasks". Approval only sent an alert (0ad8a45).
- **Check:** resolving a decision changes the task (owner, date, status), stops the old reminders, logs it, and alerts the asker with what happened.

### R87 · A request reaches the right person in the asker's own words, and the answer comes back
- **Why:** 9 Nov (N4): Busy sent an AI line, not her words. (N9): an approval asked in the chat never reached the manager. 25 Oct: "too busy" reached "no one" (56efae9, 5e6ff04, 0709cac).
- **Check:** requests go to whoever gave the task (else the manager), store the person's text unchanged, tell the sender it reached them, and send the answer back as `request_answered`.

### R88 · Comments, more time and questions land on the other side
- **Why:** 9 Nov (N2/N20): the doer's questions, due-date ask and refusal "didn't show on the manager's side" (d5ec1c7, 4e08668).
- **Check:** each new doer action creates an alert for the giver and shows in their «يحتاجك» tab. An approved extension moves the due date and the reminders (6530ae3).

### R89 · A screen that looks like it acts must really act
- **Why:** 9 Nov (N7): the thank-you was a demo. 22 Oct: adding someone on Team never emailed them (2063765, 190b693).
- **Check:** for every send, invite or thank button, follow it to the DB row and the alert or email it causes. Add a QA case.

### R90 · Joining is announced to both sides
- **Why:** 4 Nov: "I downloaded the app, but never found any notification to join". 8 Nov: "Notify me if anyone I invited joined… and remind him of his tasks" (90a98d6).
- **Check:** being added to a company alerts the person in their current company. A real join alerts the inviter and reminds the person of waiting tasks.

### R91 · Finish where the problem shows
- **Why:** 9 Nov: "if task already done let the user finish it from this page, not assign then transfer it to the tasks page then approve it" (3be228e).
- **Check:** decision cards and alerts offer the action that ends the matter («✓ خلصت أصلاً», approve), not just a link to another screen.

### R92 · A new action gets its own status, never one whose triggers mean something else
- **Why:** 9 Nov, first reviewer run: «✓ خلصت أصلاً» saved decisions as `approved`, so a "more time" card moved the due date and told the doer "gave you more time", and a "busy" card took the task back (fixed with `finish_from_decision` + status `finished`).
- **Check:** a new outcome / button that writes an existing status (decisions.status, tasks.status, reviews.decision…) must be checked against every trigger on that table; if any trigger means something else, add a status or a dedicated RPC.

### R93 · A new status is handled everywhere it can show, and in the generated types
- **Why:** 9 Nov, second reviewer pass: decision status `finished` was handled in the triggers but the asker's Home (MyRequests) read it as "declined" («ما وافق هالمرة»), and `database.types.ts` didn't list it.
- **Check:** a new decision / task / review status → every screen that labels decided items (MyRequests, NeedsYou, task page, Decisions) has a branch for it, and `src/lib/api/database.types.ts` lists it.

### R94 · Closing or cancelling a task resolves every other open decision on it
- **Why:** 9 Nov, third reviewer pass: «✓ خلصت أصلاً» closed the task but left a second pending card (busy / more time) on it; approving that later would move a done task's date or owner.
- **Check:** any path that closes or cancels a task also resolves the task's other `pending` decisions (and tells their askers once).

### R95 · The super admin's console seat gets no notifications; one person, one message per moment
- **Why:** 10 Nov: two morning reports landed on one phone at 8:00, WhatsApp from the Super account seat (5 decisions) and a push from T2 (0 decisions), with different numbers. The owner: "Super admin should not receive notifications here. It should be a dashboard in the app".
- **Check:** any new push / WhatsApp / email / report path skips `role = 'super_admin'` seats (use `consoleSeats` / `sendPush`, or `.neq('role','super_admin')`); a phone or login with seats in two companies says the company first ("T2 · …"); WhatsApp picks one seat per phone (`waProfileFor`); the push and WhatsApp versions of a report show the same numbers on the same first line.

### R96 · One report, one source line
- **Why:** 10 Nov, reviewer on R95's fix: the push opened with "in progress · late · done" while the WhatsApp template (outside the 24 h window, the usual case at 8:00) said "risks · need you · wins": two numbers for one morning.
- **Check:** a report sent on several channels (push, in-window WhatsApp, WhatsApp template, email) builds every channel's first line from the same field; no channel gets its own summary string with other numbers.

### R97 · A heading added before an RLM-wrapped message keeps the RLM first
- **Why:** 10 Nov, reviewer pass 2: «*T2 · مهمتك*» was put on top of WhatsApp cards that `rtl()` had wrapped; the Latin "T" became the first letter and flipped the whole Arabic bubble left to right.
- **Check:** any prefix or heading added in front of a WhatsApp or push text wraps the final text in `rtl()` / `rtlSafe()` again.

### R98 · On one number with several seats, a typed answer goes to the seat that asked for it
- **Why:** 10 Nov: Nouran tapped «↩️ رجّعها» on her T2 seat; her typed reason went to her other seat (picked for typing), which had no pending note and didn't know which task.
- **Check:** any WhatsApp step that waits for the next typed message (`wa_pending` note/cm/obfix…) is found from whichever seat on the number is waiting, not only the one picked for typing.

### R99 · A "picked the wrong seat" QA case rebuilds the competing state
- **Why:** 10 Nov, reviewer on R98's fix: the first case passed on the old code too, because nothing on the other seat competed (no newer pending row, AI allowed on both).
- **Check:** a case for a wrong-seat or wrong-account fix recreates what the other seat had (a newer pending row, AI consent on one seat only) and is shown to fail on the old code.

### R100 · A QA case that needs a second seat gives it a login first
- **Why:** 10 Nov, reviewer pass 2 on R98: the two-seats case could never pass, because the QA seed clears every test person's login and WhatsApp only finds seats with one.
- **Check:** a case that needs WhatsApp or the chat to find another QA profile calls `jwtFor(profile, account)` first.

### R101 · A release sends only the code it checked at the start
- **Why:** 10 Nov: a release started at 319aade; while QA ran, the «رجّعها» fix was committed and the release deployed `whatsapp` from the working folder before any review, then tagged `testing` past it.
- **Check:** `scripts/ship.mjs` saves HEAD after the ACCEPT check and stops before QA, the database, the server and the app update if HEAD moved or code outside `docs/review/`, `docs/BACKLOG.md`, `scripts/release/` is uncommitted. Nothing is committed while a release runs.

### R102 · From connected tools, only work asked of the person, or their own ask handed to a teammate
- **Why:** 10 Nov, Nouran: "these are the tasks people ask me PLUS the tasks I ask to people, we need only the ones addressed to me … disregard any task that is sent from my email to others … assign them to other users if they are already on Montej … auto cancel the task if the user responded already". Replaces the 8–9 Nov behaviour of listing her asks to her for an OK (R28/R29).
- **Check:** a mail / chat / meeting read from a connection keeps only `asked_of_user` work, or `asked_by_user` work whose owner is a teammate on Muntej (created as their task at once, not listed); work between other people and asks to people not on Muntej are dropped; the user is known by their addresses too (profile email + connected accounts), not only their name; earlier messages of the conversation are context only; waiting work the new messages show handled closes by itself and is logged.

### R103 · A question about a task is answered on the task, and leaves "Needs you" however it was answered
- **Why:** 10 Nov, the owner: "those questions I want to be able to answer them over whats app". «رد عليه» only added a comment: the due date / definition of done / budget stayed empty and the question stayed open.
- **Check:** answering a `detail_asked` (WhatsApp «✍️ جاوب», the app, the chat) fills the field through `answer_task_detail` or a task edit; the `clear_answered_questions` trigger marks the question read; the asker gets one clear `request_answered` line; dates in free words go through `readWhen`, and unclear ones get quick buttons, never a guess.

### R104 · Alert text is the person's words or Muntej's own sentence, never an internal note
- **Why:** 10 Nov: Nouran's WhatsApp showed "Owner, 9 Nov: the chat sent «نوران» to Nouranemira…" and "N is at 4 h of 40 h this week.": `activity_log.reason` became the alert body.
- **Check:** `notify_subject_of_change` (and any new alert from the log) shows `reason` only for the person's own note (`sent_back`); `reason` is for the log, written for the team.

### R105 · An automatic close or hand-off decided by the AI goes through the same path as a person's tap, and the person can undo it
- **Why:** 10 Nov, reviewer: the tools reader first closed "already answered" tasks with a direct service-role status update: no review rules, other decisions left pending, not undoable.
- **Check:** AI-decided closes use `close_by_reply` (or the status RPC a tap uses): own work only, other pending decisions resolved, the owner told, logged undoable by them (`undo_task_changes` allows 7 days for `closed_by_reply`). Never `update tasks set status` from a function.

### R106 · A count of "what needs you" is the same everywhere: the number of things «وش يحتاجني» lists
- **Why:** 10 Nov, the owner: "Is it only 1 needs me or 23?" — the midday report counted 30 tools tasks as one line («1 تحتاجك»), and «وش يحتاجني» a tap later listed 23.
- **Check:** any "need you" number (reports, push, Home, WhatsApp) comes from the same list (`needsYouCards`, or the same items it lists), counting each item, not each line or group.

### R107 · An automatic Muntej status change uses Done's close-or-review rule
- **Why:** 10 Nov, reviewer pass 2: `close_by_reply` closed any self-given task, but a Done tap from an employee with a manager sends it for review.
- **Check:** any server-side close mirrors `set_task_status`'s `can_close` for the owner (closes_itself, admin, nobody above, or the giver below); otherwise it goes to `submitted` with a review round, logged and undoable. Testers are a login (any seat), the same in `feature_on_for` as in `is_tester()`.

### R108 · A late undo never overrides someone else's decision
- **Why:** 10 Nov, reviewer pass 3: a reply-close sent for review could be undone for 7 days, even after the manager approved it.
- **Check:** an undo allowed for longer than 5 minutes refuses ("it moved on since") once the task's status changed or a review was decided after the change.

### R109 · A test build never shares the store app's identity
- **Why:** 10 Nov, reviewer pass 4: the first iPhone test profile built `sa.muntej.app` on the Muntej Test channel and uploaded it to the store app in App Store Connect, where it could be picked for Apple's review.
- **Check:** every test build profile sets `APP_VARIANT=test` (its own bundle id / package, name, App Store Connect app or Play listing, provisioning profile); the store app only ever gets `production` builds.

### R110 · A chat answer that promises a list shows the list from the data
- **Why:** 10 Nov, QA: «عطني كل مهامي حتى القديمة والمقفلة» was answered «هذي كل المهام اللي تخصك بما فيها القديمة والمقفلة:» and nothing after it.
- **Check:** questions whose answer is a list (closed / old tasks, and any new kind) get the rows filled in by the server from the context, never left to the model alone.

### R111 · A server rewrite of a chat reply never weakens a guard, and fires only on its own wording
- **Why:** 10 Nov, reviewer: the closed-tasks list made the false-"done" guard skip the reply (its titles looked like proof), and its trigger fired on "on hold" («hold» ⊃ «old»), «خلصت المهام كلها», "how many tasks are done".
- **Check:** text the server adds is excluded from the guards' "proof"; triggers use word boundaries and a clear intent (a request to see / list), skip yes/no, count and first-person questions, and have a QA case with nearby wording that must not fire them.

### R112 · Arabic patterns on the server never use \b; names match whole words
- **Why:** 10 Nov, reviewer: `/^(هل|كم)\b/` never matched (JS `\b` treats Arabic letters as non-word), «كل» matched inside «مشكلة», and the name «مها» matched inside «مهامي».
- **Check:** Arabic regexes use `(^|\s)…(\s|$)` or lookarounds; a person is found from a message by whole words (with و/ل/ال stripped), never `includes`; two people who fit → ask which one.

### R113 · A server list that finds nothing, or isn't sure who, still answers
- **Why:** 10 Nov, reviewer pass 3: when two teammates fit the name or nothing was closed, the closed-tasks block left the model's bare «هذي مهام … المقفلة:» (the R110 incident again).
- **Check:** a trigger that decided to fill a list replaces the reply with "none" or a which-one question naming the people when it has nothing to show.

### R114 · A which-one question's chips settle the choice when tapped
- **Why:** 10 Nov, reviewer pass 4: «مهام مهند الأول المقفلة كلها» still fit both «مهند»s (only first names were compared), so the same question came back forever.
- **Check:** once two people fit, the one matching the most of their other name words wins (a family name both share never keeps both); a QA case taps a chip's text, also with a shared family name, and expects exactly one person, no second question.

### R115 · Every message Muntej sends is checked as the person reads it
- **Why:** 10 Nov, the owner ("unclear", "why we are not getting this in QA activities? we should add these scenarios every time"): «من أدواتك: لقيت مهمة وحدة لك، تنتظر موافقتك» named no task and had no buttons; Nouran replied «ايه هي؟» and Saree3 answered about another task. QA had checked that the alert existed, never what it said.
- **Check:** a new or changed notification (push, WhatsApp, report line) has a QA case that reads its words as the person: it names the thing (task, person, number), has a way to act or open it, and the natural next reply («ايه هي؟» / "what is it?") is answered about that same thing.

### R116 · A follow-up to an alert uses the exact items it named, on any seat of the login
- **Why:** 10 Nov, reviewer: the «ايه هي؟» answer and the WhatsApp cards came from "the 10 newest waiting items", so an alert could name «X» and show three others; and only the picked seat's alerts were looked at.
- **Check:** an alert about specific items keeps their ids (in its key or a column) and every follow-up shows exactly those; "what is it?" looks across every seat of the number; with no card for it, the task itself is shown, never a guess.

### R117 · A follow-up that branches has one QA step per branch
- **Why:** 10 Nov, reviewer: «ايه هي؟» has four outcomes (the alert's items, the task's card, the task as yours with buttons, the task someone else does) and only the first was tested; the two-seat step didn't make sure the alert was on the seat WhatsApp did not pick.
- **Check:** each branch of a follow-up gets its own QA step, and a "wrong seat" step forces which seat is picked before testing the other one.

### R118 · A card asking for an OK carries what's needed to decide
- **Why:** 10 Nov, the owner, on the WhatsApp tools cards: "Need some info on the task like from whom and when or any other important things to help me to confirm".
- **Check:** an approve / ignore card names who asked, when, where (mail subject / chat), a short quote of their words, the due date and who it would go to — whatever the item has; QA reads the card and expects them.

### R119 · "From whom" names a person, never a place
- **Why:** 10 Nov, reviewer: the tools card fell back to the item's sender, which Google Chat fills with the space name when several people wrote, and Meet with "Google Meet": «من Availo team».
- **Check:** a "from" shown to people comes from a field that names a person (the asker, or a one-message sender); channel, space and meeting names are shown as where, not who.

### R120 · A QA guard is loosened only for the wording that failed
- **Why:** 10 Nov, reviewer: the harness's false-claim check was skipped for any message ending in ؟, but Saudi requests are usually questions («ممكن تعطي فيصل مهمة التقرير؟»).
- **Check:** an exception in a QA guard names the exact pattern that failed (here: a message starting with a question word), never punctuation or other traits real requests share.

### R121 · A long WhatsApp list is the drop-down, one row per item, and a row opens it
- **Why:** 10 Nov, the owner, on the 14-line tools text («I think there is better than the view»), picked option 2: WhatsApp's own list.
- **Check:** a list of things to decide on WhatsApp uses `waList` (rows: numbered title ≤ 24, "who · when · due" ≤ 72, «شوف الباقي» past 9); each row's tap shows that item's full card; QA reads a row and taps it.

### R122 · Paged or follow-up lists keep the numbers of the first list
- **Why:** 10 Nov, reviewer: «شوف الباقي» rebuilt the tools list fresh, so after one approval the row labelled «10.» was another task and a typed «10» approved something else.
- **Check:** every page and every typed number points to the refs saved with the first list; handled items drop out, numbers don't shift.

### R123 · WhatsApp buttons in one message never share an id
- **Why:** 10 Nov, Nouran: «جاوب» on a due date got no reply — «بعد 3 أيام» fell on Friday → Sunday, the same as «الأحد الجاي»; WhatsApp refused the message and sent nothing.
- **Check:** `waButtons` drops repeated ids; generated choices (dates…) are de-duplicated before they become buttons; QA checks the ids are distinct.

### R124 · A QA case that sends a typed command checks everything the command touches
- **Why:** 10 Nov, reviewer: the «10» case expected the 9th task to stay waiting, but «10» approves 10 and ignores the rest of the list; and it would have ignored the QA manager's other waiting items without putting them back.
- **Check:** assert the command's full effect (approved and ignored), set aside the other rows it would change and restore them in `finally`.

### R125 · What a task says is shown as words, and a question about it is answered where it's shown
- **Why:** 10 Nov, Nouran: "I still don't see my definition of done on the UI … I can't answer the definition of done or see that question on the task itself" — the task page used the definition of done, budget and description only as ✓ in the clarity ring, and the doer's question lived only in alerts / WhatsApp.
- **Check:** every field a task carries that people set (definition of done, due, budget, description) is visible as text on the task page; an open question about the task is shown on it to whoever can answer, with the answer saved there (answer-detail → answer_task_detail) and cleared everywhere.

### R126 · The database decides whose row it is, never a value the app loaded earlier
- **Why:** 10 Nov, QA: «Send an idea» failed in most runs — the app sent the profile and account it had loaded, but the policy accepts only current_profile_id(); after a seat switch they differ.
- **Check:** inserts whose policy checks `current_profile_id()` let the database fill the owner and account (a BEFORE INSERT trigger or a default), and the app doesn't send them.
