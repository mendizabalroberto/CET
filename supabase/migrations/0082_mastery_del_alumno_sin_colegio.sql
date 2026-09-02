-- =============================================================================
-- 0082_mastery_del_alumno_sin_colegio.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- TRES EVENTOS DE UN NINO TUMBAN EL TRABAJO DE MASTERY DE TODOS
--
--   select app.rebuild_skill_mastery();
--   --> 23502  null value in column "school_id" of relation "skill_mastery"
--
-- No es un caso de laboratorio: lo destapo `mastery_job.sql` el 01/09/2026, unas
-- horas despues de que la telemetria empezara a guardar por fin lo que emite el
-- navegador. Mario -hijo de un tutor, sin colegio- contesto TRES preguntas de
-- practica, sus tres `practice_item_answered` llegaron con `school_id` NULL, y
-- desde ese momento la funcion falla ENTERA. No para ese alumno: para todos, en
-- cada ejecucion, porque es un solo `insert ... select`.
--
-- LA CAUSA ES UNA MIGRACION QUE SE DEJO UNA TABLA
--
-- 0067 hizo `learning_events.school_id` nullable para que el hijo de un tutor
-- pudiera emitir telemetria sin atribuirsela a ningun centro. `skill_mastery`
-- se quedo con su `not null` de 0052, escrito cuando todo alumno tenia colegio.
-- Mientras la ingesta estuvo rota -y lo estuvo meses, ver 0077- no habia
-- eventos sin colegio que agregar y el desajuste no se noto. Arreglar la
-- ingesta fue lo que lo saco a la luz.
--
-- Es la misma familia que 0070, 0072, 0073, 0077 y 0079: la tenencia dejo de ser
-- obligatoria y quedan sitios que todavia la exigen. Este es uno mas.
--
-- POR QUE NULLABLE Y NO «INVENTARLE UN COLEGIO»
--
-- Un colegio de relleno seria un dato falso en la tabla que decide que sabe un
-- menor, y ademas lo pondria al alcance del RLS de ese centro. NULL dice la
-- verdad: este niño practica en casa y su dominio no pertenece a ningun colegio.
--
-- SE COMPROBO QUE NO ROMPE NADA MAS ANTES DE TOCARLO
--
--   - La clave primaria es `(student_id, skill_id)`: el colegio no entra, asi
--     que un NULL no puede duplicar ni perder filas.
--   - Las CINCO politicas de RLS se apoyan en `app.puede_ver_alumno(student_id)`
--     y ninguna compara `school_id`, asi que no hay que reescribir ninguna ni
--     aparece el `x = NULL` que en 0070 habria dejado a todos fuera.
--   - La clave foranea a `schools` sigue igual: NULL no la viola.
-- =============================================================================

alter table public.skill_mastery alter column school_id drop not null;

comment on column public.skill_mastery.school_id is
  'Colegio al que se atribuye el dominio, o NULL si el alumno practica en casa. Nullable desde 0082 por la misma razon que learning_events.school_id lo es desde 0067: la pertenencia vive en student_school_memberships y el hijo de un tutor no tiene ninguna.';
