-- =============================================================================
-- informes_alcanzables.sql — un informe que la web no puede llamar no existe
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- QUE FAMILIA CAZA ESTE FICHERO
--
-- PostgREST de este proyecto expone UNICAMENTE `public` y `graphql_public`.
-- Una funcion en `app` se puede escribir, probar y dar por terminada sin que
-- nada avise de que la aplicacion no puede invocarla: `.schema("app").rpc(...)`
-- devuelve 406 PGRST106 «Invalid schema: app».
--
-- Ha pasado DOS veces en este repositorio:
--   - 27/08/2026, `app.audit()`: ninguna accion de personal hecha desde la web
--     llegaba a `audit_log`. Lo arreglo 0023 con un envoltorio publico.
--   - 28/08/2026, los ocho informes: la capa entera —probada, con guardian y
--     con 53 asserts en verde— era inalcanzable. Se descubrio al ir a escribir
--     la pantalla, no antes.
--
-- Dos veces es una familia, no una casualidad. Este fichero la cierra: no
-- comprueba una funcion concreta, sino que NINGUNA funcion de informe se quede
-- sin envoltorio. La tercera vez tiene que salir roja aqui.
-- =============================================================================
begin;
select plan(6);

\ir ../migrations/0062_informes_series.sql
\ir ../migrations/0063_public_informes_wrapper.sql

-- -----------------------------------------------------------------------------
-- A. Toda funcion de informe de `app` tiene su gemela en `public`
-- -----------------------------------------------------------------------------
-- La lista NO se escribe a mano: se deriva del catalogo. Una funcion nueva en
-- `app` entra sola en esta comprobacion, que es justo lo que un test escrito a
-- mano no haria.
--
-- `metricas_bruto` se excluye A PROPOSITO y con nombre: no lleva guardian, asi
-- que publicarla dejaria leer las metricas de cualquier menor. Que la excepcion
-- este escrita aqui obliga a justificar la siguiente.
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '(ninguna)')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
      and p.proname like 'informe_alumno%'
      and p.proname <> 'informe_alumno_metricas_bruto'
      and not exists (
        select 1 from pg_proc w
        join pg_namespace wn on wn.oid = w.pronamespace
        where wn.nspname = 'public' and w.proname = p.proname)),
  '(ninguna)',
  'ninguna funcion de informe se queda sin envoltorio en public');

-- -----------------------------------------------------------------------------
-- B. El envoltorio no relaja los permisos
-- -----------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '(ninguna)')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'informe_alumno%'
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or p.proacl is null)),
  '(ninguna)',
  'ningun envoltorio es ejecutable por anon (proacl null tambien cuenta: el ACL por defecto INCLUYE a PUBLIC)');

select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '(ninguna)')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'informe_alumno%'
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  '(ninguna)',
  'todos los envoltorios los puede ejecutar authenticated, que es quien los va a llamar');

-- -----------------------------------------------------------------------------
-- C. El auxiliar sin guardian NO se publica
-- -----------------------------------------------------------------------------
-- Control positivo de la excepcion de arriba: si alguien "completa" la lista
-- envolviendo tambien `metricas_bruto`, esto se pone rojo.
select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'informe_alumno_metricas_bruto'),
  0,
  'el auxiliar sin guardian NO tiene envoltorio publico');

-- -----------------------------------------------------------------------------
-- D. El envoltorio devuelve lo mismo que la funcion de verdad
-- -----------------------------------------------------------------------------
-- Un envoltorio que compile pero devuelva otra cosa seria peor que no tenerlo.
\ir helpers/fixture.psql

-- Con sesion de profesor del colegio del alumno: el guardian salta tambien para
-- la sesion de pruebas, que no es nadie reconocido. Sin esto el fichero aborta
-- entero con «No tienes permiso para ver el informe de este alumno», que es el
-- guardian haciendo su trabajo, no un fallo del envoltorio.
select pg_temp.login_as('aaaaaaaa-0000-4000-8000-00000000002a');

select is(
  (select r.minutos_estudio from public.informe_alumno_resumen(
     'aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '30 days', now()) r),
  (select r.minutos_estudio from app.informe_alumno_resumen(
     'aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '30 days', now()) r),
  'el envoltorio de resumen devuelve exactamente lo que devuelve app');

-- -----------------------------------------------------------------------------
-- E. El guardian sigue vivo a traves del envoltorio
-- -----------------------------------------------------------------------------
-- Lo que se publica es el camino, no el permiso. Si el envoltorio se saltara la
-- comprobacion, cualquier usuario autenticado leeria los datos de cualquier
-- menor — y el envoltorio es `security definer`, asi que correria como dueno.
select pg_temp.login_as('bbbbbbbb-0000-4000-8000-00000000002b');

select throws_ok(
  $$select * from public.informe_alumno_resumen(
      'aaaaaaaa-0000-4000-8000-00000000003a', now() - interval '30 days', now())$$,
  null,
  null,
  'un profesor de OTRO colegio no puede leer el informe por el camino publico');

select * from finish();
rollback;
