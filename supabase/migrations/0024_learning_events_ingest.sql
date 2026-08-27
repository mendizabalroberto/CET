-- =============================================================================
-- 0024_learning_events_ingest.sql — el alumno puede, por fin, escribir su
-- propia telemetría
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal. Todos los derechos reservados.
-- Contrato: DATA_MODEL §7 · VERIFICATION_PLAN M11
-- =============================================================================
-- EL FALLO, CON LA LÍNEA DE PRODUCCIÓN
-- -----------------------------------------------------------------------------
--   POST /api/events -> 500, cada 2-3 segundos, con backoff:
--   "[events] insert falló permission denied for table learning_events"
--
-- No es que el navegador no encolara nada (eso decía HANDOFF §3 y era una
-- conclusión equivocada): encola, envía y reintenta. Es la base de datos la que
-- rechaza el INSERT. Las 3 únicas filas de la tabla las escribieron Edge
-- Functions con `service_role`, que se salta los GRANT y por eso nadie lo vio.
--
-- LA CAUSA es una frontera rota entre dos piezas escritas por separado
-- (VERIFICATION_PLAN R3), y las dos declaran lo contrario de la otra:
--
--   · `0012_rls_policies.sql` dice: «Solo LECTURA para authenticated. La
--     ingesta va por Route Handler con service_role». Coherente con lo que
--     hizo: tres políticas de SELECT y ninguna de INSERT.
--   · `apps/web/src/app/api/events/route.ts` hace lo contrario —y con un buen
--     motivo: inserta con el cliente de SESIÓN para que la RLS sea la segunda
--     defensa si el handler se equivocara de alumno— y su comentario afirma que
--     «la política `student_writes_own` la rechazaría».
--
-- Esa política NUNCA existió. El comentario describe una defensa imaginaria.
--
-- Se conserva el diseño del Route Handler (insertar con la sesión del alumno,
-- no con service_role) porque es el más seguro de los dos: con service_role, un
-- fallo en el handler escribe en nombre de cualquiera y no hay nada detrás. Lo
-- que se añade aquí es la defensa que faltaba.
--
-- -----------------------------------------------------------------------------
-- QUÉ HACEN FALTA EXACTAMENTE TRES COSAS, COMPROBADO CONTRA PRODUCCIÓN
-- -----------------------------------------------------------------------------
-- Reproducido el 27/08/2026 en una transacción revertida, suplantando al alumno
-- real de producción con `set local role authenticated`:
--
--   [estado actual]              42501 :: permission denied for table learning_events
--   [+ grant insert]             42501 :: permission denied for sequence learning_events_id_seq
--   [+ grant insert + política]  42501 :: permission denied for sequence learning_events_id_seq
--   [+ los dos grants, sin política]
--                                42501 :: new row violates row-level security policy
--   [los tres]                   INSERT OK, la fila aterriza en learning_events_2026_08
--
-- O sea: NO basta con el GRANT. La secuencia es un segundo permiso —`id` lleva
-- `default nextval(...)` y 0013 retiró todas las secuencias de `public` a
-- `authenticated`— y la política de INSERT es un tercero. Arreglar uno solo deja
-- el 500 exactamente igual, con otro mensaje.
--
-- -----------------------------------------------------------------------------
-- LAS PARTICIONES: POR QUÉ ESTO NO SE ROMPE SOLO EL MES QUE VIENE
-- -----------------------------------------------------------------------------
-- `learning_events` está particionada por rango sobre `server_ts`, así que la
-- pregunta obligada es si el arreglo sobrevive a la partición del mes próximo.
-- Sobrevive, y está comprobado, no razonado: en la prueba de arriba la fila
-- entró por el padre y aterrizó en `learning_events_2026_08`, cuya ACL es
-- `{postgres=...,service_role=...}` — sin una sola letra para `authenticated`.
--
-- Postgres comprueba los privilegios de LA TABLA NOMBRADA en la sentencia. El
-- enrutado a la partición no vuelve a comprobar nada, y las políticas que se
-- evalúan son las del padre. Por eso `app.create_learning_events_partition()`
-- puede seguir haciendo lo que hace —RLS activada y `revoke all ... from anon,
-- authenticated`— sin que las particiones futuras necesiten tocarse.
--
-- Y ese revoke sigue haciendo falta: cierra la OTRA puerta, la del
-- `insert/select into learning_events_2026_08` directo, que sí se regiría por
-- la RLS de la partición. Comprobado también: 42501, permission denied.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. El GRANT que faltaba — INSERT, y solo INSERT
-- -----------------------------------------------------------------------------
-- Nada de UPDATE ni DELETE: `learning_events` es append-only (0010 le puso un
-- trigger que bloquea el UPDATE incluso a service_role). Un alumno que pudiera
-- reescribir sus propios eventos podría maquillar sus horas de estudio, que es
-- justo el dato que el informe para el tutor va a afirmar.
grant insert on public.learning_events to authenticated;

-- El segundo permiso, el que no se ve. `id` es `default nextval(...)` y 0013
-- hizo `revoke all on all sequences in schema public from anon, authenticated`.
-- USAGE es lo mínimo: permite nextval y currval, no setval.
grant usage on sequence public.learning_events_id_seq to authenticated;


-- -----------------------------------------------------------------------------
-- 2. La política que el Route Handler creía que ya existía
-- -----------------------------------------------------------------------------
-- Las tres condiciones son el contrato de `/api/events` escrito en la base de
-- datos, para que siga siendo cierto aunque el handler se equivoque:
--
--   · `student_id = auth.uid()` — solo eventos PROPIOS. Es la línea que impide
--     falsear las horas de práctica de un compañero o envenenar su mastery.
--   · `school_id = app.current_school_id()` — y solo en el colegio propio. Para
--     un superadmin vale NULL, así que tampoco puede inyectar (no debe: esta
--     tabla es telemetría de alumno).
--   · `current_role() = 'student'` — la telemetría de aprendizaje es de
--     alumnos. El handler ya devuelve 204 al staff sin insertar; esto es que la
--     regla exista también donde no se puede saltar.
--
-- `(select ...)` alrededor de cada función: initplan evaluado UNA vez por
-- sentencia y no una vez por fila. Con lotes de hasta 100 eventos, la
-- diferencia es 3 llamadas contra 300 (mismo patrón que el resto de 0012).
create policy learning_events_insert_own on public.learning_events
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and school_id = (select app.current_school_id())
    and (select app.current_role()) = 'student'
  );

comment on policy learning_events_insert_own on public.learning_events is
  'Un alumno solo inserta eventos SUYOS y de SU colegio. La segunda defensa de /api/events, que deriva ambos de la sesión.';


-- #############################################################################
-- Verificación en tiempo de migración
-- #############################################################################
-- Lo que esta migración NO debe haber hecho: abrir las particiones. Si alguien
-- «arregla» un día el insert concediendo privilegios partición a partición,
-- esto lo para aquí en vez de descubrirlo dentro de seis meses.
do $$
declare v_abiertas text;
begin
  select string_agg(c.relname, ', ') into v_abiertas
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_inherits i on i.inhrelid = c.oid
  where n.nspname = 'public'
    and i.inhparent = 'public.learning_events'::regclass
    and (has_table_privilege('authenticated', c.oid, 'INSERT')
      or has_table_privilege('authenticated', c.oid, 'SELECT')
      or has_table_privilege('anon', c.oid, 'INSERT')
      or has_table_privilege('anon', c.oid, 'SELECT'));
  if v_abiertas is not null then
    raise exception 'Particiones de learning_events accesibles directamente: %', v_abiertas;
  end if;
end;
$$;

-- Y lo que sí debe haber hecho, las tres piezas juntas. Las tres o ninguna:
-- con dos de las tres, /api/events sigue devolviendo 500 con otro mensaje.
do $$
begin
  if not has_table_privilege('authenticated', 'public.learning_events', 'INSERT') then
    raise exception 'authenticated no tiene INSERT sobre learning_events';
  end if;
  if not has_sequence_privilege('authenticated', 'public.learning_events_id_seq', 'USAGE') then
    raise exception 'authenticated no tiene USAGE sobre learning_events_id_seq: el default nextval fallará';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_policy
    where polrelid = 'public.learning_events'::regclass
      and polname = 'learning_events_insert_own'
      and polcmd = 'a'
  ) then
    raise exception 'Falta la política de INSERT learning_events_insert_own';
  end if;
  -- El append-only no se negocia: si esta migración concediera UPDATE o DELETE
  -- por descuido, la tabla dejaría de ser un registro.
  if has_table_privilege('authenticated', 'public.learning_events', 'UPDATE')
     or has_table_privilege('authenticated', 'public.learning_events', 'DELETE') then
    raise exception 'learning_events ha dejado de ser append-only para authenticated';
  end if;
end;
$$;
