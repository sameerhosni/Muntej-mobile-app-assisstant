// GENERATED from docs/BACKLOG.md by scripts/sync-backlog.js — edit the page, not this file.
export type BacklogItem = { id: string; title: string; detail: string };
export type BacklogSection = { title: string; items: BacklogItem[] };
export const BACKLOG_UPDATED = "2026-10-23";
export const BACKLOG: BacklogSection[] = [
  {
    "title": "1. Needs the owner (accounts, keys, settings outside the app)",
    "items": [
      {
        "id": "1.1",
        "title": "WhatsApp voice notes → tasks (number 0115209855)",
        "detail": "Meta setup: business app + WhatsApp, add 0115209855 (voice-call verification; must not be on the WhatsApp app), permanent token, run scripts/set-whatsapp-keys.ps1, paste webhook URL + verify token in Meta, subscribe to messages. Then test end to end. · Built and deployed (supabase/functions/whatsapp, WhatsApp card on Connect your tools)"
      },
      {
        "id": "1.2",
        "title": "Google Meet transcripts → tasks",
        "detail": "Google Cloud → enable Google Meet REST API; reconnect Google in the app (\"Allow\" on the Meet line); Workspace plan with transcripts; host turns on Transcripts / Take notes with Gemini. Test end to end. · Built and deployed"
      },
      {
        "id": "1.2b",
        "title": "Google Chat → tasks",
        "detail": "Google Cloud → enable Google Chat API; its Configuration tab: app name \"Muntej\", avatar URL, description, uncheck \"Interactive features\", Visibility = your domain, Save. OAuth consent screen → Data access → add chat.spaces.readonly, chat.messages.readonly, chat.memberships.readonly. Then in the app: Connected tools → Google → \"Allow\" on the Chat line. Workspace accounts only. Test end to end. · Built and deployed"
      },
      {
        "id": "1.2c",
        "title": "Public API v1 + webhooks go-live",
        "detail": "Built, not applied/deployed (waits for the owner): apply supabase/migrations/20261024200000_public_api.sql; deploy public-api (--no-verify-jwt via config) and webhook-dispatch; create a key (create_api_key). Then: an admin screen in Settings to make / revoke keys (today: RPC only), invitation email for people added through the API, optional custom domain api.muntej.app. Docs: docs/api/README.md, docs/api/openapi.yaml, docs/design/HLD.md + LLD.md. · Built, not deployed"
      },
      {
        "id": "1.2d",
        "title": "Muntej add-on inside Google Meet",
        "detail": "Waits for the owner's Workspace setup: Google Cloud → enable Google Workspace Marketplace SDK → App configuration → Meet add-on (side panel URL from us) → publish privately to muntej.app. Then build the panel: \"Start task listener\" (Saree3 reads that meeting's transcript right when it ends + one push), live quick-add by voice / text in the panel with owner + date, sign-in with the connected Google account. Truly live listening needs Google's Meet Media API Developer Preview (apply; weeks). Public listing for other companies needs Google review. · Planned"
      },
      {
        "id": "1.3",
        "title": "Google sign-in for everyone",
        "detail": "Google Cloud → Branding: add authorized domain muntej.app, Save → Audience: Publish app. Later: Google verification (Gmail is a restricted scope → security assessment) to remove the \"unverified app\" warning and the 100-user cap. In test mode refresh tokens expire every 7 days. · Done in code"
      },
      {
        "id": "1.4",
        "title": "Code emails land in spam",
        "detail": "Add DNS TXT on muntej.app: v=spf1 include:_spf.google.com include:spf.brevo.com ~all. Then turn the shared code off."
      },
      {
        "id": "1.5",
        "title": "Shared sign-in code 123456",
        "detail": "On for every existing person until 6 Nov 2026 (QUICK_LOGIN_ALL). Turn off once 1.4 works: scripts/enable-quick-login.ps1 -Off. · Temporary"
      },
      {
        "id": "1.6",
        "title": "Microsoft 365 / Outlook / Teams",
        "detail": "Azure app registration, run scripts/set-microsoft-keys.ps1. Card shows \"needs setup\" until then. · Built"
      },
      {
        "id": "1.7",
        "title": "Download page on muntej.app",
        "detail": "Host website/index.html on muntej.app; then replace the Expo build link (DOWNLOAD_URL in src/features/invite/api.ts, supabase/functions/muntej-chat, supabase/templates/invite.html). · Page built"
      },
      {
        "id": "1.8",
        "title": "Exposed secrets",
        "detail": "Delete the Expo tokens pasted in chat (two) in Expo → Access tokens; rotate the SMTP app password that was pasted earlier; change the Intercom password (sales@muntej.app) that was pasted on 25 Oct."
      },
      {
        "id": "1.9",
        "title": "Intercom support chat (Saree3 → \"Talk to the Muntej team\")",
        "detail": "In Intercom: Settings → Installation → copy the Android (and iOS) API key; Settings → Security → turn on identity verification and copy its secret. Run scripts/set-intercom-keys.ps1 (hidden prompts). Then a new build (2.5). Optional: Messenger colors + greeting. After it's installed, apply docs/support-chat-announcement.sql as a migration so Saree3 announces it. · Built (app + support-identity deployed); waits for keys + build"
      }
    ]
  },
  {
    "title": "2. Needs a new app build (can't come by over-the-air update)",
    "items": [
      {
        "id": "2.1",
        "title": "Muntej logo as the notification icon (configured in app.json, shows gray until a build)",
        "detail": ""
      },
      {
        "id": "2.2",
        "title": "Copy buttons + \"Paste code\" on the sign-in code screen (expo-clipboard)",
        "detail": ""
      },
      {
        "id": "2.3",
        "title": "Photo / file proof (expo-image-picker, expo-document-picker)",
        "detail": ""
      },
      {
        "id": "2.4",
        "title": "New app icon and splash",
        "detail": ""
      },
      {
        "id": "2.5",
        "title": "Intercom Messenger (@intercom/intercom-react-native, keys from EAS env via app.config.js): after 1.9",
        "detail": ""
      }
    ]
  },
  {
    "title": "3. To test on a phone (built, not verified end to end)",
    "items": [
      {
        "id": "3.1",
        "title": "Saree3's setup guide (owner + invited member), the setup bar on main screens, the 10:00 setup reminder",
        "detail": ""
      },
      {
        "id": "3.2",
        "title": "One-time screen tips (Home, Chat, Tasks, Tasks from email, task page, Team, Decisions, More)",
        "detail": ""
      },
      {
        "id": "3.3",
        "title": "Tasks from email: owner / time / priority / details from the email, 3 email accounts, Gmail switches",
        "detail": ""
      },
      {
        "id": "3.4",
        "title": "Invite by email + WhatsApp message; chat \"invite Faisal on WhatsApp\"",
        "detail": ""
      },
      {
        "id": "3.5",
        "title": "Weekly summary read aloud (speak function)",
        "detail": ""
      },
      {
        "id": "3.6",
        "title": "Shorter chat replies with one next step",
        "detail": ""
      },
      {
        "id": "3.7",
        "title": "Reset onboarding / screen tips on the test accounts (salsabilsamir@gmail.com, sales@nizamy.app) to try the new guide",
        "detail": ""
      },
      {
        "id": "3.8",
        "title": "Saree3's guided walkthrough on Home, Tasks, Tasks from email, task page, Team, Decisions (highlight lines up with the element; \"Show me how\" demos; \"Teach me this page\")",
        "detail": ""
      },
      {
        "id": "3.9",
        "title": "Notification background is drawn by Android (dark in dark mode): only the icon and name color are ours (Muntej purple, in the new build)",
        "detail": ""
      }
    ]
  },
  {
    "title": "4. Later ideas (not started)",
    "items": [
      {
        "id": "4.1",
        "title": "Meeting bot for any platform (Zoom, Teams, Meet) via a paid meeting-bot service",
        "detail": ""
      },
      {
        "id": "4.2",
        "title": "~~Rename \"Tasks from email\"~~ done: \"Tasks from your tools\" (24 Oct)",
        "detail": ""
      },
      {
        "id": "4.3",
        "title": "Connect your tools: show every linked account of the same tool (today the card status shows the first one)",
        "detail": ""
      },
      {
        "id": "4.4",
        "title": "Follow-ups scheduled before 23 Oct keep the old text; only new tasks get Saree3's new voice",
        "detail": ""
      },
      {
        "id": "4.5",
        "title": "Clear \"you deleted your account\" message on sign-in (today a generic error) and let a manager re-add someone who left",
        "detail": ""
      }
    ]
  },
  {
    "title": "5. Cleanup",
    "items": [
      {
        "id": "5.1",
        "title": "Invite-code tables and functions are unused since codes were dropped (invite_codes, invite_joins, invite_attempts, create_invite_code, redeem_invite…): drop them in a migration",
        "detail": ""
      },
      {
        "id": "5.2",
        "title": "Side sessions started earlier (chat table card, logo, review countdown) are idle: confirm nothing is left unmerged",
        "detail": ""
      }
    ]
  },
  {
    "title": "Done",
    "items": []
  }
];
