-- =============================================================================
-- 0077_ingesta_del_alumno_sin_colegio.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- LA TELEMETRIA DEL NINO QUE PRACTICA EN CASA NO LLEGABA A LA BASE
--
-- Medido contra produccion el 01/09/2026: `learning_events` tenia DOS filas en
-- toda su historia, y las dos las escribe el servidor desde `lib/auth/actions`
-- (`pin_changed`, `login_success`). De la cola del navegador —`lesson_opened`,
-- `question_shown`, `answer_changed`, `practice_item_answered`, `idle_*`— no
-- habia entrado nunca ni una.
--
-- La causa no estaba en la base. 0070 ya dejo la politica de INSERT preparada
-- para el alumno sin colegio (`school_id is not distinct from
-- app.colegio_del_evento(...)`, para que NULL case con NULL) y 0067 ya hizo
-- `learning_events.school_id` nullable. La causa estaba en la ruta HTTP:
--
--   if (... || !profile.school_id) return 403;   // app/api/events/route.ts
--
-- Desde 0066 `profiles.school_id` es NULL para TODO alumno —la pertenencia vive
-- en `student_school_memberships`—, asi que esa guarda rechazaba el 100 % de
-- los lotes con un 403. Y el cliente descarta el lote ante un 403 sin reintentar
-- (`lib/telemetry/client.ts`), que es lo correcto: no hay bucle, no hay error
-- visible, no hay filas. Un fallo mudo.
--
-- POR QUE ESTA MIGRACION EXISTE SI EL ARREGLO ES DE TYPESCRIPT
--
-- La ruta tiene que escribir el MISMO `school_id` que la politica de INSERT
-- exige, o el insert muere con 42501. Esa fuente es `app.colegio_del_evento()`,
-- y `app` no la expone PostgREST: llamarla con .schema("app").rpc(...) devuelve
-- 406 / PGRST106 (el fallo de 0023 y de 0063, por tercera vez).
--
-- La alternativa era que la ruta consultase `student_school_memberships` y
-- repitiera el predicado (status activa, starts_on, ends_on). Serian dos copias
-- de la misma regla, en dos lenguajes, y el dia que divergieran el insert de un
-- alumno legitimo empezaria a dar 42501. El envoltorio deja una sola copia.
--
-- SIN ARGUMENTOS, A PROPOSITO
--
-- `app.colegio_del_evento(uuid)` acepta el alumno; este envoltorio no. Toma la
-- identidad de `auth.uid()` y solo de ahi, por lo mismo que exige el assert A2
-- de `public_rpc_surface.sql`: una funcion de `public` al alcance de
-- `authenticated` que reciba la identidad del llamante es una funcion con la
-- que cualquiera puede preguntar por otro. Aqui, ademas, seria una via para
-- averiguar en que colegio esta matriculado un menor cualquiera.
-- =============================================================================

create or replace function public.colegio_del_evento()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select app.colegio_del_evento((select auth.uid()));
$$;

-- El ACL por defecto de una funcion en Postgres YA incluye execute para PUBLIC.
-- Sin este revoke, un anonimo podria invocarla (devolveria NULL, pero la
-- superficie publica se mide por lo que es alcanzable, no por lo que responde).
revoke all on function public.colegio_del_evento() from public, anon;
grant execute on function public.colegio_del_evento() to authenticated, service_role;

comment on function public.colegio_del_evento() is
  'Colegio al que se atribuye la telemetria de QUIEN LLAMA: su matricula activa, o NULL si practica en casa. Envoltorio de app.colegio_del_evento() para que PostgREST lo alcance; sin argumentos, la identidad sale de auth.uid().';
