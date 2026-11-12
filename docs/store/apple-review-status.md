# Apple App Review: every comment, its status, and how it was solved

Status on 12 Nov 2026. The app is iOS version 1.0.0, bundle sa.muntej.app.

## Summary
| # | Review | Apple's comment | Status |
|---|---|---|---|
| 1 | 4 Nov, build 1 | 2.1 Information needed: show the full user journey | ✅ Done (guide + PDF) |
| 2 | 8 Nov, build 1 | 5.1.1(i) / 5.1.2(i): personal data sent to an AI service without asking | ✅ Done, live for everyone |
| 3 | 8 Nov, build 1 | 3.2 Business: looks like an app for one company (5 questions) | ✅ Answered; screen made clearer (in testing) |
| 4 | 8 Nov, build 1 | 5.1.1(v): account deletion + a recording on a real iPhone | ✅ Feature live · ⏳ recording still to make |
| 5 | 11 Nov, build 2 | 2.1(a): an error when tapping login, on an iPad Air 11" (M3), iPadOS 27.2 | 🧪 Fix in testing · ⏳ iPad test on build 3 |
| 6 | 11 Nov, build 2 | 3.2 Business, again | 🧪 Fix in testing (new sign-in wording) + stronger answer |
| 7 | 11 Nov, build 2 | 2.5.4: background audio declared but not used | ✅ Fixed in code · ⏳ needs build 3 |

## 1. User journey (4 Nov)
- **Apple:** wanted to see how the app is used, step by step.
- **Solved:** a 17-step captioned guide made from the demo company, as a web page and a PDF.
  - Page: https://nizamy-muntej.expo.app/journey.html
  - PDF: `store/journey/muntej-user-journey.pdf`
- **Also:** the review login (play-review@muntej.app) is now a **manager**, so the Decisions tab always shows. Before, an
  admin's "View as Employee" setting hid it.

## 2. AI data sharing, 5.1.1(i) / 5.1.2(i) (8 Nov)
- **Apple:** the app sends personal data to OpenAI, but doesn't say what is sent or who receives it, and doesn't ask first.
- **Solved (live 9 Nov):**
  - **Permission screen** right after sign-in: "Can Muntej use AI on your data?". It lists what is sent and names
    **OpenAI (USA)**, with **Allow AI** or **Not now**.
  - With **Not now**, the app still works: tasks are made by hand with a new "New task" form, and the AI parts say
    "AI is off".
  - **The server refuses every AI request** from someone who hasn't allowed it. Background jobs (mail reading,
    WhatsApp, proof checks, translation) skip that person.
  - **Settings → AI assistant (OpenAI)**: an on/off switch.
  - Each choice is written to the activity log.
  - **Privacy policy, section 4** (live): what is sent, why, the permission, retention, and no training.
- **Checked:** QA case "Nothing goes to the AI before the person allows it" (refused before, works after).

## 3 and 6. Business, 3.2 (8 Nov, then again on 11 Nov)
- **Apple:** thinks Muntej is for one specific business, and points to private distribution.
- **What we found:** self sign-up already works. A new email gets its **own free workspace** instantly, with that
  person as admin; 12 people signed up this way in the last 30 days. But the first screen said "Work email", and Apple
  couldn't get past sign-in on 11 Nov, so it never saw this.
- **Solved:**
  - **Answers to Apple's 5 questions:** not limited to one company; anyone can join with no invitation or contract;
    for the general public; sign up yourself with an email; free, with no purchases.
  - **The sign-in screen now says it (in testing):** "Sign in or start free · New here? This creates your own free
    workspace", the label is "Email", and the WhatsApp button says it's for people added by mobile.
- **Checked:** QA case "A brand-new email gets its own free workspace (what we tell Apple)".

## 4. Account deletion, 5.1.1(v) (8 Nov)
- **Apple:** wants deletion inside the app, plus a screen recording on a physical iPhone.
- **Solved (live):** Settings → scroll down → Delete my account → Delete. It works for everyone, including company
  admins: the company is handed to the next person. The demo login comes back after it's deleted, so the next
  reviewer can sign in.
- **Still to do:** **you record it on a real iPhone** (steps in the resubmission file, section 0c), then I reset the
  demo company.

## 5. Login error on iPad, 2.1(a) (11 Nov)
- **Apple:** "an error occurred when we tapped login", on an iPad Air 11" (M3), iPadOS 27.2. The app runs in iPhone
  mode there.
- **What we found:** our server logs show that iPad opened the app and loaded one list, then **never sent a sign-in
  request**. So our server never saw a failure, and the app could only show a vague error. Sign-in works on the web
  and on phones.
- **Solved (in testing):**
  - **Every sign-in failure says why**, with a reference number. For example: "Couldn't reach Muntej. Check your
    internet and try again. (ref 4821)", "That code isn't right…", "Too many tries…".
  - **Each failure is sent to our server log** with the same ref, the device (including whether it's an iPad), the
    build, and the update. It keeps no code and no full email. If there's no internet, the report waits on the phone
    and is sent on the next try.
  - The Notes ask the reviewer to use the email, not WhatsApp, and to send us the ref if anything fails.
- **Still to do:** Mohammed tests **build 3** on an **iPad Air 11" (M3) simulator** and on an iPhone before we
  resubmit. If it fails, the ref tells us exactly why.
- **Checked:** QA cases "A failed sign-in is kept with its ref and device, never the full email" and "Every sign-in
  failure shows its cause with a ref".

## 7. Background audio, 2.5.4 (11 Nov)
- **Apple:** the app declares background audio, but nothing uses it.
- **What we found:** the audio library turns it on by default. The app records a task and plays a summary only while
  it's open.
- **Solved:** turned off in the app settings (`enableBackgroundPlayback: false`).
- **Still to do:** this is a native setting, so it reaches Apple only in **build 3**.
- **Checked:** QA case "The app does not ask iOS for background audio".

## What's left, in order
1. **You:** try the test release in Muntej Test, then say "go live".
2. **Me:** release it to everyone.
3. **Mohammed:** build 3 on the Mac (section 0a of the resubmission file), then the iPad Air 11" simulator test and
   an iPhone test (section 0b).
4. **You:** record the account deletion on a real iPhone, upload it, and send me the link (section 0c).
5. **Me:** reset the demo company, and hold app updates until Apple finishes.
6. **You:** in App Store Connect, pick build 3, paste the Notes (section 2) and the reply (section 3), attach the PDF,
   and submit.

Everything to paste is in [apple-resubmission.md](apple-resubmission.md).
