-- =============================================================================
-- 0013_grants.sql — privilegios de tabla y de COLUMNA
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: DATA_MODEL.md §9 ("La clave de respuesta")
-- =============================================================================
-- RLS y GRANT son dos sistemas independientes y hay que usarlos LOS DOS:
--   · RLS decide QUÉ FILAS ve un rol.
--   · GRANT decide QUÉ COLUMNAS y qué operaciones puede siquiera intentar.
-- Una política es código que se puede escribir mal. Un GRANT ausente no falla
-- "abierto" nunca.
--
-- -----------------------------------------------------------------------------
-- CORRECCIÓN IMPORTANTE SOBRE DATA_MODEL §9
-- -----------------------------------------------------------------------------
-- DATA_MODEL propone literalmente:
--
--     revoke select (answer_key) on attempt_items from authenticated;
--
-- Esa línea, TAL CUAL, NO FUNCIONA. En Postgres los privilegios de tabla y los
-- de columna se llevan por separado: si el rol tiene SELECT a nivel de TABLA
-- (que es exactamente lo que Supabase concede por defecto a `authenticated`
-- sobre todo lo que se crea en `public`), un `revoke select (columna)` no le
-- quita nada — el privilegio de tabla sigue cubriendo todas las columnas,
-- incluidas las que se acaban de "revocar". El REVOKE se ejecuta sin error y sin
-- efecto, que es la peor combinación posible: parece que protege.
--
-- La forma que SÍ funciona, y la que se usa aquí, es:
--     revoke select on <tabla> from authenticated;              -- quita el de tabla
--     grant  select (col1, col2, ...) on <tabla> to authenticated;  -- devuelve solo lo permitido
--
-- Está verificado en supabase/tests/rls_answer_key_hidden.sql, que comprueba con
-- has_column_privilege() que el privilegio realmente no está.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Punto de partida: fail-closed
-- -----------------------------------------------------------------------------
-- Supabase concede por defecto ALL sobre las tablas nuevas de `public` a `anon`
-- y `authenticated` (vía ALTER DEFAULT PRIVILEGES del rol postgres). Se retira
-- todo y se devuelve solo lo necesario, tabla a tabla.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- Y lo mismo para lo que se cree en el futuro: sin esta línea, la próxima
-- migración que alguien escriba nace con ALL concedido a anon.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;

-- El backend sigue pudiendo todo. Es el rol que ejecuta las Edge Functions y los
-- jobs, y además tiene BYPASSRLS: es el camino privilegiado, y es explícito.
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- `anon` NO recibe NADA. Un usuario sin sesión no ve ni el nombre de un colegio:
-- la resolución del slug en la pantalla de login la hace una Route Handler con
-- service_role, que devuelve solo {name, locale, pin_length} del colegio pedido.


-- #############################################################################
-- TENANCY E IDENTIDAD
-- #############################################################################

grant select on public.schools to authenticated;
grant insert, delete on public.schools to authenticated;   -- la RLS lo limita a superadmin

-- UPDATE por COLUMNAS, no de tabla (hallazgo de la pasada 2): con un
-- `grant update on schools`, el school_admin podía reescribir su propio
-- `status` y `slug`. Lo primero le habría permitido revertir una suspensión
-- decretada por el superadmin — es decir, el mecanismo de suspensión de
-- colegios no existía. Lo segundo le habría dejado secuestrar el slug de otro
-- colegio y con él su URL de login.
-- `status` y `slug` quedan fuera: solo `service_role` (y el superadmin, vía
-- Server Action con service_role) los escribe.
grant update (
  name, country, timezone, default_locale,
  pin_length_primary, pin_length_secondary, settings
) on public.schools to authenticated;

grant select, insert, update on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- students — `pin_hash` fuera del alcance de TODO rol salvo service_role
-- ---------------------------------------------------------------------------
-- DATA_MODEL §1: "pin_hash está en una tabla con RLS que no concede SELECT a
-- nadie salvo service_role. La Edge Function de auth es la única que lo lee."
-- Se enumeran las columnas permitidas: si mañana alguien añade una columna
-- sensible a esta tabla, NO quedará concedida por accidente — el fallo será
-- "no se ve" y no "se filtró".
grant select (
  profile_id, school_id, student_code, year_level, stage, section,
  pin_must_change, pin_updated_at, failed_pin_attempts, locked_until,
  guardian_email, enrolled_at, created_at, updated_at
) on public.students to authenticated;

-- SIN `grant insert on students` (hallazgo de la pasada 2). El INSERT es
-- necesariamente de tabla completa (no hay INSERT "por columnas" que sirva,
-- porque pin_hash es NOT NULL), así que concederlo habría dejado a un
-- school_admin escribir directamente un `pin_hash` de su elección — saltándose
-- el generador de PIN aleatorio y el flujo de Argon2id. Además, crear un alumno
-- exige antes un `auth.users`, que solo puede crear `service_role`. Así que el
-- alta de alumno pasa entera por la Server Action con service_role, que es
-- donde ya estaba documentada (modules/students/CLAUDE.md).
-- La política `students_insert_admin` se conserva: es la segunda capa para el
-- día en que exista un camino de INSERT seguro desde el cliente.

grant update (
  student_code, year_level, stage, section,
  pin_must_change, failed_pin_attempts, locked_until,
  guardian_email
) on public.students to authenticated;
-- `pin_hash` y `pin_updated_at` NO están en la lista de UPDATE: escribir un PIN
-- es competencia exclusiva de la Edge Function, que es quien sabe aplicar
-- Argon2id. Un UPDATE directo permitiría guardar el PIN en claro.

grant select, update on public.registration_requests to authenticated;

grant select, insert, update, delete on public.sections to authenticated;
grant select, insert, delete on public.section_members to authenticated;


-- #############################################################################
-- CURRÍCULO Y CONTENIDO
-- #############################################################################

grant select, insert, update, delete on public.subjects       to authenticated;
grant select, insert, update, delete on public.courses        to authenticated;
grant select, insert, update, delete on public.school_courses to authenticated;
grant select, insert, update, delete on public.course_modules to authenticated;
grant select, insert, update, delete on public.lessons        to authenticated;
grant select, insert, update, delete on public.skills         to authenticated;
grant select, insert, delete         on public.lesson_skills  to authenticated;
grant select, insert, update, delete on public.media_assets   to authenticated;
grant select, insert, update, delete on public.lesson_blocks  to authenticated;


-- #############################################################################
-- PREGUNTAS — capa 2 de la defensa de la clave
-- #############################################################################

grant select, insert, update, delete on public.questions to authenticated;

-- `answer_spec` NUNCA. Ni para el alumno ni para el profesor: los GRANT son por
-- ROL de Postgres, y alumnos y profesores comparten el rol `authenticated`.
-- El profesor que necesita ver la clave la obtiene por
-- app.question_version_answer_spec(), que comprueba que es staff y del colegio
-- correcto, y deja rastro auditable.
grant select (
  id, question_id, version, format, body, hint, solution,
  difficulty, max_points, grading_mode, locale, published_at,
  created_by, created_at
) on public.question_versions to authenticated;

grant insert, delete on public.question_versions to authenticated;
-- Sin UPDATE: la tabla es inmutable (trigger question_versions_immutable).


-- #############################################################################
-- EXÁMENES
-- #############################################################################

grant select, insert, update, delete on public.exam_blueprints          to authenticated;
grant select, insert, update, delete on public.exam_blueprint_sections  to authenticated;
grant select, insert, update, delete on public.exam_assignments         to authenticated;


-- #############################################################################
-- INTENTOS — capa 2 de la defensa de la clave
-- #############################################################################

grant select, update on public.exam_attempts to authenticated;
-- Sin INSERT ni DELETE: los intentos los crea el servidor (AD-5).

-- `answer_key` e `item_seed` NUNCA salen por esta vía.
-- `item_seed` se excluye por el mismo motivo que la clave: @cet/engine es código
-- de CLIENTE y es determinista dado (engine_key, params, seed). Con la semilla,
-- el alumno regenera el item entero incluida su respuesta correcta. Ocultar
-- answer_key y publicar item_seed sería teatro de seguridad.
grant select (
  id, attempt_id, ord, section_ord, question_id, question_version_id,
  rendered_body, option_order, skill_id, difficulty, max_points, created_at
) on public.attempt_items to authenticated;

grant select on public.attempt_responses to authenticated;
grant select, insert on public.attempt_gradings to authenticated;

-- La vista sin columnas sensibles (capa 3). Es lo único que consulta el cliente.
grant select on public.attempt_items_student to authenticated;


-- #############################################################################
-- TELEMETRÍA Y AUDITORÍA
-- #############################################################################

grant select on public.learning_events to authenticated;
grant select on public.skill_mastery   to authenticated;
grant select on public.audit_log       to authenticated;
grant select on public.auth_attempts   to authenticated;

-- Las particiones de learning_events: se les RETIRA todo y NO se les concede
-- nada a `authenticated` (corregido en la pasada 2).
-- Al consultar por la tabla padre, Postgres comprueba los privilegios del PADRE
-- y no los de la partición, así que el GRANT sobre cada partición no hace falta
-- para nada... salvo para abrir una segunda puerta: un `select from
-- learning_events_2026_08` directo se rige por la RLS de esa partición, y si
-- alguien le añadiera una política permisiva mañana, el GRANT ya estaría
-- puesto. Sin GRANT, esa puerta no existe.
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_inherits i on i.inhrelid = c.oid
    where n.nspname = 'public'
      and i.inhparent = 'public.learning_events'::regclass
  loop
    execute format('revoke all on public.%I from anon, authenticated', r.relname);
    execute format('grant all on public.%I to service_role', r.relname);
  end loop;
end;
$$;


-- #############################################################################
-- Acceso tasado a la clave de corrección para el STAFF
-- #############################################################################
-- Consecuencia de que los GRANT sean por rol y no por persona: al retirar
-- `answer_spec`/`answer_key` a `authenticated` se le retiran también al profesor.
-- Necesita verlas para revisar un examen y para corregir a mano, así que aquí
-- está el camino legítimo: `security definer`, con comprobación explícita de rol
-- y de tenant, una fila cada vez. Nunca un `select *` sobre el banco entero.

create or replace function app.question_version_answer_spec(p_version_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_spec      jsonb;
  v_school_id uuid;
begin
  if not (app.is_staff() or app.is_superadmin()) then
    raise exception 'Solo el staff puede consultar la clave de corrección'
      using errcode = 'insufficient_privilege';
  end if;

  select qv.answer_spec, q.school_id
    into v_spec, v_school_id
  from public.question_versions qv
  join public.questions q on q.id = qv.question_id
  where qv.id = p_version_id;

  if v_spec is null then
    return null;   -- no existe: mismo resultado que "no puedes verla"
  end if;

  if not app.can_read_content(v_school_id) then
    raise exception 'La pregunta no pertenece a tu colegio'
      using errcode = 'insufficient_privilege';
  end if;

  return v_spec;
end;
$$;

create or replace function app.attempt_item_answer_key(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key       jsonb;
  v_school_id uuid;
begin
  if not (app.is_staff() or app.is_superadmin()) then
    raise exception 'Solo el staff puede consultar la clave de un item'
      using errcode = 'insufficient_privilege';
  end if;

  select ai.answer_key, a.school_id
    into v_key, v_school_id
  from public.attempt_items ai
  join public.exam_attempts a on a.id = ai.attempt_id
  where ai.id = p_item_id;

  if v_key is null then
    return null;
  end if;

  if not (app.is_superadmin() or v_school_id = app.current_school_id()) then
    raise exception 'El intento no pertenece a tu colegio'
      using errcode = 'insufficient_privilege';
  end if;

  return v_key;
end;
$$;

revoke all on function app.question_version_answer_spec(uuid) from public;
revoke all on function app.attempt_item_answer_key(uuid) from public;
grant execute on function app.question_version_answer_spec(uuid) to authenticated, service_role;
grant execute on function app.attempt_item_answer_key(uuid) to authenticated, service_role;

comment on function app.attempt_item_answer_key(uuid) is
  'Único camino del staff a answer_key. Comprueba rol y tenant. El alumno recibe insufficient_privilege.';


-- #############################################################################
-- Verificación en tiempo de migración
-- #############################################################################
-- La comprobación que más duele descubrir tarde: una tabla en `public` sin RLS.
-- Falla la migración en el acto en vez de esperar a que la encuentre un pentest.
do $$
declare
  v_missing text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_missing
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')          -- tablas y tablas particionadas
    and not c.relrowsecurity;

  if v_missing is not null then
    raise exception 'Tablas de public SIN row level security: %', v_missing;
  end if;
end;
$$;

-- Y la segunda: una función `security definer` sin search_path fijado es una
-- escalada de privilegios esperando a que alguien la encuentre.
do $$
declare
  v_missing text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_missing
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('app', 'public')
    and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
      where cfg like 'search_path=%'
    );

  if v_missing is not null then
    raise exception 'Funciones security definer SIN search_path fijado: %', v_missing;
  end if;
end;
$$;
