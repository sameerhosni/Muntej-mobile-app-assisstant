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
    There are no purchases in the app. Accounts can be deleted in Settings → Delete account.
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
