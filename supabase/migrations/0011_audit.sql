-- =============================================================================
-- 0011_audit.sql — audit_log y auth_attempts
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: DATA_MODEL.md §8 · MASTER_PLAN §9 (datos de menores)
-- =============================================================================
-- "Audit log de todo acceso de staff a datos de alumno." Es un requisito legal
-- del tratamiento de datos de menores, no una comodidad de depuración. Por eso
-- estas tablas también llevan RLS (una tabla de auditoría legible por cualquiera
-- es una fuga de datos con formato tabular) y son append-only a nivel de
-- trigger, no de convención.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- audit_log
-- -----------------------------------------------------------------------------
create sequence public.audit_log_id_seq as bigint;

create table public.audit_log (
  id          bigint primary key default nextval('public.audit_log_id_seq'),
  -- SIN FOREIGN KEY, y es deliberado (mismo razonamiento que en learning_events):
  -- un `on delete set null` obligaría al motor a hacer UPDATE sobre esta tabla al
  -- borrar un colegio o una persona, y el trigger append-only lo bloquearía —
  -- dejando el sistema con colegios imborrables. Un `on delete cascade` sería
  -- peor: borrar al profesor investigado borraría la prueba de lo que hizo.
  -- Un registro de auditoría es un HECHO: sobrevive al actor y al tenant.
  -- NULL en school_id solo para acciones del superadmin, que no tiene colegio.
  school_id   uuid,
  actor_id    uuid,
  -- Copia del rol EN EL MOMENTO de actuar. Si mañana lo degradan a 'teacher',
  -- este registro sigue diciendo que entonces era school_admin.
  actor_role  public.user_role,
  action      text not null,          -- 'student.pin_reset', 'attempt.regrade'...
  entity_type text not null,          -- 'students', 'exam_attempts'...
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  ip_hash     text,
  user_agent  text,
  created_at  timestamptz not null default now(),

  constraint audit_log_action_format
    check (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint audit_log_entity_format
    check (entity_type ~ '^[a-z][a-z0-9_]*$'),
  constraint audit_log_ip_hash_sha256
    check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  constraint audit_log_before_object check (before is null or app.is_jsonb_object(before)),
  constraint audit_log_after_object  check (after  is null or app.is_jsonb_object(after))
);

alter sequence public.audit_log_id_seq owned by public.audit_log.id;

comment on table public.audit_log is
  'Append-only. Toda acción de staff sobre datos de alumno (MASTER_PLAN §9). RLS activa.';
comment on column public.audit_log.actor_role is
  'Rol congelado en el momento de la acción: un cambio de rol posterior no reescribe la historia.';

-- Query caliente #1: la pantalla de auditoría del colegio, en orden cronológico
-- inverso.
create index audit_log_school_created_idx
  on public.audit_log (school_id, created_at desc);

-- Query caliente #2: "todo lo que se ha hecho sobre ESTE alumno" — la respuesta
-- a una reclamación de un tutor.
create index audit_log_entity_idx
  on public.audit_log (entity_type, entity_id, created_at desc);

-- Query caliente #3: "todo lo que ha hecho ESTE profesor" — investigación de
-- un incidente.
create index audit_log_actor_idx
  on public.audit_log (actor_id, created_at desc)
  where actor_id is not null;

alter table public.audit_log enable row level security;

-- Append-only a nivel de motor. Bloquea el UPDATE a TODOS los roles,
-- service_role incluido: un log de auditoría que el backend puede editar no
-- prueba nada.
-- El DELETE queda fuera del trigger por la misma razón que en learning_events:
-- la purga por retención y la supresión de datos de un menor tienen que ser
-- posibles con service_role. Desde el cliente no hay DELETE: ni GRANT ni política.
create trigger audit_log_append_only
  before update on public.audit_log
  for each row execute function app.block_mutation();


-- -----------------------------------------------------------------------------
-- auth_attempts — rate limiting y detección de fuerza bruta contra PINs (AD-4)
-- -----------------------------------------------------------------------------
create sequence public.auth_attempts_id_seq as bigint;

create table public.auth_attempts (
  id           bigint primary key default nextval('public.auth_attempts_id_seq'),
  school_id    uuid not null references public.schools (id) on delete cascade,
  -- Se guarda el CÓDIGO tecleado, no el student_id: hay que poder contar
  -- intentos contra códigos que NO EXISTEN, que es precisamente la firma de un
  -- ataque de enumeración.
  student_code extensions.citext not null,
  success      boolean not null,
  ip_hash      text,
  created_at   timestamptz not null default now(),

  constraint auth_attempts_ip_hash_sha256
    check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$')
);

alter sequence public.auth_attempts_id_seq owned by public.auth_attempts.id;

comment on table public.auth_attempts is
  'Rate limiting de PIN. Guarda el código TECLEADO (aunque no exista) para detectar enumeración.';

-- EL índice de esta tabla (DATA_MODEL §8). Es la query que corre en el camino
-- crítico de CADA login: "¿cuántos intentos ha habido contra este código en los
-- últimos N minutos?". Sin él, cada login hace un scan de la tabla de intentos
-- del colegio entero.
create index auth_attempts_lookup_idx
  on public.auth_attempts (school_id, student_code, created_at desc);

-- Segundo eje de rate limiting: por IP, no por código. Un atacante que prueba
-- un PIN distinto contra 500 códigos distintos nunca dispara el límite por
-- código, pero sí este. Parcial sobre los fallos, que es lo que se cuenta.
create index auth_attempts_ip_idx
  on public.auth_attempts (ip_hash, created_at desc)
  where success = false and ip_hash is not null;

alter table public.auth_attempts enable row level security;

-- Igual que en learning_events: se bloquea el UPDATE (falsear un intento fallido
-- borraría el rastro de un ataque de fuerza bruta) pero no el DELETE, porque
-- auth_attempts.school_id lleva ON DELETE CASCADE y un trigger que lo bloqueara
-- haría imposible dar de baja un colegio. Desde el cliente no hay DELETE: ni
-- GRANT ni política.
create trigger auth_attempts_append_only
  before update on public.auth_attempts
  for each row execute function app.block_mutation();


-- -----------------------------------------------------------------------------
-- app.audit(...) — el único camino para escribir en audit_log
-- -----------------------------------------------------------------------------
-- `security definer` porque `authenticated` NO tiene INSERT sobre audit_log
-- (0013_grants.sql). Que el staff pueda registrar sus propias acciones pero no
-- fabricar entradas arbitrarias en nombre de otro es justo la propiedad que se
-- quiere: actor_id y actor_role los pone el SERVIDOR desde la sesión, nunca el
-- llamante.
create or replace function app.audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid default null,
  p_before      jsonb default null,
  p_after       jsonb default null,
  p_ip_hash     text default null,
  p_user_agent  text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  -- Solo el staff audita (corregido en la pasada 2). Sin esta guarda, un alumno
  -- podía llamar a app.audit() en bucle y llenar la tabla de auditoría de su
  -- colegio con entradas fabricadas: no le daba acceso a nada, pero envenenaba
  -- la única prueba de lo que hace el personal. Registrar ruido en un log
  -- forense es un ataque, no una travesura.
  if current_user = 'authenticated'
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

comment on function app.audit(text, text, uuid, jsonb, jsonb, text, text) is
  'Único camino de escritura en audit_log. El actor lo pone el servidor, no el llamante.';

revoke all on function app.audit(text, text, uuid, jsonb, jsonb, text, text) from public;
grant execute on function app.audit(text, text, uuid, jsonb, jsonb, text, text)
  to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- app.record_auth_attempt(...) — escritura de auth_attempts
-- -----------------------------------------------------------------------------
-- La llama la Edge Function con service_role. Se expone como función (y no como
-- insert directo) para que el día que haya que añadir lógica (p. ej. un contador
-- agregado) no haya que tocar el llamante.
create or replace function app.record_auth_attempt(
  p_school_id    uuid,
  p_student_code text,
  p_success      boolean,
  p_ip_hash      text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.auth_attempts (school_id, student_code, success, ip_hash)
  values (p_school_id, p_student_code::extensions.citext, p_success, p_ip_hash);
$$;

revoke all on function app.record_auth_attempt(uuid, text, boolean, text) from public;
grant execute on function app.record_auth_attempt(uuid, text, boolean, text) to service_role;


-- -----------------------------------------------------------------------------
-- app.recent_failed_attempts(...) — la consulta del rate limiter
-- -----------------------------------------------------------------------------
create or replace function app.recent_failed_attempts(
  p_school_id    uuid,
  p_student_code text,
  p_window       interval default interval '15 minutes'
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.auth_attempts a
  where a.school_id = p_school_id
    and a.student_code = p_student_code::extensions.citext
    and a.success = false
    and a.created_at > now() - p_window;
$$;

revoke all on function app.recent_failed_attempts(uuid, text, interval) from public;
grant execute on function app.recent_failed_attempts(uuid, text, interval) to service_role;
