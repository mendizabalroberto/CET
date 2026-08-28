-- =============================================================================
-- escrituras_de_perfil.sql — la base acepta lo que la aplicacion escribe
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- QUE FAMILIA CAZA ESTE FICHERO
--
-- Una constraint puede describir un modelo de datos futuro impecable y aun asi
-- romper el producto de hoy, porque el codigo que escribe en la tabla sigue
-- siendo el de ayer. Eso no lo ve ningun test de RLS ni ningun test de esquema:
-- los dos miran la base sola.
--
-- Paso el 28 de agosto de 2026. `0056_profiles_alcance_por_rol.sql` declaro que
-- un alumno NO tiene `school_id`. La marco `NOT VALID`, que solo salta el
-- escaneo de las filas que ya existen: se sigue aplicando en cada INSERT y en
-- cada UPDATE. Como `components/staff/actions.ts` da de alta al alumno CON
-- `school_id`, y `lib/preferences-actions.ts` actualiza su fila para guardar el
-- idioma, en produccion quedo asi:
--
--   - el colegio no podia dar de alta ni un alumno (error generico en pantalla);
--   - el alumno pulsaba «Espanol» y le salia un error.
--
-- Y no se arregla vaciando el `school_id`: `api/attempts/_context.ts` y
-- `lib/auth/session.ts` cortan con `if (!profile.schoolId) -> forbidden`, asi
-- que un alumno sin colegio no puede examinarse. La migracion y el codigo se
-- contradicen, y este fichero es el que obliga a que dejen de hacerlo.
--
-- POR ESO LAS FILAS DE AQUI NO SALEN DEL FIXTURE
--
-- `helpers/fixture.psql` ya se adapto a 0056 y siembra a sus alumnos con
-- `school_id` NULL. Un test apoyado en el no habria visto nada: describe el
-- modelo nuevo, no lo que la aplicacion escribe hoy. Las filas de abajo imitan
-- a proposito la forma EXACTA de `staff/actions.ts`, que es la que llega a la
-- base en produccion.
--
-- Cuando el codigo migre a la matricula (`student_school_memberships`), este
-- fichero debe cambiar A LA VEZ que el codigo, no antes: mientras diga esto,
-- dice la verdad sobre lo que la aplicacion hace.
-- =============================================================================
begin;
select plan(3);

\ir helpers/fixture.psql

-- =============================================================================
-- A. El alta de un alumno, con la forma que escribe `staff/actions.ts`
-- =============================================================================
select lives_ok(
  $$insert into public.profiles (id, school_id, role, full_name, email, locale, status)
    values ('aaaaaaaa-0000-4000-8000-0000000000f1',
            '11111111-1111-4111-8111-111111111111',
            'student', 'Alta como la hace el panel', null, 'es', 'active')$$,
  'el colegio puede dar de alta a un alumno con school_id, como hace el panel');

-- =============================================================================
-- B. El alumno guarda su idioma
-- =============================================================================
-- `preferences-actions.ts` hace exactamente este UPDATE. Se comprueba el EFECTO
-- y no solo que no reviente: si aqui pusiera `lives_ok`, con la constraint en pie
-- el alta de arriba falla, la fila no existe, el UPDATE toca CERO filas y no
-- lanza nada — o sea, un verde por el motivo equivocado justo en el test que
-- deberia estar rojo. Es la regla 3 del repositorio, y este fichero cayo en ella
-- en su primera version.
update public.profiles set locale = 'en'
 where id = 'aaaaaaaa-0000-4000-8000-0000000000f1';

select is(
  (select locale from public.profiles where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'),
  'en',
  'el alumno puede guardar su idioma, y queda guardado');

-- =============================================================================
-- C. Control positivo: la defensa que SI tiene que seguir en pie
-- =============================================================================
-- Quitar una constraint no puede convertirse en «ya no se comprueba nada». El
-- personal sin colegio sigue siendo un estado prohibido, y lo prohibe
-- `profiles_staff_needs_email` junto al resto del esquema: un profesor sin
-- correo no entra. Si esto deja de dar error, se ha tirado de mas.
select throws_ok(
  $$insert into public.profiles (id, school_id, role, full_name, email, locale, status)
    values ('aaaaaaaa-0000-4000-8000-0000000000f2',
            '11111111-1111-4111-8111-111111111111',
            'teacher', 'Profesor sin correo', null, 'es', 'active')$$,
  '23514',
  null,
  'un profesor sin correo sigue rechazado: no se ha tirado de mas');

select * from finish();
rollback;
