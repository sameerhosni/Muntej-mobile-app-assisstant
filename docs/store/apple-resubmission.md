# Muntej: resubmitting to Apple (after the 11 Nov review of build 2)

Everything for the resubmission is in this one file, in the order you'll need it. Each grey box is ready to copy.

**What Apple said on 11 Nov, and what changed**
| Apple | What we found | What changed |
|---|---|---|
| 2.1(a): an error when tapping login, on an iPad Air 11" (M3), iPadOS 27.2 | That iPad made one call to our server (it loaded the app's feature list), then never sent a sign-in request. The cause is on the device side. | Every sign-in failure now says why ("Couldn't reach Muntej…", "That code isn't right…"), with a ref number, and the same ref reaches our server log. Mohammed tests on that iPad model in the simulator before we submit. |
| 3.2: looks like an app for one business | Self sign-up already works: a new email gets its own free workspace. The sign-in screen didn't say so: it asked for a "Work email". | The sign-in screen now says "Sign in or start free · New here? This creates your own free workspace", and the label is "Email". |
| 2.5.4: background audio declared but not used | The audio library turns it on by default. | Turned off. The app records and plays only while it is open. Needs **build 3**. |

## 0a. Build 3 (Mohammed, on the Mac, same as before)
Use the next build number after the highest one in TestFlight (Apple already has 1 and 2, and maybe 3).
```
cd muntej && git pull            # or: git clone https://github.com/sameerhosni/Muntej-mobile-app-assisstant.git muntej
npm ci
npx eas-cli login
npx eas-cli build:version:set -p ios          # type the highest build number in TestFlight
npx eas-cli build -p ios --profile production --local --output muntej-build3.ipa
npx eas-cli submit -p ios --profile production --path muntej-build3.ipa
```
- Signing uses the same `credentials.json` as before (eas.json says `credentialsSource: local`).
- The build log must say **version 1.0.0** and the new build number.
- **Check that background audio is gone:** after `npx expo prebuild -p ios --clean`, `ios/Muntej/Info.plist` must not
  contain `UIBackgroundModes` with `audio`.

## 0b. Test like Apple does (Mohammed, Xcode Simulator)
1. Xcode → Window → Devices and Simulators → add **iPad Air 11-inch (M3)** on the newest iPadOS.
2. Install the build-3 app on it (iPhone app on iPad), open it twice (the second open picks up the latest update).
3. Sign in with `play-review@muntej.app` and the review code. Record the screen.
4. If anything fails, the message shows a **ref number**. Send it to Claude, who reads that exact line in the server log.
5. Do the same on a real iPhone, and record the account deletion there (section 0c).

## 0c. Recording for Apple (real iPhone)
- [ ] Control Center → Screen Recording, then:
  1. Open Muntej and sign in with `play-review@muntej.app` and the review code.
  2. The AI screen appears ("Can Muntej use AI on your data?"). Tap **Allow AI**.
  3. Open **Settings**, scroll to the bottom and tap **Delete my account**.
  4. Tap **Delete**. The app returns to the sign-in screen. Stop recording.
- [ ] Upload it where Apple can open it without signing in (unlisted YouTube, or Google Drive "Anyone with the link").
- [ ] Put the link in place of `<RECORDING LINK>` below.
- [ ] Tell Claude "recorded": it resets the demo company so Apple gets a fresh login, and holds app updates until
  Apple finishes (so Apple runs exactly what you tested).

## 1. App Store Connect → Muntej → iOS App → version 1.0
- **Build:** pick **build 3**.
- **App Review Information:** sign-in required **Yes**; user name `play-review@muntej.app`; password: the 6-digit
  review code; contact: your name, phone, `sales@muntej.app`.
- **Notes:** paste section 2.
- Reply to the rejection with section 3, then **Submit for Review**.

## 2. Notes (App Review Information → Notes)
```
Sign in: on the first screen type the email play-review@muntej.app and tap "Send code" (please use the email, not
"Sign in with WhatsApp", which is only for people a manager added by mobile number). Then type the 6-digit code given
as the password and tap "Sign in" (no email needed). You are the manager of a demo company (Horizon Trading) with a
sample team and tasks. If anything goes wrong, the message shows the reason and a reference number; please include
it in your reply so we can find it in our logs.
Anyone can use Muntej: a new email gets its own free workspace right away, with no invitation. There are no
purchases in the app. The full user journey, screen by screen: https://nizamy-muntej.expo.app/journey.html
AI: right after signing in, the app asks "Can Muntej use AI on your data?" It lists what is sent and says it goes
to OpenAI. Nothing is sent before you tap Allow AI; with Not now the app works without AI. Change it anytime in
Settings → AI assistant (OpenAI).
To delete an account: Settings → scroll down → Delete my account → Delete. You can test it with this demo login:
it signs you out, and the same login works again afterwards in the demo company.
Screen recording of account deletion on an iPhone: <RECORDING LINK>
```

## 3. Reply to the 11 Nov review
Attach `store/journey/muntej-user-journey.pdf`.
```
Hello,

Thank you for the review. Build 3 (version 1.0.0) addresses all three points.

Guideline 2.1(a), sign-in error on iPad
Our server logs show that your iPad opened the app but its sign-in request never reached our server, so the app
could only show a general error. Build 3 shows the exact reason for any sign-in problem (for example "Couldn't reach
Muntej. Check your internet and try again.") with a reference number, and reports it to us. We tested the sign-in
with the demo login on an iPad Air 11-inch (M3) running the iPhone app on iPadOS 27.2, and on an iPhone. Please sign
in with the email play-review@muntej.app and the code (not "Sign in with WhatsApp"). If anything still fails,
please send us the reference number shown on the screen.

Guideline 3.2, public audience
Muntej is for the general public, not for one business:
1. It is not restricted to one company or organization.
2. It is not designed for a limited group of companies. Anyone can start using it, with no invitation, contract or
   approval from us.
3. Anyone can download Muntej, type their own email on the first screen ("Sign in or start free"), enter the 6-digit
   code, and start right away. A new email gets its own free workspace instantly, where the person is the admin.
   They can use it on their own or invite a team later.
4. Users get an account by signing up themselves in the app. People can also join through an invitation from their
   manager.
5. There is no paid content. Muntej is free, with no purchases, subscriptions or paid features.
We made this clearer on the first screen: it now says "Sign in or start free · New here? This creates your own free
workspace."

Guideline 2.5.4, background audio
We removed "audio" from UIBackgroundModes. The app records a spoken task and plays a spoken summary only while it is
open, and it has no feature that needs audio in the background.

Account deletion (5.1.1(v)), for reference
Settings → scroll down → Delete my account → Delete. Screen recording on a physical iPhone: <RECORDING LINK>

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
