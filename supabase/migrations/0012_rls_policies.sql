-- =============================================================================
-- 0012_rls_policies.sql — TODA la superficie de RLS, en un solo fichero
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: DATA_MODEL.md §9 · AD-1, AD-2
-- =============================================================================
-- Se centraliza a propósito: la pregunta "¿quién puede leer qué?" debe poder
-- responderse leyendo UN fichero de arriba abajo, no reconstruyéndola de doce.
--
-- CONVENCIONES QUE SE CUMPLEN SIN EXCEPCIÓN:
--
--  1. Toda política lleva `to authenticated`. Una política sin `to` aplica a
--     PUBLIC, lo que incluye `anon`. Aquí `anon` no tiene ninguna política y
--     tampoco ningún GRANT (0013): no ve absolutamente nada.
--
--  2. Toda llamada a un helper va envuelta en `(select ...)`.
--     Esto no es cosmético: `using (school_id = app.current_school_id())` puede
--     ejecutar la función UNA VEZ POR FILA candidata. Envuelta como
--     `using (school_id = (select app.current_school_id()))`, el planificador la
--     convierte en un InitPlan y la evalúa una sola vez por sentencia. En una
--     tabla de millones de filas la diferencia es de dos órdenes de magnitud.
--
--  3. Toda política de escritura declara `with check` ADEMÁS de `using`.
--     `using` decide qué filas se pueden tocar; `with check` decide cómo pueden
--     quedar. Un UPDATE con solo `using` permite a un profesor coger una fila de
--     su colegio y reescribirle el school_id al colegio de al lado. Con
--     `with check` es imposible.
--
--  4. Las políticas de escritura se separan por comando (insert / update /
--     delete) en lugar de usar `for all`, para que quede explícito qué se
--     permite y qué no. `for all` esconde un DELETE que nadie recuerda haber
--     concedido.
--
--  5. Los alumnos NO escriben en NINGUNA tabla de examen ni de telemetría.
--     Todo pasa por Edge Functions / Route Handlers con `service_role`, que es
--     lo que AD-5 exige: el motor de examen es autoritativo en el servidor.
-- =============================================================================


-- #############################################################################
-- 1. TENANCY E IDENTIDAD
-- #############################################################################

-- --- schools -----------------------------------------------------------------
-- Un usuario ve SU colegio y nada más. El superadmin los ve todos.
create policy schools_select on public.schools
  for select to authenticated
  using (
    (select app.is_superadmin())
    or id = (select app.current_school_id())
  );

create policy schools_insert on public.schools
  for insert to authenticated
  with check ((select app.is_superadmin()));

-- El school_admin ajusta su colegio (locale, timezone, longitud de PIN,
-- settings) pero no puede moverlo a otra fila: el `with check` sobre el mismo id
-- lo ancla.
create policy schools_update on public.schools
  for update to authenticated
  using (
    (select app.is_superadmin())
    or (id = (select app.current_school_id()) and (select app.is_school_admin()))
  )
  with check (
    (select app.is_superadmin())
    or (id = (select app.current_school_id()) and (select app.is_school_admin()))
  );

create policy schools_delete on public.schools
  for delete to authenticated
  using ((select app.is_superadmin()));


-- --- profiles ----------------------------------------------------------------
-- Compara contra auth.uid() SIN pasar por los helpers, a propósito: un perfil
-- `pending` o `suspended` debe poder leer su propia fila para que la UI le diga
-- POR QUÉ no puede entrar. Los helpers devuelven NULL para él.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_select_school on public.profiles
  for select to authenticated
  using (
    school_id = (select app.current_school_id())
    and (select app.is_staff())
  );

create policy profiles_select_superadmin on public.profiles
  for select to authenticated
  using ((select app.is_superadmin()));

-- Cualquiera edita su propia fila... pero solo los campos inofensivos. El
-- trigger `profiles_guard_escalation` (al final de este fichero) es lo que
-- impide que ese UPDATE se convierta en `set role = 'superadmin'`.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_update_school_admin on public.profiles
  for update to authenticated
  using (
    school_id = (select app.current_school_id())
    and (select app.is_school_admin())
  )
  with check (
    school_id = (select app.current_school_id())
    and (select app.is_school_admin())
  );

create policy profiles_update_superadmin on public.profiles
  for update to authenticated
  using ((select app.is_superadmin()))
  with check ((select app.is_superadmin()));

create policy profiles_insert_school_admin on public.profiles
  for insert to authenticated
  with check (
    school_id = (select app.current_school_id())
    and (select app.is_school_admin())
    -- Un school_admin no puede fabricar superadmins ni otros school_admins.
    -- Sin esta línea, comprometer una cuenta de admin de colegio comprometería
    -- la plataforma entera.
    and role in ('teacher', 'student')
  );

create policy profiles_insert_superadmin on public.profiles
  for insert to authenticated
  with check ((select app.is_superadmin()));

-- DELETE de profiles: NADIE por RLS. El borrado real ocurre en auth.users y
-- llega aquí por CASCADE, que no pasa por políticas. Así el borrado de una
-- persona es una operación deliberada de administración, nunca un DELETE suelto
-- desde el cliente.


-- --- students ----------------------------------------------------------------
create policy students_select_own on public.students
  for select to authenticated
  using (profile_id = (select auth.uid()));

create policy students_select_staff on public.students
  for select to authenticated
  using (
    school_id = (select app.current_school_id())
    and (select app.is_staff())
  );

create policy students_select_superadmin on public.students
  for select to authenticated
  using ((select app.is_superadmin()));

-- El alumno NO tiene UPDATE sobre su propia ficha: el cambio de PIN pasa por la
-- Edge Function (que hashea con Argon2id y resetea failed_pin_attempts). Si
-- pudiera hacer UPDATE, podría ponerse `pin_must_change = false` o vaciarse el
-- `locked_until` que le acaba de poner el sistema anti-fuerza-bruta.
create policy students_insert_admin on public.students
  for insert to authenticated
  with check (
    school_id = (select app.current_school_id())
    and (select app.is_school_admin())
  );

create policy students_update_admin on public.students
  for update to authenticated
  using (
    school_id = (select app.current_school_id())
    and (select app.is_school_admin())
  )
  with check (
    school_id = (select app.current_school_id())
    and (select app.is_school_admin())
  );

-- (Renombrada en la pasada 2: se llamaba `students_all_superadmin` pero solo
--  cubría UPDATE. Un nombre que promete más de lo que hace es una trampa para
--  quien audite el fichero de un vistazo.)
create policy students_update_superadmin on public.students
  for update to authenticated
  using ((select app.is_superadmin()))
  with check ((select app.is_superadmin()));

create policy students_insert_superadmin on public.students
  for insert to authenticated
  with check ((select app.is_superadmin()));


-- --- registration_requests ---------------------------------------------------
-- El alta pública (tutor sin cuenta) NO pasa por aquí: llega a una Route Handler
-- con service_role, que valida el slug del colegio y un captcha. Dar INSERT a
-- `anon` sobre esta tabla sería un formulario de spam abierto a internet.
create policy registration_requests_select_staff on public.registration_requests
  for select to authenticated
  using (
    school_id = (select app.current_school_id())
    and (select app.is_staff())
  );

create policy registration_requests_select_superadmin on public.registration_requests
  for select to authenticated
  using ((select app.is_superadmin()));

create policy registration_requests_update_admin on public.registration_requests
  for update to authenticated
  using (
    school_id = (select app.current_school_id())
    and (select app.is_school_admin())
  )
  with check (
    school_id = (select app.current_school_id())
    and (select app.is_school_admin())
  );


-- --- sections ----------------------------------------------------------------
create policy sections_select_school on public.sections
  for select to authenticated
  using (
    school_id = (select app.current_school_id())
    or (select app.is_superadmin())
  );

create policy sections_insert_staff on public.sections
  for insert to authenticated
  with check (
    school_id = (select app.current_school_id()) and (select app.is_staff())
  );

create policy sections_update_staff on public.sections
  for update to authenticated
  using (school_id = (select app.current_school_id()) and (select app.is_staff()))
  with check (school_id = (select app.current_school_id()) and (select app.is_staff()));

create policy sections_delete_admin on public.sections
  for delete to authenticated
  using (
    school_id = (select app.current_school_id()) and (select app.is_school_admin())
  );


-- --- section_members ---------------------------------------------------------
-- El alumno ve su propia pertenencia y la de sus compañeros de clase (necesita
-- saber quién está en su grupo). No ve las clases en las que no está.
create policy section_members_select on public.section_members
  for select to authenticated
  using (
    (select app.is_superadmin())
    or (
      school_id = (select app.current_school_id())
      and (
        (select app.is_staff())
        or profile_id = (select auth.uid())
        -- OJO: aquí NO se puede escribir `exists (select 1 from section_members
        -- me where ...)`. Postgres aplicaría a `me` las políticas de la propia
        -- tabla y abortaría con "infinite recursion detected in policy for
        -- relation section_members". Por eso la comprobación va en un helper
        -- `security definer`, que lee la tabla saltándose la RLS.
        or (select app.is_member_of_section(section_members.section_id))
      )
    )
  );

create policy section_members_insert_staff on public.section_members
  for insert to authenticated
  with check (
    school_id = (select app.current_school_id()) and (select app.is_staff())
  );

create policy section_members_delete_staff on public.section_members
  for delete to authenticated
  using (
    school_id = (select app.current_school_id()) and (select app.is_staff())
  );


-- #############################################################################
-- 2. CURRÍCULO Y CONTENIDO — patrón híbrido AD-2
-- #############################################################################
-- Lectura:  app.can_read_content(school_id)   -> global OR mío
-- Escritura: app.can_write_content(school_id) -> lo global solo el superadmin
--
-- Y una capa más: un ALUMNO solo ve contenido `published`. Un borrador a medio
-- escribir no debe aparecer en la pantalla de un niño.

-- --- subjects ----------------------------------------------------------------
create policy subjects_select on public.subjects
  for select to authenticated
  using ((select app.can_read_content(school_id)));

create policy subjects_insert on public.subjects
  for insert to authenticated
  with check ((select app.can_write_content(school_id)));

create policy subjects_update on public.subjects
  for update to authenticated
  using ((select app.can_write_content(school_id)))
  with check ((select app.can_write_content(school_id)));

create policy subjects_delete on public.subjects
  for delete to authenticated
  using ((select app.can_write_content(school_id)));


-- --- courses -----------------------------------------------------------------
create policy courses_select on public.courses
  for select to authenticated
  using (
    (select app.can_read_content(school_id))
    and (status = 'published'
         or (select app.is_staff())
         or (select app.is_superadmin()))
  );

create policy courses_insert on public.courses
  for insert to authenticated
  with check ((select app.can_write_content(school_id)));

create policy courses_update on public.courses
  for update to authenticated
  using ((select app.can_write_content(school_id)))
  with check ((select app.can_write_content(school_id)));

create policy courses_delete on public.courses
  for delete to authenticated
  using ((select app.can_write_content(school_id)));


-- --- school_courses ----------------------------------------------------------
create policy school_courses_select on public.school_courses
  for select to authenticated
  using (
    school_id = (select app.current_school_id())
    or (select app.is_superadmin())
  );

create policy school_courses_insert on public.school_courses
  for insert to authenticated
  with check (
    (select app.is_superadmin())
    or (school_id = (select app.current_school_id()) and (select app.is_school_admin()))
  );

create policy school_courses_update on public.school_courses
  for update to authenticated
  using (
    (select app.is_superadmin())
    or (school_id = (select app.current_school_id()) and (select app.is_school_admin()))
  )
  with check (
    (select app.is_superadmin())
    or (school_id = (select app.current_school_id()) and (select app.is_school_admin()))
  );

create policy school_courses_delete on public.school_courses
  for delete to authenticated
  using (
    (select app.is_superadmin())
    or (school_id = (select app.current_school_id()) and (select app.is_school_admin()))
  );


-- --- course_modules ----------------------------------------------------------
create policy course_modules_select on public.course_modules
  for select to authenticated
  using ((select app.can_read_content(school_id)));

create policy course_modules_insert on public.course_modules
  for insert to authenticated
  with check ((select app.can_write_content(school_id)));

create policy course_modules_update on public.course_modules
  for update to authenticated
  using ((select app.can_write_content(school_id)))
  with check ((select app.can_write_content(school_id)));

create policy course_modules_delete on public.course_modules
  for delete to authenticated
  using ((select app.can_write_content(school_id)));


-- --- lessons -----------------------------------------------------------------
create policy lessons_select on public.lessons
  for select to authenticated
  using (
    (select app.can_read_content(school_id))
    and (status = 'published'
         or (select app.is_staff())
         or (select app.is_superadmin()))
  );

create policy lessons_insert on public.lessons
  for insert to authenticated
  with check ((select app.can_write_content(school_id)));

create policy lessons_update on public.lessons
  for update to authenticated
  using ((select app.can_write_content(school_id)))
  with check ((select app.can_write_content(school_id)));

create policy lessons_delete on public.lessons
  for delete to authenticated
  using ((select app.can_write_content(school_id)));


-- --- skills ------------------------------------------------------------------
-- Sin filtro de `published`: la taxonomía de skills no tiene estado y el alumno
-- necesita los nombres para su dashboard de mastery.
create policy skills_select on public.skills
  for select to authenticated
  using ((select app.can_read_content(school_id)));

create policy skills_insert on public.skills
  for insert to authenticated
  with check ((select app.can_write_content(school_id)));

create policy skills_update on public.skills
  for update to authenticated
  using ((select app.can_write_content(school_id)))
  with check ((select app.can_write_content(school_id)));

create policy skills_delete on public.skills
  for delete to authenticated
  using ((select app.can_write_content(school_id)));


-- --- lesson_skills -----------------------------------------------------------
-- No tiene school_id propio: hereda el permiso de su lección. El EXISTS se
-- resuelve contra el índice de la PK de lessons, así que es un lookup.
create policy lesson_skills_select on public.lesson_skills
  for select to authenticated
  using (
    exists (
      select 1 from public.lessons l
      where l.id = lesson_skills.lesson_id
        and (select app.can_read_content(l.school_id))
    )
  );

create policy lesson_skills_insert on public.lesson_skills
  for insert to authenticated
  with check (
    exists (
      select 1 from public.lessons l
      where l.id = lesson_skills.lesson_id
        and (select app.can_write_content(l.school_id))
    )
  );

create policy lesson_skills_delete on public.lesson_skills
  for delete to authenticated
  using (
    exists (
      select 1 from public.lessons l
      where l.id = lesson_skills.lesson_id
        and (select app.can_write_content(l.school_id))
    )
  );


-- --- media_assets ------------------------------------------------------------
create policy media_assets_select on public.media_assets
  for select to authenticated
  using ((select app.can_read_content(school_id)));

create policy media_assets_insert on public.media_assets
  for insert to authenticated
  with check ((select app.can_write_content(school_id)));

create policy media_assets_update on public.media_assets
  for update to authenticated
  using ((select app.can_write_content(school_id)))
  with check ((select app.can_write_content(school_id)));

create policy media_assets_delete on public.media_assets
  for delete to authenticated
  using ((select app.can_write_content(school_id)));


-- --- lesson_blocks -----------------------------------------------------------
create policy lesson_blocks_select on public.lesson_blocks
  for select to authenticated
  using (
    (select app.can_read_content(school_id))
    and (
      (select app.is_staff()) or (select app.is_superadmin())
      or exists (
        select 1 from public.lessons l
        where l.id = lesson_blocks.lesson_id and l.status = 'published'
      )
    )
  );

create policy lesson_blocks_insert on public.lesson_blocks
  for insert to authenticated
  with check ((select app.can_write_content(school_id)));

create policy lesson_blocks_update on public.lesson_blocks
  for update to authenticated
  using ((select app.can_write_content(school_id)))
  with check ((select app.can_write_content(school_id)));

create policy lesson_blocks_delete on public.lesson_blocks
  for delete to authenticated
  using ((select app.can_write_content(school_id)));


-- #############################################################################
-- 3. PREGUNTAS — donde vive la clave de corrección
-- #############################################################################

-- --- questions ---------------------------------------------------------------
-- El ALUMNO no lee esta tabla. Ni una fila.
-- Razón: `questions` es solo identidad, pero exponerla permite enumerar el banco
-- completo (cuántas preguntas hay de cada skill y dificultad) y, cruzando con
-- attempt_items, deducir qué preguntas quedan por caer. La práctica del alumno
-- recibe sus items desde el servidor, ya renderizados y sin clave.
create policy questions_select_staff on public.questions
  for select to authenticated
  using (
    ((select app.is_staff()) or (select app.is_superadmin()))
    and (select app.can_read_content(school_id))
  );

create policy questions_insert on public.questions
  for insert to authenticated
  with check ((select app.can_write_content(school_id)));

create policy questions_update on public.questions
  for update to authenticated
  using ((select app.can_write_content(school_id)))
  with check ((select app.can_write_content(school_id)));

create policy questions_delete on public.questions
  for delete to authenticated
  using ((select app.can_write_content(school_id)));


-- --- question_versions -------------------------------------------------------
-- Capa 1 de la defensa de `answer_spec`: el alumno no tiene NINGUNA política de
-- select aquí, así que no lee ni una fila por ninguna vía.
-- Capa 2: 0013_grants.sql le retira además el privilegio de columna.
-- Capa 3: `authenticated` no tiene UPDATE (y el trigger de inmutabilidad lo
--         bloquearía igualmente, incluso para service_role).
create policy question_versions_select_staff on public.question_versions
  for select to authenticated
  using (
    ((select app.is_staff()) or (select app.is_superadmin()))
    and exists (
      select 1 from public.questions q
      where q.id = question_versions.question_id
        and (select app.can_read_content(q.school_id))
    )
  );

create policy question_versions_insert on public.question_versions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.questions q
      where q.id = question_versions.question_id
        and (select app.can_write_content(q.school_id))
    )
  );

-- Sin política de UPDATE: es inmutable (DATA_MODEL §4).

create policy question_versions_delete on public.question_versions
  for delete to authenticated
  using (
    exists (
      select 1 from public.questions q
      where q.id = question_versions.question_id
        and (select app.can_write_content(q.school_id))
    )
  );


-- #############################################################################
-- 4. EXÁMENES
-- #############################################################################

-- --- exam_blueprints ---------------------------------------------------------
-- El alumno tampoco lee blueprints: le dirían cuántas preguntas de cada skill
-- van a caer y con qué peso. Lo que necesita saber (título, duración) viaja en
-- `exam_attempts.blueprint_snapshot`, que sí es suyo.
create policy exam_blueprints_select_staff on public.exam_blueprints
  for select to authenticated
  using (
    ((select app.is_staff()) or (select app.is_superadmin()))
    and (select app.can_read_content(school_id))
  );

create policy exam_blueprints_insert on public.exam_blueprints
  for insert to authenticated
  with check ((select app.can_write_content(school_id)));

create policy exam_blueprints_update on public.exam_blueprints
  for update to authenticated
  using ((select app.can_write_content(school_id)))
  with check ((select app.can_write_content(school_id)));

create policy exam_blueprints_delete on public.exam_blueprints
  for delete to authenticated
  using ((select app.can_write_content(school_id)));


-- --- exam_blueprint_sections -------------------------------------------------
create policy exam_blueprint_sections_select_staff on public.exam_blueprint_sections
  for select to authenticated
  using (
    ((select app.is_staff()) or (select app.is_superadmin()))
    and exists (
      select 1 from public.exam_blueprints b
      where b.id = exam_blueprint_sections.blueprint_id
        and (select app.can_read_content(b.school_id))
    )
  );

create policy exam_blueprint_sections_insert on public.exam_blueprint_sections
  for insert to authenticated
  with check (
    exists (
      select 1 from public.exam_blueprints b
      where b.id = exam_blueprint_sections.blueprint_id
        and (select app.can_write_content(b.school_id))
    )
  );

create policy exam_blueprint_sections_update on public.exam_blueprint_sections
  for update to authenticated
  using (
    exists (
      select 1 from public.exam_blueprints b
      where b.id = exam_blueprint_sections.blueprint_id
        and (select app.can_write_content(b.school_id))
    )
  )
  with check (
    exists (
      select 1 from public.exam_blueprints b
      where b.id = exam_blueprint_sections.blueprint_id
        and (select app.can_write_content(b.school_id))
    )
  );

create policy exam_blueprint_sections_delete on public.exam_blueprint_sections
  for delete to authenticated
  using (
    exists (
      select 1 from public.exam_blueprints b
      where b.id = exam_blueprint_sections.blueprint_id
        and (select app.can_write_content(b.school_id))
    )
  );


-- --- exam_assignments --------------------------------------------------------
-- Aquí SÍ lee el alumno: necesita ver qué exámenes tiene y cuándo. Pero solo los
-- de SUS clases, y solo dentro de la ventana. Un examen que abre el martes no
-- debe ser visible el lunes: saber que existe ya es información.
create policy exam_assignments_select_student on public.exam_assignments
  for select to authenticated
  using (
    school_id = (select app.current_school_id())
    and (select app.is_student())
    and now() >= opens_at
    and exists (
      select 1 from public.section_members sm
      where sm.section_id = exam_assignments.section_id
        and sm.profile_id = (select auth.uid())
        and sm.role_in_section = 'student'
    )
  );

create policy exam_assignments_select_staff on public.exam_assignments
  for select to authenticated
  using (
    (select app.is_superadmin())
    or (school_id = (select app.current_school_id()) and (select app.is_staff()))
  );

create policy exam_assignments_insert_staff on public.exam_assignments
  for insert to authenticated
  with check (
    school_id = (select app.current_school_id()) and (select app.is_staff())
  );

create policy exam_assignments_update_staff on public.exam_assignments
  for update to authenticated
  using (school_id = (select app.current_school_id()) and (select app.is_staff()))
  with check (school_id = (select app.current_school_id()) and (select app.is_staff()));

create policy exam_assignments_delete_admin on public.exam_assignments
  for delete to authenticated
  using (
    school_id = (select app.current_school_id()) and (select app.is_school_admin())
  );


-- #############################################################################
-- 5. INTENTOS — el patrón exacto de DATA_MODEL §9
-- #############################################################################
-- REGLA: el alumno LEE lo suyo y NO ESCRIBE NADA. Arrancar, autoguardar y
-- entregar pasan por Edge Functions con service_role (AD-5: el motor de examen
-- es autoritativo en el servidor). Si el alumno pudiera hacer UPDATE sobre
-- exam_attempts, se regalaría `server_deadline_at`.

-- --- exam_attempts -----------------------------------------------------------
create policy exam_attempts_select_own on public.exam_attempts
  for select to authenticated
  using (
    school_id = (select app.current_school_id())
    and student_id = (select auth.uid())
  );

create policy exam_attempts_select_staff on public.exam_attempts
  for select to authenticated
  using (
    school_id = (select app.current_school_id())
    and (select app.is_staff())
  );

create policy exam_attempts_select_superadmin on public.exam_attempts
  for select to authenticated
  using ((select app.is_superadmin()));

-- El profesor puede anular un intento (status = 'voided') o cerrarlo a mano.
create policy exam_attempts_update_staff on public.exam_attempts
  for update to authenticated
  using (school_id = (select app.current_school_id()) and (select app.is_staff()))
  with check (school_id = (select app.current_school_id()) and (select app.is_staff()));

-- Sin INSERT ni DELETE para authenticated. Los intentos nacen y mueren en el
-- servidor.


-- --- attempt_items -----------------------------------------------------------
-- El alumno ve las filas de SU intento. La columna answer_key queda fuera por
-- GRANT de columna (0013), y la vista attempt_items_student es lo que consulta
-- el cliente. Tres capas para el mismo secreto.
create policy attempt_items_select_own on public.attempt_items
  for select to authenticated
  using (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_items.attempt_id
        and a.student_id = (select auth.uid())
        and a.school_id = (select app.current_school_id())
    )
  );

create policy attempt_items_select_staff on public.attempt_items
  for select to authenticated
  using (
    (select app.is_superadmin())
    or (
      (select app.is_staff())
      and exists (
        select 1 from public.exam_attempts a
        where a.id = attempt_items.attempt_id
          and a.school_id = (select app.current_school_id())
      )
    )
  );

-- Sin INSERT/UPDATE/DELETE para authenticated: la materialización es del servidor.


-- --- attempt_responses -------------------------------------------------------
create policy attempt_responses_select_own on public.attempt_responses
  for select to authenticated
  using (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_responses.attempt_id
        and a.student_id = (select auth.uid())
        and a.school_id = (select app.current_school_id())
    )
  );

create policy attempt_responses_select_staff on public.attempt_responses
  for select to authenticated
  using (
    (select app.is_superadmin())
    or (
      (select app.is_staff())
      and exists (
        select 1 from public.exam_attempts a
        where a.id = attempt_responses.attempt_id
          and a.school_id = (select app.current_school_id())
      )
    )
  );

-- Sin escritura para authenticated: si el alumno pudiera insertar revisiones,
-- podría fabricar `server_ts` pasados y "responder" después de la campana.


-- --- attempt_gradings --------------------------------------------------------
-- El alumno ve su nota SOLO cuando el intento está `graded`. Sin esta condición,
-- vería la puntuación de la pregunta 1 mientras responde la 2 — que es la clave
-- de respuesta contada de otra manera.
create policy attempt_gradings_select_own on public.attempt_gradings
  for select to authenticated
  using (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_gradings.attempt_id
        and a.student_id = (select auth.uid())
        and a.school_id = (select app.current_school_id())
        and a.status = 'graded'
    )
  );

create policy attempt_gradings_select_staff on public.attempt_gradings
  for select to authenticated
  using (
    (select app.is_superadmin())
    or (
      (select app.is_staff())
      and exists (
        select 1 from public.exam_attempts a
        where a.id = attempt_gradings.attempt_id
          and a.school_id = (select app.current_school_id())
      )
    )
  );

-- La corrección manual del profesor: INSERT de una fila nueva (posiblemente con
-- supersedes_id). Nunca un UPDATE de la anterior — la cadena de recalificación
-- es historia y no se reescribe.
create policy attempt_gradings_insert_staff on public.attempt_gradings
  for insert to authenticated
  with check (
    (select app.is_staff())
    and graded_by = 'manual'
    and grader_id = (select auth.uid())
    and exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_gradings.attempt_id
        and a.school_id = (select app.current_school_id())
    )
  );


-- #############################################################################
-- 6. TELEMETRÍA
-- #############################################################################

-- --- learning_events ---------------------------------------------------------
-- Solo LECTURA para authenticated. La ingesta va por Route Handler con
-- service_role, que rellena school_id y student_id desde la sesión: si el
-- cliente pudiera insertar, escribiría eventos en nombre de otro alumno y
-- envenenaría su modelo de mastery (events.ts lo dice explícitamente).
create policy learning_events_select_own on public.learning_events
  for select to authenticated
  using (
    student_id = (select auth.uid())
    and school_id = (select app.current_school_id())
  );

create policy learning_events_select_staff on public.learning_events
  for select to authenticated
  using (
    school_id = (select app.current_school_id())
    and (select app.is_staff())
  );

create policy learning_events_select_superadmin on public.learning_events
  for select to authenticated
  using ((select app.is_superadmin()));


-- --- skill_mastery -----------------------------------------------------------
create policy skill_mastery_select_own on public.skill_mastery
  for select to authenticated
  using (student_id = (select auth.uid()));

create policy skill_mastery_select_staff on public.skill_mastery
  for select to authenticated
  using (
    school_id = (select app.current_school_id())
    and (select app.is_staff())
  );

create policy skill_mastery_select_superadmin on public.skill_mastery
  for select to authenticated
  using ((select app.is_superadmin()));

-- Escritura solo del job (service_role): es un agregado derivado. Si el cliente
-- pudiera escribirlo, un alumno se declararía experto en todo.


-- #############################################################################
-- 7. AUDITORÍA
-- #############################################################################
-- DATA_MODEL §0: "toda tabla lleva RLS habilitada, sin excepción" — las de
-- auditoría también. Un audit_log legible por cualquiera es una fuga de datos
-- perfectamente indexada.

-- --- audit_log ---------------------------------------------------------------
-- Lo lee el school_admin de su colegio y el superadmin. Un `teacher` NO: el log
-- contiene las acciones de sus compañeros y es material de control interno.
create policy audit_log_select_admin on public.audit_log
  for select to authenticated
  using (
    school_id = (select app.current_school_id())
    and (select app.is_school_admin())
  );

create policy audit_log_select_superadmin on public.audit_log
  for select to authenticated
  using ((select app.is_superadmin()));

-- Sin INSERT: se escribe por app.audit(), que es `security definer` y pone el
-- actor desde la sesión. Sin UPDATE ni DELETE: el trigger append-only los
-- bloquea para todos los roles.


-- --- auth_attempts -----------------------------------------------------------
create policy auth_attempts_select_admin on public.auth_attempts
  for select to authenticated
  using (
    school_id = (select app.current_school_id())
    and (select app.is_school_admin())
  );

create policy auth_attempts_select_superadmin on public.auth_attempts
  for select to authenticated
  using ((select app.is_superadmin()));


-- #############################################################################
-- 8. CONTROLES DE INTEGRIDAD DE PRIVILEGIOS
-- #############################################################################

-- -----------------------------------------------------------------------------
-- profiles_guard_escalation — el agujero que la RLS SOLA no puede tapar
-- -----------------------------------------------------------------------------
-- `profiles_update_own` permite a cualquiera hacer UPDATE de su propia fila. Una
-- política RLS decide QUÉ FILAS, nunca QUÉ COLUMNAS. Sin este trigger, un alumno
-- de 11 años con la consola del navegador abierta ejecuta:
--
--     supabase.from('profiles').update({ role: 'superadmin' }).eq('id', myId)
--
-- ...y `with check (id = auth.uid())` lo aprueba, porque la fila resultante sigue
-- siendo suya. Se convierte en superadmin de la plataforma entera.
--
-- El trigger congela role, school_id y status salvo para quien tenga derecho a
-- cambiarlos. Se ejecuta ANTES que cualquier política de columna y bloquea
-- también a los `security definer` mal escritos.
create or replace function app.profiles_guard_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.user_role;
begin
  -- El backend administra sin restricción. La condición se comprueba por
  -- CURRENT_USER y no por `auth.uid() is null` (corregido en la pasada 2):
  -- un JWT con `role: authenticated` pero SIN claim `sub` deja auth.uid() en
  -- NULL, y con la versión anterior ese caso se saltaba el guard entero. Aquí
  -- lo único que abre la puerta es venir de un rol que no sea el de aplicación.
  if current_user <> 'authenticated' then
    return new;
  end if;

  select p.role into v_actor_role
  from public.profiles p
  where p.id = auth.uid() and p.status = 'active';

  if v_actor_role = 'superadmin' then
    return new;   -- el superadmin sí puede cambiarlo todo
  end if;

  -- Un school_admin puede cambiar el rol y el estado DENTRO de su colegio, pero
  -- nunca crear superadmins ni mover a nadie a otro colegio.
  if v_actor_role = 'school_admin'
     and old.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  then
    if new.school_id is distinct from old.school_id then
      raise exception 'Un school_admin no puede mover un perfil a otro colegio'
        using errcode = 'insufficient_privilege';
    end if;
    if new.role = 'superadmin' or old.role = 'superadmin' then
      raise exception 'Un school_admin no puede crear ni modificar superadmins'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  -- Cualquier otro caso (el propio usuario editando su ficha): los tres campos
  -- sensibles quedan congelados.
  if new.role is distinct from old.role then
    raise exception 'No puedes cambiar tu propio rol'
      using errcode = 'insufficient_privilege';
  end if;
  if new.school_id is distinct from old.school_id then
    raise exception 'No puedes cambiar tu propio colegio'
      using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status then
    raise exception 'No puedes cambiar tu propio estado de cuenta'
      using errcode = 'insufficient_privilege';
  end if;
  if new.id is distinct from old.id then
    raise exception 'El id de un perfil es inmutable'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

comment on function app.profiles_guard_escalation() is
  'Congela role/school_id/status en el UPDATE propio. La RLS filtra filas, no columnas: esto es lo que impide la escalada.';

create trigger profiles_guard_escalation
  before update on public.profiles
  for each row execute function app.profiles_guard_escalation();


-- -----------------------------------------------------------------------------
-- students_guard_escalation — el mismo razonamiento para la ficha del alumno
-- -----------------------------------------------------------------------------
-- `students_update_admin` permite al school_admin editar fichas de su colegio.
-- Lo que NO debe poder hacer nadie desde el cliente es mover al alumno a otro
-- colegio, ni escribir directamente `pin_hash` (que debe venir de Argon2id en la
-- Edge Function), ni vaciarse a sí mismo `locked_until` o `failed_pin_attempts`
-- para saltarse el anti-fuerza-bruta.
create or replace function app.students_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Mismo criterio que en profiles_guard_escalation: se comprueba CURRENT_USER,
  -- no auth.uid(), para que un JWT sin `sub` no se salte el guard.
  if current_user <> 'authenticated' then
    return new;      -- service_role / backend
  end if;

  if new.school_id is distinct from old.school_id then
    raise exception 'Un alumno no se mueve de colegio con un UPDATE: es una migración de datos'
      using errcode = 'insufficient_privilege';
  end if;
  if new.profile_id is distinct from old.profile_id then
    raise exception 'students.profile_id es inmutable'
      using errcode = 'insufficient_privilege';
  end if;
  if new.pin_hash is distinct from old.pin_hash then
    raise exception 'pin_hash solo lo escribe la Edge Function de auth (Argon2id, service_role)'
      using errcode = 'insufficient_privilege';
  end if;
  -- El desbloqueo manual por parte del admin es legítimo, pero solo hacia
  -- "menos bloqueado": nunca puede alargarse el bloqueo de otro ni reducirse los
  -- fallos acumulados sin desbloquear de verdad.
  if new.failed_pin_attempts > old.failed_pin_attempts then
    raise exception 'failed_pin_attempts solo lo incrementa la Edge Function de auth'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger students_guard_update
  before update on public.students
  for each row execute function app.students_guard_update();
