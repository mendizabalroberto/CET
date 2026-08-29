-- =============================================================================
-- 0063_public_informes_wrapper.sql — los informes, alcanzables desde la web
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- EL FALLO
--
-- Las ocho funciones de informe viven en el esquema `app` (cinco de 0053, tres
-- de 0062). PostgREST de este proyecto expone UNICAMENTE `public` y
-- `graphql_public`: llamarlas con .schema("app").rpc(...) devuelve
--
--   406 PGRST106 · Invalid schema: app
--
-- Es decir: la capa de informes estaba entera, probada y con guardian, y la
-- aplicacion no podia invocar ni una. No se noto porque ninguna pantalla lo
-- habia intentado: el motor de informes se escribio antes que su pantalla, y
-- entre medias nadie comprobo que el camino existiera.
--
-- Es el mismo fallo de 0023, que dejo sin registrar en `audit_log` toda accion
-- de personal hecha desde la web. Aquel se descubrio por un console.error que
-- nadie leia; este, al ir a escribir la pantalla. Ver la cabecera de
-- apps/web/src/components/staff/audit-rpc.ts.
--
-- POR QUE ENVOLTORIO Y NO MOVER LAS FUNCIONES A `public`
--
-- `app` es superficie privada por contrato. Mover los informes publicaria
-- tambien sus auxiliares, y app.informe_alumno_metricas_bruto NO lleva
-- guardian: leeria las metricas de cualquier menor. El envoltorio deja pasar
-- exactamente lo que se quiere publicar, y nada mas.
--
-- POR QUE NO COMPRUEBAN PERMISOS AQUI
--
-- Cada envoltorio delega en la funcion de `app`, que ya llama a
-- app.puede_ver_informe() como primera linea. Repetir la comprobacion aqui
-- seria una segunda copia de la regla de acceso a datos de menores, y dos
-- copias divergen. La de `app` es la de verdad.
--
-- `security definer` con search_path vacio lo exige
-- supabase/tests/public_rpc_surface.sql para toda funcion de esta superficie.
-- El revoke ... from public, anon no es ceremonia: el ACL por defecto de una
-- funcion en Postgres YA INCLUYE execute para PUBLIC, asi que sin el revoke
-- cualquier anonimo podria invocarlas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Resumen — las cifras de cabecera del scorecard
-- -----------------------------------------------------------------------------
create or replace function public.informe_alumno_resumen(
  p_student_id uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (
  minutos_estudio numeric, sesiones integer, lecciones_abiertas integer,
  lecciones_completadas integer, items_respondidos integer,
  porcentaje_acierto numeric, examenes_entregados integer,
  pistas_pedidas integer, racha_maxima integer)
language sql stable security definer set search_path = ''
as 'select * from app.informe_alumno_resumen($1, $2, $3)';

revoke all on function public.informe_alumno_resumen(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.informe_alumno_resumen(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2 · Skills — areas fortalecidas y flojas
-- -----------------------------------------------------------------------------
create or replace function public.informe_alumno_skills(
  p_student_id uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (skill_id uuid, nombre_skill jsonb, mastery numeric)
language sql stable security definer set search_path = ''
as 'select * from app.informe_alumno_skills($1, $2, $3)';

revoke all on function public.informe_alumno_skills(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.informe_alumno_skills(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3 · Habitos — donde vive la medida del esfuerzo
-- -----------------------------------------------------------------------------
create or replace function public.informe_alumno_habitos(
  p_student_id uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (
  hora_pico integer, dia_pico integer, eventos_hora_pico integer,
  eventos_dia_pico integer, tiempo_medio_item_ms numeric, tasa_idle numeric,
  tasa_focus_lost_por_hora numeric, media_change_count numeric,
  proporcion_items_con_pista numeric)
language sql stable security definer set search_path = ''
as 'select * from app.informe_alumno_habitos($1, $2, $3)';

revoke all on function public.informe_alumno_habitos(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.informe_alumno_habitos(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4 · Botones — que toca y cuanto tarda
-- -----------------------------------------------------------------------------
create or replace function public.informe_alumno_botones(
  p_student_id uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (tipo text, clave text, cuenta integer, mediana_ms numeric)
language sql stable security definer set search_path = ''
as 'select * from app.informe_alumno_botones($1, $2, $3)';

revoke all on function public.informe_alumno_botones(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.informe_alumno_botones(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5 · Secuencia — el detalle de UNA sesion. Firma distinta a proposito.
-- -----------------------------------------------------------------------------
create or replace function public.informe_alumno_secuencia(p_session_id uuid)
returns table (
  seq integer, event_type public.learning_event_type, payload jsonb,
  server_ts timestamptz, ms_desde_anterior bigint)
language sql stable security definer set search_path = ''
as 'select * from app.informe_alumno_secuencia($1)';

revoke all on function public.informe_alumno_secuencia(uuid) from public, anon;
grant execute on function public.informe_alumno_secuencia(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6 · Serie diaria — la grafica de constancia (0062)
-- -----------------------------------------------------------------------------
create or replace function public.informe_alumno_serie_diaria(
  p_student_id uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (fecha date, minutos_estudio numeric, sesiones integer)
language sql stable security definer set search_path = ''
as 'select * from app.informe_alumno_serie_diaria($1, $2, $3)';

revoke all on function public.informe_alumno_serie_diaria(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.informe_alumno_serie_diaria(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7 · Tiempo por leccion — donde se concentra el esfuerzo (0062)
-- -----------------------------------------------------------------------------
create or replace function public.informe_alumno_tiempo_por_leccion(
  p_student_id uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (leccion_id uuid, minutos numeric, visitas integer, aperturas integer)
language sql stable security definer set search_path = ''
as 'select * from app.informe_alumno_tiempo_por_leccion($1, $2, $3)';

revoke all on function public.informe_alumno_tiempo_por_leccion(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.informe_alumno_tiempo_por_leccion(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8 · Cohorte — el alumno frente a su clase (0062)
-- -----------------------------------------------------------------------------
create or replace function public.informe_alumno_cohorte(
  p_student_id uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (
  metrica text, valor_alumno numeric, media_cohorte numeric, tamano_cohorte integer)
language sql stable security definer set search_path = ''
as 'select * from app.informe_alumno_cohorte($1, $2, $3)';

revoke all on function public.informe_alumno_cohorte(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.informe_alumno_cohorte(uuid, timestamptz, timestamptz) to authenticated, service_role;
