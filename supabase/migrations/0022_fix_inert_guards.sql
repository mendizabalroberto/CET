-- 0022 · Los cuatro guards eran inertes: `current_user` dentro de un SECURITY DEFINER.
-- © 2026 Roberto Mendizabal. Todos los derechos reservados.
--
-- =============================================================================
-- EL FALLO
-- =============================================================================
-- Cuatro funciones `security definer` decidían con la misma línea:
--
--     if current_user <> 'authenticated' then
--       return new;              -- "esto no viene de la app, déjalo pasar"
--     end if;
--
-- Dentro de una función SECURITY DEFINER, `current_user` es el PROPIETARIO de
-- la función, no quien la llama. Comprobado contra producción:
--
--   DEFINER  -> current_user=postgres      session_user=postgres  role=authenticated
--   INVOKER  -> current_user=authenticated session_user=postgres  role=authenticated
--
-- `current_user` vale siempre 'postgres' ahí dentro. La condición se cumple
-- SIEMPRE. Los cuatro guards salían por la primera línea sin comprobar nada.
--
-- No es teoría. Un alumno de producción, con su propio JWT y el rol
-- `authenticated`, ejecutó:
--
--     update public.profiles set status = 'suspended' where id = <él mismo>;
--     -> 1 fila. Sin error.
--
-- ...cuando el trigger dice literalmente `raise exception 'No puedes cambiar tu
-- propio estado de cuenta'`. Lo mismo servía para `role` y `school_id`; lo único
-- que frenaba la escalada a superadmin era, por casualidad, la constraint
-- `profiles_staff_needs_email`, que exige email a todo lo que no sea alumno. Un
-- profesor —que sí tiene email— habría pasado.
--
-- POR QUÉ NADIE LO VIO
-- El comentario del propio trigger presume del cambio: la condición se comprobaba
-- antes con `auth.uid() is null`, y se pasó a `current_user` "corregido en la
-- pasada 2" para tapar el caso del JWT sin `sub`. La corrección era razonable en
-- intención y desactivó la defensa entera. Ningún test lo vio porque los tests de
-- RLS que existían comprueban QUÉ FILAS se ven, y esto es una cuestión de QUÉ
-- COLUMNAS se pueden escribir. Lo destapó la primera ejecución de pgTAP, con los
-- tests 16 y 17 de `rls_student_cannot_read_peers`, que esperaban 42501 y
-- recibieron un 23514 y un silencio.
--
-- =============================================================================
-- LA CORRECCIÓN
-- =============================================================================
-- La regla pasa a vivir en UN solo sitio, `app.is_app_user()`, y se apoya en el
-- GUC `role`, que es lo que PostgREST fija con `SET LOCAL ROLE` al recibir un
-- JWT y lo único que sobrevive intacto dentro de un SECURITY DEFINER.
--
-- Se descarta `session_user`: bajo PostgREST vale `authenticator` (el rol de
-- login del pool), no `authenticated`, así que habría dejado los guards igual de
-- inertes y más difíciles de depurar.

create or replace function app.is_app_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  -- Sin SET ROLE el GUC vale 'none': una conexión directa (migraciones,
  -- scripts, service_role) NO es un usuario de la aplicación y pasa de largo,
  -- que es exactamente lo que hacía la condición original cuando funcionaba.
  select coalesce(current_setting('role', true), 'none') = 'authenticated'
$$;

comment on function app.is_app_user() is
  'true si la petición viene del rol de aplicación. Lee el GUC `role` (SET LOCAL ROLE de PostgREST): dentro de un SECURITY DEFINER, current_user es el propietario y no sirve para esto.';


-- -----------------------------------------------------------------------------
-- 1. profiles_guard_escalation — el más grave: escalada de privilegios
-- -----------------------------------------------------------------------------
create or replace function app.profiles_guard_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.user_role;
begin
  if not app.is_app_user() then
    return new;
  end if;

  select p.role into v_actor_role
  from public.profiles p
  where p.id = auth.uid() and p.status = 'active';

  if v_actor_role = 'superadmin' then
    return new;
  end if;

  if v_actor_role = 'school_admin'
     and old.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  then
    if new.school_id is distinct from old.school_id then
      raise exception 'Un school_admin no puede mover un perfil a otro colegio'
        using errcode = 'insufficient_privilege';
    end if;
    if new.role = 'superadmin' or old.role = 'superadmin' then
      raise exception 'Un school_admin no puede crear ni modificar superadmins'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'No puedes cambiar tu propio rol'
      using errcode = 'insufficient_privilege';
  end if;
  if new.school_id is distinct from old.school_id then
    raise exception 'No puedes cambiar tu propio colegio'
      using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status then
    raise exception 'No puedes cambiar tu propio estado de cuenta'
      using errcode = 'insufficient_privilege';
  end if;
  if new.id is distinct from old.id then
    raise exception 'El id de un perfil es inmutable'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 2. students_guard_update — el candado del PIN y del bloqueo
-- -----------------------------------------------------------------------------
-- Inerte, un alumno podía bajarse `failed_pin_attempts` y anular el lockout por
-- fuerza bruta, o reescribir su `pin_hash`.
create or replace function app.students_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_app_user() then
    return new;
  end if;

  if new.school_id is distinct from old.school_id then
    raise exception 'Un alumno no se mueve de colegio con un UPDATE: es una migración de datos'
      using errcode = 'insufficient_privilege';
  end if;
  if new.profile_id is distinct from old.profile_id then
    raise exception 'students.profile_id es inmutable'
      using errcode = 'insufficient_privilege';
  end if;
  if new.pin_hash is distinct from old.pin_hash then
    raise exception 'pin_hash solo lo escribe la Edge Function de auth (Argon2id, service_role)'
      using errcode = 'insufficient_privilege';
  end if;
  if new.failed_pin_attempts > old.failed_pin_attempts then
    raise exception 'failed_pin_attempts solo lo incrementa la Edge Function de auth'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. exam_attempts_guard_update — la identidad forense del intento
-- -----------------------------------------------------------------------------
-- Inerte, la semilla y el blueprint_snapshot de un intento eran reescribibles:
-- se podría reconstruir un examen distinto del que se hizo.
create or replace function app.exam_attempts_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_app_user() then
    return new;
  end if;

  if new.id             is distinct from old.id
     or new.assignment_id  is distinct from old.assignment_id
     or new.student_id     is distinct from old.student_id
     or new.school_id      is distinct from old.school_id
     or new.attempt_number is distinct from old.attempt_number
     or new.seed           is distinct from old.seed
     or new.blueprint_snapshot is distinct from old.blueprint_snapshot
     or new.started_at     is distinct from old.started_at then
    raise exception
      'La identidad de un intento es inmutable: alumno, asignación, semilla, '
      'blueprint_snapshot e inicio no se pueden reescribir desde el cliente'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. app.audit — aquí la condición es al revés, y por eso NO denegaba a nadie
-- -----------------------------------------------------------------------------
-- `authenticated` tiene EXECUTE sobre esta función (0011). Con el guard inerte,
-- cualquier alumno podía escribir entradas arbitrarias en el audit_log: un log
-- en el que cualquiera puede escribir no prueba nada.
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
  if app.is_app_user()
     and not (app.is_staff() or app.is_superadmin()) then
    raise exception 'Solo el personal del colegio escribe en el audit_log'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.audit_log (
    school_id, actor_id, actor_role, action, entity_type, entity_id,
    before, after, ip_hash, user_agent
  )
  values (
    app.current_school_id(),
    auth.uid(),
    app.current_role(),
    p_action, p_entity_type, p_entity_id,
    p_before, p_after, p_ip_hash, p_user_agent
  )
  returning id into v_id;

  return v_id;
end;
$$;
