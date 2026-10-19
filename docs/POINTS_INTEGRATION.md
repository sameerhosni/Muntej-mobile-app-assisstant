# Muntej ↔ Points system — integration requirements

Muntej (mobile app) will use the existing points system for everything related to points, levels, badges,
rewards and kudos. This document lists what Muntej needs from that system.

**How Muntej will connect:** the app never calls the points system directly. A Supabase Edge Function calls
it server-to-server, so the API key stays in Supabase secrets and is never in the app. Screens then read the
results through Muntej's own API layer.

---

## 1. Connection & general

| # | Requirement | Notes |
|---|---|---|
| 1.1 | Base URL for production + a sandbox/test environment | Sandbox lets us test without touching real balances |
| 1.2 | Authentication method (API key / OAuth client credentials / per-user token) | Stored as a Supabase secret |
| 1.3 | **User identifier** to match Muntej people | Phone (E.164, e.g. `966500000002`), email, or your user ID. If it's your ID, we need a lookup by phone or email |
| 1.4 | **Team / manager identifier** | Rules, budget and catalog are per team (manager + direct reports) |
| 1.5 | Response format | JSON; dates in ISO-8601 UTC |
| 1.6 | Names in **English and Arabic** | For rewards, badges, levels, rule names and reasons |
| 1.7 | Error format + HTTP codes | e.g. `{ "code": "INSUFFICIENT_BALANCE", "message": "…" }` |
| 1.8 | Rate limits | So we can cache sensibly |
| 1.9 | Pagination style | For history, the kudos wall and requests |
| 1.10 | Idempotency on all writes | An `Idempotency-Key` header or an `event_id`, so a retry never double-awards |

## 2. Reads (data shown in the app)

### 2.1 Balance & level per user
Used on Employee home, Rewards, Badges, Pushback.
```json
{
  "user_id": "…",
  "balance": 3485,
  "sar_value": 348.5,
  "xp": 1240,
  "level": 7,
  "level_name": { "en": "Pro", "ar": "محترف" },
  "next_level_xp": 1500,
  "earned_today": 70,
  "earned_this_week": 410,
  "streak_days": 12
}
```
We also need the **points → SAR conversion rate**. Today the app assumes 10 pts = 1 SAR.

### 2.2 Points history per user
Used on Rewards and Achievements.
`[{ id, points (+/−), reason_key, reason { en, ar }, task_ref, created_at }]`

### 2.3 Earning rules (per team)
Used on Points control, Capture ("+65 pts" preview) and Task detail.
`[{ key, name { en, ar }, points, enabled }]`

Current values in the app:

| Rule | Points |
|---|---|
| On time | 50 |
| Early (≥24 h before due) | 20 |
| Proof attached | 15 |
| 5★ rating | 30 |
| Helping a teammate | 25 |
| Kudos | 10 / 25 / 50 |

### 2.4 Monthly budget (per team)
Used on Points control.
`{ month, total_points, used_points }`. The app's sample values are 20,000 total and 12,800 used.

### 2.5 Reward catalog (per team)
Used on Rewards and Employee home ("next reward").
`[{ id, name { en, ar }, cost_points, sar_value?, icon?, active }]`

The current sample catalog:

| Reward | Cost (pts) |
|---|---|
| Coffee | 300 |
| Charity donation | 500 |
| Leave 1 h early | 800 |
| Parking 1 week | 1,500 |
| Lunch with CEO | 2,500 |
| Remote day | 4,000 |

### 2.6 Badges per user
Used on Badges.
`[{ id, name { en, ar }, how_to_earn { en, ar }, earned, earned_at?, progress { current, target }?, points }]`

### 2.7 Level bands
Used on Badges.
`[{ level_from, level_to, name { en, ar }, xp_from }]`. Example bands: Starter 1–3, Achiever 4–6, Pro 7, Expert 8–9, Legend 10.

### 2.8 Kudos wall (per team)
Used on Kudos.
`[{ id, from_user, to_user, value (ownership|speed|quality|teamwork), points, message, created_at }]`

### 2.9 Team summary (for the manager)
Used on the manager's Home ("Team energy this week").
`{ points_this_week, change_pct_vs_last_week, people_on_streak, top_performers: [user_id…] }`

### 2.10 Reward requests
Used on Points control and Rewards.
`[{ id, user_id, reward_id, cost_points, status (pending|approved|declined), requested_at, decided_at?, decided_by? }]`
Filterable by team + status (manager view) and by user (employee view).

### 2.11 Optional (if your system has them)
- **Team challenge** (Team quests): `{ title, done, goal, deadline, reward_points, reward_sar, contributors[] }`
- **League across teams**: `[{ team_name { en, ar }, points, trend_pct, is_mine }]`
- **"You vs last week"** per user: on-time %, points, reminders received
- **Fairness hint**: people with no kudos in the last 30 days

## 3. Writes (actions from the app)

| # | Action | Who | Payload | Expected checks on your side |
|---|---|---|---|---|
| 3.1 | Send kudos | anyone | `to_user, value, points, message` | allowed amounts, no self-kudos |
| 3.2 | Request a reward | employee | `reward_id` | enough balance (minus pending requests) |
| 3.3 | Approve / decline a request | manager | `request_id, decision` | caller is the requester's manager; approve deducts the points |
| 3.4 | Update a rule | manager | `rule_key, points, enabled` | manager of that team; allowed range (the app uses 5–200, step 5) |

## 4. Events Muntej sends to the points system

When something happens in Muntej, we send an event (with a unique `event_id` for idempotency):

| Event | Data we can send |
|---|---|
| `task.closed` | task_id, owner, helper (optional), due_at, closed_at, proof_attached (bool), team |
| `task.reviewed` | task_id, owner, reviewer, rating 1–5, decision (approved / sent_back) |
| `task.flagged_overload` | user, task_id (employee said "I'm overloaded", Pushback screen) |
| `onboarding.step_done` | user, step key (first task, team added, WhatsApp linked, …) |

**❓ Key decision:** should **your system compute the points** from these events using its rules (preferred, so
there's one source of truth), or should **Muntej compute the amount** and send `{ user, points, reason }`?

## 5. Notifications back to Muntej (optional, recommended)

A webhook to a Muntej endpoint (signed with a shared secret) for:
- `points.awarded`: user, points, reason. Shown as "You got +50 🎉".
- `redemption.decided`: request_id, status. Shown as "Ahmed approved your coffee".
- `badge.earned`: user, badge_id.
- `level.up`: user, new_level.

Without webhooks, Muntej refreshes the data when a screen opens.

## 6. What to send us

1. API documentation (OpenAPI/Swagger preferred) covering the sections above.
2. Sandbox URL + test API key (sent privately; I'll store it in Supabase secrets, never in code or chat).
3. Test user IDs that match our demo people: Ahmed (manager), Faisal, Abdullah, Noura, Khalid, Saad, Maha.
4. Your answer to the key decision in section 4.

Anything your system doesn't provide stays as clearly marked sample data in the app until it's available.
