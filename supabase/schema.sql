-- Secrets of Mental Math: accounts, the 120-second leaderboard and head-to-head matches.
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).
-- Safe to run again: it replaces functions and policies, and creates tables only if missing.
--
-- Clients never write tables directly. Every write goes through a function below, which checks
-- who is calling (auth.uid()) and whether the numbers are believable.

-- ---------- Profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text,
  rating int not null default 1200,
  games int not null default 0,
  wins int not null default 0,
  created_at timestamptz not null default now(),
  constraint username_shape check (username is null or username ~ '^[A-Za-z0-9_]{3,16}$')
);
-- Names are unique ignoring case: Rey and rey are the same player.
create unique index if not exists profiles_username on public.profiles (lower(username));

-- A profile for every new account; the player picks a username afterwards.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_username(name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if name !~ '^[A-Za-z0-9_]{3,16}$' then raise exception '3 to 16 letters, digits or _'; end if;
  insert into profiles (id, username) values (auth.uid(), name)
    on conflict (id) do update set username = excluded.username;
exception when unique_violation then
  raise exception 'that name is taken';
end $$;

-- ---------- 120-second scores ----------
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  score int not null check (score between 0 and 300),
  created_at timestamptz not null default now()
);
create index if not exists scores_user on public.scores (user_id, created_at desc);
create index if not exists scores_best on public.scores (score desc, created_at);

-- One score per test: the client calls begin_test when the clock starts and submit_score when
-- it stops, and the server checks that about 120 seconds passed between the two.
create table if not exists public.tests (
  user_id uuid primary key references public.profiles on delete cascade,
  started_at timestamptz not null
);

create or replace function public.begin_test() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into tests (user_id, started_at) values (auth.uid(), now())
    on conflict (user_id) do update set started_at = now();
end $$;

create or replace function public.submit_score(score int) returns void
language plpgsql security definer set search_path = public as $$
declare t timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from tests where user_id = auth.uid() returning started_at into t;
  if t is null then raise exception 'no test in progress'; end if;
  -- 118 s allows for a little clock drift; a test older than 10 minutes is stale.
  if now() - t < interval '118 seconds' or now() - t > interval '10 minutes' then
    raise exception 'test timing does not check out';
  end if;
  -- Faster than 2.5 answers a second is not believable.
  if score < 0 or score > 300 then raise exception 'score out of range'; end if;
  insert into scores (user_id, score) values (auth.uid(), score);
end $$;

-- Each player's best, all time or in the last 7 days.
drop function if exists public.leaderboard(text, int);
drop function if exists public.top_scores(text, int);
create or replace function public.top_scores(span text default 'all', lim int default 50)
returns table (username text, score int, rating int, played_at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from (
    select distinct on (p.id) p.username, s.score, p.rating, s.created_at as played_at
    from scores s join profiles p on p.id = s.user_id
    where p.username is not null
      and (span = 'all' or s.created_at > now() - interval '7 days')
    order by p.id, s.score desc, s.created_at
  ) best
  order by score desc, played_at
  limit least(lim, 100)
$$;

create or replace function public.top_ratings(lim int default 50)
returns table (username text, rating int, games int, wins int)
language sql stable security definer set search_path = public as $$
  select username, rating, games, wins from profiles
  where username is not null and games > 0
  order by rating desc, games desc limit least(lim, 100)
$$;

-- ---------- Head-to-head ----------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  seed bigint not null,
  p1 uuid not null references public.profiles on delete cascade,
  p2 uuid not null references public.profiles on delete cascade,
  starts_at timestamptz not null,
  p1_score int,
  p2_score int,
  p1_delta int,
  p2_delta int,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists matches_p1 on public.matches (p1, created_at desc);
create index if not exists matches_p2 on public.matches (p2, created_at desc);

create table if not exists public.queue (
  user_id uuid primary key references public.profiles on delete cascade,
  rating int not null,
  seen_at timestamptz not null default now()
);

-- Called every couple of seconds while searching. Returns the match once there is one.
-- Pairs with the waiting player nearest in rating.
create or replace function public.find_match() returns public.matches
language plpgsql security definer set search_path = public as $$
declare me profiles; them queue; m matches;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into me from profiles where id = auth.uid();
  if me.username is null then raise exception 'pick a username first'; end if;

  -- Already paired by the other player?
  select * into m from matches
    where (p1 = me.id or p2 = me.id) and not done and starts_at > now() - interval '5 seconds'
    order by created_at desc limit 1;
  if found then
    delete from queue where user_id = me.id;
    return m;
  end if;

  insert into queue (user_id, rating) values (me.id, me.rating)
    on conflict (user_id) do update set seen_at = now();
  delete from queue where seen_at < now() - interval '10 seconds';

  select q.* into them from queue q
    where q.user_id <> me.id
    order by abs(q.rating - me.rating), q.seen_at
    limit 1
    for update skip locked;
  if not found then return null; end if;

  delete from queue where user_id in (me.id, them.user_id);
  insert into matches (seed, p1, p2, starts_at)
    values ((random() * 4294967295)::bigint, them.user_id, me.id, now() + interval '5 seconds')
    returning * into m;
  return m;
end $$;

create or replace function public.leave_queue() returns void
language sql security definer set search_path = public as $$
  delete from public.queue where user_id = auth.uid()
$$;

-- Elo, as in chess: the expected score from the rating gap, K = 32.
create or replace function public.settle(m public.matches) returns public.matches
language plpgsql security definer set search_path = public as $$
declare r1 int; r2 int; e1 float; s1 float; d1 int;
begin
  if m.done then return m; end if;
  select rating into r1 from profiles where id = m.p1;
  select rating into r2 from profiles where id = m.p2;
  e1 := 1 / (1 + power(10, (r2 - r1) / 400.0));
  s1 := case when coalesce(m.p1_score, 0) > coalesce(m.p2_score, 0) then 1
             when coalesce(m.p1_score, 0) < coalesce(m.p2_score, 0) then 0 else 0.5 end;
  d1 := round(32 * (s1 - e1));
  update profiles set rating = rating + d1, games = games + 1, wins = wins + (s1 = 1)::int where id = m.p1;
  update profiles set rating = rating - d1, games = games + 1, wins = wins + (s1 = 0)::int where id = m.p2;
  update matches set p1_delta = d1, p2_delta = -d1, done = true where id = m.id returning * into m;
  return m;
end $$;

-- Each player sends their score when the clock stops. The match settles when both are in,
-- or when either player asks after the grace period (a missing score counts as 0).
create or replace function public.submit_match(match_id uuid, score int) returns public.matches
language plpgsql security definer set search_path = public as $$
declare m matches; ends timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into m from matches where id = match_id for update;
  if not found or auth.uid() not in (m.p1, m.p2) then raise exception 'not your match'; end if;
  ends := m.starts_at + interval '120 seconds';
  if m.done then return m; end if;
  if now() < ends - interval '2 seconds' then raise exception 'match still running'; end if;
  if score is not null and now() < ends + interval '30 seconds' then
    if score < 0 or score > 300 then raise exception 'score out of range'; end if;
    if auth.uid() = m.p1 and m.p1_score is null then
      update matches set p1_score = score where id = m.id returning * into m;
    elsif auth.uid() = m.p2 and m.p2_score is null then
      update matches set p2_score = score where id = m.id returning * into m;
    end if;
  end if;
  if (m.p1_score is not null and m.p2_score is not null) or now() > ends + interval '30 seconds' then
    m := settle(m);
  end if;
  return m;
end $$;

-- A match with both usernames and ratings, for the race and result screens. server_now lets
-- both players start the clock together whatever their own clocks say.
drop function if exists public.match_view(uuid);
create or replace function public.match_view(match_id uuid)
returns table (id uuid, seed bigint, starts_at timestamptz, done boolean,
               me_score int, them_score int, me_delta int, them_name text, them_rating int, me_rating int,
               server_now timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.seed, m.starts_at, m.done,
         case when m.p1 = auth.uid() then m.p1_score else m.p2_score end,
         case when m.p1 = auth.uid() then m.p2_score else m.p1_score end,
         case when m.p1 = auth.uid() then m.p1_delta else m.p2_delta end,
         o.username, o.rating, me.rating, now()
  from matches m
  join profiles o on o.id = case when m.p1 = auth.uid() then m.p2 else m.p1 end
  join profiles me on me.id = auth.uid()
  where m.id = match_id and auth.uid() in (m.p1, m.p2)
$$;

-- ---------- Row-level security ----------
-- Profiles and scores are readable by anyone (they are the leaderboard). Matches only by
-- their two players. Nothing is writable directly; the functions above do all writes.
alter table public.profiles enable row level security;
alter table public.scores enable row level security;
alter table public.tests enable row level security;
alter table public.matches enable row level security;
alter table public.queue enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "scores readable" on public.scores;
create policy "scores readable" on public.scores for select using (true);
drop policy if exists "own matches" on public.matches;
create policy "own matches" on public.matches for select using (auth.uid() in (p1, p2));

-- settle() is internal: only the functions above call it.
revoke execute on function public.settle(public.matches) from public, anon, authenticated;
