# Online play: Supabase setup

Accounts, the 120-second leaderboard and rated matches run on one free Supabase project.
Without it the site still works; the Play page just shows the solo test.

## 1. Project

1. Create a project at supabase.com (any region near your players). Keep the database
   password to yourself; the site never needs it.
2. **SQL Editor → New query**: paste all of `schema.sql`, then **Run**.
3. **Project Settings → API**: copy the **Project URL** and the **anon public** key into
   `.env.production` at the repo root (and `.env.local` for local runs):

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

   The anon key is public by design. What it can reach is limited by the row-level security
   and functions in `schema.sql`. Never put the `service_role` key here.

## 2. Sign-in

**Authentication → URL Configuration**

- Site URL: `https://official-rey.github.io/secrets-of-mental-math/`
- Redirect URLs: the same, plus `http://localhost:5174/` for local runs.

**Email link** works as soon as the project exists. The free plan's built-in mailer sends only
a few emails an hour; set up custom SMTP under Authentication → Emails before many people sign in.

**Google**

1. Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID
   (Web application). Configure the consent screen first if asked (External, app name, email).
2. Authorized redirect URI: `https://xxxx.supabase.co/auth/v1/callback` (your Project URL).
3. Paste the client ID and secret into Supabase → Authentication → Providers → Google, enable.

## 3. How it fits together

- `begin_test` / `submit_score`: a solo score counts only if about 120 s passed between the
  two calls and it is at most 300 (2.5 answers a second).
- `find_match`: polled every 2 s while searching; pairs the two waiting players nearest in
  rating and gives them one seed, so both get the same problems, starting 5 s later.
- During a match each side broadcasts its score on a Realtime channel, for display only.
- `submit_match`: each sends a final score; when both are in (or 30 s after the end, with a
  missing score as 0) the server applies Elo, K = 32, to both ratings.
