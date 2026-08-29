-- =============================================================================
-- 0076_el_tutor_ve_a_su_hijo.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- LA OTRA MITAD DEL FALLO DE 0075.
--
-- Con `0075`, el tutor ya alcanza la fila de `guardian_students` y sabe QUE
-- tiene un hijo. Sigue sin poder leer QUIEN es: las tres politicas de lectura
-- de `profiles` son «yo mismo», «personal de mi colegio» y «superadmin», y
-- ninguna contempla al tutor. `0055` creo el rol `guardian` y `0058` creo el
-- eje `app.puede_ver_alumno()` para gobernar el acceso a datos de alumno, pero
-- `profiles` —la tabla donde vive el NOMBRE del menor— nunca se enganchó a ese
-- eje.
--
-- El sintoma en produccion era el mismo silencio de siempre: `listarHijos()`
-- recibe el id del hijo, pide su nombre a `profiles` (queries.ts:72), no
-- recibe fila, y pinta la tarjeta con el nombre vacio. Ni error, ni log, ni
-- pantalla rota: una ficha de menor sin nombre, en la unica pantalla desde la
-- que su padre puede darle acceso.
--
-- POR QUE `puede_ver_alumno` Y NO UN `exists` SOBRE `guardian_students`
-- Un `exists` escrito aqui a mano se evaluaria con las POLITICAS de quien
-- pregunta, asi que esta politica dependeria de que las de `guardian_students`
-- sigan existiendo y siendo correctas — el acoplamiento que la cabecera de
-- `0069` documenta como fuente de bucles y de fallos mudos. La funcion es
-- `security definer`: resuelve la pertenencia saltandose la RLS, y es la MISMA
-- que ya gobierna `student_devices`, `student_school_memberships` y
-- `student_access_links`. Si un dia se endurece, se endurece en todas a la vez.
--
-- NO AMPLIA EL ALCANCE DE NADIE MAS. Los otros tres caminos de la funcion —el
-- propio usuario, el personal con matricula vigente y el superadmin— ya tenian
-- su politica aqui. Lo unico que esta linea añade es el segundo camino: el
-- tutor con vinculo sin revocar.
-- =============================================================================

create policy profiles_select_alcance_de_alumno on public.profiles
  for select to authenticated
  using ((select app.puede_ver_alumno(id)));

comment on policy profiles_select_alcance_de_alumno on public.profiles is
  'Engancha profiles al eje de 0058: quien puede ver a un alumno puede leer su perfil. En la practica, lo que añade sobre las politicas ya existentes es el tutor.';
