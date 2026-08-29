-- =============================================================================
-- 0071_telemetria_solo_del_alumno.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Segundo hallazgo de la misma tanda que 0070, y de la misma familia.
--
-- `learning_events_insert_staff` decia:
--
--     with check (school_id = app.current_school_id() and app.is_staff())
--
-- Nada sobre `student_id`. Es decir: un profesor podia insertar eventos de
-- aprendizaje CON EL student_id QUE QUISIERA, mientras fuese de su colegio.
-- Esos eventos alimentan los informes del tutor, el calculo de mastery y la
-- reconstruccion forense de un intento.
--
-- El principio rector del MASTER_PLAN dice que el sistema debe poder
-- reconstruir exactamente que hizo el estudiante «sin depender de la honestidad
-- del cliente». Una politica que deja a un tercero fabricar esos hechos lo
-- contradice de frente.
--
-- Y no la usa nadie: `apps/web/src/app/api/events/route.ts` inserta con el
-- cliente de SESION (RLS activa) y ya rechaza a quien no sea alumno en su
-- linea 123. El motor de examen emite con `service_role`, que no pasa por
-- politicas. La politica era superficie de ataque sin funcion.
--
-- Lo destapa el assert 12 de `telemetry_ingest.sql`: «Un PROFESOR no genera
-- telemetria de aprendizaje». Esperaba 42501 y no recibia excepcion.
-- =============================================================================

drop policy if exists learning_events_insert_staff on public.learning_events;

comment on table public.learning_events is
  'Telemetria de aprendizaje. La escribe el ALUMNO sobre si mismo (learning_events_insert_own) o el servidor con service_role. Ningun tercero puede fabricar hechos sobre un menor.';
