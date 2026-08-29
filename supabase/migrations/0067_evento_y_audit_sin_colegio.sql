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
  -- Tres puertas, y ninguna mas:
  --   · personal y superadmin, como siempre;
  --   · el tutor, sobre si mismo o sobre un hijo suyo — y quien es hijo suyo lo
  --     decide `app.puede_ver_alumno`, la misma funcion que gobierna toda su RLS;
  --   · el alumno, SOLO sobre si mismo. Existe por un unico hecho: el canje de
  --     su enlace lo audita su propia sesion recien abierta, porque el actor de
  --     ese hecho es el. Auditarlo con `service_role` escribiria `actor_id`
  --     nulo, y un registro forense sin actor vale la mitad.
  if app.is_app_user()
     and not (app.is_staff() or app.is_superadmin())
     and not (
       app.current_role() = 'guardian'
       and (p_entity_id is null
            or p_entity_id = auth.uid()
            or app.puede_ver_alumno(p_entity_id))
     )
     and not (
       app.current_role() = 'student'
       and (p_entity_id is null or p_entity_id = auth.uid())
     ) then
    raise exception 'Solo el personal, el tutor sobre los suyos y el alumno sobre si mismo escriben en el audit_log'
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

-- -----------------------------------------------------------------------------
-- auth_attempts — el libro de intentos tambien vale sin colegio
-- -----------------------------------------------------------------------------
-- `school_id` era `not null` (0011), y eso dejaba un hueco que no se ve hasta
-- que existe un alumno sin colegio: sus intentos fallidos NO SE PODIAN
-- REGISTRAR. La cuenta seguia protegida por el lockout de
-- `students.failed_pin_attempts` y por el limite por IP, asi que no era una
-- puerta abierta — pero si un ciego: nadie podia ver un ataque contra el hijo
-- de un tutor, ni contarlo en la ventana por codigo.
--
-- El codigo de un alumno sin colegio es unico globalmente (indice parcial de
-- 0066), asi que `(school_id NULL, student_code)` sigue identificandolo sin
-- ambiguedad.
alter table public.auth_attempts alter column school_id drop not null;

comment on column public.auth_attempts.school_id is
  'NULL cuando el alumno no esta matriculado en ningun colegio. Su student_code es unico globalmente (0066).';
