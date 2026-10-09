# Sports Meet Manager

Online app for running an interschool athletics meet: registration, Excel bulk import, bib numbers, start lists,
relay teams, one-tap prize entry, championship points, automatic certificates (PDF), and a public live-results page.

- **Frontend:** Next.js 15 (App Router) + Tailwind, hosted on Vercel
- **Database / logins / photo storage:** Supabase (Postgres with row-level security)
- **Exports:** Excel (SheetJS) and PDF (jsPDF)

## Roles

| Role | Can do |
| --- | --- |
| **Admin** | Everything, plus Meet Setup (schools, categories, events, points, signatories), bib numbers, users, backup/restore, deleting athletes |
| **Data entry** | Register/edit athletes, Excel import, relay teams, prize entry, certificates, exports |
| **Public** (no login) | `/live` — points table and winners only (no DOB/photos). Can be switched off in Meet Setup. |

All rules (age eligibility, max entries per school, relay team checks, one 1st/2nd/3rd per event, bib locking,
permissions) are enforced in the database, so they hold no matter which screen or device is used.

## Meet-day workflow

1. **Meet Setup** — meet name, date, venue, signatory names (printed on certificates), points.
2. **Athletes** — register one by one, or **Excel Import** (download the template first). The same sheet can create
   relay teams: list the relay in each runner's Events, plus optional **Relay Team** (A, B…) and **Relay Leg** (1–4).
3. **Relay Teams** — check imported teams, or add teams by hand (4 runners per team).
4. **Bib Numbers** — allocate, then **Finalize**. Print bib cards (PDF).
5. **Start Lists** — print/export per event for officials.
6. **Prize Entry** — pick event → tap 🥇/🥈/🥉. Optional time/distance.
7. **Certificates** — appear instantly; download one, per school, or all as a single PDF.
8. **Backup** — download a backup file before and after each day.

## Run locally

Requires Node 20+ and Docker Desktop.

```bash
npm install
npx supabase start          # local Postgres + auth + storage (first run downloads images)
cp .env.example .env.local  # then paste the URL / anon key / service_role key printed by `supabase start`
npm run create-admin -- you@example.com "a-strong-password" "Your Name"
npm run dev                 # http://localhost:3000
```

`npx supabase db reset` wipes the local database and re-applies `supabase/migrations/`.

## Deploy online (free tiers)

1. **Supabase:** create a project at <https://supabase.com>. Then from this folder:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push        # creates tables, rules, default schools/categories/events
   ```
   In the Supabase dashboard → **Authentication → Sign In / Providers**, turn **off** “Allow new users to sign up”
   (staff accounts are created by the admin from the Users page).
2. **Vercel:** import this project at <https://vercel.com/new> (or run `npx vercel`), and add the three variables from
   `.env.example` with your Supabase values (Project Settings → API). Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
3. **First admin:** with `.env.local` pointing at the cloud project, run
   `npm run create-admin -- you@example.com "a-strong-password" "Your Name"`
   (or add a user in Supabase → Authentication → Users; the very first user automatically becomes admin).
4. In Supabase → **Authentication → URL Configuration**, set **Site URL** to your Vercel URL.

## Project layout

```
supabase/migrations/   database schema, validation triggers, RLS policies, default data
src/app/(app)/         logged-in pages (dashboard, athletes, import, events, relays, results, points,
                       certificates, bibs, setup, users, backup)
src/app/live/          public results page
src/app/login/         sign-in
src/components/        shared UI, meet data context (with realtime updates), athlete form
src/lib/               Supabase clients, Excel/PDF/certificate generation, helpers
scripts/create-admin.mjs
```
