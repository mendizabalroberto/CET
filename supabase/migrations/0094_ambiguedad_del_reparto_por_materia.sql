-- =============================================================================
-- 0094_ambiguedad_del_reparto_por_materia.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- 0093 CREÓ LA FUNCIÓN, PERO NO SE PUEDE LLAMAR
--
-- `app.informe_alumno_resumen_por_materia` es `language plpgsql`, y sus
-- parámetros OUT (`subject_id`, `aciertos`, …) son variables visibles en TODO
-- el cuerpo de la función, incluido dentro de las consultas SQL embebidas —
-- Postgres crea la función sin comprobarlo, porque el cuerpo de un `plpgsql`
-- no se valida hasta que se ejecuta.
--
-- La CTE `materias_activas` hacía `select subject_id from minutos_por_materia`
-- sin cualificar, y esa columna se llama TAMBIÉN `subject_id` en la propia
-- CTE. Postgres no sabe si «subject_id» es la columna de la tabla o el
-- parámetro OUT de la función, y avisa en cuanto alguien llama a la función de
-- verdad:
--
--   ERROR: column reference "subject_id" is ambiguous
--
-- No lo vio la migración porque `create or replace function` con plpgsql NO
-- ejecuta el cuerpo: solo lo aparca. Lo cantó el primer `select` de
-- `supabase/tests/informe_por_materia.sql`, que sí llama a la función.
--
-- POR QUÉ UN FICHERO NUEVO Y NO UNA CORRECCIÓN EN 0093
--
-- 0093 ya se aplicó. `db-apply.mjs` se niega a reaplicar un fichero cuyo
-- contenido cambió después de aplicarse, y de sus dos salidas la que toca es
-- la primera: «escribe una migración NUEVA con la diferencia y deja el
-- fichero viejo como estaba». La misma decisión que tomaron 0079 y 0090.
--
-- EL ARREGLO
--
-- Las tres ramas de `materias_activas` cualifican la columna con el alias de
-- su CTE (`mm.subject_id`, `lc.subject_id`, `it.subject_id`). Todo lo demás
-- —el algoritmo, la firma, los permisos— es idéntico a 0093. El envoltorio
-- `public.informe_alumno_resumen_por_materia` no se toca: es `language sql`
-- sin ningún literal ambiguo, y 0093 lo dejó correcto.
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
  -- Toda materia con AL MENOS UNA de las tres señales, y solo esas. Se
  -- cualifica el nombre de columna a propósito: `subject_id` es también el
  -- parámetro OUT de la función, y sin el prefijo Postgres lo confunde con la
  -- columna de cada CTE («column reference is ambiguous»). Ver 0094.
  materias_activas as (
    select mm.subject_id from minutos_por_materia mm
    union
    select lc.subject_id from lecciones_por_materia lc
    union
    select it.subject_id from items_por_materia it
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
  'Minutos, items respondidos, aciertos, porcentaje de acierto y lecciones completadas, repartidos por materia. Minutos y lecciones via lessons->course_modules->courses; items via skill_id->skills->courses. porcentaje_acierto es NULL sin items, nunca 0. Ver 0093 y 0094 (ambiguedad de subject_id).';

revoke all on function app.informe_alumno_resumen_por_materia(uuid, timestamptz, timestamptz) from public;
grant execute on function app.informe_alumno_resumen_por_materia(uuid, timestamptz, timestamptz)
  to authenticated, service_role;
