# Clasificación de políticas RLS

> Cada política de `0012_rls_policies.sql` debe estar clasificada en una de
> tres columnas: `intacta` (contenido/currículo), `reescrita` (datos de alumno)
> o `nueva` (tablas de la tarea 4). El script `scripts/clasificar-politicas.mjs`
> lo verifica.

| Política | Tabla | Montón | Descripción |
|---|---|---|---|
| `schools_select` | schools | intacta | El superadmin ve todos; cada usuario ve su colegio |
| `schools_insert` | schools | intacta | Solo el superadmin crea colegios |
| `schools_update` | schools | intacta | El superadmin o el school_admin ajustan su colegio |
| `schools_delete` | schools | intacta | Solo el superadmin borra colegios |
| `profiles_select_own` | profiles | reescrita | Cada usuario lee su propio perfil |
| `profiles_select_school` | profiles | reescrita | El staff lee los perfiles de su colegio |
| `profiles_select_superadmin` | profiles | reescrita | El superadmin lee todos los perfiles |
| `profiles_update_own` | profiles | reescrita | Cada usuario edita su propio perfil |
| `profiles_update_school_admin` | profiles | reescrita | El school_admin edita perfiles de su colegio |
| `profiles_update_superadmin` | profiles | reescrita | El superadmin edita cualquier perfil |
| `profiles_insert_school_admin` | profiles | reescrita | El school_admin crea perfiles de su colegio |
| `profiles_insert_superadmin` | profiles | reescrita | El superadmin crea perfiles |
| `students_select_own` | students | reescrita | El alumno ve su propia ficha |
| `students_select_staff` | students | reescrita | El staff ve las fichas de su colegio |
| `students_select_superadmin` | students | reescrita | El superadmin ve todas las fichas |
| `students_insert_admin` | students | reescrita | El school_admin crea fichas de su colegio |
| `students_update_admin` | students | reescrita | El school_admin edita fichas de su colegio |
| `students_update_superadmin` | students | reescrita | El superadmin edita cualquier ficha |
| `students_insert_superadmin` | students | reescrita | El superadmin crea fichas |
| `registration_requests_select_staff` | registration_requests | reescrita | El staff ve solicitudes de su colegio |
| `registration_requests_select_superadmin` | registration_requests | reescrita | El superadmin ve todas las solicitudes |
| `registration_requests_update_admin` | registration_requests | reescrita | El school_admin gestiona solicitudes de su colegio |
| `sections_select_school` | sections | intacta | Cada usuario ve las secciones de su colegio |
| `sections_insert_staff` | sections | intacta | El staff crea secciones en su colegio |
| `sections_update_staff` | sections | intacta | El staff edita secciones de su colegio |
| `sections_delete_admin` | sections | intacta | El school_admin borra secciones de su colegio |
| `section_members_select` | section_members | reescrita | El alumno ve su pertenencia y la de sus compañeros |
| `section_members_insert_staff` | section_members | reescrita | El staff añade miembros a secciones de su colegio |
| `section_members_delete_staff` | section_members | reescrita | El staff quita miembros de secciones de su colegio |
| `subjects_select` | subjects | intacta | Lectura de asignaturas según can_read_content |
| `subjects_insert` | subjects | intacta | Escritura de asignaturas según can_write_content |
| `subjects_update` | subjects | intacta | Edición de asignaturas según can_write_content |
| `subjects_delete` | subjects | intacta | Borrado de asignaturas según can_write_content |
| `courses_select` | courses | intacta | Lectura de cursos publicados o para staff |
| `courses_insert` | courses | intacta | Escritura de cursos según can_write_content |
| `courses_update` | courses | intacta | Edición de cursos según can_write_content |
| `courses_delete` | courses | intacta | Borrado de cursos según can_write_content |
| `school_courses_select` | school_courses | intacta | Cada usuario ve los cursos de su colegio |
| `school_courses_insert` | school_courses | intacta | El superadmin o school_admin asignan cursos |
| `school_courses_update` | school_courses | intacta | El superadmin o school_admin editan asignaciones |
| `school_courses_delete` | school_courses | intacta | El superadmin o school_admin quitan asignaciones |
| `course_modules_select` | course_modules | intacta | Lectura de módulos según can_read_content |
| `course_modules_insert` | course_modules | intacta | Escritura de módulos según can_write_content |
| `course_modules_update` | course_modules | intacta | Edición de módulos según can_write_content |
| `course_modules_delete` | course_modules | intacta | Borrado de módulos según can_write_content |
| `lessons_select` | lessons | intacta | Lectura de lecciones publicadas o para staff |
| `lessons_insert` | lessons | intacta | Escritura de lecciones según can_write_content |
| `lessons_update` | lessons | intacta | Edición de lecciones según can_write_content |
| `lessons_delete` | lessons | intacta | Borrado de lecciones según can_write_content |
| `skills_select` | skills | intacta | Lectura de skills según can_read_content |
| `skills_insert` | skills | intacta | Escritura de skills según can_write_content |
| `skills_update` | skills | intacta | Edición de skills según can_write_content |
| `skills_delete` | skills | intacta | Borrado de skills según can_write_content |
| `lesson_skills_select` | lesson_skills | intacta | Lectura de skills de lección según la lección |
| `lesson_skills_insert` | lesson_skills | intacta | Escritura de skills de lección según la lección |
| `lesson_skills_delete` | lesson_skills | intacta | Borrado de skills de lección según la lección |
| `media_assets_select` | media_assets | intacta | Lectura de assets según can_read_content |
| `media_assets_insert` | media_assets | intacta | Escritura de assets según can_write_content |
| `media_assets_update` | media_assets | intacta | Edición de assets según can_write_content |
| `media_assets_delete` | media_assets | intacta | Borrado de assets según can_write_content |
| `lesson_blocks_select` | lesson_blocks | intacta | Lectura de bloques publicados o para staff |
| `lesson_blocks_insert` | lesson_blocks | intacta | Escritura de bloques según can_write_content |
| `lesson_blocks_update` | lesson_blocks | intacta | Edición de bloques según can_write_content |
| `lesson_blocks_delete` | lesson_blocks | intacta | Borrado de bloques según can_write_content |
| `questions_select_staff` | questions | intacta | Solo staff lee preguntas |
| `questions_insert` | questions | intacta | Escritura de preguntas según can_write_content |
| `questions_update` | questions | intacta | Edición de preguntas según can_write_content |
| `questions_delete` | questions | intacta | Borrado de preguntas según can_write_content |
| `question_versions_select_staff` | question_versions | intacta | Solo staff lee versiones de preguntas |
| `question_versions_insert` | question_versions | intacta | Escritura de versiones según can_write_content |
| `question_versions_delete` | question_versions | intacta | Borrado de versiones según can_write_content |
| `exam_blueprints_select_staff` | exam_blueprints | intacta | Solo staff lee blueprints |
| `exam_blueprints_insert` | exam_blueprints | intacta | Escritura de blueprints según can_write_content |
| `exam_blueprints_update` | exam_blueprints | intacta | Edición de blueprints según can_write_content |
| `exam_blueprints_delete` | exam_blueprints | intacta | Borrado de blueprints según can_write_content |
| `exam_blueprint_sections_select_staff` | exam_blueprint_sections | intacta | Solo staff lee secciones de blueprint |
| `exam_blueprint_sections_insert` | exam_blueprint_sections | intacta | Escritura de secciones según can_write_content |
| `exam_blueprint_sections_update` | exam_blueprint_sections | intacta | Edición de secciones según can_write_content |
| `exam_blueprint_sections_delete` | exam_blueprint_sections | intacta | Borrado de secciones según can_write_content |
| `exam_assignments_select_student` | exam_assignments | intacta | El alumno ve sus exámenes dentro de la ventana |
| `exam_assignments_select_staff` | exam_assignments | intacta | El staff ve exámenes de su colegio |
| `exam_assignments_insert_staff` | exam_assignments | intacta | El staff crea exámenes en su colegio |
| `exam_assignments_update_staff` | exam_assignments | intacta | El staff edita exámenes de su colegio |
| `exam_assignments_delete_admin` | exam_assignments | intacta | El school_admin borra exámenes de su colegio |
| `learning_events_select_own` | learning_events | reescrita | El alumno ve sus propios eventos |
| `learning_events_select_staff` | learning_events | reescrita | El staff ve eventos de su colegio |
| `learning_events_select_superadmin` | learning_events | reescrita | El superadmin ve todos los eventos |
| `learning_events_insert_student` | learning_events | reescrita | El alumno inserta sus propios eventos |
| `learning_events_insert_staff` | learning_events | reescrita | El staff inserta eventos de su colegio |
| `learning_events_update_staff` | learning_events | reescrita | El staff edita eventos de su colegio |
| `learning_events_delete_staff` | learning_events | reescrita | El staff borra eventos de su colegio |
| `skill_mastery_select_own` | skill_mastery | reescrita | El alumno ve su propio mastery |
| `skill_mastery_select_staff` | skill_mastery | reescrita | El staff ve mastery de su colegio |
| `skill_mastery_select_superadmin` | skill_mastery | reescrita | El superadmin ve todo el mastery |
| `skill_mastery_insert_staff` | skill_mastery | reescrita | El staff inserta mastery de su colegio |
| `skill_mastery_update_staff` | skill_mastery | reescrita | El staff edita mastery de su colegio |
| `exam_attempts_select_own` | exam_attempts | reescrita | El alumno ve sus propios intentos |
| `exam_attempts_select_staff` | exam_attempts | reescrita | El staff ve intentos de su colegio |
| `exam_attempts_select_superadmin` | exam_attempts | reescrita | El superadmin ve todos los intentos |
| `exam_attempts_insert_student` | exam_attempts | reescrita | El alumno inserta sus propios intentos |
| `exam_attempts_update_staff` | exam_attempts | reescrita | El staff edita intentos de su colegio |
| `attempt_items_select_own` | attempt_items | reescrita | El alumno ve sus propios items |
| `attempt_items_select_staff` | attempt_items | reescrita | El staff ve items de su colegio |
| `attempt_items_select_superadmin` | attempt_items | reescrita | El superadmin ve todos los items |
| `attempt_items_insert_student` | attempt_items | reescrita | El alumno inserta sus propios items |
| `attempt_items_update_staff` | attempt_items | reescrita | El staff edita items de su colegio |
| `attempt_responses_select_own` | attempt_responses | reescrita | El alumno ve sus propias respuestas |
| `attempt_responses_select_staff` | attempt_responses | reescrita | El staff ve respuestas de su colegio |
| `attempt_responses_select_superadmin` | attempt_responses | reescrita | El superadmin ve todas las respuestas |
| `attempt_responses_insert_student` | attempt_responses | reescrita | El alumno inserta sus propias respuestas |
| `attempt_responses_update_staff` | attempt_responses | reescrita | El staff edita respuestas de su colegio |
| `attempt_gradings_select_own` | attempt_gradings | reescrita | El alumno ve sus propias calificaciones |
| `attempt_gradings_select_staff` | attempt_gradings | reescrita | El staff ve calificaciones de su colegio |
| `attempt_gradings_select_superadmin` | attempt_gradings | reescrita | El superadmin ve todas las calificaciones |
| `attempt_gradings_insert_staff` | attempt_gradings | reescrita | El staff inserta calificaciones de su colegio |
| `attempt_gradings_update_staff` | attempt_gradings | reescrita | El staff edita calificaciones de su colegio |
| `audit_log_select_admin` | audit_log | reescrita | El admin ve el log de su colegio |
| `audit_log_select_staff` | audit_log | reescrita | El staff ve el log de su colegio |
| `audit_log_select_superadmin` | audit_log | reescrita | El superadmin ve todo el log |
| `audit_log_insert_staff` | audit_log | reescrita | El staff inserta entradas de log |
| `audit_log_insert_superadmin` | audit_log | reescrita | El superadmin inserta entradas de log |
| `auth_attempts_select_admin` | auth_attempts | reescrita | El admin ve intentos de autenticación de su colegio |
| `auth_attempts_select_superadmin` | auth_attempts | reescrita | El superadmin ve todos los intentos de autenticación |
