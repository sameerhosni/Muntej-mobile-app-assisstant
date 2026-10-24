# Muntej API (v1)

> **بالعربي:** واجهة منتج البرمجية تخلّي أنظمتكم (ERP، CRM، الموارد البشرية، أودو، زوهو…) تعطي منتج مهام، وتقرا
> حالتها، وتضيف موظفين، وتستقبل تنبيهات (Webhooks) لما تنشأ مهمة أو تخلص أو ينتظر قرار. منتج بعدها يتابع بنفسه:
> يسلّم المهمة لصاحبها، يذكّره، يجمع الإثبات، ويبلّغ المدير بالاستثناءات بس. المفتاح يسويه مسؤول الحساب من التطبيق،
> ويطلع مرة وحدة بس، فاحفظه في مكان آمن.

Contract: [openapi.yaml](openapi.yaml) · Design: [../design/HLD.md](../design/HLD.md)

**Base URL:** `https://katwiedukkvssuxbjbqf.supabase.co/functions/v1/public-api`

## 1. Get a key

An **admin** of the account creates a key. It is shown **once** and only its hash is stored:

```sql
-- from the app (admin), via RPC
select public.create_api_key('Odoo');            -- → {"id": "...", "key": "mjk_…", "prefix": "mjk_3f9a1c"}
select public.revoke_api_key('<key id>');
```

Send it on every call:

```
Authorization: Bearer mjk_…
```

`X-API-Key: mjk_…` also works.

The key acts as the admin who made it, so tasks it creates are "from" that admin and the account's rules apply.

| | |
|---|---|
| **Scopes** (default: all) | `tasks:read` · `tasks:write` · `people:read` · `people:write` · `decisions:read` · `messages:write` · `webhooks:write` |
| **Rate limit** | 120 requests per minute per key. Above it, `429 rate_limited`. |
| **Idempotency** | Send `Idempotency-Key: <unique>` on POSTs. A retry within 24 h returns the first answer. |
| **Errors** | `{"error": {"code": "invalid_field", "message": "due_at must be an ISO 8601 date-time"}}` |
| **Audit** | Every write is in the activity log as "API key <name>". |

## 2. Give Muntej a task

```bash
curl -X POST "$BASE/v1/tasks" \
  -H "Authorization: Bearer $MUNTEJ_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: odoo-so-4471" \
  -d '{
    "title": "Prepare the quotation for Al-Rajhi",
    "owner_email": "faisal@company.sa",
    "due_at": "2026-10-27T17:00:00+03:00",
    "priority": "high",
    "description": "3 items from SO-4471, 15% discount approved",
    "proof_required": "file",
    "external_ref": "SO-4471"
  }'
```

The response is `201 {"data": {task}}`. From that moment Saree3 runs the task: Faisal gets one push ("Ahmed gave you a
task · due Tue 5 PM · Got it / Need time / Need help"), then receipt and progress check-ins, then "one hour left". If he
asks for more time, his manager gets a decision.

## 3. Read and update

```bash
curl "$BASE/v1/tasks?status=in_progress&owner=faisal@company.sa&updated_since=2026-10-24T00:00:00Z" -H "Authorization: Bearer $MUNTEJ_KEY"
curl "$BASE/v1/tasks/<id>" -H "Authorization: Bearer $MUNTEJ_KEY"           # with its steps
curl -X PATCH "$BASE/v1/tasks/<id>" -H "Authorization: Bearer $MUNTEJ_KEY" -H "Content-Type: application/json" \
  -d '{"due_at": "2026-10-29T17:00:00+03:00", "priority": "urgent"}'
```

## 4. People and decisions

```bash
curl "$BASE/v1/people" -H "Authorization: Bearer $MUNTEJ_KEY"
curl -X POST "$BASE/v1/people" -H "Authorization: Bearer $MUNTEJ_KEY" -H "Content-Type: application/json" \
  -d '{"email": "noura@company.sa", "name": "Noura", "name_ar": "نورة", "title": "Accountant", "role": "employee"}'
curl "$BASE/v1/decisions?status=pending" -H "Authorization: Bearer $MUNTEJ_KEY"
```

Added people sign in with that email (no codes).

## 5. Send a message in

Use this to pass on an email, a ticket comment or meeting notes. Saree3 finds the tasks, and they wait for an OK in
**Your tools**:

```bash
curl -X POST "$BASE/v1/messages" -H "Authorization: Bearer $MUNTEJ_KEY" -H "Content-Type: application/json" \
  -d '{"text": "Faisal, please send the price list to Al-Rajhi by tomorrow noon", "for_email": "ahmed@company.sa", "external_id": "crm-note-9921"}'
```

The response is `202` with `tasks_found`. The same `external_id` is never read twice.

## 6. Webhooks

```bash
curl -X POST "$BASE/v1/webhooks" -H "Authorization: Bearer $MUNTEJ_KEY" -H "Content-Type: application/json" \
  -d '{"url": "https://erp.company.sa/hooks/muntej", "events": ["task.created", "task.done", "decision.created"]}'
# → 201 {"data": {"id": "...", "secret": "whsec_…"}}   keep the secret: shown once
curl -X DELETE "$BASE/v1/webhooks/<id>" -H "Authorization: Bearer $MUNTEJ_KEY"
```

**Events:** `task.created`, `task.updated` (status, due date, owner, priority or title changed), `task.done`,
`decision.created`, `decision.resolved`.

**Each delivery** is a POST:

```
X-Muntej-Event: task.done
X-Muntej-Delivery: 1842
X-Muntej-Timestamp: 1761314400
X-Muntej-Signature: sha256=<hex>
{"id": 1842, "event": "task.done", "created_at": "...", "account_id": "...", "data": {"task": {...}}}
```

**Verify it** by computing `HMAC_SHA256(secret, "<X-Muntej-Timestamp>.<raw body>")` in hex and comparing it with the
signature. Reject anything older than 5 minutes:

```js
const expected = crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
if (`sha256=${expected}` !== req.headers['x-muntej-signature']) return res.status(401).end();
```

Reply with any 2xx. Otherwise the delivery is retried after 1 min, 5 min, 30 min, 2 h and 12 h, then marked failed.

## 7. Go-live checklist (owner)

1. Apply the migration `supabase/migrations/20261024200000_public_api.sql`.
2. Deploy the functions:
   - `public-api` with `--no-verify-jwt`
   - `webhook-dispatch` (cron-only)
3. Create a key with `create_api_key`. An admin screen for this is in the backlog.
4. Optional: put `https://api.muntej.app` in front of the base URL (a custom domain or a proxy).
