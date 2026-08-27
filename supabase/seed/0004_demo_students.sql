-- =============================================================================
-- 0004_demo_students.sql — tres alumnos de prueba en Y6A
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- IDENTIDAD SINTÉTICA (AD-3) — cómo se crea el auth.users de un alumno
-- -----------------------------------------------------------------------------
-- Un alumno NO tiene email real: se le crea un usuario de GoTrue con un email
-- sintético e irrutable dentro del dominio reservado `.invalid` (RFC 2606, que
-- garantiza que NUNCA resolverá en DNS y por tanto no puede recibir correo):
--
--     s.<student_code>@<school_slug>.students.cet.invalid
--
-- y una contraseña que el alumno nunca ve ni teclea, derivada por HMAC de un
-- secreto de servidor. Ese par es el que la Edge Function `auth-pin` usa para
-- canjear un PIN validado por una sesión REAL de Supabase. Todo el detalle está
-- en modules/auth/CLAUDE.md.
--
-- Este seed NO crea los auth.users por la misma razón que 0001: nada de
-- credenciales en el repositorio, y los internos de `auth.users` son de GoTrue.
-- El script que sí lo hace es `scripts/seed-demo-students.ts`, que lee
-- SUPABASE_SERVICE_ROLE_KEY y CET_STUDENT_PASSWORD_SECRET del entorno.
--
-- SOBRE EL PIN: `pin_hash` es un hash Argon2id de un PIN de 4 dígitos (el
-- colegio demo es de primaria, `pin_length_primary = 4`). Los PIN se generan
-- aleatoriamente en ese mismo script y se entregan al profesor en papel;
-- `pin_must_change = true` obliga al alumno a cambiarlo en el primer acceso
-- (AD-4). No hay ningún PIN escrito en este fichero, y el CHECK
-- `students_pin_hash_is_argon2id` impide que alguien intente guardar uno en
-- claro "solo para probar".
--
-- Este fichero se ejecuta DESPUÉS de ese script y se limita a crear los
-- `profiles`, los `students` y la matrícula en Y6A a partir de los auth.users
-- que ya existen. Es idempotente.
-- =============================================================================

do $$
declare
  v_school_id  uuid := '00000000-0000-4000-8000-000000000001';
  v_section_id uuid := '00000000-0000-4000-8000-0000000000a1';
  v_slug       text;
  v_user_id    uuid;
  r            record;
begin
  select s.slug::text into v_slug from public.schools s where s.id = v_school_id;
  if v_slug is null then
    raise exception 'Falta el colegio demo. Ejecuta antes 0002_demo_school.sql.'
      using errcode = 'no_data_found';
  end if;

  for r in
    select * from (values
      ('Y6A-001', 'Lucía Fernández',  'lucia.guardian@example.com'),
      ('Y6A-002', 'Mateo Rodríguez',  'mateo.guardian@example.com'),
      ('Y6A-003', 'Aisha Okonkwo',    'aisha.guardian@example.com')
    ) as t(student_code, full_name, guardian_email)
  loop
    -- El email sintético es la clave que enlaza el auth.users con este seed.
    select u.id into v_user_id
    from auth.users u
    where lower(u.email) = lower(
      's.' || r.student_code || '@' || v_slug || '.students.cet.invalid');

    if v_user_id is null then
      raise exception using
        errcode = 'no_data_found',
        message = format('No existe auth.users para el alumno %s', r.student_code),
        hint    = 'Ejecuta antes scripts/seed-demo-students.ts, que crea los usuarios sintéticos y sus PIN.';
    end if;

    -- Perfil. `email` va NULL: minimización de datos de menores (MASTER_PLAN §9).
    -- El email sintético vive en auth.users porque GoTrue lo exige; no se copia
    -- aquí porque no es un dato de contacto de nadie.
    insert into public.profiles (id, school_id, role, full_name, email, locale, status)
    values (v_user_id, v_school_id, 'student', r.full_name, null, 'es', 'active')
    on conflict (id) do update
      set full_name = excluded.full_name,
          school_id = excluded.school_id,
          role      = 'student',
          status    = 'active';

    -- Ficha de alumno. `pin_hash` lo escribió ya el script de creación; si la
    -- fila no existe aún, este seed no puede inventarse un hash — falla claro.
    if not exists (select 1 from public.students st where st.profile_id = v_user_id) then
      raise exception using
        errcode = 'no_data_found',
        message = format('El alumno %s no tiene ficha con pin_hash', r.student_code),
        hint    = 'scripts/seed-demo-students.ts inserta students(pin_hash) con Argon2id. Este seed no genera PIN.';
    end if;

    update public.students st
       set student_code   = r.student_code::extensions.citext,
           year_level     = 6,
           stage          = 'primary',   -- => PIN de 4 dígitos (pin_length_primary)
           section        = 'Y6A',
           guardian_email = r.guardian_email::extensions.citext
     where st.profile_id = v_user_id;

    -- Matrícula en la clase.
    insert into public.section_members (section_id, profile_id, role_in_section, school_id)
    values (v_section_id, v_user_id, 'student', v_school_id)
    on conflict (section_id, profile_id) do nothing;

    raise notice 'Alumno demo % listo (%).', r.student_code, v_user_id;
  end loop;
end;
$$;
