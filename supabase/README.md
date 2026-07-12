# Supabase — feedback backend

The site's feedback widget (`src/components/FeedbackWidget.jsx`) POSTs to a
Supabase `feedback` table using a **public anon key**. The privacy posture the
UI and CONTRIBUTING promise depends on the row-level-security (RLS) policy being
**insert-only for anon**. This file is the version-controlled statement of that
intended posture and how to verify it — the policy itself lives in the hosted
Supabase project, not in a committed migration.

## Intended RLS posture (the promise the site makes)

Table `public.feedback` (columns: `message`, `name`, `email`, `page`,
`created_at`):

- **RLS enabled.**
- **anon role: INSERT only.** No `SELECT`, `UPDATE`, or `DELETE` for anon — a
  visitor can submit feedback but can never read, edit, or delete anyone's
  (including their own) submissions.
- **service_role** (server-side, used by the `feedback-digest` Edge Function)
  may read to send the digest.

Equivalent policy SQL (for reference / re-application):

```sql
alter table public.feedback enable row level security;

create policy "anon can insert feedback"
  on public.feedback for insert
  to anon
  with check (true);

-- no anon select/update/delete policies are created → those are denied by default
```

## Verify it (do this in the Supabase dashboard)

1. Table editor → `feedback` → **RLS is ON**.
2. Auth → Policies on `feedback`: exactly one anon policy, `INSERT` only.
   Confirm there is **no** anon `SELECT` policy.
3. Smoke test with the public anon key:
   - `POST /rest/v1/feedback` with a row → **201** (insert works).
   - `GET /rest/v1/feedback` with the same key → **empty / 401-403** (read denied).
4. Confirm the Resend key and notification email are set as **Edge Function
   secrets** (server-side), never in client code.

Record the verification date here when done: _not yet verified in-repo._
