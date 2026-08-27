# M01 · `security` — RLS transversal, auditoría, hashing y rate limiting

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Depende de: — (es la raíz del grafo). Del que dependen: todos los demás.

---

## Objetivo

Ser la capa de la que dependen los otros doce módulos para no tener que pensar en
seguridad. Concretamente:

1. **Aislamiento multi-colegio (AD-1).** Ningún usuario del colegio A lee un byte
   del colegio B, por ninguna vía: tabla, vista, función o join.
2. **Confidencialidad de la clave de corrección.** `attempt_items.answer_key` y
   `question_versions.answer_spec` no llegan al navegador de un alumno ni aunque
   una política esté mal escrita.
3. **Confidencialidad del PIN.** `students.pin_hash` no es legible por ningún rol
   salvo `service_role`.
4. **Auditoría verificable.** Toda acción de staff sobre datos de alumno queda
   registrada y ese registro no se puede editar.
5. **Resistencia a fuerza bruta** contra los PINs de 4 dígitos.

El criterio de éxito no es "no hemos encontrado fugas": es que
`supabase/tests/rls_tenant_isolation.sql` prueba tabla por tabla que no las hay.

---

## Arquitectura

Cuatro capas independientes. Cada una sola es insuficiente; las cuatro juntas
hacen que un fallo en una no sea una brecha.

| Capa | Qué protege | Dónde vive |
|---|---|---|
| **GRANT de tabla y columna** | Qué columnas puede intentar leer un rol | `supabase/migrations/0013_grants.sql` |
| **RLS** | Qué filas ve de las que puede leer | `supabase/migrations/0012_rls_policies.sql` |
| **Vistas sin columnas sensibles** | Lo único que el cliente consulta | `attempt_items_student` (0009) |
| **Triggers de integridad** | Lo que la RLS no puede expresar (columnas, inmutabilidad) | 0007, 0009, 0012 |

### Helpers de RLS (`supabase/migrations/0004_app_helpers.sql`)

Todos `stable`, `security definer`, **`set search_path = ''`**, en el esquema
`app` (que no está expuesto por PostgREST).

```
app.current_profile_id()          -> uuid
app.current_school_id()           -> uuid      -- NULL si el perfil no está `active`
app.current_role()                -> user_role
app.is_superadmin()               -> boolean   -- nunca NULL
app.is_staff()                    -> boolean   -- school_admin | teacher (NO superadmin)
app.is_school_admin()             -> boolean
app.is_student()                  -> boolean
app.can_read_content(uuid)        -> boolean   -- AD-2: NULL global OR mío
app.can_write_content(uuid)       -> boolean   -- lo global solo el superadmin
app.is_member_of_section(uuid)    -> boolean   -- rompe la recursión de RLS
app.teaches_student(uuid)         -> boolean   -- reservado para endurecer M04
```

**Tres reglas que no se negocian al escribir una política:**

1. `to authenticated` **siempre**. Sin `to`, la política aplica a `PUBLIC`, que
   incluye `anon`.
2. Cada llamada a un helper envuelta en `(select ...)`. `using (x = app.f())`
   puede ejecutar `f` una vez por fila; `using (x = (select app.f()))` la
   convierte en InitPlan y la ejecuta una vez por sentencia.
3. Toda política de escritura lleva `with check` además de `using`. Con solo
   `using`, un profesor coge una fila de su colegio y le reescribe el
   `school_id` al colegio de al lado.

### Por qué NO se usa `force row level security`

Los helpers son `security definer` propiedad de `postgres` y leen
`public.profiles`. Con FORCE, `app.current_school_id()` quedaría sujeta a las
políticas de `profiles`, que a su vez la llaman: recursión, o un helper que
devuelve NULL en silencio y convierte cada política en "no ves nada". El
aislamiento lo dan RLS + GRANTs mínimos + `to authenticated`; FORCE no protegería
de `postgres` ni de `service_role` (que son la administración) y sí rompería los
helpers.

---

## Tablas

De este módulo:

- **`audit_log`** — append-only. `school_id` y `actor_id` **sin FK**, a propósito:
  un `on delete set null` obligaría a hacer UPDATE sobre una tabla cuyo UPDATE
  está bloqueado por trigger, dejando colegios imborrables; un `cascade` borraría
  la prueba de lo que hizo el investigado. Un registro de auditoría es un hecho:
  sobrevive al actor.
- **`auth_attempts`** — rate limiting. Guarda el **código tecleado**, exista o no:
  contar intentos contra códigos inexistentes es lo que detecta una enumeración.

Transversalmente, este módulo **es dueño de la política RLS de todas las demás
tablas**. Cambiar una política es un cambio de M01 aunque la tabla sea de M09.

### Funciones de escritura

```
app.audit(action, entity_type, entity_id, before, after, ip_hash, user_agent)
```
`security definer`, único camino de escritura en `audit_log`. `actor_id` y
`actor_role` los pone el **servidor** desde la sesión, nunca el llamante:
`authenticated` no tiene INSERT sobre la tabla.

```
app.question_version_answer_spec(uuid)   app.attempt_item_answer_key(uuid)
```
Camino tasado del staff a la clave de corrección. Comprueban rol **y** tenant y
devuelven una fila cada vez. Existen porque los GRANT son por rol de Postgres y
alumnos y profesores comparten el rol `authenticated`.

---

## APIs

Este módulo no expone endpoints HTTP propios. Expone **contrato de SQL**:

| Consumidor | Usa | No debe usar |
|---|---|---|
| Cualquier política RLS | los helpers `app.*` | `auth.jwt()` crudo, subconsultas a `profiles` |
| Panel de staff | `app.audit(...)` tras cada acción sobre datos de alumno | `insert into audit_log` |
| Corrección manual (M10) | `app.attempt_item_answer_key(id)` | `select answer_key from attempt_items` |
| Ingesta de telemetría (M11) | `service_role` | el cliente escribiendo `learning_events` |
| Login (M02) | `service_role` para leer `pin_hash` | cualquier otro rol |

Regla para todos los módulos: **el rol `anon` no recibe ningún GRANT**. Lo que la
pantalla de login necesita antes de autenticarse (nombre del colegio, longitud
del PIN) lo sirve una Route Handler con `service_role` que devuelve solo esos
tres campos del colegio pedido.

---

## Frontend

M01 no tiene pantallas propias, pero impone tres invariantes al resto:

1. **Nunca se pide `select *`** sobre `attempt_items` ni `question_versions`: `*`
   expande a las columnas retiradas y la petición falla con 42501. El cliente
   consulta `attempt_items_student`.
2. **La clave nunca viaja al cliente en modo examen**, ni siquiera "para
   validar". La corrección es del servidor (AD-5).
3. Cuando una acción de staff toca datos de alumno, la Server Action llama a
   `app.audit(...)` **en la misma transacción** que la mutación. Auditar después,
   en otra transacción, produce mutaciones sin registro cuando algo falla en
   medio.

---

## Seguridad

Los cinco fallos que este módulo existe para hacer imposibles:

| Fallo | Defensa |
|---|---|
| Escalada de privilegio vía `search_path` | Toda función lleva `set search_path = ''` y nombres cualificados. Verificado en migración (0013) y en `constraints.sql`. |
| Un alumno se hace superadmin con `update profiles set role=...` | Trigger `profiles_guard_escalation`. La RLS filtra **filas**, nunca **columnas**: sin el trigger, `with check (id = auth.uid())` aprueba el cambio de rol. |
| Tabla nueva sin RLS | `do $$ ... $$` al final de 0013 que hace fallar la migración, más una aserción en `constraints.sql`. |
| Vista que salta la RLS | `attempt_items_student` se crea con `security_invoker = true`. Sin ese ajuste, la vista corre como su propietario y expone los items de todo el sistema. |
| Fuga de tenant por escritura | `with check` en toda política de escritura + triggers `*_validate_tenant` donde una FK no puede expresar "y del mismo colegio". |

**IP:** nunca en claro. `ip_hash = sha256(ip + salt)` con el salt en el entorno,
no en la base de datos: IPv4 tiene 2^32 direcciones y un hash sin salt secreto se
revierte con una tabla precalculada.

---

## Pruebas

| Fichero | Qué demuestra |
|---|---|
| `supabase/tests/rls_tenant_isolation.sql` | 27 tablas × "A no ve B", en ambos sentidos, **más 5 controles positivos** |
| `supabase/tests/rls_answer_key_hidden.sql` | `has_column_privilege` es false; `select *` falla; la vista no tiene la columna; el camino del staff comprueba tenant |
| `supabase/tests/rls_student_cannot_read_peers.sql` | Aislamiento **dentro** del colegio + el alumno no escribe nada del motor |
| `supabase/tests/constraints.sql` | Ninguna tabla sin RLS; ninguna `security definer` sin `search_path` |
| `supabase/tests/immutability.sql` | `audit_log` y `auth_attempts` no se pueden editar |

**Los controles positivos son obligatorios.** Una RLS rota que bloquee todo pasa
cualquier test de aislamiento con sobresaliente y deja el producto inservible.
Todo fichero de test de RLS de este proyecto incluye al menos una aserción de que
el acceso legítimo **sí** funciona.

---

## Criterios de finalización

- [ ] `select relname from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p') and not relrowsecurity` devuelve **0 filas**.
- [ ] Ninguna función de `app` o `public` con `prosecdef` carece de `search_path` en `proconfig`.
- [ ] `has_column_privilege('authenticated', ...)` es **false** para `attempt_items.answer_key`, `attempt_items.item_seed`, `question_versions.answer_spec` y `students.pin_hash`.
- [ ] `anon` no tiene ningún privilegio sobre ninguna tabla de `public`.
- [ ] Los cinco ficheros pgTAP en verde, con sus controles positivos.
- [ ] Toda política tiene `to authenticated`; toda política de escritura tiene `with check`.
- [ ] `app.audit()` es el único camino de escritura a `audit_log` y está probado.
- [ ] Un intento de escalada (`update profiles set role='superadmin'` como alumno) falla con 42501 en un test.
