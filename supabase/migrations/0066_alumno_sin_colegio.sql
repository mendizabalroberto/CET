-- =============================================================================
-- 0066_alumno_sin_colegio.sql — la tanda que 0060 dejo pendiente
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- 0060 retiro `profiles_alcance_por_rol` y dejo escrito por que: la aplicacion
-- seguia dando de alta al alumno CON colegio, asi que la constraint cortaba
-- caminos legitimos sin comprar ninguna garantia. Su cabecera dice que la
-- constraint vuelve «EN LA MISMA TANDA que la migracion de los datos y que el
-- codigo que los lee». Esta es esa tanda: la tarea 5 del plan purga los
-- `if (!schoolId)` y la 16 borra el unico alumno que la violaria.
-- =============================================================================

alter table public.students alter column school_id drop not null;

-- `students_code_uniq` es unique (school_id, student_code). Con school_id NULL
-- esa constraint NO impide nada: en Postgres dos NULL son distintos entre si.
-- El indice parcial es lo que devuelve la unicidad justo en el caso nuevo.
create unique index students_code_sin_colegio_uniq
  on public.students (student_code) where school_id is null;

-- La constraint vuelve, y esta vez SIN `not valid`: se valida contra las filas
-- existentes, que a estas alturas son las que la tarea 16 dejo.
alter table public.profiles
  add constraint profiles_alcance_por_rol check (
    case role
      when 'superadmin'   then school_id is null
      when 'school_admin' then school_id is not null
      when 'teacher'      then school_id is not null
      when 'student'      then school_id is null
      when 'guardian'     then school_id is null
    end
  );

comment on index public.students_code_sin_colegio_uniq is
  'La unicidad del codigo cuando no hay colegio. Sin esto, students_code_uniq no impide nada.';
