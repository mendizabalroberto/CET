-- =============================================================================
-- 0067_evento_y_audit_sin_colegio.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Dos consecuencias de que exista un alumno sin colegio:
--
--  1. Lo que practica en casa NO tiene colegio, y el colegio no debe verlo.
--     `learning_events.school_id` pasa a nullable y lo RESUELVE el servidor a
--     partir de la membresia activa, nunca el cliente.
--  2. Un tutor no puede auditar sus propias acciones. El guard de `app.audit()`
--     que introdujo 0022 dice: si eres usuario de la app y no eres staff ni
--     superadmin, excepcion. Un `guardian` cae ahi.
--
--     Se ACOTA, no se quita. Quitarlo devolveria el fallo que 0022 cerro: un
--     log de auditoria en el que cualquier alumno puede escribir no prueba nada.
-- =============================================================================

alter table public.learning_events alter column school_id drop not null;

-- El colegio de un evento es el de la membresia ACTIVA del alumno hoy, o NULL.
-- `security definer` porque la ruta de ingesta corre con la sesion del alumno,
-- que no puede leer `student_school_memberships` de nadie mas — ni le hace
-- falta: solo pregunta por si mismo.
create or replace function app.colegio_del_evento(p_student_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.school_id
    from public.student_school_memberships m
   where m.student_id = p_student_id
     and m.status = 'activa'
     and m.starts_on <= current_date
     and (m.ends_on is null or m.ends_on > current_date)
   limit 1;
$$;

revoke all on function app.colegio_del_evento(uuid) from public;
grant execute on function app.colegio_del_evento(uuid) to authenticated, service_role;

comment on function app.colegio_del_evento(uuid) is
  'Colegio al que se atribuye un evento: la membresia activa, o NULL si practica en casa.';

-- -----------------------------------------------------------------------------
-- app.audit — el guard se acota, no se abre
-- -----------------------------------------------------------------------------
create or replace function app.audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid    default null,
  p_before      jsonb   default null,
  p_after       jsonb   default null,
  p_ip_hash     text    default null,
  p_user_agent  text    default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  -- Staff y superadmin: como siempre. Un tutor: SOLO sobre si mismo o sobre un
  -- hijo suyo, y eso lo decide `app.puede_ver_alumno`, que es la misma funcion
  -- que gobierna toda la RLS del tutor. Cualquier otro usuario de la app: no.
  if app.is_app_user()
     and not (app.is_staff() or app.is_superadmin())
     and not (
       app.current_role() = 'guardian'
       and (p_entity_id is null
            or p_entity_id = auth.uid()
            or app.puede_ver_alumno(p_entity_id))
     ) then
    raise exception 'Solo el personal del colegio y el tutor sobre los suyos escriben en el audit_log'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.audit_log (
    school_id, actor_id, actor_role, action, entity_type, entity_id,
    before, after, ip_hash, user_agent
  )
  values (
    app.current_school_id(),   -- NULL para tutor y superadmin: la columna ya lo admite
    auth.uid(),
    app.current_role(),
    p_action, p_entity_type, p_entity_id,
    p_before, p_after, p_ip_hash, p_user_agent
  )
  returning id into v_id;

  return v_id;
end;
$$;
