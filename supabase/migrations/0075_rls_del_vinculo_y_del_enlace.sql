-- =============================================================================
-- 0075_rls_del_vinculo_y_del_enlace.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- `0057` DEJÓ TRES TABLAS CON RLS Y SIN UNA SOLA POLÍTICA. `0069` ARREGLÓ UNA.
--
-- Aquellas tres fueron `student_school_memberships`, `guardian_students` y
-- `student_access_links`. `0069` documentó el fallo y cerró la primera; las
-- otras dos se quedaron como estaban, y con `grant` por columna concedido, que
-- es lo que hace que el sintoma sea SILENCIOSO: quien pregunta tiene permiso
-- para leer la tabla, la RLS no encuentra ninguna politica que le deje pasar
-- ninguna fila, y PostgREST devuelve una lista vacia y un 200. No hay error que
-- buscar en ningun log.
--
-- QUE SE VEIA EN PRODUCCION, y se vio: un tutor añade a su hijo, el alta
-- funciona entera —`auth.users`, `profiles`, `students` y el vinculo quedan
-- escritos— y al volver a `/tutor` la pagina le dice «Todavia no has añadido a
-- nadie». `listarHijos()` empieza consultando `guardian_students` con la SESION
-- del tutor (queries.ts:52), recibe cero filas y devuelve la lista vacia. El
-- hijo existe, el vinculo existe, y el padre no puede llegar a el: ni ver su
-- ficha, ni generarle su enlace de acceso, ni entrar nunca en la aplicacion.
--
-- Lo destapo el e2e `alta-por-enlace.spec.ts` contra produccion, y no lo podia
-- destapar ninguna otra prueba: las de RLS comprueban politicas que EXISTEN, y
-- aqui el defecto era una tabla sobre la que nadie habia escrito ninguna.
--
-- POR QUE ESTAS POLITICAS NO SE RECURSAN
-- `app.puede_ver_alumno()` es `security definer` y consulta `guardian_students`
-- saltandose la RLS (0058). Si la politica de `student_access_links` citara esa
-- tabla directamente, Postgres tendria que evaluar la politica de aquella para
-- resolver esta, y ahi es donde nacen los bucles.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · guardian_students — quien es hijo de quien
-- -----------------------------------------------------------------------------
-- CUATRO POLITICAS Y NO UNA SOLA CON `puede_ver_alumno`, que habria sido mas
-- corta y habria estado mal. Esa funcion responde «¿puedes ver a ESTE alumno?»,
-- y para un tutor la respuesta es si para todos los vinculos de su hijo,
-- incluido el del OTRO progenitor. En una familia separada eso convierte una
-- tabla de parentesco en un localizador: el vinculo lleva el `guardian_id` de
-- la otra persona. Cada uno ve el suyo.
create policy vinculos_select_propio on public.guardian_students
  for select to authenticated
  using (guardian_id = (select auth.uid()));

-- El alumno ve de quien es hijo. Es su propia filiacion.
create policy vinculos_select_alumno on public.guardian_students
  for select to authenticated
  using (student_id = (select auth.uid()));

-- El personal, los vinculos de los alumnos que ya puede ver: `puede_ver_alumno`
-- exige matricula VIGENTE en SU colegio (0058, camino 3). Un profesor necesita
-- saber a quien llamar cuando un niño no aparece por clase.
create policy vinculos_select_personal on public.guardian_students
  for select to authenticated
  using ((select app.is_staff()) and (select app.puede_ver_alumno(student_id)));

create policy vinculos_select_superadmin on public.guardian_students
  for select to authenticated
  using ((select app.is_superadmin()));

-- SIN POLITICAS DE ESCRITURA, y es deliberado. El vinculo lo crea `crearHijo`
-- con `service_role` desde una accion de dominio auditada (actions.ts:488). Que
-- un `authenticated` no pueda escribir aqui significa que nadie se declara
-- tutor de un menor por su cuenta, que es exactamente la garantia que se busca.

comment on table public.guardian_students is
  'El vinculo tutor-menor. Lectura: el propio tutor (solo SU vinculo), el propio alumno, el personal con matricula vigente y el superadmin. Escritura: solo service_role, desde una accion de dominio auditada.';

-- -----------------------------------------------------------------------------
-- 2 · student_access_links — el enlace de un solo uso
-- -----------------------------------------------------------------------------
-- Aqui SI vale `puede_ver_alumno`: la fila no habla de un adulto, habla del
-- menor y de una credencial suya. Los cuatro caminos de la funcion son
-- exactamente quienes deben saber que ese enlace existe.
create policy enlaces_select on public.student_access_links
  for select to authenticated
  using ((select app.puede_ver_alumno(student_id)));

-- SIN POLITICAS DE ESCRITURA: el enlace lo crea y lo consume `service_role`.
-- Que un tutor pudiera marcar `revoked_at` desde el cliente convertiria el uso
-- unico en una sugerencia.

-- EL HASH NO SE LEE, calcado de `device_hash` en 0065.
-- `0057` incluyo `token_hash` en el `grant` por columna. Es un SHA-256 y no el
-- token, asi que no abre nada por si mismo; pero es el hash de una credencial
-- de un menor, no hace falta para pintar ninguna pantalla —la UI solo necesita
-- saber SI hay enlace activo— y un hash que nadie puede leer es un hash que no
-- se puede llevar a ninguna parte.
revoke select (token_hash) on public.student_access_links from authenticated;

comment on table public.student_access_links is
  'El enlace de acceso de un menor, de un solo uso. Lectura: quien ya puede ver a ese alumno, y nunca su token_hash. Escritura: solo service_role.';
