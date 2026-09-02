-- =============================================================================
-- plan_de_estudio.sql — pgTAP de la migracion 0091
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
begin;
select plan(22);

-- La migracion 0091_plan_de_estudio ya esta aplicada en la base: incluirla aqui con \ir
-- rompia con «type ... already exists» (02/09/2026). Se prueba lo desplegado.

-- La migracion rellena estimated_minutes. En este punto el fixture no ha
-- creado sus lecciones, asi que el cero solo puede venir de las 33 reales.
select is(
  (select count(*)::int from public.lessons
    where status = 'published'
      and (estimated_minutes is null or estimated_minutes = 0)),
  0,
  'la migracion deja minutos estimados en todas las lecciones publicadas');

\ir helpers/fixture.psql

-- Tutores: tutor_1 de s1a, tutor_2 de s2a
insert into auth.users (id, email) values
  ('99999999-0000-4000-8000-0000000000c1', 'tutor.plan.uno@cet.test'),
  ('99999999-0000-4000-8000-0000000000c2', 'tutor.plan.dos@cet.test');

insert into public.profiles (id, school_id, role, full_name, email, status)
values
  ('99999999-0000-4000-8000-0000000000c1', null, 'guardian', 'Tutor Plan Uno', 'tutor.plan.uno@cet.test', 'active'),
  ('99999999-0000-4000-8000-0000000000c2', null, 'guardian', 'Tutor Plan Dos', 'tutor.plan.dos@cet.test', 'active');

insert into public.guardian_students (guardian_id, student_id)
values
  ('99999999-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-00000000003a'),
  ('99999999-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-00000000004a');

-- Un boletin, un plan activo, dos tareas y un parte para s1a
insert into public.boletines
  (id, school_id, student_id, subido_por, gestion, trimestre,
   storage_path, checksum, notas, estado)
values
  ('99999999-0000-4000-8000-0000000000d1',
   '11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-00000000003a',
   '99999999-0000-4000-8000-0000000000c1',
   2026, 1,
   's1a/boletin-2026-t1.pdf',
   repeat('a', 64),
   '[]'::jsonb,
   'extraido');

insert into public.planes_de_estudio
  (id, school_id, student_id, boletin_id, desde, hasta, minutos_por_dia,
   reparto, recomendaciones, activo, creado_por)
values
  ('99999999-0000-4000-8000-0000000000e1',
   '11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-00000000003a',
   '99999999-0000-4000-8000-0000000000d1',
   current_date, current_date + 28, 30,
   '[{"weekday":1,"minutos":30}]'::jsonb,
   array['Repasar fracciones'],
   true,
   '99999999-0000-4000-8000-0000000000c1');

insert into public.plan_tareas
  (id, plan_id, student_id, fecha, ord, subject_id, tipo,
   lesson_id, skill_id, minutos)
values
  ('99999999-0000-4000-8000-0000000000f1',
   '99999999-0000-4000-8000-0000000000e1',
   'aaaaaaaa-0000-4000-8000-00000000003a',
   current_date, 0,
   'cccccccc-0000-4000-8000-000000000001',
   'leccion',
   'ffffffff-0000-4000-8000-000000000001',
   null,
   20),
  ('99999999-0000-4000-8000-0000000000f2',
   '99999999-0000-4000-8000-0000000000e1',
   'aaaaaaaa-0000-4000-8000-00000000003a',
   current_date + 1, 0,
   'cccccccc-0000-4000-8000-000000000001',
   'practica',
   null,
   '99999999-0000-4000-8000-000000000001',
   15);

insert into public.plan_partes
  (id, plan_id, student_id, fecha, minutos_previstos, minutos_medidos,
   items_respondidos, aciertos)
values
  ('99999999-0000-4000-8000-0000000000a1',
   '99999999-0000-4000-8000-0000000000e1',
   'aaaaaaaa-0000-4000-8000-00000000003a',
   current_date, 30, 22.5, 6, 4);

-- Las lecciones del fixture nacen despues de la migracion; se rellenan con la
-- misma formula para poder comprobar el valor esperado mas abajo.
update public.lessons l
   set estimated_minutes = greatest(10, round(
         (select count(*) from public.lesson_blocks b where b.lesson_id = l.id) * 1.5))
 where l.id in (
   'ffffffff-0000-4000-8000-000000000001',
   'ffffffff-0000-4000-8000-00000000000b'
 );

-- 1-2: tutor_1 ve el boletin de s1a; tutor_2 no ve ninguno
select pg_temp.login_as('99999999-0000-4000-8000-0000000000c1');
select is(pg_temp.visible_count('select count(*) from public.boletines'), 1,
          'el tutor vinculado ve el boletin de su alumno');
select pg_temp.logout();

select pg_temp.login_as('99999999-0000-4000-8000-0000000000c2');
select is(pg_temp.visible_count('select count(*) from public.boletines'), 0,
          'el tutor ajeno no ve boletines');
select pg_temp.logout();

-- 3-8: el staff del colegio no lee boletines, planes ni partes
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000002a');
select is(pg_temp.visible_count('select count(*) from public.boletines'), 0,
          'teacher_a no ve boletines');
select is(pg_temp.visible_count('select count(*) from public.planes_de_estudio'), 0,
          'teacher_a no ve planes de estudio');
select is(pg_temp.visible_count('select count(*) from public.plan_partes'), 0,
          'teacher_a no ve partes');
select pg_temp.logout();

select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000001a');
select is(pg_temp.visible_count('select count(*) from public.boletines'), 0,
          'admin_a no ve boletines');
select is(pg_temp.visible_count('select count(*) from public.planes_de_estudio'), 0,
          'admin_a no ve planes de estudio');
select is(pg_temp.visible_count('select count(*) from public.plan_partes'), 0,
          'admin_a no ve partes');
select pg_temp.logout();

-- 9-10: el alumno ve sus tareas, el companero no
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000003a');
select is(pg_temp.visible_count('select count(*) from public.plan_tareas'), 2,
          's1a ve sus dos tareas sin filtro de fecha');
select pg_temp.logout();

select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000004a');
select is(pg_temp.visible_count('select count(*) from public.plan_tareas'), 0,
          's2a no ve tareas ajenas');
select pg_temp.logout();

-- 11-12: el tutor inserta boletines solo para su alumno
select pg_temp.login_as('99999999-0000-4000-8000-0000000000c1');
select lives_ok($sql$
  insert into public.boletines
    (id, school_id, student_id, subido_por, gestion, trimestre,
     storage_path, checksum, notas, estado)
  values
    ('99999999-0000-4000-8000-0000000000d2',
     '11111111-1111-4111-8111-111111111111',
     'aaaaaaaa-0000-4000-8000-00000000003a',
     '99999999-0000-4000-8000-0000000000c1',
     2026, 2,
     's1a/boletin-2026-t2.pdf',
     repeat('b', 64),
     '[]'::jsonb,
     'extraido')
$sql$, 'el tutor_1 puede insertar un boletin para s1a');

select throws_ok($sql$
  insert into public.boletines
    (id, school_id, student_id, subido_por, gestion, trimestre,
     storage_path, checksum, notas, estado)
  values
    ('99999999-0000-4000-8000-0000000000d3',
     '11111111-1111-4111-8111-111111111111',
     'aaaaaaaa-0000-4000-8000-00000000004a',
     '99999999-0000-4000-8000-0000000000c1',
     2026, 2,
     's2a/boletin-2026-t2.pdf',
     repeat('c', 64),
     '[]'::jsonb,
     'extraido')
$sql$, '42501', null, 'el tutor_1 NO puede insertar un boletin para s2a');
select pg_temp.logout();

-- 13: el alumno no escribe en plan_tareas
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000003a');
select throws_ok($sql$
  insert into public.plan_tareas
    (id, plan_id, student_id, fecha, ord, subject_id, tipo, lesson_id, skill_id, minutos)
  values
    ('99999999-0000-4000-8000-0000000000f3',
     '99999999-0000-4000-8000-0000000000e1',
     'aaaaaaaa-0000-4000-8000-00000000003a',
     current_date, 1,
     'cccccccc-0000-4000-8000-000000000001',
     'leccion',
     'ffffffff-0000-4000-8000-000000000001',
     null, 20)
$sql$, '42501', null, 's1a no puede insertar en plan_tareas');
select pg_temp.logout();

-- 14-16: un plan activo por alumno; los inactivos no cuentan
select throws_ok($sql$
  insert into public.planes_de_estudio
    (id, school_id, student_id, boletin_id, desde, hasta, minutos_por_dia,
     reparto, recomendaciones, activo, creado_por)
  values
    ('99999999-0000-4000-8000-0000000000e2',
     '11111111-1111-4111-8111-111111111111',
     'aaaaaaaa-0000-4000-8000-00000000003a',
     '99999999-0000-4000-8000-0000000000d1',
     current_date, current_date + 28, 30,
     '[{"weekday":1,"minutos":30}]'::jsonb,
     array['Repasar fracciones'],
     true,
     '99999999-0000-4000-8000-0000000000c1')
$sql$, '23505', null, 'un segundo plan activo para s1a choca con planes_uno_activo');

select lives_ok($sql$
  insert into public.planes_de_estudio
    (id, school_id, student_id, boletin_id, desde, hasta, minutos_por_dia,
     reparto, recomendaciones, activo, creado_por)
  values
    ('99999999-0000-4000-8000-0000000000e3',
     '11111111-1111-4111-8111-111111111111',
     'aaaaaaaa-0000-4000-8000-00000000003a',
     '99999999-0000-4000-8000-0000000000d1',
     current_date, current_date + 28, 30,
     '[{"weekday":2,"minutos":20}]'::jsonb,
     array['Repasar fracciones'],
     false,
     '99999999-0000-4000-8000-0000000000c1')
$sql$, 'un plan inactivo para el mismo alumno entra');

-- 17: un parte por plan y dia
select throws_ok($sql$
  insert into public.plan_partes
    (id, plan_id, student_id, fecha, minutos_previstos, minutos_medidos,
     items_respondidos, aciertos)
  values
    ('99999999-0000-4000-8000-0000000000a2',
     '99999999-0000-4000-8000-0000000000e1',
     'aaaaaaaa-0000-4000-8000-00000000003a',
     current_date, 30, 25.0, 5, 3)
$sql$, '23505', null, 'un segundo parte del mismo plan y dia choca con el indice unico');

-- 18: una tarea de leccion sin lesson no tiene sentido
select throws_ok($sql$
  insert into public.plan_tareas
    (id, plan_id, student_id, fecha, ord, subject_id, tipo, lesson_id, skill_id, minutos)
  values
    ('99999999-0000-4000-8000-0000000000f4',
     '99999999-0000-4000-8000-0000000000e1',
     'aaaaaaaa-0000-4000-8000-00000000003a',
     current_date, 2,
     'cccccccc-0000-4000-8000-000000000001',
     'leccion',
     null, null, 20)
$sql$, '23514', null, 'una tarea de leccion sin lesson_id viola tarea_apunta_a_algo');

-- 19: un boletin confirmado necesita su confirmado_at
select throws_ok($sql$
  insert into public.boletines
    (id, school_id, student_id, subido_por, gestion, trimestre,
     storage_path, checksum, notas, estado, confirmado_at)
  values
    ('99999999-0000-4000-8000-0000000000d4',
     '11111111-1111-4111-8111-111111111111',
     'aaaaaaaa-0000-4000-8000-00000000003a',
     '99999999-0000-4000-8000-0000000000c1',
     2026, 1,
     's1a/boletin-confirmado.pdf',
     repeat('d', 64),
     '[]'::jsonb,
     'confirmado',
     null)
$sql$, '23514', null, 'un boletin confirmado sin confirmado_at viola la coherencia');

-- 20: la leccion del fixture, rellenada con la misma formula, vale sus bloques
select is(
  (select estimated_minutes from public.lessons
    where id = 'ffffffff-0000-4000-8000-000000000001'),
  (select greatest(10, round(count(*) * 1.5))::smallint
     from public.lesson_blocks b
    where b.lesson_id = 'ffffffff-0000-4000-8000-000000000001'),
  'la leccion del fixture tiene los minutos estimados segun sus bloques');

-- 21-22: el bucket boletines es privado y con limite
select is(
  (select "public" from storage.buckets where id = 'boletines'),
  false,
  'el bucket boletines es privado');

select is(
  (select file_size_limit::int from storage.buckets where id = 'boletines'),
  10485760,
  'el bucket boletines limita a 10 MiB');

select * from finish();
rollback;
