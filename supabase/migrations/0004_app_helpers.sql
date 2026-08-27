-- =============================================================================
-- 0004_app_helpers.sql — helpers de RLS
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: DATA_MODEL.md §9
-- =============================================================================
-- Va DESPUÉS de 0003 porque todas leen public.profiles.
--
-- REGLAS INNEGOCIABLES para toda función de este fichero:
--   1. `security definer`  — deben poder leer profiles sin depender de las
--      políticas de profiles (que a su vez las llaman: recursión).
--   2. `set search_path = ''` — SIN ESTO, cualquiera que pueda crear una tabla
--      en un esquema de su search_path (o envenenar el search_path de la sesión)
--      hace que `select role from profiles` lea SU tabla en vez de la nuestra, y
--      se autoconcede superadmin. Es el fallo clásico de Supabase.
--   3. `stable` — se evalúan una vez por sentencia, no por fila (con la ayuda
--      del `(select ...)` que envuelve cada llamada en 0012_rls_policies.sql).
--   4. Nombres SIEMPRE cualificados: public.profiles, auth.uid(), nunca a secas.
--
-- CONTRATO DE "ACTIVO": TODOS los helpers exigen dos cosas a la vez —
--   · `profiles.status = 'active'`  y
--   · el colegio del perfil también `schools.status = 'active'`
--     (los superadmin, que no tienen colegio, quedan exentos de la segunda).
--
-- Consecuencia deliberada: suspender un perfil, o suspender un colegio entero,
-- corta el acceso EN LA PETICIÓN SIGUIENTE — no hay que revocar sesiones ni
-- esperar a que caduque un JWT.
--
-- Un perfil `pending` o `suspended` solo puede leer su propia fila de profiles,
-- y esa política compara contra auth.uid() directamente, sin pasar por estos
-- helpers, para que la interfaz pueda explicarle por qué no entra.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- app.current_profile_id() -> uuid
-- -----------------------------------------------------------------------------
-- NO es security definer: auth.uid() solo lee un GUC de la sesión, no toca
-- tablas. Menos privilegio, misma utilidad.
create or replace function app.current_profile_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select auth.uid();
$$;

comment on function app.current_profile_id() is
  'auth.uid(). NULL si la petición no está autenticada (rol anon).';


-- -----------------------------------------------------------------------------
-- app.current_school_id() -> uuid
-- -----------------------------------------------------------------------------
-- El tenant del solicitante. NULL para superadmin (que no tiene colegio) y NULL
-- para anon o para un perfil no activo.
--
-- CUIDADO AL USARLA: `school_id = app.current_school_id()` es NULL para un
-- superadmin, y `NULL = x` es NULL, o sea falso. Es correcto y deliberado: el
-- superadmin nunca pasa por la rama de tenant, pasa por app.is_superadmin().
-- Ninguna política de 0012 depende de que esta función devuelva algo para él.
-- El join con `schools` NO es decorativo (hallazgo de la pasada 2): sin él,
-- `schools.status = 'suspended'` no tenía NINGÚN efecto. El school_admin de un
-- colegio suspendido conservaba acceso completo a sus alumnos, a sus exámenes y
-- a su auditoría, y encima podía volver a ponerlo en 'active' él mismo. Ahora
-- suspender un colegio deja a TODO su personal sin acceso en la petición
-- siguiente, igual que suspender un perfil.
create or replace function app.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.school_id
  from public.profiles p
  join public.schools s on s.id = p.school_id
  where p.id = auth.uid()
    and p.status = 'active'
    and s.status = 'active';
$$;

comment on function app.current_school_id() is
  'school_id del perfil ACTIVO de un colegio ACTIVO. NULL para superadmin, anon, perfil suspendido o colegio suspendido.';


-- -----------------------------------------------------------------------------
-- app.current_role() -> public.user_role
-- -----------------------------------------------------------------------------
create or replace function app.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active'
    and (p.school_id is null or exists (
          select 1 from public.schools s
          where s.id = p.school_id and s.status = 'active'));
$$;

comment on function app.current_role() is
  'Rol del perfil autenticado y ACTIVO. NULL si no hay sesión o el perfil no está activo.';


-- -----------------------------------------------------------------------------
-- app.is_superadmin() -> boolean
-- -----------------------------------------------------------------------------
-- Devuelve false (nunca NULL) para que sea seguro en un `using (... or ...)`:
-- un NULL en una política se trata como falso, pero un `not app.is_superadmin()`
-- con NULL también sería falso y podría cerrar una puerta que debía estar
-- abierta. coalesce elimina la clase entera de bug.
create or replace function app.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'superadmin'
     from public.profiles p
     where p.id = auth.uid() and p.status = 'active'
       and (p.school_id is null or exists (
             select 1 from public.schools s
             where s.id = p.school_id and s.status = 'active'))),
    false);
$$;

comment on function app.is_superadmin() is
  'true solo si el perfil autenticado está activo y es superadmin. Nunca devuelve NULL.';


-- -----------------------------------------------------------------------------
-- app.is_staff() -> boolean   (school_admin | teacher)
-- -----------------------------------------------------------------------------
-- No incluye superadmin: "staff" significa "personal DE UN COLEGIO". Las
-- políticas que quieren cubrir a ambos escriben `app.is_staff() or app.is_superadmin()`
-- explícitamente, para que leyendo la política se vea a quién cubre.
create or replace function app.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role in ('school_admin', 'teacher')
     from public.profiles p
     where p.id = auth.uid() and p.status = 'active'
       and (p.school_id is null or exists (
             select 1 from public.schools s
             where s.id = p.school_id and s.status = 'active'))),
    false);
$$;

comment on function app.is_staff() is
  'true si el perfil activo es school_admin o teacher. NO incluye superadmin (a propósito).';


-- -----------------------------------------------------------------------------
-- app.is_school_admin() -> boolean
-- -----------------------------------------------------------------------------
-- Distingue al administrador del colegio del profesor: el primero gestiona
-- perfiles y PINs, el segundo solo enseña y califica.
create or replace function app.is_school_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'school_admin'
     from public.profiles p
     where p.id = auth.uid() and p.status = 'active'
       and (p.school_id is null or exists (
             select 1 from public.schools s
             where s.id = p.school_id and s.status = 'active'))),
    false);
$$;


-- -----------------------------------------------------------------------------
-- app.is_student() -> boolean
-- -----------------------------------------------------------------------------
create or replace function app.is_student()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'student'
     from public.profiles p
     where p.id = auth.uid() and p.status = 'active'
       and (p.school_id is null or exists (
             select 1 from public.schools s
             where s.id = p.school_id and s.status = 'active'))),
    false);
$$;


-- -----------------------------------------------------------------------------
-- app.can_read_content(content_school_id uuid) -> boolean   (AD-2)
-- -----------------------------------------------------------------------------
-- El patrón de contenido híbrido: NULL = biblioteca global (visible para todos
-- los usuarios activos), con valor = contenido propio del colegio.
--
-- OJO al caso que parece inocente y no lo es: si el solicitante NO tiene sesión,
-- current_school_id() es NULL y `content_school_id is null` seguiría siendo true
-- → la biblioteca global quedaría legible por `anon`. Por eso se exige además
-- que exista un perfil activo. El rol `anon` tampoco recibe GRANT en 0013, así
-- que son dos capas.
create or replace function app.can_read_content(content_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select
       case
         when p.role = 'superadmin' then true            -- lo ve todo
         when content_school_id is null then true        -- biblioteca global
         else content_school_id = p.school_id            -- contenido propio
       end
     from public.profiles p
     where p.id = auth.uid() and p.status = 'active'
       and (p.school_id is null or exists (
             select 1 from public.schools s
             where s.id = p.school_id and s.status = 'active'))),
    false);
$$;

comment on function app.can_read_content(uuid) is
  'AD-2: NULL = global, con valor = del colegio. Exige perfil activo, así que anon nunca ve la biblioteca global.';


-- -----------------------------------------------------------------------------
-- app.can_write_content(content_school_id uuid) -> boolean   (AD-2)
-- -----------------------------------------------------------------------------
-- La asimetría es el punto: el contenido global se LEE por todos y se ESCRIBE
-- solo por el superadmin. Un school_admin que pudiera editar una lección global
-- la rompería para los otros 200 colegios.
create or replace function app.can_write_content(content_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select
       case
         when p.role = 'superadmin' then true
         when content_school_id is null then false       -- global: solo superadmin
         when p.role in ('school_admin', 'teacher')
              then content_school_id = p.school_id
         else false
       end
     from public.profiles p
     where p.id = auth.uid() and p.status = 'active'
       and (p.school_id is null or exists (
             select 1 from public.schools s
             where s.id = p.school_id and s.status = 'active'))),
    false);
$$;

comment on function app.can_write_content(uuid) is
  'AD-2 en escritura: el contenido global (school_id NULL) solo lo modifica el superadmin.';


-- -----------------------------------------------------------------------------
-- app.teaches_student(student_profile_id uuid) -> boolean
-- -----------------------------------------------------------------------------
-- Granularidad más fina que "es staff de mi colegio", para el día en que un
-- colegio grande no quiera que cualquier profesor vea a cualquier alumno.
-- Hoy no se usa en ninguna política; existe para que el endurecimiento futuro
-- sea un cambio de política y no un cambio de esquema.
create or replace function app.teaches_student(student_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select exists (
       select 1
       from public.section_members teacher_m
       join public.section_members student_m
         on student_m.section_id = teacher_m.section_id
       where teacher_m.profile_id = auth.uid()
         and teacher_m.role_in_section in ('teacher', 'assistant')
         and student_m.profile_id = student_profile_id
         and student_m.role_in_section = 'student'
     )
     from public.profiles p
     where p.id = auth.uid()
       and p.status = 'active'
       and p.role in ('school_admin', 'teacher')),
    false);
$$;


-- -----------------------------------------------------------------------------
-- app.is_member_of_section(section_id uuid) -> boolean
-- -----------------------------------------------------------------------------
-- Existe por una razón muy concreta: la política de `section_members` necesita
-- preguntar "¿el solicitante está en esta misma clase?", y hacerlo con un
-- `exists (select 1 from section_members ...)` DENTRO de la política de
-- section_members provoca "infinite recursion detected in policy for relation".
-- Un `security definer` lee la tabla sin pasar por sus propias políticas y corta
-- la recursión de raíz.
create or replace function app.is_member_of_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.section_members sm
    where sm.section_id = p_section_id
      and sm.profile_id = auth.uid()
  );
$$;

comment on function app.is_member_of_section(uuid) is
  'Rompe la recursión de RLS en section_members. No filtra nada: solo responde sí/no sobre el propio usuario.';


-- -----------------------------------------------------------------------------
-- Privilegios sobre los helpers
-- -----------------------------------------------------------------------------
-- Postgres concede EXECUTE a PUBLIC por defecto en cada CREATE FUNCTION. En una
-- función `security definer` eso significa "cualquiera, incluido anon, la
-- ejecuta con los privilegios del owner". Se retira y se concede a mano.
revoke all on function
  app.current_profile_id(),
  app.current_school_id(),
  app.current_role(),
  app.is_superadmin(),
  app.is_staff(),
  app.is_school_admin(),
  app.is_student(),
  app.can_read_content(uuid),
  app.can_write_content(uuid),
  app.teaches_student(uuid),
  app.is_member_of_section(uuid)
from public;

-- `authenticated` las necesita porque las políticas RLS se evalúan con su rol.
grant execute on function
  app.current_profile_id(),
  app.current_school_id(),
  app.current_role(),
  app.is_superadmin(),
  app.is_staff(),
  app.is_school_admin(),
  app.is_student(),
  app.can_read_content(uuid),
  app.can_write_content(uuid),
  app.teaches_student(uuid),
  app.is_member_of_section(uuid)
to authenticated, service_role;

-- `anon` NO recibe execute: las políticas que consulta anon (ninguna, hoy) no
-- deben poder sondear la existencia de perfiles.
