-- =============================================================================
-- 0025_superadmin_sin_colegio.sql — el superadmin puede hacer lo que la
-- aplicación le deja intentar
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal. Todos los derechos reservados.
-- Contrato: 0012_rls_policies.sql · 0004_app_helpers.sql · VERIFICATION_PLAN M03/M09/M12
-- =============================================================================
-- ESTA MIGRACIÓN NO SE HA APLICADO A PRODUCCIÓN. La aplica el usuario.
--
-- -----------------------------------------------------------------------------
-- EL FALLO, Y POR QUÉ NO ES EL QUE PARECE
-- -----------------------------------------------------------------------------
-- Buscando por qué el alta pública no escribía nada apareció el otro extremo de
-- la misma tabla: el superadmin no puede resolver una solicitud. Y al tirar del
-- hilo, no es una tabla: es un patrón repetido doce veces.
--
-- Toda política de escritura del personal en `0012` tiene esta forma:
--
--     school_id = (select app.current_school_id())  AND  <predicado de rol>
--
-- El superadmin NO TIENE COLEGIO (`profiles_superadmin_has_no_school`), así que
-- `app.current_school_id()` le devuelve NULL. Y aquí está lo que importa:
--
--     school_id = NULL   no es FALSE.   Es NULL.
--
-- Una política que devuelve NULL no deja pasar. Da igual el predicado de rol
-- que haya al lado. Reproducido contra producción el 27/08/2026 suplantando al
-- superadmin real (el único miembro del personal que existe hoy), en una
-- transacción revertida con `raise exception`:
--
--   role=superadmin is_staff=false is_school_admin=false is_superadmin=true
--   current_school_id=NULL
--   MITAD DE TENANT (school_id = current_school_id()) sobre una fila real = NULL
--   exam_attempts    UPDATE -> 0 filas
--   attempt_gradings INSERT -> 42501 :: new row violates row-level security policy
--
-- -----------------------------------------------------------------------------
-- POR QUÉ NO SE TOCA `app.is_staff()`, QUE ERA LA OTRA VÍA
-- -----------------------------------------------------------------------------
-- `app.is_staff()` devuelve FALSE para un superadmin. Es tentador leer eso como
-- la causa y arreglar el predicado, que serían dos líneas en vez de esta
-- migración. Sería inútil, y la línea de arriba lo demuestra:
--
--     la mitad de tenant vale NULL, no FALSE.
--
-- `true and NULL` sigue siendo NULL. Un `is_staff()` que incluyera al superadmin
-- no habría cambiado ni uno de los cuatro resultados de arriba. Se arregla lo
-- que bloquea, no lo que llama la atención.
--
-- Y además la exclusión es deliberada y está sostenida por el resto del
-- esquema. `0004` lo declara ("staff significa personal DE UN COLEGIO") y todas
-- las llamadas que quieren cubrir a los dos escriben
-- `app.is_staff() or app.is_superadmin()` a la vista: en `0011` (el guard
-- append-only del audit_log), en `0013`, en `0022` y en las dos guardas de
-- `0023`. Cambiar el significado de `is_staff()` cambiaría en silencio el de
-- esas guardas —incluida la que decide quién escribe en el registro forense—
-- para arreglar cero de los cuatro fallos. Vía descartada por inútil antes que
-- por arriesgada.
--
-- -----------------------------------------------------------------------------
-- QUÉ SE ABRE, Y SOBRE TODO QUÉ NO
-- -----------------------------------------------------------------------------
-- Que un superadmin escriba en cualquier colegio es justo lo que la RLS
-- multi-inquilino retiene a propósito. Así que esto NO repara las doce
-- políticas: repara EXACTAMENTE las dos escrituras que la aplicación le deja
-- intentar hoy a un superadmin, que son las que tienen una pantalla detrás.
--
--   tabla                  cmd     acción de la web            cliente
--   registration_requests  UPDATE  approve/rejectRegistration  sesión
--   attempt_gradings       INSERT  gradeItemManually           sesión
--
-- (Las dos salen de un `requireRole([...])` con "superadmin" en la lista, en
--  `apps/web/src/components/staff/actions.ts`, y escriben con el cliente de
--  sesión, que es el único que pasa por RLS.)
--
-- Las otras diez NO se tocan, y la lista importa tanto como lo que se concede:
--
--   sections           INSERT / UPDATE / DELETE
--   section_members    INSERT / DELETE
--   exam_assignments   INSERT / UPDATE / DELETE
--   exam_attempts      UPDATE
--   learning_events    INSERT
--
-- Ninguna tiene hoy un camino en la web por el que un superadmin pueda
-- intentarla. Concederlas "ya que estamos" sería inventar poder de escritura
-- entre inquilinos por delante de la necesidad, que es exactamente lo que el
-- modelo multi-inquilino existe para no hacer. El día que aparezca la pantalla,
-- el invariante de COMPORTAMIENTO de `supabase/tests/web_write_paths.sql` se
-- pone rojo y esa política se escribe entonces, con su motivo al lado.
--
-- -----------------------------------------------------------------------------
-- AUDITORÍA — UNA DEPENDENCIA QUE HAY QUE MIRAR ANTES DE APLICAR ESTO
-- -----------------------------------------------------------------------------
-- Las dos acciones ya auditan: llaman a `public.audit_staff_action` (0023), que
-- delega en `app.audit()`. Pero `app.audit()` escribe
-- `school_id = app.current_school_id()`, que para un superadmin es NULL — el
-- mismo NULL de arriba — y el visor del audit_log filtra por colegio.
--
-- Es un hallazgo YA ABIERTO (HANDOFF §6, segunda fila), pero deja de ser
-- cosmético en cuanto se aplique esta migración: a partir de aquí el superadmin
-- escribe en colegios que no son suyos y sus entradas no aparecen en el log de
-- ninguno de ellos. La acción queda registrada; simplemente no se ve donde se
-- mira. No se arregla aquí porque toca `app.audit()` y el visor a la vez, y
-- mezclar eso con un cambio de RLS haría irrevisables los dos.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. registration_requests — resolver una solicitud de alta (M03)
-- -----------------------------------------------------------------------------
-- Hoy en producción el superadmin es el ÚNICO miembro del personal que existe:
--
--   select id, role, school_id from public.profiles
--    where role in ('superadmin','school_admin');
--   -> 0ee8844d-… | superadmin | NULL      (una sola fila)
--
-- O sea que la cola de solicitudes no la puede resolver nadie. Y lo hacía en
-- silencio: PostgREST responde 204 a un UPDATE que no toca ninguna fila, así
-- que `approveRegistration` creaba el alumno, escribía `registration.approved`
-- en el audit_log y dejaba la solicitud en `pending`. Un segundo clic creaba un
-- segundo alumno.
--
-- No amplía la superficie de lectura: el superadmin ya ve estas filas
-- (`registration_requests_select_superadmin`) y ya puede crear alumnos en
-- cualquier colegio (`students_insert_superadmin`, `profiles_insert_superadmin`).
-- Poder marcar como revisada una solicitud que de hecho ya puede aprobar no le
-- da poder nuevo: deja de mentirle sobre el resultado.
create policy registration_requests_update_superadmin on public.registration_requests
  for update to authenticated
  using ((select app.is_superadmin()))
  with check ((select app.is_superadmin()));


-- -----------------------------------------------------------------------------
-- 2. attempt_gradings — la calificación manual (M09, M12)
-- -----------------------------------------------------------------------------
-- `gradeItemManually` admite a un superadmin y escribe con el cliente de
-- sesión. `attempt_gradings_insert_staff` exige `app.is_staff()` Y que el
-- intento sea de `app.current_school_id()`: las dos mitades le fallan.
--
-- Ésta falla RUIDOSAMENTE (42501 al violar el `with check` de un INSERT, no 0
-- filas como en un UPDATE), así que la interfaz devuelve "unexpected" en vez de
-- mentir. Es la diferencia entre las dos y conviene tenerla presente: en un
-- INSERT la RLS grita; en un UPDATE y en un DELETE calla.
--
-- Se copia la política del staff quitando SOLO la mitad de tenant. Las otras
-- dos condiciones se mantienen palabra por palabra, y no son negociables:
--   · `graded_by = 'manual'` — esta puerta no sirve para fabricar
--     calificaciones automáticas, que son del motor con service_role.
--   · `grader_id = auth.uid()` — nadie firma una nota con el nombre de otro. Es
--     el mismo razonamiento por el que `audit_staff_action` (0023) no acepta
--     identidad del llamante y por el que `audit_log` es append-only.
-- Se conserva el `exists` contra `exam_attempts` para que el intento tenga que
-- existir de verdad; lo único que se relaja es DE QUÉ COLEGIO puede ser.
create policy attempt_gradings_insert_superadmin on public.attempt_gradings
  for insert to authenticated
  with check (
    (select app.is_superadmin())
    and graded_by = 'manual'
    and grader_id = (select auth.uid())
    and exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_gradings.attempt_id
    )
  );


-- #############################################################################
-- Verificación en tiempo de migración
-- #############################################################################
-- No comprueba estas dos políticas: comprueba que la FAMILIA no ha crecido.
--
-- Toda política de escritura que se apoya en `app.current_school_id()` deja
-- fuera al superadmin por construcción. Eso está bien mientras sea deliberado;
-- el fallo aparece cuando alguien copia el patrón para una tabla que el
-- superadmin sí tiene que poder tocar. Aquí se pincha el conjunto conocido: si
-- mañana aparece una decimotercera, este bloque falla y hay que decidir a cuál
-- de los dos lados pertenece.
do $$
declare
  v_actual text;
  v_esperado constant text :=
    'exam_assignments:DELETE, exam_assignments:INSERT, exam_assignments:UPDATE, '
    'exam_attempts:UPDATE, learning_events:INSERT, '
    'section_members:DELETE, section_members:INSERT, '
    'sections:DELETE, sections:INSERT, sections:UPDATE';
begin
  select coalesce(string_agg(x.tabla || ':' || x.cmd, ', ' order by x.tabla, x.cmd), '')
    into v_actual
  from (
    select distinct c.relname as tabla,
           case p.polcmd when 'a' then 'INSERT' when 'w' then 'UPDATE'
                         when 'd' then 'DELETE' end as cmd
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and p.polcmd::text in ('a', 'w', 'd')
      and (coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '')
        || coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''))
          like '%current_school_id%'
      -- ...y la tabla no tiene NINGUNA política de ese mismo comando que cubra
      -- al superadmin por otra vía.
      and not exists (
        select 1 from pg_catalog.pg_policy p2
        where p2.polrelid = p.polrelid and p2.polcmd = p.polcmd
          and (coalesce(pg_catalog.pg_get_expr(p2.polqual, p2.polrelid), '')
            || coalesce(pg_catalog.pg_get_expr(p2.polwithcheck, p2.polrelid), ''))
              like '%is_superadmin%')
  ) x;

  if v_actual is distinct from v_esperado then
    raise exception
      'Las escrituras que excluyen al superadmin han cambiado. esperado: [%] ahora: [%]. '
      'Si la nueva la va a intentar un superadmin desde la web, necesita su política; '
      'si no, añádela a la lista con el motivo.',
      v_esperado, v_actual;
  end if;
end;
$$;
