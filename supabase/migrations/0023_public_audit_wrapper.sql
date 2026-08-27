-- =============================================================================
-- 0023_public_audit_wrapper.sql — la web vuelve a poder auditar
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal. Todos los derechos reservados.
-- Contrato: MASTER_PLAN §9 (datos de menores) · VERIFICATION_PLAN M12
-- =============================================================================
-- EL FALLO
-- -----------------------------------------------------------------------------
-- `apps/web/src/components/staff/actions.ts` llama a `app.audit(...)` y a
-- `app.attempt_item_answer_key(...)` a través de PostgREST. PostgREST de este
-- proyecto expone ÚNICAMENTE `public` y `graphql_public`. Reproducido contra
-- producción el 27/08/2026 con la clave anónima:
--
--   POST /rest/v1/rpc/audit   (Content-Profile: app)
--   -> HTTP 406
--      {"code":"PGRST106","message":"Invalid schema: app",
--       "hint":"Only the following schemas are exposed: public, graphql_public"}
--
--   POST /rest/v1/rpc/audit   (sin perfil, o sea public)
--   -> HTTP 404 {"code":"PGRST202", ... "public.audit ... no matches"}
--
-- Las dos puertas están cerradas. Efecto: NINGUNA acción de staff hecha desde
-- la web llegaba a `audit_log` —incluido revelar una clave de respuesta, que
-- M12 exige registrar— y, peor, `app.attempt_item_answer_key` tampoco era
-- alcanzable, así que la propia revelación de la clave estaba rota entera.
--
-- No era visible porque el helper `audit()` de la web se tragaba el error en un
-- `console.error`: el 406 no aparecía en ninguna parte de la interfaz.
--
-- -----------------------------------------------------------------------------
-- LA CORRECCIÓN, Y LO QUE NO SE HACE
-- -----------------------------------------------------------------------------
-- NO se expone el esquema `app` en PostgREST. `app` es la superficie privada
-- del servidor: sus 40+ funciones incluyen helpers que jamás deben ser un
-- endpoint HTTP. Exponerlo entero para arreglar dos llamadas sería cambiar un
-- fallo de auditoría por un problema de superficie de ataque.
--
-- Se hace lo mismo que ya se hizo dos veces para las Edge Functions
-- (`audit_student_pin_reset` en 0014, `audit_staff_password_change` en 0019):
-- un envoltorio mínimo en `public`, `security definer`, con `search_path`
-- fijado y con su propia guarda explícita.
--
-- LA DIFERENCIA CON ESOS DOS, Y ES LA PROPIEDAD IMPORTANTE:
-- aquéllos corren con `service_role` desde una Edge Function, donde NO hay
-- sesión de PostgREST, y por eso reciben `p_actor_id` y `p_school_id`. Éste lo
-- llama la web con la sesión del propio miembro del personal, así que
-- **no acepta identidad del llamante**: ni actor, ni colegio, ni rol. Los tres
-- los deriva `app.audit()` de la sesión (`auth.uid()`,
-- `app.current_school_id()`, `app.current_role()`).
--
-- Un envoltorio general que aceptara un `p_actor_id` del cliente convertiría el
-- audit_log en un cuaderno donde cualquier profesor puede firmar con el nombre
-- de otro. Un log que se puede falsificar no prueba nada, que es exactamente el
-- mismo razonamiento por el que 0011 hizo la tabla append-only.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. public.audit_staff_action(...) — envoltorio general de app.audit()
-- -----------------------------------------------------------------------------
-- `p_action` NO es texto libre. La lista blanca es el mismo criterio que 0014
-- aplicó a `p_op`: si el vocabulario del log lo pone el cliente, cualquier
-- miembro del personal puede escribir entradas con nombres inventados y
-- ensuciar la única prueba de lo que hace el staff. Añadir una acción nueva
-- cuesta una migración, y eso es deliberado: el vocabulario del registro
-- forense queda versionado igual que el esquema.
--
-- `p_entity_type` se valida contra las tablas que existen de verdad. La CHECK
-- `audit_log_entity_format` solo comprueba la FORMA del texto; una errata como
-- 'attempt_item' (en singular) la pasa y deja una entrada que el índice
-- `audit_log_entity_idx` nunca devolverá al investigar a ese alumno.
create or replace function public.audit_staff_action(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid  default null,
  p_before      jsonb default null,
  p_after       jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  -- Guarda explícita, además de la que ya tiene `app.audit()`. Se repite a
  -- propósito: este envoltorio es una puerta NUEVA a una tabla forense, y una
  -- puerta nueva se cierra por sí misma en vez de confiar en que la de dentro
  -- siga cerrada mañana.
  --
  -- `app.is_staff()` y `app.is_superadmin()` resuelven contra el perfil ACTIVO
  -- de `auth.uid()`, así que una sesión sin JWT (service_role, una conexión
  -- directa) tampoco pasa: para eso están los envoltorios de 0014 y 0019.
  if not (app.is_staff() or app.is_superadmin()) then
    raise exception 'Solo el personal del colegio escribe en el audit_log'
      using errcode = 'insufficient_privilege';
  end if;

  if p_action not in (
    -- attempts — lectura de clave y calificación manual
    'attempt.answer_key_viewed',
    'attempt.answer_key_denied',
    'attempt.graded_manually',
    'attempt.regraded',
    -- alumnos
    'student.created',
    'student.unlocked',
    -- solicitudes de alta
    'registration.approved',
    'registration.rejected'
  ) then
    raise exception 'audit_staff_action: acción no reconocida (%)', p_action
      using errcode   = 'invalid_parameter_value',
            hint      = 'El vocabulario del audit_log se amplía con una migración, no desde el cliente';
  end if;

  -- quote_ident evita que un `p_entity_type` con comillas resuelva a otra cosa.
  -- El identificador no se ejecuta: to_regclass solo RESUELVE un nombre.
  if pg_catalog.to_regclass('public.' || pg_catalog.quote_ident(p_entity_type)) is null then
    raise exception 'audit_staff_action: entity_type % no es una tabla de public', p_entity_type
      using errcode = 'invalid_parameter_value';
  end if;

  -- La identidad la pone `app.audit()` desde la sesión. Este envoltorio no
  -- tiene forma de decir quién es el actor ni siquiera queriendo: no recibe
  -- ese dato.
  v_id := app.audit(p_action, p_entity_type, p_entity_id, p_before, p_after);
  return v_id;
end;
$$;

comment on function public.audit_staff_action(text, text, uuid, jsonb, jsonb) is
  'Envoltorio público de app.audit() para la web. No acepta identidad del llamante: actor, rol y colegio los deriva el servidor de la sesión. Acción validada contra lista blanca.';

revoke all on function public.audit_staff_action(text, text, uuid, jsonb, jsonb)
  from public, anon;
-- Solo `authenticated`. `service_role` NO lo necesita: las Edge Functions ya
-- tienen sus dos envoltorios, y sin sesión la guarda de arriba lo rechazaría
-- igualmente. Dar un GRANT que siempre falla es peor que no darlo.
grant execute on function public.audit_staff_action(text, text, uuid, jsonb, jsonb)
  to authenticated;


-- -----------------------------------------------------------------------------
-- 2. public.attempt_item_answer_key(uuid) — el otro lado del mismo 406
-- -----------------------------------------------------------------------------
-- Sin esto, `revealAnswerKey()` devolvía "failed" siempre: el camino a la clave
-- de respuesta que documenta 0013 —el único que el staff tiene— no era
-- alcanzable desde la web.
--
-- Delega. NO reimplementa las comprobaciones: `app.attempt_item_answer_key`
-- comprueba rol Y tenant fila a fila, y duplicar esa lógica aquí sería crear
-- una segunda versión que puede divergir. La guarda de rol se repite porque es
-- barata y hace que el envoltorio no dependa de la de dentro; el tenant, que es
-- lo que sí puede divergir, se deja donde está.
create or replace function public.attempt_item_answer_key(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.is_staff() or app.is_superadmin()) then
    raise exception 'Solo el staff puede consultar la clave de un item'
      using errcode = 'insufficient_privilege';
  end if;

  return app.attempt_item_answer_key(p_item_id);
end;
$$;

comment on function public.attempt_item_answer_key(uuid) is
  'Envoltorio público de app.attempt_item_answer_key. Delega rol y tenant en la función de app; existe solo porque PostgREST no expone el esquema app.';

revoke all on function public.attempt_item_answer_key(uuid) from public, anon;
grant execute on function public.attempt_item_answer_key(uuid) to authenticated;


-- #############################################################################
-- Verificación en tiempo de migración
-- #############################################################################
-- Mismo bloque que cierra 0014. Si un `create or replace` de arriba se hubiera
-- dejado el `set search_path`, la migración no se aplica.
do $$
declare v_missing text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_missing
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('app', 'public')
    and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%'
    );
  if v_missing is not null then
    raise exception 'Funciones security definer SIN search_path: %', v_missing;
  end if;
end;
$$;

-- Ninguno de los dos envoltorios puede quedar al alcance de `anon`: uno escribe
-- en el registro forense y el otro devuelve claves de respuesta.
do $$
declare v_leak text;
begin
  select string_agg(f, ', ') into v_leak
  from unnest(array[
    'public.audit_staff_action(text, text, uuid, jsonb, jsonb)',
    'public.attempt_item_answer_key(uuid)'
  ]) f
  where has_function_privilege('anon', f, 'EXECUTE');
  if v_leak is not null then
    raise exception 'anon tiene EXECUTE sobre: %', v_leak;
  end if;
end;
$$;
