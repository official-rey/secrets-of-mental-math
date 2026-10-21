-- Exercises the functions in schema.sql with two made-up players, then throws everything away:
-- the block ends by raising its report as an error, which rolls back every change it made.
do $$
declare
  a uuid := '00000000-0000-4000-8000-00000000000a';
  b uuid := '00000000-0000-4000-8000-00000000000b';
  m public.matches;
  out text := '';
  n int;
begin
  insert into auth.users (id, email) values (a, 'a@selftest.invalid'), (b, 'b@selftest.invalid');
  select count(*) into n from public.profiles where id in (a, b);
  out := out || 'profiles made by trigger: ' || n || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.set_username('alice_t');
  begin
    perform public.set_username('x');
    out := out || 'FAIL short name accepted' || E'\n';
  exception when others then out := out || 'short name refused: ' || sqlerrm || E'\n';
  end;

  -- Solo: too fast is refused; a full 120 s counts.
  perform public.begin_test();
  begin
    perform public.submit_score(40);
    out := out || 'FAIL early score accepted' || E'\n';
  exception when others then out := out || 'early score refused: ' || sqlerrm || E'\n';
  end;
  perform public.begin_test();
  update public.tests set started_at = now() - interval '121 seconds' where user_id = a;
  perform public.submit_score(40);

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  begin
    perform public.set_username('ALICE_T');
    out := out || 'FAIL duplicate name accepted' || E'\n';
  exception when others then out := out || 'duplicate name refused: ' || sqlerrm || E'\n';
  end;
  perform public.set_username('bob_t');
  perform public.begin_test();
  update public.tests set started_at = now() - interval '121 seconds' where user_id = b;
  perform public.submit_score(55);
  out := out || 'board: ' || (select string_agg(username || ' ' || score, ', ' order by score desc) from public.top_scores('all', 10)) || E'\n';

  -- Match: alice searches (nobody), bob searches (paired with alice).
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  m := public.find_match();
  out := out || 'alice first search: ' || coalesce(m.id::text, 'waiting') || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  m := public.find_match();
  out := out || 'bob search paired: ' || (m.id is not null) || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  out := out || 'alice sees same match: ' || ((public.find_match()).id = m.id) || E'\n';
  begin
    perform public.submit_match(m.id, 30);
    out := out || 'FAIL score taken mid-match' || E'\n';
  exception when others then out := out || 'mid-match refused: ' || sqlerrm || E'\n';
  end;

  -- Fast-forward to the end; alice 30, bob 42.
  update public.matches set starts_at = now() - interval '121 seconds' where id = m.id;
  perform public.submit_match(m.id, 30);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  m := public.submit_match(m.id, 42);
  out := out || 'settled: ' || m.done || ', deltas alice ' || m.p1_delta || ' bob ' || m.p2_delta || E'\n';
  out := out || 'ratings: ' || (select string_agg(username || ' ' || rating || ' (' || wins || '/' || games || ')', ', ' order by username) from public.profiles where id in (a, b)) || E'\n';
  out := out || 'bob view: ' || (select them_name || ' ' || me_score || '-' || them_score || ' delta ' || me_delta from public.match_view(m.id)) || E'\n';

  raise exception E'SELFTEST (rolled back)\n%', out;
end $$;
