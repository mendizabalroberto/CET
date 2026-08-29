-- =============================================================================
-- 0070_ingesta_sin_agujero_de_tenant.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- AGUJERO DE AISLAMIENTO ENTRE COLEGIOS, ENCONTRADO EL 29/08/2026
--
-- `learning_events` tenia TRES politicas de INSERT, y las politicas del mismo
-- comando se combinan con OR. Dos comprobaban el colegio:
--
--   learning_events_insert_own    student_id = uid AND school_id = mi colegio
--                                 AND rol = student
--   learning_events_insert_staff  school_id = mi colegio AND is_staff
--
-- y la tercera, no:
--
--   learning_events_insert_student   student_id = auth.uid()
--
-- Con un OR delante, esa tercera ANULA a las otras dos: cualquier alumno podia
-- escribir un evento de telemetria con el `school_id` de OTRO COLEGIO, y ese
-- evento aparecia despues en los informes de ese colegio. Un dato de un menor
-- atribuido a un centro que no es el suyo.
--
-- Lo destapo `telemetry_ingest.sql`, cuyo assert 8 —«s1a NO puede escribir un
-- evento en el colegio Beta»— esperaba un 42501 y no recibia excepcion ninguna.
-- Llevaba sin verse porque la suite pgTAP NO la corre `pnpm verify`: se lanza a
-- mano con `node scripts/db-test.mjs`. Una prueba que nadie ejecuta no es una
-- prueba.
--
-- EL ARREGLO NO ES SOLO BORRAR LA POLITICA FLOJA
-- `learning_events_insert_own` compara `school_id = app.current_school_id()`, y
-- `current_school_id()` sale de `profiles.school_id`, que desde 0066 es NULL
-- para todo alumno. Dejar solo esa politica cambiaria el agujero por lo
-- contrario: NINGUN alumno podria emitir telemetria, porque `x = NULL` no es
-- falso, es NULL. Asi que la condicion pasa a apoyarse en la matricula, que es
-- donde vive ahora la pertenencia, a traves de `app.colegio_del_evento()` (0067).
--
-- `is not distinct from` y no `=`: el hijo de un tutor no tiene colegio, su
-- evento lleva `school_id` NULL, y NULL = NULL seria NULL. Con `is not distinct
-- from`, NULL casa con NULL y el niño que practica en casa emite telemetria sin
-- atribuirsela a ningun centro — que es exactamente lo que el spec pide.
-- =============================================================================

drop policy if exists learning_events_insert_student on public.learning_events;

drop policy if exists learning_events_insert_own on public.learning_events;

create policy learning_events_insert_own on public.learning_events
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and (select app."current_role"()) = 'student'
    -- El colegio del evento tiene que ser el de SU matricula activa, o NULL si
    -- no tiene ninguna. Se resuelve en el servidor y no se acepta del cliente.
    and school_id is not distinct from (select app.colegio_del_evento((select auth.uid())))
  );

comment on policy learning_events_insert_own on public.learning_events is
  'Un alumno solo emite eventos SUYOS y atribuidos a su matricula activa (o a ninguna). Sustituye a learning_events_insert_student, que no comprobaba el colegio y anulaba por OR a las demas.';
