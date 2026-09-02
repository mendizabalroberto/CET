-- calendario_escolar.sql — pgTAP del calendario escolar
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
begin;
select plan(9);

\ir ../migrations/0092_calendario_escolar.sql
\ir ../seed/calendario_2026.sql

-- 1 · Hay exactamente 11 filas globales de 2026.
select is(count(*), 11::bigint,
          'hay 11 eventos globales de 2026')
  from public.calendario_eventos
 where school_id is null and gestion = 2026;

-- 2 · El 2026-09-24 es feriado y el 2026-11-02 también.
--    (Filtramos por tipo: el tramo de Movers también contiene el 2026-11-02.)
select ok(exists(
    select 1 from public.calendario_eventos
     where gestion = 2026 and tipo = 'feriado'
       and desde <= '2026-09-24' and hasta >= '2026-09-24'),
          'el 2026-09-24 es feriado');
select ok(exists(
    select 1 from public.calendario_eventos
     where gestion = 2026 and tipo = 'feriado'
       and desde <= '2026-11-02' and hasta >= '2026-11-02'),
          'el 2026-11-02 es feriado');

-- 3 · Existe un tramo de examenes finales que contiene el 2026-11-15.
select ok(exists(
    select 1 from public.calendario_eventos
     where gestion = 2026 and tipo = 'examenes_finales'
       and desde <= '2026-11-15' and hasta >= '2026-11-15'),
          'el 2026-11-15 cae dentro de los examenes finales');

-- 4 · Ningun hito Cambridge de 2026 aplica a Y6.
select is(count(*), 0::bigint,
          'ningun hito Cambridge de 2026 es de Y6')
  from public.calendario_eventos
 where gestion = 2026 and tipo = 'hito_cambridge'
   and 6 = any(year_levels);

-- 5 · Idempotencia: repetir un insert del seed no duplica filas.
--    (No incluimos el seed dos veces: db-test.mjs lo rechazaria como circular.)
insert into public.calendario_eventos
  (school_id, gestion, desde, hasta, tipo, titulo, year_levels)
values
  (null, 2026, '2026-09-24', '2026-09-24', 'feriado',
   'Aniversario de Santa Cruz', null)
on conflict do nothing;

select is(count(*), 11::bigint,
          'repetir el seed no duplica filas')
  from public.calendario_eventos
 where school_id is null and gestion = 2026;

-- 6 · Un evento con hasta < desde viola la constraint de rango.
select throws_ok(
  $$insert into public.calendario_eventos
      (school_id, gestion, desde, hasta, tipo, titulo, year_levels)
    values (null, 2026, '2026-11-20', '2026-11-13', 'feriado',
            'Rango invertido', null)$$,
  '23514',
  null,
  'un evento con hasta < desde falla');

-- 7 · Un tutor autenticado ve las 11 filas globales.
insert into auth.users (id, email) values
  ('99999999-9999-9999-9999-999999999999', 'tutor.calendario@cet.test');

insert into public.profiles (id, school_id, role, full_name, email, status)
values ('99999999-9999-9999-9999-999999999999', null, 'guardian',
        'Tutor Calendario', 'tutor.calendario@cet.test', 'active');

set local role authenticated;
set local request.jwt.claims to '{"sub":"99999999-9999-9999-9999-999999999999"}';

select is(count(*), 11::bigint,
          'un tutor autenticado ve las 11 filas globales')
  from public.calendario_eventos
 where gestion = 2026;

reset role;

-- 8 · Un anon no ve nada: la politica no le deja ni leer.
set local role anon;
select throws_ok(
  $$select count(*) from public.calendario_eventos$$,
  '42501',
  null,
  'anon no tiene permiso de lectura');
reset role;

select * from finish();
rollback;

