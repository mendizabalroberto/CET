-- =============================================================================
-- 0084_navegar_no_es_estudiar.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- 0083 HIZO QUE EL INFORME MIDIERA, Y ASI SE VIO DE DONDE VENIA EL RESTO
--
-- Tras 0083 la cifra bajo de 91,19 a 78,57 min sobre la misma tarde. Partiendo
-- esas 39 sesiones por lo que de verdad contienen:
--
--     A · con cronometro                        11 sesiones    7,7 min
--     B · sin cronometro PERO con aprendizaje    1 sesion     36,2 min
--     C · solo navegacion                       27 sesiones   34,8 min
--
-- El grupo C son VEINTISIETE sesiones en las que el nino no abrio ni una
-- leccion ni una practica: entro al indice, miro materias, se fue. El
-- estimador de huecos les atribuia 34,8 minutos de «estudio».
--
-- LA REGLA: ESTUDIAR ES ESTAR EN UNA PANTALLA DE APRENDIZAJE
--
-- Pasear por el catalogo no es estudiar. Es uso de la aplicacion, y si algun dia
-- interesa medirlo sera otra metrica con otro nombre; meterlo en «minutos de
-- estudio» es decirle a un tutor que su hijo estudio media hora cuando estuvo
-- eligiendo. Una sesion sin ningun evento de aprendizaje pasa a valer CERO.
--
-- POR QUE EL GRUPO B SIGUE ESTIMANDO
--
-- Son sesiones con aprendizaje de verdad y sin medicion: las anteriores al
-- 01/09/2026, cuando el cronometro no existia. Ponerlas a cero seria borrar
-- meses de historia que si ocurrio. Se les sigue aplicando el estimador de
-- 0064, que para eso se escribio.
--
-- Y el grupo B SE VACIA SOLO. Desde 0080 toda pantalla de aprendizaje lleva
-- cronometro, asi que una sesion nueva con aprendizaje trae medicion por
-- definicion. B es historia, no un caso que vaya a repetirse: la regla se cura
-- sola segun pasan los dias.
--
-- Resultado sobre la misma tarde: 78,57 -> 43,9 min. No baja a 7,7 porque esa
-- unica sesion del grupo B es real y se midio como se podia entonces.
--
-- LO QUE ESTO NO ROMPE, Y POR QUE
--
-- `informes_series.sql` y `tiempo_de_estudio.sql` siembran sesiones con eventos
-- de leccion y sin `tiempo_en_pantalla` -se escribieron antes de 0080-, o sea
-- que son grupo B y siguen estimando exactamente igual. Si la regla fuera «sin
-- medicion, cero» esos fixtures caerian, y con razon: estarian avisando de que
-- se estaba borrando historia.
--
-- LA LISTA DE QUE ES APRENDIZAJE VIVE EN UN SOLO SITIO
--
-- `app.es_evento_de_aprendizaje`. Repetirla en las tres funciones de informe
-- seria tres listas que divergen en cuanto alguien anada un tipo de evento.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- app.es_evento_de_aprendizaje — la frontera entre estudiar y navegar
-- -----------------------------------------------------------------------------
-- Deliberadamente NO estan aqui: `session_context`, `ui_interaction`,
-- `nav_route_changed`, `focus_*`, `idle_*`, `login_success` y `pin_changed`.
-- Todos ocurren mientras el nino usa la aplicacion y ninguno prueba que este
-- aprendiendo; `focus_*` e `idle_*` ademas suelen aparecer JUNTO a los de
-- aprendizaje, asi que no cambian nada donde importa y solo darian falsos
-- positivos en una sesion de puro paseo.
create or replace function app.es_evento_de_aprendizaje(p_tipo text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_tipo in (
    'lesson_opened', 'lesson_block_viewed', 'lesson_completed',
    'question_shown', 'question_skipped', 'question_revisited',
    'answer_changed', 'answer_submitted', 'answer_cleared',
    'hint_requested', 'solution_viewed',
    'practice_started', 'practice_item_answered', 'practice_streak',
    'attempt_started', 'attempt_resumed', 'attempt_submitted', 'attempt_autosaved',
    'video_started', 'video_progress', 'video_completed',
    'game_started', 'game_completed'
  );
$$;

comment on function app.es_evento_de_aprendizaje(text) is
  'Si un tipo de evento prueba que el alumno estaba APRENDIENDO y no solo navegando. Unica lista del sistema: repetirla es como diverge. Ver 0084.';

revoke all on function app.es_evento_de_aprendizaje(text) from public;
grant execute on function app.es_evento_de_aprendizaje(text) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- app.minutos_de_sesion — tres caminos, y solo uno estima
-- -----------------------------------------------------------------------------
-- Se DEJA CAER la version de tres argumentos de 0083 en vez de sobrecargarla:
-- dos firmas conviviendo es que la mitad de los llamantes se queden en la vieja
-- sin que nada avise, y el `drop` obliga a que este fichero las actualice todas.
drop function if exists app.minutos_de_sesion(timestamptz[], numeric, jsonb[]);

create or replace function app.minutos_de_sesion(
  p_marcas          timestamptz[],
  p_ms_declarados   numeric,
  p_payloads_tiempo jsonb[],
  p_tipos           text[]
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  with medido as (select app.ms_medidos(p_payloads_tiempo) as ms),
       aprendio as (
         select bool_or(app.es_evento_de_aprendizaje(t.tipo)) as si
         from pg_catalog.unnest(coalesce(p_tipos, '{}'::text[])) as t(tipo)
       )
  select case
           -- 1 · Medido: la verdad, y desde 0080 el caso normal.
           when m.ms > 0 then m.ms / 60000.0
           -- 2 · Ni medicion ni aprendizaje: navego. Cero.
           when not coalesce(a.si, false) then 0
           -- 3 · Aprendizaje sin medicion: historia anterior al cronometro.
           else app.minutos_de_estudio(p_marcas, p_ms_declarados)
         end
  from medido m, aprendio a;
$$;

comment on function app.minutos_de_sesion(timestamptz[], numeric, jsonb[], text[]) is
  'Minutos de ESTUDIO de una sesion. Mide si puede (tiempo_en_pantalla, 0080); da cero si el alumno solo navego; y solo estima por huecos (0064) cuando hubo aprendizaje sin medicion, que es historia anterior al cronometro. Ver 0084.';

revoke all on function app.minutos_de_sesion(timestamptz[], numeric, jsonb[], text[]) from public;
grant execute on function app.minutos_de_sesion(timestamptz[], numeric, jsonb[], text[])
  to authenticated, service_role;


-- =============================================================================
-- Los tres llamantes, actualizados a la firma nueva
-- =============================================================================
-- Solo cambia el argumento que se anade: `array_agg` de los tipos de la sesion.
-- Todo lo demas es identico a 0083.

create or replace function app.informe_alumno_resumen(
  p_student_id uuid,
  p_desde      timestamptz,
  p_hasta      timestamptz
)
returns table (
  minutos_estudio       numeric,
  sesiones              integer,
  lecciones_abiertas    integer,
  lecciones_completadas integer,
  items_respondidos     integer,
  porcentaje_acierto    numeric,
  examenes_entregados   integer,
  pistas_pedidas        integer,
  racha_maxima          integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.puede_ver_informe(p_student_id);

  return query
  select
    coalesce(round(sum(x.min_estudio), 2), 0)::numeric,
    (select count(distinct le.session_id)::integer
       from public.learning_events le
      where le.student_id = p_student_id
        and le.server_ts >= p_desde and le.server_ts < p_hasta)::integer,
    (select count(*)::integer
       from public.learning_events le
      where le.student_id = p_student_id
        and le.event_type::text = 'lesson_opened'
        and le.server_ts >= p_desde and le.server_ts < p_hasta)::integer,
    (select count(*)::integer
       from public.learning_events le
      where le.student_id = p_student_id
        and le.event_type::text = 'lesson_completed'
        and le.server_ts >= p_desde and le.server_ts < p_hasta)::integer,
    (select count(*)::integer
       from public.learning_events le
      where le.student_id = p_student_id
        and le.event_type::text = 'answer_submitted'
        and le.server_ts >= p_desde and le.server_ts < p_hasta)::integer,
    (select case
              when count(*) filter (where le.event_type::text = 'answer_submitted') = 0 then 0
              else round(
                     100.0
                     * count(*) filter (where le.event_type::text = 'answer_submitted'
                                          and le.payload ->> 'isCorrect' = 'true')
                     / count(*) filter (where le.event_type::text = 'answer_submitted'),
                     1)
            end
       from public.learning_events le
      where le.student_id = p_student_id
        and le.server_ts >= p_desde and le.server_ts < p_hasta)::numeric,
    (select count(*)::integer
       from public.learning_events le
      where le.student_id = p_student_id
        and le.event_type::text = 'attempt_submitted'
        and le.server_ts >= p_desde and le.server_ts < p_hasta)::integer,
    (select count(*)::integer
       from public.learning_events le
      where le.student_id = p_student_id
        and le.event_type::text = 'hint_requested'
        and le.server_ts >= p_desde and le.server_ts < p_hasta)::integer,
    (select coalesce(max((le.payload ->> 'streak')::integer), 0)::integer
       from public.learning_events le
      where le.student_id = p_student_id
        and le.event_type::text = 'practice_streak'
        and le.server_ts >= p_desde and le.server_ts < p_hasta)::integer
  from (
    select app.minutos_de_sesion(
             array_agg(le.server_ts),
             sum(app.ms_descontables(le.event_type::text, le.payload)),
             coalesce(
               array_agg(le.payload) filter (
                 where le.event_type::text = 'tiempo_en_pantalla'),
               '{}'::jsonb[]),
             array_agg(le.event_type::text)
           ) as min_estudio
    from public.learning_events le
    where le.student_id = p_student_id
      and le.server_ts >= p_desde and le.server_ts < p_hasta
    group by le.session_id
  ) x;
end;
$$;


create or replace function app.informe_alumno_metricas_bruto(
  p_student_id uuid,
  p_desde      timestamptz,
  p_hasta      timestamptz
)
returns table (ord integer, metrica text, valor numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with ev as (
    select le.session_id, le.server_ts, le.event_type, le.payload
    from public.learning_events le
    where le.student_id = p_student_id
      and le.server_ts >= p_desde
      and le.server_ts < p_hasta
  ),
  sesiones as (
    select app.minutos_de_sesion(
             array_agg(ev.server_ts),
             sum(app.ms_descontables(ev.event_type::text, ev.payload)),
             coalesce(
               array_agg(ev.payload) filter (
                 where ev.event_type::text = 'tiempo_en_pantalla'),
               '{}'::jsonb[]),
             array_agg(ev.event_type::text)
           ) as min_estudio
    from ev
    group by ev.session_id
  ),
  resp as (
    select count(*) as n,
           count(*) filter (where ev.payload ->> 'isCorrect' = 'true') as aciertos
    from ev
    where ev.event_type::text = 'answer_submitted'
  )
  select 1::integer, 'minutos_estudio'::text,
         coalesce(round((select sum(s.min_estudio) from sesiones s), 2), 0)::numeric
  union all
  select 2, 'sesiones',
         (select count(distinct ev.session_id) from ev)::numeric
  union all
  select 3, 'lecciones_abiertas',
         (select count(*) from ev where ev.event_type::text = 'lesson_opened')::numeric
  union all
  select 4, 'lecciones_completadas',
         (select count(*) from ev where ev.event_type::text = 'lesson_completed')::numeric
  union all
  select 5, 'items_respondidos',
         (select r.n from resp r)::numeric
  union all
  select 6, 'porcentaje_acierto',
         (select case when r.n = 0 then 0
                      else round(100.0 * r.aciertos / r.n, 1) end
            from resp r)::numeric
  union all
  select 7, 'examenes_entregados',
         (select count(*) from ev where ev.event_type::text = 'attempt_submitted')::numeric
  union all
  select 8, 'pistas_pedidas',
         (select count(*) from ev where ev.event_type::text = 'hint_requested')::numeric
  union all
  select 9, 'racha_maxima',
         (select coalesce(max((ev.payload ->> 'streak')::integer), 0)
            from ev where ev.event_type::text = 'practice_streak')::numeric;
$$;


create or replace function app.informe_alumno_serie_diaria(
  p_student_id uuid,
  p_desde      timestamptz,
  p_hasta      timestamptz
)
returns table (fecha date, minutos_estudio numeric, sesiones integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
begin
  perform app.puede_ver_informe(p_student_id);

  v_tz := app.zona_horaria_alumno(p_student_id, p_desde, p_hasta);

  return query
  with ev as (
    select le.session_id,
           le.server_ts,
           le.event_type,
           le.payload,
           (le.server_ts at time zone v_tz)::date as d_local
    from public.learning_events le
    where le.student_id = p_student_id
      and le.server_ts >= p_desde
      and le.server_ts < p_hasta
  ),
  tramos as (
    select ev.d_local,
           app.minutos_de_sesion(
             array_agg(ev.server_ts),
             sum(app.ms_descontables(ev.event_type::text, ev.payload)),
             coalesce(
               array_agg(ev.payload) filter (
                 where ev.event_type::text = 'tiempo_en_pantalla'),
               '{}'::jsonb[]),
             array_agg(ev.event_type::text)
           ) as min_estudio
    from ev
    group by ev.d_local, ev.session_id
  ),
  por_dia as (
    select t.d_local,
           round(sum(t.min_estudio), 2) as minutos,
           count(*)::integer as n_sesiones
    from tramos t
    group by t.d_local
  ),
  calendario as (
    select g::date as d_local
    from pg_catalog.generate_series(
           (p_desde at time zone v_tz)::date,
           ((p_hasta - interval '1 microsecond') at time zone v_tz)::date,
           interval '1 day') g
  )
  select c.d_local,
         coalesce(p.minutos, 0)::numeric,
         coalesce(p.n_sesiones, 0)::integer
  from calendario c
  left join por_dia p on p.d_local = c.d_local
  order by c.d_local;
end;
$$;
