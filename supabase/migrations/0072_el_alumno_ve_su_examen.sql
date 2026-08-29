-- =============================================================================
-- 0072_el_alumno_ve_su_examen.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Tercera consecuencia de que 0066 vaciara `profiles.school_id`, y la mas cara
-- de las tres: NINGUN ALUMNO VEIA NINGUN EXAMEN.
--
-- `exam_assignments_select_student` exigia
--
--     school_id = app.current_school_id()
--
-- y `current_school_id()` sale de `profiles.school_id`, que para un alumno es
-- NULL desde 0066. En Postgres `x = NULL` no es falso: es NULL, y una politica
-- que devuelve NULL no deja pasar ni una fila. Efecto en produccion: la lista de
-- examenes del alumno, vacia; ningun examen se puede empezar; y ni un error que
-- lo explique, porque no hay error — simplemente no hay filas.
--
-- Es el mismo modo de fallo que `0025_superadmin_sin_colegio.sql` documento con
-- evidencia reproducida: doce politicas se comportaron asi en silencio. Aquel
-- fichero lo dejo escrito para que no volviera a pasar; ha vuelto a pasar en
-- cuanto una segunda clase de usuario se ha quedado sin colegio en `profiles`.
--
-- Se comprobo que era la UNICA politica del esquema con ese patron (una que
-- cruza `current_school_id()` con la condicion de ser alumno).
--
-- POR QUE LA MATRICULA Y NO QUITAR EL FILTRO
-- La pertenencia a la seccion, que la politica ya comprueba, implica el colegio
-- correcto: bastaria con borrar la comparacion. Pero el filtro explicito de
-- tenant es la regla transversal 2 de `MODULES.md` y existe para que un fallo en
-- otra capa sea «no veo nada» en vez de «veo el colegio de al lado». Se conserva
-- y se le cambia la fuente: `app.colegio_del_evento()` (0067), que lee la
-- matricula activa, que es donde vive ahora la pertenencia del alumno.
-- =============================================================================

drop policy if exists exam_assignments_select_student on public.exam_assignments;

create policy exam_assignments_select_student on public.exam_assignments
  for select to authenticated
  using (
    (select app.is_student())
    and school_id = (select app.colegio_del_evento((select auth.uid())))
    and now() >= opens_at
    and exists (
      select 1 from public.section_members sm
       where sm.section_id = exam_assignments.section_id
         and sm.profile_id = (select auth.uid())
         and sm.role_in_section = 'student'
    )
  );

comment on policy exam_assignments_select_student on public.exam_assignments is
  'El alumno ve las asignaciones ya abiertas de sus secciones, dentro del colegio de su MATRICULA ACTIVA. Antes cruzaba profiles.school_id, que desde 0066 es NULL para todo alumno y dejaba la lista vacia.';
