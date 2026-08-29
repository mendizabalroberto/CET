-- =============================================================================
-- informes_series.sql — pgTAP para 0062_informes_series.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Cubre las tres funciones del scorecard (serie diaria, tiempo por lección,
-- comparativa con la cohorte), la COHERENCIA con `informe_alumno_resumen` de
-- 0053, los permisos de las cinco funciones nuevas y el guardián.
--
-- La migración se aplica AQUÍ DENTRO, en la misma transacción que el rollback
-- final deshace. No se toca la base de producción: `db-apply` no interviene.
-- =============================================================================
begin;

select plan(34);

-- La migración bajo prueba. `\ir` es relativo al fichero que incluye, así que
-- esto sube a supabase/ y baja a migrations/.
\ir ../migrations/0062_informes_series.sql

-- El mundo compartido: colegios Alfa y Beta, clase Y6A con s1a y s2a, clase Y6B
-- con s1b sola, y la lección ffffffff-...-0001.
\ir helpers/fixture.psql


-- -----------------------------------------------------------------------------
-- Anclas temporales
-- -----------------------------------------------------------------------------
-- Todo cuelga de `now()` para no depender de qué particiones mensuales existan.
-- `stgo(-3, '10:00')` = las 10:00 hora de Santiago de hace tres días, como
-- timestamptz. `dia(-3)` = esa misma fecha LOCAL, que es la que debe salir en la
-- serie.
create or replace function pg_temp.stgo(p_dias integer, p_hora text)
returns timestamptz language sql stable as $fn$
  select ((date_trunc('day', now() at time zone 'America/Santiago')
           + (p_dias || ' days')::interval) + p_hora::interval)
         at time zone 'America/Santiago';
$fn$;

create or replace function pg_temp.dia(p_dias integer)
returns date language sql stable as $fn$
  select (date_trunc('day', now() at time zone 'America/Santiago')
          + (p_dias || ' days')::interval)::date;
$fn$;


-- -----------------------------------------------------------------------------
-- La clase Y6A necesita CINCO alumnos, que es el umbral de cohorte
-- (`c_min_cohorte` en la migración, `MIN_COHORTE` en la pantalla; los ata
-- `packages/ui/__tests__/umbral-de-cohorte.test.ts`). Con menos, la media sale
-- NULL a propósito y no habría forma de probar el camino normal.
--
-- El fixture base trae dos (S1A y S2A); aquí se añaden tres. Los dos últimos no
-- estudian NADA, y eso es deliberado: entran en la media como 0 y así se
-- comprueba que una clase con ausentes baja la media en vez de calcularla solo
-- sobre los aplicados, que haría parecer peor al alumno del informe.
-- -----------------------------------------------------------------------------
insert into auth.users (id, email)
values ('aaaaaaaa-0000-4000-8000-00000000005a', 's.S3A@alfa.students.cet.invalid');

insert into public.profiles (id, school_id, role, full_name, email, locale, status)
values ('aaaaaaaa-0000-4000-8000-00000000005a', '11111111-1111-4111-8111-111111111111',
        'student', 'Alumno S3A', null, 'es', 'active');

insert into public.students (profile_id, school_id, student_code, year_level, stage,
                             section, pin_hash, guardian_email)
values ('aaaaaaaa-0000-4000-8000-00000000005a', '11111111-1111-4111-8111-111111111111',
        'S3A', 6, 'primary', 'Y6A',
        '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$ZmFrZWhhc2hmYWtlaGFzaGZha2U',
        'tutor.s3a@example.com');

insert into public.section_members (section_id, profile_id, role_in_section, school_id)
values ('11111111-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-00000000005a',
        'student', '11111111-1111-4111-8111-111111111111');

insert into public.student_school_memberships
  (student_id, school_id, section_id, starts_on, status, approved_at)
values ('aaaaaaaa-0000-4000-8000-00000000005a',
        '11111111-1111-4111-8111-111111111111',
        '11111111-0000-4000-8000-0000000000a1',
        '2026-01-01', 'activa', now());

insert into auth.users (id, email)
values ('aaaaaaaa-0000-4000-8000-00000000006a', 's.S4A@alfa.students.cet.invalid');

insert into public.profiles (id, school_id, role, full_name, email, locale, status)
values ('aaaaaaaa-0000-4000-8000-00000000006a', '11111111-1111-4111-8111-111111111111',
        'student', 'Alumno S4A', null, 'es', 'active');

insert into public.students (profile_id, school_id, student_code, year_level, stage,
                             section, pin_hash, guardian_email)
values ('aaaaaaaa-0000-4000-8000-00000000006a', '11111111-1111-4111-8111-111111111111',
        'S4A', 6, 'primary', 'Y6A',
        '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$ZmFrZWhhc2hmYWtlaGFzaGZha2U',
        'tutor.s4a@example.com');

insert into public.section_members (section_id, profile_id, role_in_section, school_id)
values ('11111111-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-00000000006a',
        'student', '11111111-1111-4111-8111-111111111111');

insert into public.student_school_memberships
  (student_id, school_id, section_id, starts_on, status, approved_at)
values ('aaaaaaaa-0000-4000-8000-00000000006a',
        '11111111-1111-4111-8111-111111111111',
        '11111111-0000-4000-8000-0000000000a1',
        '2026-01-01', 'activa', now());

insert into auth.users (id, email)
values ('aaaaaaaa-0000-4000-8000-00000000007a', 's.S5A@alfa.students.cet.invalid');

insert into public.profiles (id, school_id, role, full_name, email, locale, status)
values ('aaaaaaaa-0000-4000-8000-00000000007a', '11111111-1111-4111-8111-111111111111',
        'student', 'Alumno S5A', null, 'es', 'active');

insert into public.students (profile_id, school_id, student_code, year_level, stage,
                             section, pin_hash, guardian_email)
values ('aaaaaaaa-0000-4000-8000-00000000007a', '11111111-1111-4111-8111-111111111111',
        'S5A', 6, 'primary', 'Y6A',
        '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$ZmFrZWhhc2hmYWtlaGFzaGZha2U',
        'tutor.s5a@example.com');

insert into public.section_members (section_id, profile_id, role_in_section, school_id)
values ('11111111-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-00000000007a',
        'student', '11111111-1111-4111-8111-111111111111');

insert into public.student_school_memberships
  (student_id, school_id, section_id, starts_on, status, approved_at)
values ('aaaaaaaa-0000-4000-8000-00000000007a',
        '11111111-1111-4111-8111-111111111111',
        '11111111-0000-4000-8000-0000000000a1',
        '2026-01-01', 'activa', now());


-- -----------------------------------------------------------------------------
-- 1 · Se retira la telemetría que trae el fixture
-- -----------------------------------------------------------------------------
-- El fixture siembra un `attempt_started` suelto para s1a y otro para s1b. Si se
-- quedan, contaminan cada suma de este fichero con una sesión de más.
--
-- El DELETE va DENTRO de un assert a propósito. Un borrado que no borra nada no
-- avisa: seguiría adelante en silencio y todas las cifras de abajo saldrían
-- desplazadas, con los asserts «ajustados» hasta pasar. Comprobar que tocó
-- exactamente 2 filas es lo que distingue «limpié» de «creí que limpiaba».
-- Va en una función y no en un CTE dentro del `is()` porque Postgres no admite
-- un CTE que modifica datos si no está en el nivel más alto de la sentencia.
create or replace function pg_temp.limpiar_telemetria()
returns integer language plpgsql as $fn$
declare n integer;
begin
  delete from public.learning_events
  where student_id in ('aaaaaaaa-0000-4000-8000-00000000003a',
                       'aaaaaaaa-0000-4000-8000-00000000004a',
                       'aaaaaaaa-0000-4000-8000-00000000005a',
                       'bbbbbbbb-0000-4000-8000-00000000003b');
  get diagnostics n = row_count;
  return n;
end $fn$;

select is(
  pg_temp.limpiar_telemetria(),
  2,
  'el fixture traia exactamente 2 eventos de telemetria y se han retirado'
);


-- -----------------------------------------------------------------------------
-- Telemetría del alumno del informe (s1a, colegio Alfa)
-- -----------------------------------------------------------------------------
-- Tres sesiones repartidas así, en hora LOCAL de Santiago:
--
--   día -5  nada
--   día -4  nada                     <- el cero interior que la gráfica necesita
--   día -3  sesión A  10:00 → 10:20, con 60 s de idle   => 19.00 min
--   día -2  sesión D  22:00 → 22:10                     => 10.00 min
--   día -1  sesión B  09:00 → 09:10                     => 10.00 min
--
-- La sesión D es la que decide si el agrupamiento por día está bien: a las 22:00
-- en Santiago ya es el día SIGUIENTE en UTC (Chile está en -04 y en -03 según la
-- época; en ambos casos cruza). Si la función agrupara en UTC, el día -2 saldría
-- a cero y el -1 con 20 minutos.
--
-- lesson_id solo viaja en los eventos de contenido; el `answer_submitted` y el
-- `idle_end` lo llevan a NULL a propósito, que es como llegan de verdad, para
-- ejercitar el arrastre de contexto de `informe_alumno_tiempo_por_leccion`.
-- La lección ...0002 no existe en `lessons`: learning_events no lleva FK hacia
-- lessons y 0010 documenta por qué.
insert into public.learning_events
  (school_id, student_id, session_id, seq, event_type, lesson_id, payload, server_ts)
values
  -- --- sesión A · día -3 ------------------------------------------------------
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0a0a0a0a-0000-4000-8000-00000000000a', 0, 'session_context', null,
   '{"viewportW":800,"viewportH":600,"dpr":1,"pointer":"fine","modality":"mouse","theme":"light","locale":"es-CL","timezone":"America/Santiago","reducedMotion":false,"connection":"4g"}'::jsonb,
   pg_temp.stgo(-3, '10:00')),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0a0a0a0a-0000-4000-8000-00000000000a', 1, 'lesson_opened',
   'ffffffff-0000-4000-8000-000000000001', '{}'::jsonb, pg_temp.stgo(-3, '10:00')),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0a0a0a0a-0000-4000-8000-00000000000a', 2, 'answer_submitted', null,
   '{"isCorrect":true}'::jsonb, pg_temp.stgo(-3, '10:05')),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0a0a0a0a-0000-4000-8000-00000000000a', 3, 'idle_end', null,
   '{"idleMs":60000}'::jsonb, pg_temp.stgo(-3, '10:20')),

  -- --- sesión D · día -2, de noche (cruza la medianoche UTC) ------------------
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0d0d0d0d-0000-4000-8000-00000000000d', 0, 'lesson_opened',
   'ffffffff-0000-4000-8000-000000000002', '{}'::jsonb, pg_temp.stgo(-2, '22:00')),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0d0d0d0d-0000-4000-8000-00000000000d', 1, 'answer_submitted', null,
   '{"isCorrect":true}'::jsonb, pg_temp.stgo(-2, '22:10')),

  -- --- sesión B · día -1 · va y vuelve entre dos lecciones --------------------
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0b0b0b0b-0000-4000-8000-00000000000b', 0, 'lesson_opened',
   'ffffffff-0000-4000-8000-000000000001', '{}'::jsonb, pg_temp.stgo(-1, '09:00')),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0b0b0b0b-0000-4000-8000-00000000000b', 1, 'answer_submitted', null,
   '{"isCorrect":true}'::jsonb, pg_temp.stgo(-1, '09:04')),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0b0b0b0b-0000-4000-8000-00000000000b', 2, 'lesson_opened',
   'ffffffff-0000-4000-8000-000000000002', '{}'::jsonb, pg_temp.stgo(-1, '09:05')),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0b0b0b0b-0000-4000-8000-00000000000b', 3, 'answer_submitted', null,
   '{"isCorrect":false}'::jsonb, pg_temp.stgo(-1, '09:08')),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0b0b0b0b-0000-4000-8000-00000000000b', 4, 'lesson_opened',
   'ffffffff-0000-4000-8000-000000000001', '{}'::jsonb, pg_temp.stgo(-1, '09:09')),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   '0b0b0b0b-0000-4000-8000-00000000000b', 5, 'lesson_completed',
   'ffffffff-0000-4000-8000-000000000001', '{}'::jsonb, pg_temp.stgo(-1, '09:10')),

  -- --- compañera s2a: una sesión de 20 min, un acierto -----------------------
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000004a',
   '0c0c0c0c-0000-4000-8000-00000000000c', 0, 'lesson_opened',
   'ffffffff-0000-4000-8000-000000000001', '{}'::jsonb, pg_temp.stgo(-2, '11:00')),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000004a',
   '0c0c0c0c-0000-4000-8000-00000000000c', 1, 'answer_submitted', null,
   '{"isCorrect":true}'::jsonb, pg_temp.stgo(-2, '11:20')),

  -- --- s1b (colegio Beta) con una zona horaria BASURA en el payload ----------
  -- El navegador escribe ese campo; `at time zone 'Nowhere/Fake'` reventaría la
  -- consulta entera. `zona_horaria_alumno` debe descartarla y caer a UTC.
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-0000-4000-8000-00000000003b',
   '0e0e0e0e-0000-4000-8000-00000000000e', 0, 'session_context', null,
   '{"timezone":"Nowhere/Fake"}'::jsonb, pg_temp.stgo(-3, '12:00'));

-- s3a no tiene ni un evento: es el compañero que no estudió, y entra en la media
-- como 0. Excluirlo la inflaría y haría parecer peor al alumno del informe.


-- =============================================================================
-- El profesor de Alfa consulta. `true` = local a la transacción, se revierte.
-- =============================================================================
select set_config('request.jwt.claims',
                  '{"sub":"aaaaaaaa-0000-4000-8000-00000000002a"}', true);


-- -----------------------------------------------------------------------------
-- Serie diaria
-- -----------------------------------------------------------------------------
select is(
  (select count(*)::integer from app.informe_alumno_serie_diaria(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00'))),
  5,
  'la serie devuelve los 5 dias de la ventana, no solo los que tienen actividad'
);

select is(
  (select string_agg(to_char(s.fecha, 'YYYY-MM-DD'), ',' order by s.fecha)
     from app.informe_alumno_serie_diaria(
       'aaaaaaaa-0000-4000-8000-00000000003a',
       pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) s),
  (select string_agg(to_char(pg_temp.dia(d), 'YYYY-MM-DD'), ',' order by d)
     from generate_series(-5, -1) d),
  'los dias son los locales de la ventana y ni sobra ni falta el borde'
);

select is(
  (select s.minutos_estudio from app.informe_alumno_serie_diaria(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) s
   where s.fecha = pg_temp.dia(-4)),
  0.00,
  'un dia sin estudiar viene como 0, no ausente'
);

select is(
  (select s.minutos_estudio from app.informe_alumno_serie_diaria(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) s
   where s.fecha = pg_temp.dia(-3)),
  19.00,
  'dia -3: 20 minutos de sesion menos 60 s de idle'
);

-- El assert que de verdad prueba la zona horaria: en UTC este dia estaria vacio.
select is(
  (select s.minutos_estudio from app.informe_alumno_serie_diaria(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) s
   where s.fecha = pg_temp.dia(-2)),
  10.00,
  'la sesion de las 22:00 en Santiago cuenta en SU dia local, no en el UTC siguiente'
);

select is(
  (select s.sesiones from app.informe_alumno_serie_diaria(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) s
   where s.fecha = pg_temp.dia(-1)),
  1,
  'una sesion en el dia -1'
);

-- COHERENCIA: la gráfica y la tarjeta de arriba no pueden decir cifras
-- distintas. Este es el assert que ata la serie a la definición de 0053.
select is(
  (select sum(s.minutos_estudio) from app.informe_alumno_serie_diaria(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) s),
  (select r.minutos_estudio from app.informe_alumno_resumen(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) r),
  'la suma de la serie diaria es exactamente el minutos_estudio del resumen'
);


-- -----------------------------------------------------------------------------
-- Tiempo por lección
-- -----------------------------------------------------------------------------
select is(
  (select count(*)::integer from app.informe_alumno_tiempo_por_leccion(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00'))),
  2,
  'dos lecciones abiertas en la ventana'
);

select is(
  (select l.minutos from app.informe_alumno_tiempo_por_leccion(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) l
   where l.leccion_id = 'ffffffff-0000-4000-8000-000000000001'),
  24.00,
  'leccion 1: 19 (sesion A, con el idle descontado) + 4 + 1 (sesion B)'
);

select is(
  (select l.visitas from app.informe_alumno_tiempo_por_leccion(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) l
   where l.leccion_id = 'ffffffff-0000-4000-8000-000000000001'),
  3,
  'leccion 1: tres visitas, porque volvio a ella despues de pasar por la otra'
);

select is(
  (select l.aperturas from app.informe_alumno_tiempo_por_leccion(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) l
   where l.leccion_id = 'ffffffff-0000-4000-8000-000000000001'),
  3,
  'leccion 1: tres eventos lesson_opened'
);

select is(
  (select l.minutos from app.informe_alumno_tiempo_por_leccion(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) l
   where l.leccion_id = 'ffffffff-0000-4000-8000-000000000002'),
  13.00,
  'leccion 2: 3 (sesion B) + 10 (sesion D nocturna)'
);

select is(
  (select l.visitas from app.informe_alumno_tiempo_por_leccion(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) l
   where l.leccion_id = 'ffffffff-0000-4000-8000-000000000002'),
  2,
  'leccion 2: dos visitas, una por sesion'
);

-- El desglose por lección NO suma el total, y eso es la especificación, no un
-- fallo: los 2 minutos de tránsito entre lección y lección no se le atribuyen a
-- ninguna. Este assert congela ese contrato para que nadie lo "arregle" en
-- silencio repartiendo huecos inventados.
select is(
  (select sum(l.minutos) from app.informe_alumno_tiempo_por_leccion(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) l),
  37.00,
  'los minutos atribuibles a lecciones (37) son menos que los de estudio (39)'
);


-- -----------------------------------------------------------------------------
-- La red que impide que el scorecard diga dos cifras para lo mismo
-- -----------------------------------------------------------------------------
-- `informe_alumno_metricas_bruto` es una segunda implementación de las nueve
-- métricas de 0053, y existe solo porque la de 0053 lleva guardián y no se puede
-- llamar por cada compañero de clase. Dos implementaciones divergen: este assert
-- las compara UNA A UNA, con el formato de texto incluido, para que la
-- divergencia se vea el día que ocurra y no seis meses después en una reunión.
select is(
  (select string_agg(m.metrica || '=' || m.valor::text, ' ' order by m.ord)
     from app.informe_alumno_metricas_bruto(
       'aaaaaaaa-0000-4000-8000-00000000003a',
       pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) m),
  (select 'minutos_estudio='       || r.minutos_estudio::text
       || ' sesiones='             || r.sesiones::text
       || ' lecciones_abiertas='   || r.lecciones_abiertas::text
       || ' lecciones_completadas='|| r.lecciones_completadas::text
       || ' items_respondidos='    || r.items_respondidos::text
       || ' porcentaje_acierto='   || r.porcentaje_acierto::text
       || ' examenes_entregados='  || r.examenes_entregados::text
       || ' pistas_pedidas='       || r.pistas_pedidas::text
       || ' racha_maxima='         || r.racha_maxima::text
     from app.informe_alumno_resumen(
       'aaaaaaaa-0000-4000-8000-00000000003a',
       pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) r),
  'metricas_bruto coincide metrica a metrica con informe_alumno_resumen'
);


-- -----------------------------------------------------------------------------
-- Cohorte
-- -----------------------------------------------------------------------------
select is(
  (select count(*)::integer from app.informe_alumno_cohorte(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00'))),
  9,
  'la comparativa cubre las 9 metricas del resumen'
);

select is(
  (select distinct c.tamano_cohorte from app.informe_alumno_cohorte(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) c),
  5,
  'la clase Y6A tiene 5 alumnos, el del informe incluido — justo el umbral'
);

select is(
  (select c.valor_alumno from app.informe_alumno_cohorte(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) c
   where c.metrica = 'minutos_estudio'),
  39.00,
  'valor del alumno: 19 + 10 + 10'
);

-- (39 + 20 + 0 + 0 + 0) / 5. Los ceros son s3a, s4a y s5a, que no estudiaron
-- nada y SI entran en la media: una media solo de los que estudiaron es la media
-- de los aplicados, y hace parecer peor al alumno del informe.
select is(
  (select c.media_cohorte from app.informe_alumno_cohorte(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) c
   where c.metrica = 'minutos_estudio'),
  11.80,
  'la media incluye a los companeros que no estudiaron, como 0'
);

select is(
  (select c.media_cohorte from app.informe_alumno_cohorte(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) c
   where c.metrica = 'sesiones'),
  0.80,
  'media de sesiones de la clase: (3 + 1 + 0 + 0 + 0) / 5'
);

select is(
  (select c.media_cohorte from app.informe_alumno_cohorte(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) c
   where c.metrica = 'porcentaje_acierto'),
  35.00,
  'media de acierto de la clase: (75 + 100 + 0 + 0 + 0) / 5'
);


-- -----------------------------------------------------------------------------
-- Zona horaria
-- -----------------------------------------------------------------------------
select is(
  app.zona_horaria_alumno('aaaaaaaa-0000-4000-8000-00000000003a',
                          pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')),
  'America/Santiago',
  'la zona sale del ultimo session_context, igual que en informe_alumno_habitos'
);


-- =============================================================================
-- El profesor de Beta consulta a SU alumna (s1b), que esta sola en su clase.
-- =============================================================================
select set_config('request.jwt.claims',
                  '{"sub":"bbbbbbbb-0000-4000-8000-00000000002b"}', true);

select is(
  app.zona_horaria_alumno('bbbbbbbb-0000-4000-8000-00000000003b',
                          pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')),
  'UTC',
  'una zona horaria inventada por el cliente se descarta y cae a UTC'
);

select is(
  (select distinct c.tamano_cohorte from app.informe_alumno_cohorte(
     'bbbbbbbb-0000-4000-8000-00000000003b',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) c),
  1,
  'el tamano de la cohorte se devuelve tambien cuando es 1'
);

-- Con 1 companero la "media" seria el propio alumno; con 2, restarla daria el
-- valor exacto del otro nino. Por eso no sale de la base.
select is(
  (select count(*)::integer from app.informe_alumno_cohorte(
     'bbbbbbbb-0000-4000-8000-00000000003b',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) c
   where c.media_cohorte is not null),
  0,
  'con la cohorte por debajo de 5 no se devuelve ninguna media'
);

select is(
  (select count(*)::integer from app.informe_alumno_cohorte(
     'bbbbbbbb-0000-4000-8000-00000000003b',
     pg_temp.stgo(-5, '0:00'), pg_temp.stgo(0, '0:00')) c
   where c.valor_alumno is not null),
  9,
  'suprimir la media no suprime los datos propios del alumno'
);


-- -----------------------------------------------------------------------------
-- El guardián. El profesor de Beta NO puede tocar al alumno de Alfa.
-- -----------------------------------------------------------------------------
select throws_ok(
  $$select app.informe_alumno_serie_diaria('aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '5 days', now())$$,
  '42501',
  'No tienes permiso para ver el informe de este alumno',
  'serie_diaria llama al guardian'
);

select throws_ok(
  $$select app.informe_alumno_tiempo_por_leccion('aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '5 days', now())$$,
  '42501',
  'No tienes permiso para ver el informe de este alumno',
  'tiempo_por_leccion llama al guardian'
);

select throws_ok(
  $$select app.informe_alumno_cohorte('aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '5 days', now())$$,
  '42501',
  'No tienes permiso para ver el informe de este alumno',
  'cohorte llama al guardian'
);


-- -----------------------------------------------------------------------------
-- Permisos. Una función sin permisos coherentes ya tumbó el login de todos los
-- alumnos una vez; aquí se comprueban explícitamente, no se dan por hechos.
-- -----------------------------------------------------------------------------
-- OJO con `proacl is null`: para una función eso NO significa "sin permisos",
-- significa el ACL POR DEFECTO, que incluye EXECUTE para PUBLIC. Solo el
-- `revoke ... from public` materializa el ACL. Comprobar únicamente las entradas
-- existentes dejaría pasar precisamente el caso peligroso.
select is(
  (select count(*)::integer
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
      and p.proname in ('informe_alumno_serie_diaria', 'informe_alumno_tiempo_por_leccion',
                        'informe_alumno_cohorte', 'informe_alumno_metricas_bruto',
                        'zona_horaria_alumno', 'ms_descontables')
      and (p.proacl is null
           or exists (select 1 from unnest(p.proacl) a where a::text like '=%'))),
  0,
  'ninguna de las 6 funciones nuevas deja EXECUTE a PUBLIC'
);

select is(
  (select count(*)::integer
     from unnest(array['informe_alumno_serie_diaria', 'informe_alumno_tiempo_por_leccion',
                       'informe_alumno_cohorte']) f
    where not has_function_privilege(
            'authenticated',
            ('app.' || f || '(uuid,timestamptz,timestamptz)')::regprocedure, 'execute')),
  0,
  'las tres funciones del scorecard son ejecutables por authenticated'
);

-- La sin guardián NO se concede a authenticated: quien la ejecutara leeria las
-- metricas de cualquier menor sin ninguna comprobacion.
select ok(
  not has_function_privilege(
        'authenticated',
        'app.informe_alumno_metricas_bruto(uuid,timestamptz,timestamptz)'::regprocedure,
        'execute'),
  'metricas_bruto, que no lleva guardian, NO es ejecutable por authenticated'
);

select is(
  (select count(*)::integer
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
      and p.proname in ('informe_alumno_serie_diaria', 'informe_alumno_tiempo_por_leccion',
                        'informe_alumno_cohorte')
      and not p.prosecdef),
  0,
  'las tres funciones del scorecard son security definer'
);

select finish();
rollback;
