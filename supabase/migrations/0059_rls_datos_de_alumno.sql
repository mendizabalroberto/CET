-- =============================================================================
-- 0059_rls_datos_de_alumno.sql — los datos de alumno cuelgan de app.puede_ver_alumno
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Sustituye el patron `school_id = app.current_school_id()` en las politicas de
-- datos de alumno. La llamada va envuelta en `(select ...)` para que Postgres la
-- evalue una vez por sentencia y no una vez por fila.
--
-- El `with check` de INSERT no se relaja: quien inserta un nuevo registro sigue
-- teniendo que demostrar que actua dentro de su colegio. SELECT, UPDATE USING y
-- DELETE pasan a preguntar "puedes ver a este alumno".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
-- Los perfiles mezclan personal y alumnos. El personal sigue viéndose por colegio;
-- los alumnos, cuyo profiles.school_id pasa a ser NULL, se ven por membresía.
-- Esta dualidad desaparece cuando todo el personal también tenga membresía, pero
-- hoy no es el caso.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_select_school on public.profiles;
create policy profiles_select_school on public.profiles
  for select to authenticated
  using (
    (school_id = (select app.current_school_id()) and (select app.is_staff()))
    or (
      (select app.is_staff())
      and exists (
        select 1 from public.student_school_memberships m
        where m.student_id = profiles.id
          and m.school_id = (select app.current_school_id())
          and m.status = 'activa'
          and m.starts_on <= current_date
          and (m.ends_on is null or m.ends_on > current_date)
      )
    )
  );

drop policy if exists profiles_select_superadmin on public.profiles;
create policy profiles_select_superadmin on public.profiles
  for select to authenticated
  using ((select app.is_superadmin()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists profiles_update_school_admin on public.profiles;
create policy profiles_update_school_admin on public.profiles
  for update to authenticated
  using (
    (school_id = (select app.current_school_id()) and (select app.is_school_admin()))
    or (
      (select app.is_school_admin())
      and exists (
        select 1 from public.student_school_memberships m
        where m.student_id = profiles.id
          and m.school_id = (select app.current_school_id())
          and m.status = 'activa'
          and m.starts_on <= current_date
          and (m.ends_on is null or m.ends_on > current_date)
      )
    )
  )
  with check (school_id = (select app.current_school_id()) and (select app.is_school_admin()));

drop policy if exists profiles_update_superadmin on public.profiles;
create policy profiles_update_superadmin on public.profiles
  for update to authenticated
  using ((select app.is_superadmin()))
  with check ((select app.is_superadmin()));

drop policy if exists profiles_insert_school_admin on public.profiles;
create policy profiles_insert_school_admin on public.profiles
  for insert to authenticated
  with check (school_id = (select app.current_school_id()) and (select app.is_school_admin()));

drop policy if exists profiles_insert_superadmin on public.profiles;
create policy profiles_insert_superadmin on public.profiles
  for insert to authenticated
  with check ((select app.is_superadmin()));

-- -----------------------------------------------------------------------------
-- students
-- -----------------------------------------------------------------------------
drop policy if exists students_select_own on public.students;
create policy students_select_own on public.students
  for select to authenticated
  using ((select app.puede_ver_alumno(profile_id)));

drop policy if exists students_select_staff on public.students;
create policy students_select_staff on public.students
  for select to authenticated
  using ((select app.puede_ver_alumno(profile_id)));

drop policy if exists students_select_superadmin on public.students;
create policy students_select_superadmin on public.students
  for select to authenticated
  using ((select app.puede_ver_alumno(profile_id)));

drop policy if exists students_insert_admin on public.students;
create policy students_insert_admin on public.students
  for insert to authenticated
  with check (school_id = (select app.current_school_id()) and (select app.is_school_admin()));

drop policy if exists students_update_admin on public.students;
create policy students_update_admin on public.students
  for update to authenticated
  using ((select app.puede_ver_alumno(profile_id)))
  with check (school_id = (select app.current_school_id()) and (select app.is_school_admin()));

drop policy if exists students_update_superadmin on public.students;
create policy students_update_superadmin on public.students
  for update to authenticated
  using ((select app.puede_ver_alumno(profile_id)))
  with check ((select app.is_superadmin()));

drop policy if exists students_insert_superadmin on public.students;
create policy students_insert_superadmin on public.students
  for insert to authenticated
  with check ((select app.is_superadmin()));

-- -----------------------------------------------------------------------------
-- learning_events
-- -----------------------------------------------------------------------------
drop policy if exists learning_events_select_own on public.learning_events;
create policy learning_events_select_own on public.learning_events
  for select to authenticated
  using ((select app.puede_ver_alumno(student_id)));

drop policy if exists learning_events_select_staff on public.learning_events;
create policy learning_events_select_staff on public.learning_events
  for select to authenticated
  using ((select app.puede_ver_alumno(student_id)));

drop policy if exists learning_events_select_superadmin on public.learning_events;
create policy learning_events_select_superadmin on public.learning_events
  for select to authenticated
  using ((select app.puede_ver_alumno(student_id)));

drop policy if exists learning_events_insert_student on public.learning_events;
create policy learning_events_insert_student on public.learning_events
  for insert to authenticated
  with check (student_id = (select auth.uid()));

drop policy if exists learning_events_insert_staff on public.learning_events;
create policy learning_events_insert_staff on public.learning_events
  for insert to authenticated
  with check (school_id = (select app.current_school_id()) and (select app.is_staff()));

drop policy if exists learning_events_update_staff on public.learning_events;
create policy learning_events_update_staff on public.learning_events
  for update to authenticated
  using ((select app.puede_ver_alumno(student_id)))
  with check (school_id = (select app.current_school_id()) and (select app.is_staff()));

drop policy if exists learning_events_delete_staff on public.learning_events;
create policy learning_events_delete_staff on public.learning_events
  for delete to authenticated
  using ((select app.puede_ver_alumno(student_id)));

-- -----------------------------------------------------------------------------
-- skill_mastery
-- -----------------------------------------------------------------------------
drop policy if exists skill_mastery_select_own on public.skill_mastery;
create policy skill_mastery_select_own on public.skill_mastery
  for select to authenticated
  using ((select app.puede_ver_alumno(student_id)));

drop policy if exists skill_mastery_select_staff on public.skill_mastery;
create policy skill_mastery_select_staff on public.skill_mastery
  for select to authenticated
  using ((select app.puede_ver_alumno(student_id)));

drop policy if exists skill_mastery_select_superadmin on public.skill_mastery;
create policy skill_mastery_select_superadmin on public.skill_mastery
  for select to authenticated
  using ((select app.puede_ver_alumno(student_id)));

drop policy if exists skill_mastery_insert_staff on public.skill_mastery;
create policy skill_mastery_insert_staff on public.skill_mastery
  for insert to authenticated
  with check (school_id = (select app.current_school_id()) and (select app.is_staff()));

drop policy if exists skill_mastery_update_staff on public.skill_mastery;
create policy skill_mastery_update_staff on public.skill_mastery
  for update to authenticated
  using ((select app.puede_ver_alumno(student_id)))
  with check (school_id = (select app.current_school_id()) and (select app.is_staff()));

-- -----------------------------------------------------------------------------
-- exam_attempts
-- -----------------------------------------------------------------------------
drop policy if exists exam_attempts_select_own on public.exam_attempts;
create policy exam_attempts_select_own on public.exam_attempts
  for select to authenticated
  using ((select app.puede_ver_alumno(student_id)));

drop policy if exists exam_attempts_select_staff on public.exam_attempts;
create policy exam_attempts_select_staff on public.exam_attempts
  for select to authenticated
  using ((select app.puede_ver_alumno(student_id)));

drop policy if exists exam_attempts_select_superadmin on public.exam_attempts;
create policy exam_attempts_select_superadmin on public.exam_attempts
  for select to authenticated
  using ((select app.puede_ver_alumno(student_id)));

drop policy if exists exam_attempts_insert_student on public.exam_attempts;
create policy exam_attempts_insert_student on public.exam_attempts
  for insert to authenticated
  with check (student_id = (select auth.uid()));

drop policy if exists exam_attempts_update_staff on public.exam_attempts;
create policy exam_attempts_update_staff on public.exam_attempts
  for update to authenticated
  using ((select app.puede_ver_alumno(student_id)))
  with check (school_id = (select app.current_school_id()) and (select app.is_staff()));

-- -----------------------------------------------------------------------------
-- attempt_items
-- -----------------------------------------------------------------------------
drop policy if exists attempt_items_select_own on public.attempt_items;
create policy attempt_items_select_own on public.attempt_items
  for select to authenticated
  using ((select app.puede_ver_alumno((select a.student_id from public.exam_attempts a where a.id = attempt_items.attempt_id))));

drop policy if exists attempt_items_select_staff on public.attempt_items;
create policy attempt_items_select_staff on public.attempt_items
  for select to authenticated
  using ((select app.puede_ver_alumno((select a.student_id from public.exam_attempts a where a.id = attempt_items.attempt_id))));

drop policy if exists attempt_items_select_superadmin on public.attempt_items;
create policy attempt_items_select_superadmin on public.attempt_items
  for select to authenticated
  using ((select app.puede_ver_alumno((select a.student_id from public.exam_attempts a where a.id = attempt_items.attempt_id))));

drop policy if exists attempt_items_insert_student on public.attempt_items;
create policy attempt_items_insert_student on public.attempt_items
  for insert to authenticated
  with check (exists (
    select 1 from public.exam_attempts a
    where a.id = attempt_items.attempt_id
      and a.student_id = (select auth.uid())));

drop policy if exists attempt_items_update_staff on public.attempt_items;
create policy attempt_items_update_staff on public.attempt_items
  for update to authenticated
  using ((select app.puede_ver_alumno((select a.student_id from public.exam_attempts a where a.id = attempt_items.attempt_id))))
  with check (exists (
    select 1 from public.exam_attempts a
    where a.id = attempt_items.attempt_id
      and a.school_id = (select app.current_school_id())
      and (select app.is_staff())));

-- -----------------------------------------------------------------------------
-- attempt_responses
-- -----------------------------------------------------------------------------
drop policy if exists attempt_responses_select_own on public.attempt_responses;
create policy attempt_responses_select_own on public.attempt_responses
  for select to authenticated
  using ((select app.puede_ver_alumno((select a.student_id from public.exam_attempts a where a.id = attempt_responses.attempt_id))));

drop policy if exists attempt_responses_select_staff on public.attempt_responses;
create policy attempt_responses_select_staff on public.attempt_responses
  for select to authenticated
  using ((select app.puede_ver_alumno((select a.student_id from public.exam_attempts a where a.id = attempt_responses.attempt_id))));

drop policy if exists attempt_responses_select_superadmin on public.attempt_responses;
create policy attempt_responses_select_superadmin on public.attempt_responses
  for select to authenticated
  using ((select app.puede_ver_alumno((select a.student_id from public.exam_attempts a where a.id = attempt_responses.attempt_id))));

drop policy if exists attempt_responses_insert_student on public.attempt_responses;
create policy attempt_responses_insert_student on public.attempt_responses
  for insert to authenticated
  with check (exists (
    select 1 from public.exam_attempts a
    where a.id = attempt_responses.attempt_id
      and a.student_id = (select auth.uid())));

drop policy if exists attempt_responses_update_staff on public.attempt_responses;
create policy attempt_responses_update_staff on public.attempt_responses
  for update to authenticated
  using ((select app.puede_ver_alumno((select a.student_id from public.exam_attempts a where a.id = attempt_responses.attempt_id))))
  with check (exists (
    select 1 from public.exam_attempts a
    where a.id = attempt_responses.attempt_id
      and a.school_id = (select app.current_school_id())
      and (select app.is_staff())));

-- -----------------------------------------------------------------------------
-- attempt_gradings
-- -----------------------------------------------------------------------------
drop policy if exists attempt_gradings_select_own on public.attempt_gradings;
create policy attempt_gradings_select_own on public.attempt_gradings
  for select to authenticated
  using ((select app.puede_ver_alumno((select a.student_id from public.exam_attempts a where a.id = attempt_gradings.attempt_id))));

drop policy if exists attempt_gradings_select_staff on public.attempt_gradings;
create policy attempt_gradings_select_staff on public.attempt_gradings
  for select to authenticated
  using ((select app.puede_ver_alumno((select a.student_id from public.exam_attempts a where a.id = attempt_gradings.attempt_id))));

drop policy if exists attempt_gradings_select_superadmin on public.attempt_gradings;
create policy attempt_gradings_select_superadmin on public.attempt_gradings
  for select to authenticated
  using ((select app.puede_ver_alumno((select a.student_id from public.exam_attempts a where a.id = attempt_gradings.attempt_id))));

drop policy if exists attempt_gradings_insert_staff on public.attempt_gradings;
create policy attempt_gradings_insert_staff on public.attempt_gradings
  for insert to authenticated
  with check ((select app.is_staff())
    and graded_by = 'manual'
    and grader_id = (select auth.uid())
    and exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_gradings.attempt_id
        and a.school_id = (select app.current_school_id())));

drop policy if exists attempt_gradings_update_staff on public.attempt_gradings;
create policy attempt_gradings_update_staff on public.attempt_gradings
  for update to authenticated
  using ((select app.puede_ver_alumno((select a.student_id from public.exam_attempts a where a.id = attempt_gradings.attempt_id))))
  with check ((select app.is_staff())
    and graded_by = 'manual'
    and grader_id = (select auth.uid())
    and exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_gradings.attempt_id
        and a.school_id = (select app.current_school_id())));
