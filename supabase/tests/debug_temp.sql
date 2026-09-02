begin;
select plan(6);
\ir helpers/fixture.psql

select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000002a');

select is((select auth.uid()::text), 'aaaaaaaa-0000-4000-8000-00000000002a', 'auth.uid es teacher_a');
select is((select app.current_school_id()::text), '11111111-1111-4111-8111-111111111111', 'current_school_id es Alfa');
select is((select app.is_staff()::text), 'true', 'is_staff es true');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-4000-8000-00000000002a'$$),
  1, 'teacher_a se ve a si mismo');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.profiles where school_id = '11111111-1111-4111-8111-111111111111'$$),
  4, 'teacher_a ve 4 perfiles de Alfa');

select is(pg_temp.visible_count(
  $$select count(*)::int from public.profiles$$),
  5, 'teacher_a ve 5 perfiles en total (4 alfa + el mismo, sin duplicar)');

select pg_temp.logout();
select * from finish();
rollback;
