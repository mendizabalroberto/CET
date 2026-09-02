-- =============================================================================
-- 0093_informe_por_materia.sql — el reparto del informe, por fin con materia
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- EL FALLO
--
-- `apps/web/src/lib/tutor/queries.ts` (`materiasDeLecciones`) construye el
-- reparto por materia del panel del tutor ENCADENANDO EN LA APLICACIÓN
-- `lessons -> course_modules -> courses -> subjects` sobre las filas que ya
-- trae `informe_alumno_tiempo_por_leccion`. Es minutos y nada más: ningún RPC
-- reparte ítems respondidos, aciertos ni lecciones completadas por materia, así
-- que `SubjectBreakdownRow` (`packages/ui/src/reports/SubjectBreakdown.tsx`)
-- lleva `accuracyText` y `lessonsText` opcionales desde que se escribió y
-- nunca se rellenan. Un padre ve minutos por materia y nada de cómo le va en
-- cada una.
--
-- ESTA MIGRACIÓN
--
-- `app.informe_alumno_resumen_por_materia`, envuelta en
-- `public.informe_alumno_resumen_por_materia` con el mismo patrón que 0063 y
-- sus sucesoras (0077, 0085, 0086): guardián en la de `app`, envoltorio sin
-- comprobación propia porque repetirla sería una segunda copia de la regla de
-- acceso a datos de un menor.
--
-- CÓMO SE LLEGA A LA MATERIA — DOS CAMINOS, PORQUE SON DOS COSAS DISTINTAS
--
-- MINUTOS y LECCIONES COMPLETADAS salen de `lessons -> course_modules ->
-- courses -> subject_id`, igual que ya hace la aplicación a mano. Los minutos
-- reutilizan el ALGORITMO de `app.informe_alumno_tiempo_por_leccion` (0062):
-- dentro de cada sesión se arrastra el último `lesson_id` no nulo visto —los
-- eventos intermedios (idle, focus, answer_submitted) no traen lección propia—
-- y una isla es un tramo consecutivo con la misma resolución. La única
-- diferencia es la CLAVE de la isla: 0062 corta isla cuando cambia la LECCIÓN,
-- esta función corta isla cuando cambia la MATERIA de la lección arrastrada, así
-- que dos lecciones seguidas de la misma materia no abren una isla nueva entre
-- ellas y sus minutos se sirven en la misma isla — es justo lo que hace falta
-- para un reparto por materia y no cambia nada dentro de una sola materia. Se
-- hereda también la advertencia de 0062: la suma de minutos por materia es
-- MENOR O IGUAL que `minutos_estudio` del resumen, porque el hueco entre una
-- lección y la siguiente no se le atribuye a ninguna.
--
-- ÍTEMS RESPONDIDOS y ACIERTOS salen de la PREGUNTA, no de la lección:
-- `learning_events.skill_id` (relleno en todo `answer_submitted`, ver 0010) ->
-- `skills.course_id` -> `courses.subject_id`. Es el mismo primer tramo que usa
-- `app.informe_alumno_skills` (0053) para llegar de un evento a su destreza;
-- aquí se prolonga un salto más, de la destreza a la materia de su curso. No
-- se usa `lesson_id` para los ítems porque una pregunta de práctica libre no
-- tiene por qué venir dentro de una lección abierta — `skill_id` es el dato
-- que SIEMPRE la ata a un curso y por tanto a una materia.
--
-- CERO DIVISIONES POR CERO
--
-- `porcentaje_acierto` es NULL, no 0, cuando esa materia no tuvo ni un
-- `answer_submitted` en la ventana — la misma regla que «un cero que no
-- significa cero no se pinta» de `seguimiento.ts`, aplicada aquí en el origen
-- para que la capa de aplicación no tenga que reinventarla fila a fila.
--
-- UNA FILA POR MATERIA CON ACTIVIDAD, NO POR TODAS LAS MATERIAS DEL CATÁLOGO
--
-- Una materia que el niño nunca tocó en la ventana no aparece: inventar una
-- fila a cero por cada materia del curso sería enseñar «0 % de acierto en
-- Ciencias» de un niño que ni abrió el catálogo, que es precisamente el fallo
-- que motiva la regla del cero que no es cero.
-- =============================================================================

create or replace function app.informe_alumno_resumen_por_materia(
  p_student_id uuid,
  p_desde      timestamptz,
  p_hasta      timestamptz
)
returns table (
  subject_id            uuid,
  subject_code          text,
  minutos_estudio       numeric,
  items_respondidos     integer,
  aciertos              integer,
  porcentaje_acierto    numeric,
  lecciones_completadas integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.puede_ver_informe(p_student_id);

  return query
  with materia_de_leccion as (
    -- Un único salto lessons -> course_modules -> courses, reutilizado abajo
    -- tanto para arrastrar minutos como para contar lecciones completadas.
    select l.id as lesson_id, c.subject_id
    from public.lessons l
    join public.course_modules cm on cm.id = l.module_id
    join public.courses c on c.id = cm.course_id
  ),
  ev as (
    select le.session_id, le.seq, le.server_ts, le.event_type, le.payload,
           le.lesson_id, le.skill_id
    from public.learning_events le
    where le.student_id = p_student_id
      and le.server_ts >= p_desde
      and le.server_ts < p_hasta
  ),
  -- --- Minutos: el mismo arrastre de contexto de 0062 -----------------------
  bloques as (
    select ev.*,
           count(ev.lesson_id) over (
             partition by ev.session_id order by ev.seq
             rows between unbounded preceding and current row) as bloque
    from ev
  ),
  arrastrado as (
    select b.*,
           first_value(b.lesson_id) over (
             partition by b.session_id, b.bloque order by b.seq
             rows between unbounded preceding and unbounded following) as leccion
    from bloques b
  ),
  con_materia as (
    select a.*, ml.subject_id as materia
    from arrastrado a
    left join materia_de_leccion ml on ml.lesson_id = a.leccion
  ),
  cambios as (
    select c.*,
           case
             when c.materia is distinct from
                  lag(c.materia) over (partition by c.session_id order by c.seq)
             then 1 else 0 end as abre_isla
    from con_materia c
  ),
  marcado as (
    select c.*,
           sum(c.abre_isla) over (
             partition by c.session_id order by c.seq
             rows between unbounded preceding and current row) as isla
    from cambios c
  ),
  islas as (
    -- Solo las islas CON materia: los eventos anteriores a la primera lección
    -- (menu, session_context) arrastran NULL y no se atribuyen a nadie.
    select m.session_id, m.isla, m.materia,
           extract(epoch from (max(m.server_ts) - min(m.server_ts))) as span_seg,
           coalesce(sum(app.ms_descontables(m.event_type::text, m.payload)), 0) as descontable_ms
    from marcado m
    where m.materia is not null
    group by m.session_id, m.isla, m.materia
  ),
  minutos_por_materia as (
    select i.materia as subject_id,
           round(sum(greatest(i.span_seg - i.descontable_ms / 1000.0, 0)) / 60.0, 2) as minutos
    from islas i
    group by i.materia
  ),
  -- --- Lecciones completadas: el evento SIEMPRE trae su lesson_id (0062) ----
  lecciones_por_materia as (
    select ml.subject_id, count(*)::integer as n
    from ev e
    join materia_de_leccion ml on ml.lesson_id = e.lesson_id
    where e.event_type::text = 'lesson_completed'
    group by ml.subject_id
  ),
  -- --- Ítems: de la pregunta a su destreza y de ahí a su materia ------------
  items_por_materia as (
    select c.subject_id,
           count(*)::integer as n,
           count(*) filter (where e.payload ->> 'isCorrect' = 'true')::integer as aciertos
    from ev e
    join public.skills sk on sk.id = e.skill_id
    join public.courses c on c.id = sk.course_id
    where e.event_type::text = 'answer_submitted'
    group by c.subject_id
  ),
  -- Toda materia con AL MENOS UNA de las tres señales, y solo esas.
  materias_activas as (
    select subject_id from minutos_por_materia
    union
    select subject_id from lecciones_por_materia
    union
    select subject_id from items_por_materia
  )
  select
    sub.id,
    sub.code,
    coalesce(mm.minutos, 0)::numeric,
    coalesce(it.n, 0)::integer,
    coalesce(it.aciertos, 0)::integer,
    case when coalesce(it.n, 0) = 0 then null
         else round(100.0 * it.aciertos / it.n, 1) end::numeric,
    coalesce(lc.n, 0)::integer
  from materias_activas ma
  join public.subjects sub on sub.id = ma.subject_id
  left join minutos_por_materia mm on mm.subject_id = ma.subject_id
  left join lecciones_por_materia lc on lc.subject_id = ma.subject_id
  left join items_por_materia it on it.subject_id = ma.subject_id
  order by sub.code;
end;
$$;

comment on function app.informe_alumno_resumen_por_materia(uuid, timestamptz, timestamptz) is
  'Minutos, items respondidos, aciertos, porcentaje de acierto y lecciones completadas, repartidos por materia. Minutos y lecciones via lessons->course_modules->courses; items via skill_id->skills->courses. porcentaje_acierto es NULL sin items, nunca 0. Ver 0093.';

revoke all on function app.informe_alumno_resumen_por_materia(uuid, timestamptz, timestamptz) from public;
grant execute on function app.informe_alumno_resumen_por_materia(uuid, timestamptz, timestamptz)
  to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- Envoltorio en `public` — PostgREST no expone `app`
-- -----------------------------------------------------------------------------
-- Quinta vez que hace falta (0023, 0063, 0077, 0085/0086). El guardián vive en
-- la función de `app`, que llama a `app.puede_ver_informe` como primera línea;
-- repetirlo aquí serían dos copias de la regla de acceso a datos de un menor.
create or replace function public.informe_alumno_resumen_por_materia(
  p_student_id uuid,
  p_desde      timestamptz,
  p_hasta      timestamptz
)
returns table (
  subject_id            uuid,
  subject_code          text,
  minutos_estudio       numeric,
  items_respondidos     integer,
  aciertos              integer,
  porcentaje_acierto    numeric,
  lecciones_completadas integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from app.informe_alumno_resumen_por_materia(p_student_id, p_desde, p_hasta);
$$;

revoke all on function public.informe_alumno_resumen_por_materia(uuid, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.informe_alumno_resumen_por_materia(uuid, timestamptz, timestamptz)
  to authenticated, service_role;
