-- =============================================================================
-- accesos_de_alumno.sql — pgTAP de 0078_registro_de_accesos.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: docs/superpowers/specs/2026-09-01-registro-de-accesos-de-alumno-design.md §8
-- =============================================================================
-- `accesos_de_alumno` guarda la IP EN CLARO y SIN CADUCIDAD de un menor. La
-- unica compensacion que el diseño acepta no es la retencion: es el control de
-- acceso. Si `ip`, `ip_hash` o `user_agent` se colaran alguna vez en el grant de
-- `authenticated`, un XSS en el panel del tutor exfiltraria el historial de
-- ubicacion de un niño y nadie se enteraria — la tabla seguiria «funcionando».
--
-- Por eso la parte A se prueba con `has_column_privilege()` y no con un SELECT:
-- es la capa 0 de `rls_answer_key_hidden.sql`. Un `revoke select (ip) ... from
-- authenticated` NO retira nada si el rol conserva el SELECT de tabla, y ese
-- error se lee igual de bien que el codigo correcto. Solo el catalogo lo canta.
-- La parte C repite lo mismo contra la base, con sesion de verdad, porque un
-- privilegio correcto y una politica rota siguen siendo una fuga.
-- =============================================================================
begin;
select plan(41);

\ir helpers/fixture.psql

-- -----------------------------------------------------------------------------
-- Una tutora, su hija, y un niño que no es suyo
-- -----------------------------------------------------------------------------
-- El fixture compartido no trae tutores: monta dos colegios. La cadena que
-- prueba este fichero —enlace, dispositivo, acceso— es la del hijo de tutor,
-- que no tiene colegio ninguno.
insert into auth.users (id, email) values
  ('cccccccc-0000-4000-8000-000000000001', 'tutora.accesos@cet.test'),
  ('cccccccc-0000-4000-8000-000000000002', 'h.accesos@familia.cet.invalid'),
  ('cccccccc-0000-4000-8000-000000000003', 'x.accesos@familia.cet.invalid');

insert into public.profiles (id, school_id, role, full_name, email, status) values
  ('cccccccc-0000-4000-8000-000000000001', null, 'guardian', 'Tutora Accesos',
   'tutora.accesos@cet.test', 'active');

insert into public.profiles (id, school_id, role, full_name, status) values
  ('cccccccc-0000-4000-8000-000000000002', null, 'student', 'Hija De Tutora', 'active'),
  ('cccccccc-0000-4000-8000-000000000003', null, 'student', 'Nino Ajeno', 'active');

insert into public.guardian_students (guardian_id, student_id) values
  ('cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002');

-- Los enlaces de un solo uso, con la IP desde la que los genero la tutora. Es
-- el lado izquierdo de la comparacion de `canje_fuera_de_red`. Hay uno IPv4 y
-- uno IPv6 porque la mascara no es la misma en las dos familias.
insert into public.student_access_links
  (id, token_hash, student_id, created_by, expires_at, creado_desde_ip)
values
  ('dddddddd-0000-4000-8000-000000000001', 'hash-enlace-ipv4-accesos',
   'cccccccc-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000001',
   now() + interval '7 days', '203.0.113.10'),
  ('dddddddd-0000-4000-8000-000000000006', 'hash-enlace-ipv6-accesos',
   'cccccccc-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000001',
   now() + interval '7 days', '2001:db8:1:1::1');

-- Cuatro dispositivos, uno por escenario, para que ninguna prueba dependa del
-- rastro que dejo la anterior.
insert into public.student_devices
  (id, student_id, device_hash, agente_familia, created_from_link)
values
  ('eeeeeeee-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002',
   'device-hash-accesos-1', 'Chrome en Android', 'dddddddd-0000-4000-8000-000000000001'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002',
   'device-hash-accesos-2', 'Chrome en Android', 'dddddddd-0000-4000-8000-000000000001'),
  ('eeeeeeee-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000002',
   'device-hash-accesos-3', 'Safari en iPad', null),
  ('eeeeeeee-0000-4000-8000-000000000006', 'cccccccc-0000-4000-8000-000000000002',
   'device-hash-accesos-6', 'Chrome en Android', 'dddddddd-0000-4000-8000-000000000006');

-- Llamar a la funcion y leer las señales de la fila que acaba de escribir tiene
-- que hacerse en DOS sentencias. En una sola —un CTE que llama a la funcion y
-- se une despues con la tabla— el SELECT usa la instantanea del inicio de la
-- sentencia y NO ve la fila recien insertada: el test daria «sin señales»
-- siempre, y pasaria por bueno cualquier bug de deteccion.
create or replace function pg_temp.senales_de(
  p_student uuid, p_device uuid, p_tipo public.acceso_tipo,
  p_ip inet, p_pais text default null, p_origen text default 'edge')
returns text[] language plpgsql as $fn$
declare
  v_id bigint;
  v    text[];
begin
  v_id := app.registrar_acceso(
    p_student, p_device, p_tipo, p_ip, null, p_pais, null, null, null, null, p_origen);
  select a.senales into v from public.accesos_de_alumno a where a.id = v_id;
  return v;
end $fn$;

-- =============================================================================
-- A · EL GRANT POR COLUMNA — la capa que ninguna politica puede desandar
-- =============================================================================
-- Puntos 1, 2 y 5 de §8, medidos en el catalogo.
select ok(
  not has_column_privilege('authenticated', 'public.accesos_de_alumno', 'ip', 'SELECT'),
  'authenticated NO tiene privilegio SELECT sobre accesos_de_alumno.ip');

select ok(
  not has_column_privilege('authenticated', 'public.accesos_de_alumno', 'ip_hash', 'SELECT'),
  'authenticated NO tiene privilegio SELECT sobre accesos_de_alumno.ip_hash');

select ok(
  not has_column_privilege('authenticated', 'public.accesos_de_alumno', 'user_agent', 'SELECT'),
  'authenticated NO tiene privilegio SELECT sobre accesos_de_alumno.user_agent '
  '(el user-agent entero de un menor es una huella digital)');

select ok(
  has_column_privilege('authenticated', 'public.accesos_de_alumno', 'pais', 'SELECT'),
  'el tutor SI lee el pais: sin eso no puede reconocer un acceso raro');

select ok(
  has_column_privilege('authenticated', 'public.accesos_de_alumno', 'ciudad', 'SELECT'),
  'el tutor SI lee la ciudad');

select ok(
  has_column_privilege('authenticated', 'public.accesos_de_alumno', 'agente_familia', 'SELECT'),
  'el tutor SI lee "Chrome en Android": es lo que le permite revocar el aparato');

-- 0088 abrio zona_horaria y dejo fuera las coordenadas, y la diferencia no es
-- de sensibilidad sino de APARIENCIA: unas coordenadas con seis decimales en
-- una pantalla se leen como la direccion de un niño, cuando son el centroide de
-- su ciudad. La zona horaria no localiza a nadie —media America comparte la
-- misma— y es lo unico que permite pintar las horas de un informe en la del
-- alumno en vez de en UTC.
select ok(
  not has_column_privilege('authenticated', 'public.accesos_de_alumno', 'latitud', 'SELECT'),
  'authenticated NO lee latitud: aparenta una precision que el dato no tiene');

select ok(
  not has_column_privilege('authenticated', 'public.accesos_de_alumno', 'longitud', 'SELECT'),
  'authenticated NO lee longitud, por el mismo motivo que la latitud');

select ok(
  has_column_privilege('authenticated', 'public.accesos_de_alumno', 'zona_horaria', 'SELECT'),
  'zona_horaria SI: no localiza a nadie y es lo que pone las horas en la del alumno');

select ok(
  not has_table_privilege('authenticated', 'public.accesos_de_alumno', 'INSERT'),
  'authenticated NO tiene INSERT: nadie fabrica su propio rastro');

select ok(
  not has_table_privilege('authenticated', 'public.accesos_de_alumno', 'UPDATE'),
  'authenticated NO tiene UPDATE: nadie reescribe el rastro que ya existe');

select ok(
  not has_table_privilege('authenticated', 'public.accesos_de_alumno', 'DELETE'),
  'authenticated NO tiene DELETE: un registro forense que la victima puede '
  'borrar no prueba nada');

select ok(
  not has_table_privilege('anon', 'public.accesos_de_alumno', 'SELECT'),
  'anon no alcanza la tabla en absoluto');

-- 0057 dio SELECT de TABLA sobre student_access_links, y un grant de tabla
-- alcanza tambien a las columnas añadidas despues. Sin bajarlo a grant por
-- columna, la IP de la tutora viajaria al navegador con cada enlace.
select ok(
  not has_column_privilege('authenticated', 'public.student_access_links',
                           'creado_desde_ip', 'SELECT'),
  'authenticated NO lee la IP desde la que se genero el enlace');

-- =============================================================================
-- B · LAS FUNCIONES — quien puede escribir un acceso
-- =============================================================================
select ok(
  exists (select 1 from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'app' and p.proname = 'registrar_acceso'),
  'existe app.registrar_acceso: insertar y evaluar son la misma operacion');

-- PostgREST solo sirve `public`; desde `app` responde 406/PGRST106. Es el fallo
-- de 0023, 0063 y 0077.
select ok(
  exists (select 1 from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'registrar_acceso'),
  'existe el envoltorio public.registrar_acceso, alcanzable por PostgREST');

select ok(
  not has_function_privilege('authenticated',
    'public.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text, numeric, numeric, text)',
    'EXECUTE'),
  'authenticated NO ejecuta el envoltorio: acepta p_student_id, y con el un '
  'alumno fabricaria el rastro de otro');

select ok(
  not has_function_privilege('anon',
    'public.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text, numeric, numeric, text)',
    'EXECUTE'),
  'anon tampoco: el ACL por defecto de una funcion incluye PUBLIC, y sin el '
  'revoke explicito estaria abierta');

select ok(
  not has_function_privilege('authenticated',
    'app.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text, numeric, numeric, text)',
    'EXECUTE'),
  'authenticated tampoco alcanza la de `app` por la puerta de atras');

select ok(
  has_function_privilege('service_role',
    'public.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text, numeric, numeric, text)',
    'EXECUTE'),
  'service_role SI la ejecuta: es quien escribe desde la web y desde auth-pin');

-- =============================================================================
-- C · LA LECTURA REAL, CON SESION — puntos 1 a 5 de §8 contra la base
-- =============================================================================
-- Una fila por alumno, escrita a mano y no por registrar_acceso, para que las
-- señales no entren en la ecuacion de esta parte.
insert into public.accesos_de_alumno
  (student_id, device_id, tipo, ip, ip_hash, pais, region, ciudad,
   agente_familia, user_agent, origen)
values
  ('cccccccc-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000001',
   'login_ok', '203.0.113.10', 'hash-ip-de-la-hija', 'ES', 'Madrid', 'Madrid',
   'Chrome en Android', 'Mozilla/5.0 (Linux; Android 14) Chrome/127', 'web'),
  ('cccccccc-0000-4000-8000-000000000003', null,
   'login_ok', '198.51.100.1', 'hash-ip-ajena', 'PT', 'Lisboa', 'Lisboa',
   'Safari en iPhone', 'Mozilla/5.0 (iPhone) Safari/605', 'edge');

select pg_temp.login_as('cccccccc-0000-4000-8000-000000000001');

select is(
  pg_temp.errcode_of('select ip from public.accesos_de_alumno'),
  '42501',
  'la tutora pide la ip de su propia hija y se lleva un 42501');

select is(
  pg_temp.errcode_of('select ip_hash from public.accesos_de_alumno'),
  '42501',
  'tampoco el ip_hash: comparar sin leer es cosa del servidor');

select is(
  pg_temp.errcode_of('select user_agent from public.accesos_de_alumno'),
  '42501',
  'tampoco el user_agent completo');

select is(
  pg_temp.visible_count(
    $$select count(*)::int from public.accesos_de_alumno
      where student_id = 'cccccccc-0000-4000-8000-000000000002'$$),
  1,
  'la tutora SI ve la fila de su hija');

select is(
  (select pais from public.accesos_de_alumno
    where student_id = 'cccccccc-0000-4000-8000-000000000002'),
  'ES',
  'y lee su pais');

select is(
  (select ciudad from public.accesos_de_alumno
    where student_id = 'cccccccc-0000-4000-8000-000000000002'),
  'Madrid',
  'y su ciudad');

select is(
  (select agente_familia from public.accesos_de_alumno
    where student_id = 'cccccccc-0000-4000-8000-000000000002'),
  'Chrome en Android',
  'y "Chrome en Android", que es cuanto necesita para revocar el aparato');

select is(
  pg_temp.visible_count(
    $$select count(*)::int from public.accesos_de_alumno
      where student_id = 'cccccccc-0000-4000-8000-000000000003'$$),
  0,
  'la tutora no ve NI UNA fila de un niño que no es suyo');

-- -1 = ni siquiera hay GRANT. Distinto de 0, que seria «la RLS lo filtro».
select is(
  pg_temp.affected(
    $$insert into public.accesos_de_alumno (student_id, tipo, origen)
      values ('cccccccc-0000-4000-8000-000000000002', 'login_ok', 'web')$$),
  -1,
  'la tutora no puede insertar un acceso: no es que la politica lo filtre, es '
  'que el privilegio no existe');

select pg_temp.logout();

-- El caso que mas se olvida: el propio alumno. Es quien tiene la sesion abierta
-- en el aparato que un atacante ya controla.
select pg_temp.login_as('cccccccc-0000-4000-8000-000000000002');

select is(
  pg_temp.errcode_of('select ip from public.accesos_de_alumno'),
  '42501',
  'el propio alumno TAMPOCO alcanza su ip');

select is(
  pg_temp.visible_count($$select count(*)::int from public.accesos_de_alumno$$),
  1,
  'el alumno ve su propia fila y solo la suya');

select pg_temp.logout();

-- =============================================================================
-- D · LAS CUATRO REGLAS — punto 6 de §8: dispara y no dispara
-- =============================================================================
-- Las siembras van en bloques DO y no en un SELECT suelto por dos razones: no
-- devuelven filas —una fila suelta en medio de la salida TAP es ruido— y, sobre
-- todo, quedan como SENTENCIAS SEPARADAS de la que evalua. Meter siembra y
-- comprobacion en la misma sentencia devuelve el problema de la instantanea.

-- canje_fuera_de_red · el enlace lo genero la tutora desde 203.0.113.10.
select ok(
  'canje_fuera_de_red' = any(pg_temp.senales_de(
    'cccccccc-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000002',
    'enlace_canjeado', '198.51.100.7', 'ES', 'web')),
  'canjear el enlace desde otra /24 dispara canje_fuera_de_red');

select ok(
  not ('canje_fuera_de_red' = any(pg_temp.senales_de(
    'cccccccc-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000002',
    'enlace_canjeado', '203.0.113.99', 'ES', 'web'))),
  'canjearlo desde la MISMA /24 no dispara: la niña abrio el enlace en casa');

-- salto_de_pais · 12 h absorben un vuelo y una VPN torpe.
do $$ begin perform pg_temp.senales_de(
  'aaaaaaaa-0000-4000-8000-00000000003a', null, 'login_ok', '203.0.113.1', 'ES'); end $$;

select ok(
  'salto_de_pais' = any(pg_temp.senales_de(
    'aaaaaaaa-0000-4000-8000-00000000003a', null, 'login_ok', '198.51.100.9', 'FR')),
  'dos accesos del mismo alumno desde paises distintos en menos de 12 h '
  'disparan salto_de_pais');

do $$ begin perform pg_temp.senales_de(
  'aaaaaaaa-0000-4000-8000-00000000004a', null, 'login_ok', '203.0.113.2', 'ES'); end $$;

select ok(
  not ('salto_de_pais' = any(pg_temp.senales_de(
    'aaaaaaaa-0000-4000-8000-00000000004a', null, 'login_ok', '198.51.100.8', 'ES'))),
  'dos accesos desde el MISMO pais no disparan salto_de_pais');

-- ip_multicuenta · mas de 3 alumnos distintos en 24 h. Tres hermanos en una
-- casa comparten IP y no son una señal; el cuarto ya merece una mirada.
do $$
begin
  perform pg_temp.senales_de('cccccccc-0000-4000-8000-000000000002', null, 'login_ok', '192.0.2.50', 'ES');
  perform pg_temp.senales_de('cccccccc-0000-4000-8000-000000000003', null, 'login_ok', '192.0.2.50', 'ES');
  perform pg_temp.senales_de('aaaaaaaa-0000-4000-8000-00000000003a', null, 'login_ok', '192.0.2.50', 'ES');
end $$;

select ok(
  'ip_multicuenta' = any(pg_temp.senales_de(
    'bbbbbbbb-0000-4000-8000-00000000003b', null, 'login_ok', '192.0.2.50', 'ES')),
  'el CUARTO alumno distinto en la misma IP en 24 h dispara ip_multicuenta');

do $$
begin
  perform pg_temp.senales_de('cccccccc-0000-4000-8000-000000000002', null, 'login_ok', '192.0.2.60', 'ES');
  perform pg_temp.senales_de('cccccccc-0000-4000-8000-000000000003', null, 'login_ok', '192.0.2.60', 'ES');
end $$;

select ok(
  not ('ip_multicuenta' = any(pg_temp.senales_de(
    'aaaaaaaa-0000-4000-8000-00000000003a', null, 'login_ok', '192.0.2.60', 'ES'))),
  'tres hermanos en la misma IP no disparan ip_multicuenta');

-- dispositivo_nuevo · ruido cero, valor alto.
select ok(
  'dispositivo_nuevo' = any(pg_temp.senales_de(
    'cccccccc-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000003',
    'login_ok', '203.0.113.70', 'ES')),
  'el primer acceso de un dispositivo dispara dispositivo_nuevo');

select ok(
  not ('dispositivo_nuevo' = any(pg_temp.senales_de(
    'cccccccc-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000003',
    'login_ok', '203.0.113.70', 'ES'))),
  'el segundo acceso del MISMO dispositivo ya no la dispara');

-- IPv6 · el diseño escribio «/24», que es una mascara IPv4. Sobre IPv6 recorta
-- 24 de 128 bits y mete a medio continente en la misma «red»: la señal no
-- dispararia jamas contra un canje por IPv6, que en movil es ya lo normal. La
-- migracion usa /64, la subred que un ISP asigna a UNA linea. Estos dos asserts
-- son lo que impide que alguien «simplifique» eso mas adelante.
select ok(
  not ('canje_fuera_de_red' = any(pg_temp.senales_de(
    'cccccccc-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000006',
    'enlace_canjeado', '2001:db8:1:1::99', 'ES', 'web'))),
  'IPv6 dentro de la misma /64 no dispara: es la misma linea de casa');

select ok(
  'canje_fuera_de_red' = any(pg_temp.senales_de(
    'cccccccc-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000006',
    'enlace_canjeado', '2001:db8:1:2::1', 'ES', 'web')),
  'IPv6 en otra /64 SI dispara: con /24 esta señal no habria saltado nunca');

select * from finish();
rollback;
