-- =============================================================================
-- tiempo_de_estudio.sql — pgTAP para 0064_tiempo_de_estudio.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Demuestra que un hueco largo sin idle_end no infla el tiempo de estudio,
-- que una sesión continua no pierde minutos, y que las dos implementaciones
-- del scorecard siguen devolviendo lo mismo.
-- =============================================================================
begin;

select plan(9);

-- La migración bajo prueba.
\ir ../migrations/0064_tiempo_de_estudio.sql

-- El mundo compartido: colegios Alfa y Beta, profesores y alumnos.
\ir helpers/fixture.psql


-- -----------------------------------------------------------------------------
-- Limpieza de telemetría que trae el fixture
-- -----------------------------------------------------------------------------
create or replace function pg_temp.limpiar_telemetria()
returns integer language plpgsql as $fn$
declare n integer;
begin
  delete from public.learning_events
  where student_id in ('aaaaaaaa-0000-4000-8000-00000000003a',
                       'aaaaaaaa-0000-4000-8000-00000000004a',
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
-- Dos sesiones:
--   · Sesión continua: 4 eventos en 15 minutos, sin idle_end. Debe medir 15 min.
--   · Sesión con hueco: 4 eventos en 2 horas, sin idle_end. El último gap es
--     de 117 minutos; con el umbral de 10 minutos solo quedan 10, así que el
--     tiempo debe ser 120 - 107 = 13 min.
-- Total: 28 minutos.
--
-- El trigger de 0064 añade _gapMs al payload en cada insert.
insert into public.learning_events
  (school_id, student_id, session_id, seq, event_type, lesson_id, payload, server_ts)
values
  -- sesión continua ----------------------------------------------------------
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   'f0f0f0f0-0000-4000-8000-000000000000', 0, 'session_context', null,
   '{"timezone":"Europe/Madrid"}'::jsonb, now() - interval '5 hours'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   'f0f0f0f0-0000-4000-8000-000000000000', 1, 'lesson_opened',
   'ffffffff-0000-4000-8000-000000000001', '{}'::jsonb, now() - interval '4 hours 55 minutes'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   'f0f0f0f0-0000-4000-8000-000000000000', 2, 'answer_submitted', null,
   '{"isCorrect":true}'::jsonb, now() - interval '4 hours 50 minutes'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   'f0f0f0f0-0000-4000-8000-000000000000', 3, 'lesson_completed',
   'ffffffff-0000-4000-8000-000000000001', '{}'::jsonb, now() - interval '4 hours 45 minutes'),

  -- sesión con hueco largo ---------------------------------------------------
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   'f1f1f1f1-0000-4000-8000-000000000001', 0, 'session_context', null,
   '{"timezone":"Europe/Madrid"}'::jsonb, now() - interval '3 hours'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   'f1f1f1f1-0000-4000-8000-000000000001', 1, 'lesson_opened',
   'ffffffff-0000-4000-8000-000000000001', '{}'::jsonb, now() - interval '2 hours 58 minutes'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   'f1f1f1f1-0000-4000-8000-000000000001', 2, 'answer_submitted', null,
   '{"isCorrect":false}'::jsonb, now() - interval '2 hours 57 minutes'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000003a',
   'f1f1f1f1-0000-4000-8000-000000000001', 3, 'answer_submitted', null,
   '{"isCorrect":true}'::jsonb, now() - interval '1 hour');


-- -----------------------------------------------------------------------------
-- El profesor de Alfa consulta.
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
                  '{"sub":"aaaaaaaa-0000-4000-8000-00000000002a"}', true);


-- -----------------------------------------------------------------------------
-- 1 · Caso que motivó el encargo: hueco largo sin idle_end
-- -----------------------------------------------------------------------------
select is(
  (select r.minutos_estudio from app.informe_alumno_resumen(
     'aaaaaaaa-0000-4000-8000-00000000003a',
     now() - interval '6 hours', now()) r),
  28.00,
  'una sesión con un hueco de casi 2 horas no mide el span entero (15 + 13 = 28 min)'
);


-- -----------------------------------------------------------------------------
-- 2 · Caso contrario: sesión continua sin idle_end no pierde minutos
-- -----------------------------------------------------------------------------
select is(
  (select count(*)::integer from (
     select session_id,
            round(greatest(
              extract(epoch from (max(server_ts) - min(server_ts)))
              - coalesce(sum(app.ms_descontables(event_type::text, payload)), 0) / 1000.0,
              0) / 60.0, 2) as minutos
     from public.learning_events
     where student_id = 'aaaaaaaa-0000-4000-8000-00000000003a'
       and session_id = 'f0f0f0f0-0000-4000-8000-000000000000'
     group by session_id
   ) s where s.minutos = 15.00),
  1,
  'la sesión continua de 15 min mide exactamente 15 min, sin descuentos fantasmas'
);


-- -----------------------------------------------------------------------------
-- 3 · Coherencia: las dos implementaciones devuelven lo mismo
-- -----------------------------------------------------------------------------
select is(
  (select string_agg(m.metrica || '=' || m.valor::text, ' ' order by m.ord)
     from app.informe_alumno_metricas_bruto(
       'aaaaaaaa-0000-4000-8000-00000000003a',
       now() - interval '6 hours', now()) m),
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
       now() - interval '6 hours', now()) r),
  'metricas_bruto coincide metrica a metrica con informe_alumno_resumen tras el arreglo'
);


-- -----------------------------------------------------------------------------
-- 4 · El umbral está fijado a mano: 10 minutos (600000 ms)
-- -----------------------------------------------------------------------------
-- El valor 600000 vive en la migración; aquí se comprueba el comportamiento
-- esperado para que cambiarlo sea una decisión consciente.
select is(
  app.ms_descontables('answer_submitted', '{"_gapMs":3600000}'::jsonb),
  3000000.0,
  'un hueco de 60 min descuenta 50 min: el umbral fijado a mano es 10 min'
);

select is(
  app.ms_descontables('answer_submitted', '{"_gapMs":600000}'::jsonb),
  0.0,
  'un hueco de exactamente 10 min no descuenta'
);

select is(
  app.ms_descontables('answer_submitted', '{"_gapMs":601000}'::jsonb),
  1000.0,
  'un hueco de 10 min y 1 s descuenta solo 1 s'
);

select is(
  app.ms_descontables('idle_end', '{"idleMs":60000,"_gapMs":3600000}'::jsonb),
  60000.0,
  'un idle_end declarado sigue usando idleMs, sin tocar el hueco'
);


-- -----------------------------------------------------------------------------
-- 5 · Aislamiento entre colegios
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
                  '{"sub":"bbbbbbbb-0000-4000-8000-00000000002b"}', true);

select throws_ok(
  $$select app.informe_alumno_resumen('aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '6 hours', now())$$,
  '42501',
  'No tienes permiso para ver el informe de este alumno',
  'el profesor de Beta no puede ver el informe de un alumno de Alfa'
);


select finish();
rollback;
