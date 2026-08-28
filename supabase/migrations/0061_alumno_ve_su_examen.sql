-- =============================================================================
-- 0061_alumno_ve_su_examen.sql — el alumno puede leer el examen que le ponen
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- EL FALLO
--
-- `/exam` le decia a TODO alumno «Ahora mismo no tienes examenes», tuviera los
-- que tuviera. En produccion habia dos asignaciones abiertas, dentro de plazo, y
-- de una clase a la que el alumno pertenece.
--
-- La lista sale de `exam_assignments` con el blueprint INCRUSTADO:
--
--     blueprint:exam_blueprints ( id, title, duration_seconds, ... )
--
-- y `_lib/assignments.ts` descarta la tarjeta entera si el blueprint no llega
-- (`if (!id || !blueprint) return null`). Medido con la sesion del alumno:
--
--     exam_assignments: 2  ||  exam_blueprints: 0  ||  secciones: 0
--
-- Ve la asignacion y no ve el examen al que apunta, asi que las dos tarjetas se
-- caian en silencio y la pantalla concluia que no habia nada.
--
-- Desde 0012 las UNICAS politicas de SELECT sobre estas dos tablas son
-- `*_select_staff`, y exigen `is_staff() OR is_superadmin()`. Nunca hubo una
-- para el alumno. No es una regresion de la refundacion de la tenencia: 0059 no
-- menciona `exam_blueprints` ni una vez. Llevaba roto desde el principio, y no
-- se veia porque las pruebas del recorrido de examen escriben con `service_role`
-- —que se salta la RLS— y porque nadie habia abierto /exam con la sesion de un
-- alumno de verdad.
--
-- POR QUE POR LA ASIGNACION Y NO POR EL COLEGIO
--
-- «Alumno del colegio X puede leer los blueprints del colegio X» seria mas corto
-- y estaria mal: dejaria a cualquier alumno leer el enunciado y la duracion de
-- examenes que no le han puesto, incluidos los de otros cursos y los que aun no
-- se han asignado. El alumno ve un examen porque se lo han PUESTO, no porque
-- comparta colegio con el. Por eso se pasa por `exam_assignments` y por la clase
-- a la que pertenece.
--
-- No se filtra por fechas a proposito: la tarjeta necesita leer el examen para
-- poder decir «se abre el lunes» o «ya cerro». Filtrar aqui por `opens_at`
-- volveria a producir el sintoma de arriba —tarjeta muda— en vez de un mensaje.
-- Quien decide que se puede EMPEZAR es `exam_attempts`, que si mira el plazo.
--
-- Esto es SELECT y nada mas: escribir un blueprint sigue siendo cosa del
-- personal. Las politicas de INSERT/UPDATE/DELETE no se tocan.
-- =============================================================================

drop policy if exists exam_blueprints_select_student on public.exam_blueprints;
create policy exam_blueprints_select_student on public.exam_blueprints
  for select to authenticated
  using (
    exists (
      select 1
        from public.exam_assignments a
        join public.section_members m on m.section_id = a.section_id
       where a.blueprint_id = exam_blueprints.id
         and m.profile_id = (select auth.uid())
         and m.role_in_section = 'student'
    )
  );

drop policy if exists exam_blueprint_sections_select_student on public.exam_blueprint_sections;
create policy exam_blueprint_sections_select_student on public.exam_blueprint_sections
  for select to authenticated
  using (
    exists (
      select 1
        from public.exam_assignments a
        join public.section_members m on m.section_id = a.section_id
       where a.blueprint_id = exam_blueprint_sections.blueprint_id
         and m.profile_id = (select auth.uid())
         and m.role_in_section = 'student'
    )
  );
