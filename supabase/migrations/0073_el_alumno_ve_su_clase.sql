-- =============================================================================
-- 0073_el_alumno_ve_su_clase.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Cuarta y ultima instancia del mismo patron. `section_members_select` era:
--
--     is_superadmin()
--     OR ( school_id = current_school_id()
--          AND ( is_staff() OR profile_id = auth.uid() OR is_member_of_section(...) ) )
--
-- Ese `school_id = current_school_id()` va en AND con TODO lo demas, incluido
-- «esta es mi propia fila». Con `profiles.school_id` a NULL desde 0066, un
-- alumno no veia ni siquiera su propia pertenencia a su clase.
--
-- Y eso no se quedaba ahi: `exam_assignments_select_student` resuelve su
-- condicion con un EXISTS sobre `section_members`, y una subconsulta dentro de
-- una politica se evalua con las politicas de quien pregunta. Sin ver su fila de
-- `section_members`, el alumno no veia NINGUNA asignacion de examen — aunque
-- 0072 ya hubiera arreglado la comparacion de colegio de esa politica.
--
-- Dos politicas encadenadas y un solo sintoma: «Ahora mismo no tienes
-- examenes». Es exactamente lo que `alumno_ve_su_examen.sql` existe para cazar,
-- y su cabecera ya avisaba de que una RLS que deja ver una cosa y no la de al
-- lado «no produce un error: produce una pantalla vacia que miente».
--
-- EL ARREGLO
-- Su propia fila deja de cruzarse con el colegio: es suya, y eso no depende de
-- ningun tenant. Para VER A SUS COMPANEROS de clase se conserva el filtro de
-- tenant, con la fuente correcta — la matricula, via `app.colegio_del_evento()`.
-- =============================================================================

drop policy if exists section_members_select on public.section_members;

create policy section_members_select on public.section_members
  for select to authenticated
  using (
    (select app.is_superadmin())
    -- Su propia pertenencia. Sin cruzar colegio: la fila es suya.
    or profile_id = (select auth.uid())
    -- El personal, dentro de su colegio, como siempre.
    or (
      school_id = (select app.current_school_id())
      and (select app.is_staff())
    )
    -- Sus companeros de clase, con el colegio tomado de SU matricula activa.
    or (
      school_id = (select app.colegio_del_evento((select auth.uid())))
      and (select app.is_member_of_section(section_members.section_id))
    )
  );

comment on policy section_members_select on public.section_members is
  'Su propia fila (sin cruzar colegio), sus companeros de clase dentro del colegio de su matricula activa, y el personal dentro del suyo. Antes cruzaba profiles.school_id con TODO, y desde 0066 eso dejaba al alumno sin ver ni su propia clase.';
