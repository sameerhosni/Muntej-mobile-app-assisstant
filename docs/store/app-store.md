# App Store release — Muntej (sa.muntej.app)

Everything App Store Connect asks for, ready to paste. Arabic (ar-SA) is the primary language; English (en-US) is
the second (App Store Connect → the app → the language menu next to the version → add English (U.S.)).

**State on 3 Nov:**
- Build 1 (version 1.0) is uploaded and processed: VALID, from Mohammed's Mac.
- The version page "1.0 Prepare for Submission" is empty.
- Our API key (K5J8645KR2) can read but not write: Apple gave it the Developer role. So someone with **App Manager or
  Admin** access types this in on the website (it also works from a phone browser). Alternatively, give the key App
  Manager access and Claude fills it all in through the API.

## Links
| Field | Value |
|---|---|
| Privacy Policy URL | https://nizamy-muntej.expo.app/privacy.html |
| Support URL | https://nizamy-muntej.expo.app/help.html |
| Marketing URL (optional) | https://nizamy-muntej.expo.app/help.html |
| Account deletion | in the app (Settings → Delete account), and https://nizamy-muntej.expo.app/delete-account.html |

## App Information (left menu → General → App Information)
| Field | Arabic (primary) | English |
|---|---|---|
| Name (30) | `منتج – مساعد المهام` | `Muntej – Task Assistant` |
| Subtitle (30) | `قلها وانساها، ومنتج يتابعها` | `Say the task. Forget it.` |

The current name, "Muntej ( Task Assisstant )", has a typo. Replace it with the names above.

- **Category:** Productivity (primary), Business (secondary).
- **Content Rights:** "No, it does not contain, show, or access third-party content".
- **Age Rating:** answer None or No to everything, except:
  - **Messaging and Chat:** Yes (team comments and the chat with Saree3);
  - **User-Generated Content:** Yes (tasks and comments between coworkers).
  - Expected result: 9+ or 13+. Either is fine for a work app.

## Version 1.0 page (Distribution → iOS App → 1.0)
- **Screenshots:** upload `store/ios/1-home.png … 5-team.png` (1290×2796) into **iPhone 6.9" Display**. They are made
  by `node scripts/store/graphics.mjs --ios`. Use the same files for English.
- **Promotional Text (170):**
  - AR: `قل المهمة بصوتك، وسريع يسلّمها للشخص المناسب ويتابعها ويرجع لك بالنتيجة. أنت تقرر بس.`
  - EN: `Say a task by voice and Saree3 hands it to the right person, follows up and reports back. You only decide.`
- **Description:** the AR and EN "Full description" blocks in [google-play.md](google-play.md).
- **Keywords (100):**
  - AR: `مهام,فريق,مساعد,متابعة,إنتاجية,موظفين,مدير,تكليف,تذكير,اجتماعات,واتساب,ذكاء اصطناعي`
  - EN: `tasks,team,assistant,follow up,productivity,manager,delegate,reminders,meetings,whatsapp,ai`
- **Support URL / Marketing URL:** see Links above.
- **Version:** 1.0. **Copyright:** `2026 Muntej`.
- **Build:** tap "Add Build" and pick build 1.
- **App Review Information:**
  - Sign-in required: **Yes**.
  - User name: `play-review@muntej.app`.
  - Password: the same 6-digit review code given to Google Play (Supabase secret `REVIEW_LOGIN_CODE`).
  - Contact: first name, last name, phone and email of the person Apple should call (sales@muntej.app works as the
    email).
  - Notes:
    ```
    Sign in: type the email play-review@muntej.app, tap Send code, then type the 6-digit code given as the password
    (no email needed). You are the manager of a demo company (Horizon Trading) with a sample team and tasks. The app
    is in Arabic and English. Tap the microphone to say a task; Saree3 (the assistant) assigns it and follows up.
    There are no purchases in the app. The full user journey, screen by screen:
    https://nizamy-muntej.expo.app/journey.html
    AI: right after signing in, the app asks "Can Muntej use AI on your data?" It lists what is sent and says it goes
    to OpenAI. Nothing is sent before you tap Allow AI; with Not now the app works without AI. Change it anytime in
    Settings → AI assistant (OpenAI).
    To delete an account: Settings → scroll down → Delete my account → Delete. You can test it with this demo login:
    it signs you out, and the same login works again afterwards in the demo company.
    Screen recording of account deletion on an iPhone: <PASTE THE RECORDING LINK>
    ```
  - Journey guide: page `support-web/journey.html`, PDF `store/journey/muntej-user-journey.pdf`. To refresh them, run
    `node scripts/store/journey.mjs`, then `node --use-system-ca scripts/store/journey-guide.mjs`, then deploy
    support-web.
  - Reply to Apple in the Resolution Center (attach the PDF):
    ```
    Hello,

    The attached PDF shows the full user journey with a captioned screen for every step. The same guide is online:
    https://nizamy-muntej.expo.app/journey.html

    How it works: a manager says or types a task once. Muntej assigns it to the right person, follows up, collects
    the proof and reports back. The employee gets the task, updates it with one tap and sends it for review. The
    manager then approves requests and finished work and reads the reports.

    To follow it in the app, sign in with the demo login in App Review Information. You are the manager of a demo
    company, Horizon Trading. Part 2 of the guide shows the employee screens.

    The screens are captured at iPhone size from the app's web build, using the same demo company.

    Thank you.
    ```
  - Reply to Apple's 8 Nov review (5.1.1(i) / 5.1.2(i), 3.2, 5.1.1(v)), after the AI permission update is live:
    ```
    Hello,

    Thank you for the review. Here is what we changed and the answers to your questions.

    Guidelines 5.1.1(i) and 5.1.2(i), data sent to a third-party AI service
    Muntej now asks before any personal data is sent to AI. Right after signing in, the app shows "Can Muntej use AI
    on your data?". The screen lists what is sent:
    - what the user types or says, including voice recordings;
    - names, job titles and skills of their team;
    - task details;
    - proof photos and files they attach;
    - org charts and lists they upload;
    - and, only if they connect them, emails, chats and meetings from Gmail, Outlook, Teams or WhatsApp.
    The screen names the receiver, OpenAI (USA), and links to the privacy policy. Nothing is sent until the user taps
    "Allow AI". With "Not now", the app keeps working without AI: tasks are created by hand, and our server refuses
    every AI request for that user. The choice can be changed anytime in Settings → AI assistant (OpenAI). The
    privacy policy (https://nizamy-muntej.expo.app/privacy.html, section 4) explains the same data, how it is
    collected, every use, and that OpenAI and our other providers protect it at least as well as our policy. You can
    see the screen by signing in with the demo login.

    Guideline 3.2, public audience
    1. No. Muntej is not restricted to one company or organization.
    2. No. It is not designed for a limited group of companies. Any company or organization can start using it,
       with no invitation, contract or approval from us.
    3. Everything in the app is for the general public. Anyone can download Muntej, sign up with their email and a
       6-digit code, and start creating and following up tasks right away, on their own or with a team they invite.
    4. Users sign up themselves in the app with their email; signing up creates their own company workspace, where
       they are the admin. People can also join through an invitation from their manager (email or WhatsApp link).
    5. No. There is no paid content. Muntej is free, with no purchases, subscriptions or paid features.

    Guideline 5.1.1(v), account deletion
    Account deletion is in the app: Settings → scroll down → Delete my account → Delete. The account is deleted
    right away and the user is signed out. It works for every user, including company admins and the demo login.
    Screen recording on a physical iPhone (sign in with the demo login, open Settings, delete the account, confirm):
    <PASTE THE RECORDING LINK>
    We also added the recording link to the Notes in App Review Information.

    Thank you.
    ```
- **Version Release:** "Automatically release this version" (or manual, if you want to pick the day).

## Pricing and Availability
- Price: **Free** (USD 0).
- Availability: all countries, or only Saudi Arabia and the Gulf if you prefer a soft launch.

## App Privacy (left menu → App Privacy → Get Started)
- "Do you or your third-party partners collect data from this app?" **Yes**.
- Tracking (used to track people across other companies' apps or sites): **No** for every type.
- Every type below is **Linked to the user**.

| Apple category → type | Purpose |
|---|---|
| Contact Info → Name | App Functionality |
| Contact Info → Email Address | App Functionality |
| Contact Info → Phone Number | App Functionality (WhatsApp alerts; optional) |
| User Content → Emails or Text Messages | App Functionality (tasks found in connected Gmail, Outlook, WhatsApp) |
| User Content → Audio Data | App Functionality (a task said by voice is turned into text; the audio isn't kept) |
| User Content → Photos or Videos | App Functionality (proof of done work) |
| User Content → Other User Content | App Functionality (tasks, comments, chat with Saree3, support chat) |
| User Content → Customer Support | App Functionality (support chat) |
| Identifiers → User ID | App Functionality |
| Usage Data → Product Interaction | Analytics, App Functionality |

Not collected: Location, Contacts, Health, Financial Info, Browsing History, Search History, Purchases, Diagnostics,
Sensitive Info, and Identifiers → Device ID.

## Already handled in the build
- **Export compliance:** `usesNonExemptEncryption: false` in app.json, so Apple doesn't ask.
- **Sign in with Apple:** not required. Sign-in is email and code only, with no Google or Facebook login. Google
  appears only for connecting tools, which Apple doesn't count.
- **iPad:** off (`supportsTablet: false`), so no iPad screenshots are needed.
- **In-app purchases:** none. Leave the In-App Purchases section empty.

## Then
Tap **Add for Review**, then **Submit to App Review**. A first review usually takes 1–3 days. Later app changes reach
iPhones over the air (`npm run ship`), as on Android. A new upload is only needed for native changes.

## TestFlight (optional, before review)
Test the real build on your own iPhone first: TestFlight → Internal Testing → add yourself as a tester. Install
TestFlight from the App Store and open the invite.
