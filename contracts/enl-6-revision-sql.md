---
id: enl-6-revision-sql
model: reasoner
context: [supabase/migrations/0065_invitaciones_y_dispositivos.sql, supabase/migrations/0066_alumno_sin_colegio.sql, supabase/migrations/0067_evento_y_audit_sin_colegio.sql, supabase/migrations/0068_auditoria_de_la_cadena.sql, supabase/tests/invitaciones_y_dispositivos.sql, supabase/tests/alumno_sin_colegio.sql, supabase/migrations/0003_tenancy.sql, supabase/migrations/0011_audit.sql, supabase/migrations/0013_grants.sql, supabase/migrations/0022_fix_inert_guards.sql, supabase/migrations/0057_tutor_y_membresias.sql, supabase/migrations/0058_puede_ver_alumno.sql, supabase/migrations/0060_quitar_alcance_por_rol.sql]
rounds: 1
deadline: 1 ronda
---

## 1 · El problema

Cuatro migraciones y dos ficheros pgTAP escritos para la cadena de invitación
**no se han ejecutado nunca contra Postgres**. No hay ninguna base de datos
alcanzable donde probarlos: la de producción está bloqueada a propósito y no
existe otra. Se van a aplicar a producción en cuanto haya credencial, así que
esta lectura es la última red antes de eso.

Este contrato **no tiene `territory`**: es de informe. No escribas ningún
parche. Devuelve prosa.

## 2 · La evidencia que ya tenemos

Lo que ya salió mal una vez en este repositorio, y que por tanto es lo que hay
que buscar con más ganas:

- `0060_quitar_alcance_por_rol.sql` documenta una constraint añadida `not valid`
  que rompió el alta de alumnos y el cambio de idioma **en producción**.
- La cabecera de `scripts/db-apply.mjs` documenta una migración que citaba una
  tabla nueva en una política **sin darle `grant`**, y toda lectura de
  `profiles` murió con «permission denied»: todos los alumnos fuera.
- `0022_fix_inert_guards.sql` documenta guards que quedaron **inertes** —una
  condición al revés— sin que ningún test lo notara, porque los tests de RLS
  comprueban qué FILAS se ven y aquello era una cuestión de qué COLUMNAS se
  pueden escribir.

Los cuatro ficheros nuevos hacen, resumido: crear `guardian_invites` y
`student_devices` con `grant` por columna sobre sus hashes; hacer
`students.school_id` nullable con un índice único parcial; hacer
`learning_events.school_id` y `auth_attempts.school_id` nullable, crear
`app.colegio_del_evento()` y ampliar el guard de `app.audit()`; y reescribir
`public.audit_staff_action` con un vocabulario por rol.

## 3 · El criterio de aceptación

Un informe con **una lista numerada de hallazgos**, cada uno con: fichero y
línea, qué pasa, y qué se rompe en producción si nadie lo arregla. Ordenados de
más grave a menos. Si no encuentras nada en una categoría, dilo explícitamente
en vez de callarte — «revisado y sin hallazgos» es información.

Busca, como mínimo:

1. **Errores de sintaxis o de nombres.** ¿Existen todas las funciones, columnas
   y tipos que se citan, con esa firma exacta? `app.is_app_user`,
   `app.is_staff`, `app.is_superadmin`, `app.current_role`,
   `app.current_school_id`, `app.puede_ver_alumno`, `public.user_role`,
   `public.membership_status`, `extensions.citext`.
2. **Grants que faltan.** Una política que cita una tabla a la que quien
   pregunta no tiene `grant` tumba la consulta entera con «permission denied»,
   incluida la que otra política sí le concedía. Es el fallo de la cabecera de
   `db-apply`. ¿Le falta `grant` a alguna de las tablas nuevas, o a alguna que
   citen las políticas nuevas?
3. **Guards inertes o invertidos.** Lee el `if` de `app.audit()` en `0067` y el
   de `audit_staff_action` en `0068` **como si quisieras colarte**: ¿hay algún
   rol que pase y no deba, o alguno que no pase y sí deba? Concretamente: ¿puede
   un alumno escribir una acción del tutor? ¿Puede un tutor auditar sobre un
   niño que no es suyo? ¿Se ha quedado alguien fuera que antes entraba?
4. **Orden de aplicación.** ¿Alguna migración usa algo que crea una posterior?
   ¿`0068` depende de algo de `0067`?
5. **`NULL` tratado como falso.** En Postgres `x = NULL` es NULL, no falso, y
   una política que devuelve NULL no deja pasar. Con `school_id` ahora nullable
   en tres tablas, ¿hay alguna comparación, política o índice que se comporte
   distinto de lo que su autor creía?
6. **Los pgTAP.** ¿Cuadra cada `plan(N)` con los asserts escritos? ¿Sembran
   los tests todo lo que sus asserts necesitan, o alguno depende de filas que
   quizá no existan? ¿Hay algún assert que pase por el motivo equivocado — que
   sería un falso verde?
7. **Constraints que las filas existentes violarían.** `0066` devuelve
   `profiles_alcance_por_rol` **sin** `not valid`, así que se valida contra lo
   que haya. ¿Qué filas la violarían hoy?

## 4 · Qué NO cuenta como resuelto

- Devolver un parche: este contrato es de informe.
- «Parece correcto» sin haber mirado fichero por fichero.
- Repetir lo que los comentarios de las migraciones ya dicen de sí mismas. Los
  comentarios explican la INTENCIÓN; tu trabajo es comprobar si el SQL la
  cumple. Donde el comentario y el código digan cosas distintas, eso es
  precisamente un hallazgo.
- Callar una categoría de la lista de arriba sin decir que la has revisado.
