# Muntej: resubmitting to Apple (after the 8 Nov review)

Everything for the resubmission is in this one file, in the order you'll need it. Each grey box is ready to copy.

## 0a. Build 2 (Mohammed, on the Mac, same as build 1)
Apple already has build 1, so this build must be number 2. Run in Terminal:
```
git clone https://github.com/sameerhosni/Muntej-mobile-app-assisstant.git muntej   # or: cd muntej && git pull
cd muntej
npm ci
npx eas-cli login
npx eas-cli build:version:set -p ios          # type 1, so the next build becomes 2
npx eas-cli build -p ios --profile production --local --output muntej-build2.ipa
npx eas-cli submit -p ios --profile production --path muntej-build2.ipa
```
- Signing uses the same certificate and profile as build 1 (`credentials.json` in the project folder,
  because eas.json says `credentialsSource: local`). Copy it from the build 1 folder if it is a new clone.
- The build log must say **buildNumber 2** and **version 1.0.0**.
- After submit, App Store Connect takes about 15 minutes to process it, then it shows in TestFlight.

## 0. Before you start
- [ ] Install **build 2** from TestFlight on your iPhone (it reaches TestFlight about 15 minutes after the build finishes).
- [ ] Record the screen on the iPhone (Control Center → Screen Recording):
  1. Open Muntej and sign in with `play-review@muntej.app` and the review code.
  2. The AI screen appears ("Can Muntej use AI on your data?"). Tap **Allow AI**.
  3. Open **Settings**, scroll to the bottom and tap **Delete my account**.
  4. Tap **Delete**. The app returns to the sign-in screen. Stop recording.
- [ ] Upload the video somewhere Apple can open without signing in: an unlisted YouTube video, or Google Drive with "Anyone with the link".
- [ ] Put the link in place of `<RECORDING LINK>` in sections 2 and 3 below.
- [ ] Tell Claude "recorded". It resets the demo company so Apple gets a fresh login.

## 1. App Store Connect → Muntej → iOS App → version 1.0
- **Build:** remove build 1, tap **Add Build** and pick **build 2**.
- **App Review Information:**
  - Sign-in required: **Yes**
  - User name: `play-review@muntej.app`
  - Password: the 6-digit review code (the same one given to Google Play)
  - Contact: your name, phone, and `sales@muntej.app`
- **Notes:** paste section 2.
- Tap **Save**, then **Add for Review** → **Submit to App Review**.

## 2. Notes (App Review Information → Notes)
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
Screen recording of account deletion on an iPhone: <RECORDING LINK>
```

## 3. Reply in App Review (the message thread on the rejection)
Attach `store/journey/muntej-user-journey.pdf` (the user-journey guide).
```
Hello,

Thank you for the review. Here is what we changed and the answers to your questions. The new build (1.0.0, build 2)
includes all of it.

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
<RECORDING LINK>
We also added the recording link to the Notes in App Review Information.

Thank you.
```

## 4. Links (already set; check only)
| Field | Value |
|---|---|
| Privacy Policy URL | https://nizamy-muntej.expo.app/privacy.html (section 4 is the AI part) |
| Support URL | https://nizamy-muntej.expo.app/help.html |
| Account deletion (web) | https://nizamy-muntej.expo.app/delete-account.html |
| User journey | https://nizamy-muntej.expo.app/journey.html |

## 5. App Privacy (only if Apple asks again)
No change is needed. Every type is "Linked to the user", with no tracking. The full list is in
[app-store.md](app-store.md), section "App Privacy".
