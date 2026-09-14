# Pocket Ledger

Small, mobile-first personal expense tracker using React, Vite, Supabase, and PWA support.

## Local setup

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in its SQL Editor. It is an in-place V1 migration for the original schema and preserves existing transactions.
3. In Authentication > URL Configuration, add `http://localhost:5173` to Redirect URLs (and your production URL after deployment).
4. In Authentication > Providers > Email, keep Email enabled. Magic Link login is used by this app.
5. Copy `.env.example` to `.env` and fill in your Project URL plus anon/publishable key from Supabase's Connect/API settings.
6. Run `npm install`, then `npm run dev`.

The database uses RLS policies so an authenticated user can access only their own transactions, ledgers, and settings. Do not add a service-role key to `.env`.

## Included V1 scope

- Passwordless Supabase Auth via email sign-in link
- Add, edit, list, and delete income/expense transactions
- Built-in and custom income/expense ledgers, with safe custom-ledger deletion
- Cloud-synced CNY/USD preference and per-transaction currency preservation
- Week, month, and year summaries with ledger filtering; currencies are never combined
- Responsive mobile-first UI and installable PWA manifest/service worker

Not included: export, backups, budgets, charts, recurring entries, notifications, analytics, accounts, sharing, or offline data editing.
