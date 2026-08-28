-- =============================================================================
-- 0056_profiles_alcance_por_rol.sql — la constraint de profiles por rol
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- La constraint vieja era binaria: o eres superadmin y no tienes colegio, o
-- tienes colegio. Con el tutor como raíz hay CUATRO combinaciones legítimas y
-- una sola prohibida —personal sin colegio—, así que la constraint pasa a
-- enumerar por rol en vez de comparar dos booleanos.
-- =============================================================================

alter table public.profiles
  drop constraint if exists profiles_superadmin_has_no_school;

alter table public.profiles
  add constraint profiles_alcance_por_rol check (
    case role
      when 'superadmin'   then school_id is null
      when 'school_admin' then school_id is not null
      when 'teacher'      then school_id is not null
      when 'student'      then school_id is null
      when 'guardian'     then school_id is null
    end
  ) not valid;

comment on constraint profiles_alcance_por_rol on public.profiles is
  'El personal pertenece a un colegio; superadmin, alumno y tutor no. La matricula del alumno vive en student_school_memberships, no aqui. NOT VALID hasta que la migracion 0061 valide los alumnos existentes.';
