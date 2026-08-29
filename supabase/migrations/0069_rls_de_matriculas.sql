-- =============================================================================
-- 0069_rls_de_matriculas.sql — la matricula tenia RLS y ninguna politica
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- `0057` creo `student_school_memberships` con `enable row level security` y
-- SIN ESCRIBIR NI UNA POLITICA. Mientras el alumno siguio llevando su colegio en
-- `profiles.school_id` eso no se noto: nadie necesitaba leer la tabla.
--
-- `0066` vacio esa columna, y con ella la tabla paso a ser la unica fuente de
-- la pertenencia. `profiles_select_school` la resuelve con un EXISTS sobre esta
-- tabla — y una subconsulta dentro de una politica se evalua con los privilegios
-- y las POLITICAS de quien pregunta. Sin politica aqui, ese EXISTS es siempre
-- falso, y el resultado en produccion habria sido:
--
--   · un profesor deja de ver los perfiles de sus alumnos;
--   · un school_admin deja de verlos y de poder actualizarlos;
--   · el panel del colegio sale vacio, sin un solo error que lo explique.
--
-- Lo destapo `rls_tenant_isolation.sql`, cuyo control cuenta perfiles EXACTOS y
-- no `>= n`: con un umbral flojo, «ver de menos» habria pasado el control tan
-- contento. La cifra exacta comprueba las dos direcciones.
--
-- POR QUE ESTAS POLITICAS NO SE RECURSAN
-- `app.current_school_id()`, `app.is_staff()` y `app.puede_ver_alumno()` son
-- `security definer`: leen `profiles` saltandose la RLS. Si estas politicas
-- citaran `public.profiles` directamente, Postgres tendria que evaluar la
-- politica de `profiles` — que cita esta tabla — y entrariamos en un bucle.
-- =============================================================================

-- El alumno ve sus propias matriculas. Es su historial escolar.
create policy membresias_select_propia on public.student_school_memberships
  for select to authenticated
  using (student_id = (select auth.uid()));

-- El tutor, las de sus hijos. `app.puede_ver_alumno` es la MISMA funcion que
-- gobierna el resto de su alcance: si un dia se endurece, se endurece aqui
-- tambien, sin que nadie tenga que acordarse de este fichero.
create policy membresias_select_tutor on public.student_school_memberships
  for select to authenticated
  using ((select app.puede_ver_alumno(student_id)));

-- El personal, las de SU colegio. `school_id` es una columna de esta misma
-- fila, asi que no hace falta salir a ningun sitio para decidir.
create policy membresias_select_personal on public.student_school_memberships
  for select to authenticated
  using (
    (select app.is_staff()) and school_id = (select app.current_school_id())
  );

-- El superadmin, todas.
create policy membresias_select_superadmin on public.student_school_memberships
  for select to authenticated
  using ((select app.is_superadmin()));

-- SIN POLITICAS DE ESCRITURA, y es deliberado. Una matricula la crea el alta de
-- alumno del panel y la aprueba un administrador, y las dos cosas pasan por
-- `service_role` desde una accion de dominio auditada. Que un `authenticated`
-- no pueda escribir aqui significa que nadie se matricula a si mismo en un
-- colegio, que es exactamente la garantia que se quiere.

comment on table public.student_school_memberships is
  'La matricula del alumno, con fechas. Lectura: el propio alumno, su tutor, el personal de ese colegio y el superadmin. Escritura: solo service_role, desde una accion de dominio auditada.';
