# Alta por enlace — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un superadmin invite a un tutor por enlace, que ese tutor cree a su hijo y le genere otro enlace, y que el hijo —tras fijar su PIN— vuelva al día siguiente y entre tecleando solo cuatro dígitos.

**Architecture:** Un mismo mecanismo en los tres eslabones: token aleatorio de 32 bytes, del que la base guarda únicamente el SHA-256, con caducidad, revocable y consumido al primer canje. La cookie de dispositivo (`HttpOnly`) **no abre sesión**: solo identifica al alumno para saltarse los pasos «colegio» y «código» del formulario; la sesión sigue naciendo de un Argon2id verificado dentro de la Edge Function `auth-pin`.

**Tech Stack:** Postgres 17 + RLS, pgTAP, Supabase Edge Functions (Deno + `hash-wasm`), Next.js 15 App Router con Server Actions, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-29-alta-por-enlace-design.md`

## Global Constraints

- **Toda tabla lleva RLS habilitada.** Sin excepción. Una tabla sin política es una tabla inaccesible, que es el fallo seguro correcto.
- **Todo `foreign key` declara `on delete` explícitamente.** Nunca se deja el default.
- **Ningún token en claro en reposo.** Ni en la base, ni en un log, ni en un mensaje de error. Solo su SHA-256 en hexadecimal minúsculas.
- **Zod en ambos extremos de cada frontera** (formulario → Server Action → base de datos). Un esquema, inferencia de tipos gratis.
- **TypeScript `strict: true` y `noUncheckedIndexedAccess`.** Sin `any` implícito en código de producción.
- **Texto visible al usuario en `es` y `en`**, desde los diccionarios de `apps/web/src/lib/i18n/dictionaries/`. Ni una cadena a pelo en un componente.
- **`packages/ui/src/index.ts` y `packages/shared/src/index.ts` son territorio ajeno**: ningún contrato delegado los toca.
- **Migraciones:** numeración estricta y correlativa. La última en el árbol es `0064_tiempo_de_estudio.sql`; este plan usa `0065`, `0065` y `0066`.
- **Nunca aplicar migraciones contra producción desde un contrato.** `node scripts/db-apply.mjs migrations` tiene guarda de producción y así se queda.
- **Argon2id, parámetros fijos:** `{ parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32 }`. Idénticos en `student-pin` y en el hash señuelo de `auth-pin`; si divergen, el tiempo de respuesta revela qué cuentas existen.
- **Todo fallo de credencial devuelve el mismo cuerpo y el mismo tiempo.** `MIN_RESPONSE_MS = 350`.

---

## Estructura de ficheros

**Base de datos**

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/0065_invitaciones_y_dispositivos.sql` | `guardian_invites`, `student_devices`, su RLS y sus grants por columna |
| `supabase/migrations/0066_alumno_sin_colegio.sql` | `students.school_id` nullable, índice único parcial del código, `profiles_alcance_por_rol` de vuelta |
| `supabase/migrations/0067_evento_y_audit_sin_colegio.sql` | `learning_events.school_id` nullable, `app.colegio_del_evento()`, `app.audit()` admite al tutor |
| `supabase/tests/invitaciones_y_dispositivos.sql` | pgTAP de 0064 |
| `supabase/tests/alumno_sin_colegio.sql` | pgTAP de 0065 y 0066 |

**Edge Functions**

| Fichero | Responsabilidad |
|---|---|
| `supabase/functions/student-pin/index.ts` | nueva `op: "set-from-link"` — fija el primer PIN sin exigir el anterior |
| `supabase/functions/auth-pin/index.ts` | segunda puerta `{ deviceToken, pin }` |

**Aplicación** — todo lo nuevo del tutor vive junto, porque cambia junto:

| Fichero | Responsabilidad |
|---|---|
| `apps/web/src/lib/tutor/tokens.ts` | generar y hashear tokens. Sin dependencias de Supabase: es puro y se testea puro |
| `apps/web/src/lib/tutor/dispositivo.ts` | nombre, forma y lectura/escritura de la cookie; familia de user-agent |
| `apps/web/src/lib/tutor/schemas.ts` | los cinco Zod de esta funcionalidad |
| `apps/web/src/lib/tutor/actions.ts` | las seis Server Actions |
| `apps/web/src/lib/tutor/queries.ts` | lecturas de la zona del tutor y del `/login` con cookie |
| `apps/web/src/components/tutor/*` | las pantallas del tutor y del canje |

**Pruebas de punta a punta:** `apps/web/e2e/alta-por-enlace.spec.ts`.

---

## Reparto entre agentes

| Tareas | Contrato | Agente |
|---|---|---|
| 2 | `contracts/enl-1-tablas.md` | DeepSeek `reasoner` |
| 3, 4 | `contracts/enl-2-alumno-sin-colegio.md` | DeepSeek `reasoner` |
| 6, 7 | `contracts/enl-3-dos-puertas.md` | Kimi `k3` |
| 8, 9, 10 | `contracts/enl-4-acciones.md` | Kimi `codigo` |
| 15 | `contracts/enl-5-e2e.md` | Kimi `codigo` |
| 1, 5, 11, 12, 13, 14, 16, 17 | — | Opus, en esta sesión |

Orden: 1 → 2 → (3, 4) → 5 → (6-7 ‖ 8-10) → 11-14 → 15 → 16 → 17.
`enl-1` y `enl-2` **no van en el mismo `--batch`**: sus territorios se solapan en `supabase/tests/` y el motor valida que sean disjuntos.

---

### Task 1: Los cinco contratos

**Files:**
- Create: `contracts/enl-1-tablas.md`, `contracts/enl-2-alumno-sin-colegio.md`, `contracts/enl-3-dos-puertas.md`, `contracts/enl-4-acciones.md`, `contracts/enl-5-e2e.md`

**Interfaces:**
- Consumes: nada.
- Produces: los ficheros que consumen `scripts/deepseek/run-contract.mjs` y `scripts/kimi/run-contract.mjs`.

- [ ] **Step 1: Escribir `contracts/enl-1-tablas.md`**

```markdown
---
id: enl-1-tablas
model: reasoner
territory: [supabase/migrations/0065_invitaciones_y_dispositivos.sql, supabase/tests/invitaciones_y_dispositivos.sql]
forbidden: [packages/ui/src/index.ts, packages/shared/src/index.ts, supabase/migrations/0057_tutor_y_membresias.sql]
context: [supabase/migrations/0057_tutor_y_membresias.sql, supabase/migrations/0013_grants.sql, supabase/migrations/0058_puede_ver_alumno.sql, docs/superpowers/specs/2026-08-29-alta-por-enlace-design.md]
verify: node scripts/db-test.mjs invitaciones_y_dispositivos
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 4
deadline: 4 rondas o 30 min
---

## 1 · El problema

Faltan dos tablas: `guardian_invites` (el enlace con el que un tutor se da de
alta) y `student_devices` (el dispositivo que un alumno ya canjeó). Las dos
guardan un secreto, y las dos deben guardarlo **hasheado**.

## 2 · La evidencia que ya tenemos

`supabase/migrations/0057_tutor_y_membresias.sql` ya creó `student_access_links`
con exactamente esta disciplina: `token_hash text not null unique`, RLS
habilitada, índice por la entidad. Cópiala.

`supabase/migrations/0013_grants.sql` retira `SELECT` sobre `students.pin_hash`
a `authenticated` y a `anon` **con un grant por columna**, no solo con una
política. Ese es el patrón que hay que repetir sobre `guardian_invites.token_hash`
y sobre `student_devices.device_hash`.

`app.puede_ver_alumno(uuid)` existe desde `0058` y es la función que decide si
un tutor puede ver los datos de un alumno.

El spec §4.1 y §4.2 fija las columnas exactas.

## 3 · El criterio de aceptación

`node scripts/db-test.mjs invitaciones_y_dispositivos` en verde, con
`supabase/tests/invitaciones_y_dispositivos.sql` declarando `plan(8)`:

1. `has_table('public','guardian_invites')`.
2. `has_table('public','student_devices')`.
3. RLS habilitada en las dos (`pg_class.relrowsecurity`).
4. `guardian_invites.token_hash` tiene `unique`.
5. `student_devices.device_hash` tiene `unique`.
6. `authenticated` NO tiene `select` sobre `guardian_invites.token_hash`
   (`has_column_privilege('authenticated','public.guardian_invites','token_hash','SELECT')`
   es falso).
7. Lo mismo sobre `student_devices.device_hash`.
8. Un `insert` en `student_devices` con `student_id` inexistente falla con `23503`.

## 4 · Qué NO cuenta como resuelto

- Guardar un token en claro en cualquiera de las dos tablas.
- Tablas sin RLS habilitada.
- Proteger el hash solo con una política y no con `grant` por columna: una
  política se reescribe mal, un grant por columna lo impide el motor.
- FK sin `on delete` explícito.
- Un `plan(N)` que no cuadre con los asserts escritos.
- Tocar `0057`, que ya está aplicada en producción.
```

- [ ] **Step 2: Escribir `contracts/enl-2-alumno-sin-colegio.md`**

```markdown
---
id: enl-2-alumno-sin-colegio
model: reasoner
territory: [supabase/migrations/0066_alumno_sin_colegio.sql, supabase/migrations/0067_evento_y_audit_sin_colegio.sql, supabase/tests/alumno_sin_colegio.sql]
forbidden: [packages/ui/src/index.ts, packages/shared/src/index.ts, supabase/migrations/0060_quitar_alcance_por_rol.sql]
context: [supabase/migrations/0003_tenancy.sql, supabase/migrations/0011_audit.sql, supabase/migrations/0022_fix_inert_guards.sql, supabase/migrations/0024_learning_events_ingest.sql, supabase/migrations/0060_quitar_alcance_por_rol.sql, supabase/tests/escrituras_de_perfil.sql]
verify: node scripts/db-test.mjs alumno_sin_colegio
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 4
deadline: 4 rondas o 30 min
---

## 1 · El problema

Un alumno creado por su tutor no tiene colegio, y hoy la base lo impide en tres
sitios: `students.school_id` es `not null`, la unicidad del código se apoya en
un `school_id` que sería NULL, y `app.audit()` levanta una excepción cuando el
actor es un tutor.

## 2 · La evidencia que ya tenemos

`0003_tenancy.sql:164` declara `school_id uuid not null` en `students`, y
`students_code_uniq` es `unique (school_id, student_code)`. En Postgres dos NULL
son **distintos entre sí**, así que con `school_id` nulo esa constraint deja
entrar códigos repetidos: hace falta además un índice único parcial.

`0022_fix_inert_guards.sql:210` define `app.audit()`. Su guard es:

    if app.is_app_user() and not (app.is_staff() or app.is_superadmin()) then
      raise exception 'Solo el personal del colegio escribe en el audit_log'

Un `guardian` es `app.is_app_user()` y no es staff, así que **hoy un tutor no
puede auditar ni sus propias acciones**. `audit_log.school_id` ya es nullable
(`0011_audit.sql:27`), así que la columna no es el problema: lo es el guard.

`0060_quitar_alcance_por_rol.sql` retiró `profiles_alcance_por_rol` y dejó
escrito por qué: la aplicación seguía escribiendo `school_id` en alumnos. Su
cabecera dice que la constraint vuelve «EN LA MISMA TANDA que la migración de
los datos y que el código que los lee». Esta es esa tanda.

## 3 · El criterio de aceptación

`node scripts/db-test.mjs alumno_sin_colegio` en verde, con `plan(7)`:

1. `students.school_id` admite NULL (`col_is_null`).
2. Dos alumnos sin colegio con el MISMO `student_code` fallan con `23505`.
3. Dos alumnos sin colegio con códigos distintos entran (`lives_ok`).
4. `learning_events.school_id` admite NULL.
5. `app.colegio_del_evento(uuid)` existe y devuelve NULL para un alumno sin
   membresía activa.
6. Un `profiles` con `role='guardian'` y `school_id` no nulo falla con `23514`.
7. `app.audit('tutor.hijo_creado','profiles', ...)` ejecutada como un `guardian`
   **no** levanta excepción y devuelve un `bigint`.

`0066` hace: `alter table public.students alter column school_id drop not null`;
crea `create unique index students_code_sin_colegio_uniq on public.students
(student_code) where school_id is null`; y devuelve `profiles_alcance_por_rol`
tal y como la declaró `0056`, esta vez **sin** `not valid`.

`0067` hace: `learning_events.school_id` nullable, `app.colegio_del_evento()`
como `security definer` con `search_path = ''`, y amplía el guard de
`app.audit()` para que un `guardian` pueda escribir entradas **cuyo
`entity_id` sea un hijo suyo o él mismo**, comprobándolo con
`app.puede_ver_alumno()`.

## 4 · Qué NO cuenta como resuelto

- Quitar el guard de `app.audit()` en vez de acotarlo: dejaría que cualquier
  alumno llenase el log de auditoría, que es el fallo que `0022` vino a cerrar.
- Un índice único no parcial sobre `student_code`: rompería a los alumnos de
  colegio, cuyo código solo es único dentro de su colegio.
- Devolver `profiles_alcance_por_rol` con `not valid`: es lo que dejó `0056`
  inservible.
- Tocar `0060`, que ya está aplicada.
- Escribir la migración de datos (el borrado de `Y6A-001`): no es tuya.
```

- [ ] **Step 3: Escribir `contracts/enl-3-dos-puertas.md`**

```markdown
---
id: enl-3-dos-puertas
model: k3
territory: [supabase/functions/auth-pin/index.ts, supabase/functions/student-pin/index.ts]
forbidden: [packages/ui/src/index.ts, packages/shared/src/index.ts, apps/web/**]
context: [supabase/migrations/0065_invitaciones_y_dispositivos.sql, docs/superpowers/specs/2026-08-29-alta-por-enlace-design.md]
verify: pnpm vitest run supabase/functions
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 3
timeout: 1800
deadline: 3 rondas o 40 min
---

## 1 · El problema

`auth-pin` solo sabe entrar por `{schoolId, studentCode, pin}`. Necesita una
segunda puerta, `{deviceToken, pin}`, sin relajar nada de lo que protege la
primera. Y `student-pin` necesita una operación nueva que fije el PRIMER PIN sin
exigir el anterior, porque quien la invoca ya presentó un enlace de un solo uso.

## 2 · La evidencia que ya tenemos

La cabecera de `auth-pin/index.ts` documenta las tres defensas y por qué existen:
hash señuelo con los MISMOS parámetros de coste, suelo de `MIN_RESPONSE_MS = 350`
en TODAS las salidas, y cuerpo de respuesta idéntico para todo fallo de
credencial. El motivo, literal: «si "código inexistente" respondiera en 5 ms y
"PIN incorrecto" en 90 ms, cualquiera enumeraría el listado completo de alumnos
de un colegio con un script y un cronómetro».

`student-pin/index.ts` ya tiene una unión discriminada por `op` con `change`,
`reset` y `provision`, y es el único sitio del sistema que calcula Argon2id.

`student_devices` (migración `0065`) tiene `device_hash` = SHA-256 hex del
secreto, y `revoked_at`.

## 3 · El criterio de aceptación

En `auth-pin`:

- El Zod de entrada pasa a ser `z.union([...])` con la forma vieja intacta y
  `{ deviceToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/), pin: z.string().regex(/^[0-9]{4,8}$/) }`.
- La puerta del dispositivo resuelve `student_devices` por
  `device_hash = sha256hex(deviceToken)` con `revoked_at is null`, y a partir de
  ahí **reutiliza exactamente el mismo camino** que la puerta vieja: lockout,
  Argon2id, canje por sesión.
- El lockout y el rate limit se cuentan **por `profile_id` de alumno**, no por
  puerta. Un intento fallido por dispositivo gasta el mismo cupo que uno por
  código.
- `deviceToken` desconocido o revocado: se verifica igualmente contra
  `DECOY_HASH` y se responde `genericFailure()` a través de `respond()`.
- Al entrar con éxito por la puerta del dispositivo se escribe `last_seen_at`.

En `student-pin`, una `op` nueva:

    { op: "set-from-link", studentProfileId: uuid, newPin: string }

que exige que el llamante sea `service_role` (no un JWT de usuario), escribe
`pin_hash`, pone `pin_must_change = false` y `pin_updated_at = now()`, y aplica
la MISMA lista de PIN débiles que ya aplica `change`.

`pnpm test:functions` en verde. Las pruebas van en
`supabase/functions/_shared/puertas.test.ts` y comprueban, sin red, las
funciones puras que extraigas: el discriminador de entrada y el cálculo de
`sha256hex`.

## 4 · Qué NO cuenta como resuelto

- Una salida de `auth-pin` que no pase por `respond()`: rompe el suelo de tiempo
  y con él la defensa entera.
- Contar el lockout por puerta: convierte la puerta nueva en un rodeo para
  gastar intentos infinitos contra el mismo PIN.
- Que la puerta del dispositivo devuelva un mensaje distinto de `genericFailure()`.
- Que `set-from-link` acepte un JWT de alumno o de tutor: solo `service_role`.
- Cambiar los parámetros de coste de Argon2id.
- Tocar cualquier fichero de `apps/web/`.
```

- [ ] **Step 4: Escribir `contracts/enl-4-acciones.md`**

```markdown
---
id: enl-4-acciones
model: codigo
territory: [apps/web/src/lib/tutor/**]
forbidden: [packages/ui/src/index.ts, packages/shared/src/index.ts, apps/web/src/components/**, apps/web/src/app/**]
context: [apps/web/src/lib/auth/schemas.ts, apps/web/src/lib/auth/actions.ts, apps/web/src/components/staff/actions.ts, apps/web/src/lib/supabase/admin.ts, docs/superpowers/specs/2026-08-29-alta-por-enlace-design.md]
verify: pnpm vitest run apps/web/src/lib/tutor
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 3
timeout: 1800
deadline: 3 rondas o 40 min
---

## 1 · El problema

No existe la capa de dominio del tutor: generar y hashear tokens, los Zod de
las cinco entradas, y las seis Server Actions que mueven la cadena de
invitación.

## 2 · La evidencia que ya tenemos

`apps/web/src/lib/auth/schemas.ts` fija el estilo de los Zod y ya exporta
`pinSchema` y `studentCodeSchema`; reutilízalos, no los redefinas.

`apps/web/src/components/staff/actions.ts:389` (`createStudent`) es el modelo
exacto de una acción que escala privilegios: comprueba el rol ANTES, documenta
el motivo en `createAdminClient("...")`, y hace `rollback()` borrando el
`auth.users` si falla un paso posterior. Cópialo, incluido el rollback.

`apps/web/src/lib/supabase/admin.ts` exige una razón en texto al crear el
cliente administrativo. No es decorativa.

Las firmas exactas están en la sección «Interfaces» de las tareas 8, 9 y 10 del
plan `docs/superpowers/plans/2026-08-29-alta-por-enlace.md`. Respétalas al
carácter: hay pantallas que las importan.

## 3 · El criterio de aceptación

`pnpm vitest run apps/web/src/lib/tutor` en verde, con pruebas que comprueban:

- `generarToken()` devuelve 43 caracteres de base64url y dos llamadas no
  coinciden.
- `hashToken()` es estable, devuelve 64 hex en minúsculas, y NO devuelve el
  token.
- `familiaDeAgente()` sobre un user-agent de Chrome en Android devuelve
  `"Chrome en Android"`, y sobre uno desconocido devuelve `"Navegador"` —
  nunca la cadena original.
- Los cinco Zod aceptan lo válido y rechazan: token corto, token con `+` o `/`,
  PIN de 3 dígitos, PIN y repetición distintos, correo sin `@`.

## 4 · Qué NO cuenta como resuelto

- Guardar el token en claro en la base de datos, o registrarlo con
  `console.log`.
- Una acción que devuelva la URL del enlace más de una vez.
- `familiaDeAgente()` devolviendo el user-agent completo: es la huella digital
  de un menor.
- Una acción que escale a `createAdminClient` sin comprobar el rol antes.
- Tocar `apps/web/src/components/**` o `apps/web/src/app/**`: las pantallas son
  de otro.
```

- [ ] **Step 5: Escribir `contracts/enl-5-e2e.md`**

```markdown
---
id: enl-5-e2e
model: codigo
territory: [apps/web/e2e/alta-por-enlace.spec.ts]
forbidden: [packages/ui/src/index.ts, packages/shared/src/index.ts, apps/web/src/**]
context: [apps/web/e2e/login.spec.ts, docs/superpowers/specs/2026-08-29-alta-por-enlace-design.md]
verify: pnpm --filter web exec playwright test alta-por-enlace
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 3
timeout: 2400
deadline: 3 rondas o 45 min
---

## 1 · El problema

La cadena de invitación no tiene prueba de punta a punta. Es la única prueba
que puede demostrar que los cinco eslabones encajan.

## 2 · La evidencia que ya tenemos

`apps/web/e2e/login.spec.ts` fija cómo se arranca la app, cómo se siembra y qué
selectores se usan en este repositorio.

El recorrido está descrito paso a paso en el spec §3 y en el §9 del mismo
documento.

## 3 · El criterio de aceptación

Un solo `test()` que recorre: superadmin invita → tutor se da de alta con el
correo fijo → crea un hijo → genera su enlace → el hijo elige PIN y entra →
**cierra sesión, vuelve, y la pantalla pide SOLO el PIN** → reintentar el enlace
ya usado muestra la pantalla amable → el tutor olvida el dispositivo y la
siguiente visita vuelve a pedir colegio y código.

La segunda visita **no** puede simularse conservando la sesión: hay que borrar
las cookies de sesión de Supabase y dejar solo `cet_device`, porque lo que se
prueba es justamente que esa cookie basta para identificar y el PIN para entrar.

## 4 · Qué NO cuenta como resuelto

- Conservar la sesión entre las dos visitas: entonces la prueba pasa sin que la
  cookie de dispositivo haga nada.
- Un `expect` que compare un valor consigo mismo.
- Un `data-testid` que no exista en el código.
- Saltarse el caso del enlace ya usado.
```

- [ ] **Step 6: Commit**

```bash
git add contracts/enl-*.md
git commit -m "chore(contratos): los cinco encargos de la cadena de invitacion"
```

---

### Task 2: `guardian_invites` y `student_devices`

**Agente:** DeepSeek `reasoner`, contrato `enl-1-tablas`.

**Files:**
- Create: `supabase/migrations/0065_invitaciones_y_dispositivos.sql`
- Test: `supabase/tests/invitaciones_y_dispositivos.sql`

**Interfaces:**
- Consumes: `app.puede_ver_alumno(uuid)` de `0058`.
- Produces: las tablas `public.guardian_invites` y `public.student_devices` con las columnas del spec §4.1 y §4.2.

- [ ] **Step 1: Escribir el pgTAP que falla**

```sql
-- invitaciones_y_dispositivos.sql — pgTAP de 0064
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
begin;
select plan(8);

select has_table('public', 'guardian_invites', 'existe la invitacion de tutor');
select has_table('public', 'student_devices',  'existe el dispositivo casado');

select is(
  (select relrowsecurity from pg_class where oid = 'public.guardian_invites'::regclass),
  true, 'guardian_invites tiene RLS habilitada');
select is(
  (select relrowsecurity from pg_class where oid = 'public.student_devices'::regclass),
  true, 'student_devices tiene RLS habilitada');

select col_is_unique('public', 'guardian_invites', 'token_hash', 'el hash de la invitacion es unico');
select col_is_unique('public', 'student_devices',  'device_hash', 'el hash del dispositivo es unico');

-- Un grant por columna, no una politica: el motor lo impide, no el criterio.
select is(
  has_column_privilege('authenticated', 'public.guardian_invites', 'token_hash', 'SELECT'),
  false, 'authenticated no lee el hash de la invitacion');
select is(
  has_column_privilege('authenticated', 'public.student_devices', 'device_hash', 'SELECT'),
  false, 'authenticated no lee el hash del dispositivo');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node scripts/db-test.mjs invitaciones_y_dispositivos`
Expected: FAIL — `relation "public.guardian_invites" does not exist`.

- [ ] **Step 3: Escribir la migración**

```sql
-- =============================================================================
-- 0065_invitaciones_y_dispositivos.sql — la cadena de invitacion
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Dos tablas con la MISMA disciplina que `student_access_links` (0057): el
-- secreto no se guarda, se guarda su SHA-256. Un token en claro en reposo es
-- una credencial en reposo, y una de ellas es la de un menor.
--
-- POR QUE DOS TABLAS Y NO UNA CON DISCRIMINADOR
-- La forma es casi identica, pero una guarda la credencial de un adulto y la
-- otra la de un menor, y las politicas que las gobiernan no se parecen. Una
-- tabla unica obligaria a cada politica a razonar sobre el tipo ANTES de
-- decidir, que es la clase de politica que se escribe mal una vez y filtra
-- durante meses.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- guardian_invites — el enlace con el que un tutor se da de alta
-- -----------------------------------------------------------------------------
create table public.guardian_invites (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,
  -- A quien va dirigida. La pantalla de alta lo muestra FIJO: un enlace
  -- reenviado por error no le fabrica una cuenta a otra persona.
  email        extensions.citext not null,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  used_at      timestamptz,
  used_by      uuid references public.profiles (id) on delete set null,
  created_by   uuid references public.profiles (id) on delete set null,
  -- Vacia hasta que exista la contratacion. Es la sutura, no una promesa.
  contrato_ref text,
  created_at   timestamptz not null default now(),
  constraint invitacion_caduca_despues_de_nacer check (expires_at > created_at)
);
alter table public.guardian_invites enable row level security;
create index invitaciones_email_idx on public.guardian_invites (email);

-- SIN NINGUNA POLITICA, y es deliberado. Esta tabla la lee la accion de canje
-- con `service_role`, que las ignora. Para todos los demas es inalcanzable,
-- que es el fallo seguro correcto (DATA_MODEL §0).

-- -----------------------------------------------------------------------------
-- student_devices — el dispositivo que ya canjeo un enlace
-- -----------------------------------------------------------------------------
create table public.student_devices (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.profiles (id) on delete cascade,
  device_hash       text not null unique,
  -- Lo pone el tutor: "Tablet de casa". Es lo unico que le permite saber cual
  -- esta revocando.
  etiqueta          text,
  -- "Chrome en Android", NUNCA el user-agent completo. Minimizacion de datos:
  -- el user-agent entero de un menor es una huella digital.
  agente_familia    text,
  created_from_link uuid references public.student_access_links (id) on delete set null,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz,
  revoked_at        timestamptz
);
alter table public.student_devices enable row level security;
create index dispositivos_alumno_idx
  on public.student_devices (student_id) where revoked_at is null;

-- El alumno ve los suyos; el tutor, los de sus hijos. Nadie inserta ni
-- actualiza: eso lo hace `service_role` desde el canje.
create policy dispositivos_select_propio on public.student_devices
  for select to authenticated
  using (student_id = (select auth.uid()));

create policy dispositivos_select_tutor on public.student_devices
  for select to authenticated
  using ((select app.puede_ver_alumno(student_id)));

-- =============================================================================
-- GRANTS POR COLUMNA — la garantia que no depende de una politica
-- =============================================================================
-- Mismo patron que 0013_grants.sql sobre `students.pin_hash`. Una politica mal
-- reescrita expone la fila entera; un grant retirado por columna lo impide el
-- motor, y ninguna politica puede devolverlo.
grant select (id, student_id, etiqueta, agente_familia, created_from_link,
              created_at, last_seen_at, revoked_at)
  on public.student_devices to authenticated;
revoke select on public.student_devices from anon;

revoke all on public.guardian_invites from authenticated, anon;

comment on table public.guardian_invites is
  'Enlace de alta de tutor. Token hasheado, un solo uso, siete dias. Solo service_role lo lee.';
comment on table public.student_devices is
  'Dispositivo casado con un alumno. La cookie tiene el secreto; aqui solo vive su SHA-256.';
```

- [ ] **Step 4: Aplicar y correr las pruebas**

Run: `node scripts/db-apply.mjs migrations && node scripts/db-test.mjs invitaciones_y_dispositivos`
Expected: PASS, `# Looks like you planned 8 and ran 8`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0065_invitaciones_y_dispositivos.sql supabase/tests/invitaciones_y_dispositivos.sql
git commit -m "feat(acceso): las dos tablas de la cadena, con el hash protegido por grant de columna"
```

---

### Task 3: El alumno sin colegio, en la base

**Agente:** DeepSeek `reasoner`, contrato `enl-2-alumno-sin-colegio` (primera mitad).

**Files:**
- Create: `supabase/migrations/0066_alumno_sin_colegio.sql`
- Test: `supabase/tests/alumno_sin_colegio.sql`

**Interfaces:**
- Consumes: nada.
- Produces: `students.school_id` nullable; el índice `students_code_sin_colegio_uniq`; la constraint `profiles_alcance_por_rol` de vuelta y validada.

- [ ] **Step 1: Escribir el pgTAP que falla**

```sql
-- alumno_sin_colegio.sql — pgTAP de 0065 y 0066
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
begin;
select plan(7);

select col_is_null('public', 'students', 'school_id',
  'un alumno puede no tener colegio');

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333331', 's.hijo1@familia.cet.invalid'),
  ('33333333-3333-3333-3333-333333333332', 's.hijo2@familia.cet.invalid');
insert into public.profiles (id, school_id, role, full_name, status) values
  ('33333333-3333-3333-3333-333333333331', null, 'student', 'Hijo Uno', 'active'),
  ('33333333-3333-3333-3333-333333333332', null, 'student', 'Hijo Dos', 'active');

insert into public.students (profile_id, school_id, student_code, year_level, stage, pin_hash)
values ('33333333-3333-3333-3333-333333333331', null, 'FAM-0001', 6, 'primary', 'x');

-- En Postgres dos NULL son distintos, asi que `unique (school_id, code)` NO
-- basta: sin el indice parcial, esto entraria.
select throws_ok(
  $$insert into public.students (profile_id, school_id, student_code, year_level, stage, pin_hash)
    values ('33333333-3333-3333-3333-333333333332', null, 'FAM-0001', 6, 'primary', 'x')$$,
  '23505', null,
  'dos alumnos sin colegio no comparten codigo');

select lives_ok(
  $$insert into public.students (profile_id, school_id, student_code, year_level, stage, pin_hash)
    values ('33333333-3333-3333-3333-333333333332', null, 'FAM-0002', 6, 'primary', 'x')$$,
  'con codigos distintos, si');

select col_is_null('public', 'learning_events', 'school_id',
  'un evento puede no tener colegio');

select has_function('app', 'colegio_del_evento', array['uuid'],
  'existe el resolutor de colegio del evento');

select throws_ok(
  $$insert into auth.users (id, email) values ('33333333-3333-3333-3333-33333333333a','t@x.com');
    insert into public.profiles (id, school_id, role, full_name, email, status)
    values ('33333333-3333-3333-3333-33333333333a',
            (select id from public.schools limit 1), 'guardian', 'Tutor Con Colegio',
            't@x.com', 'active')$$,
  '23514', null,
  'un tutor no pertenece a un colegio');

select is(
  (select app.colegio_del_evento('33333333-3333-3333-3333-333333333331')),
  null,
  'un alumno sin membresia activa no aporta colegio a su evento');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node scripts/db-test.mjs alumno_sin_colegio`
Expected: FAIL en el primer assert — `school_id` es `not null`.

- [ ] **Step 3: Escribir `0066_alumno_sin_colegio.sql`**

```sql
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
```

- [ ] **Step 4: Aplicar y comprobar que avanza**

Run: `node scripts/db-apply.mjs migrations && node scripts/db-test.mjs alumno_sin_colegio`
Expected: pasan los asserts 1, 2, 3 y 6; siguen fallando 4, 5 y 7 (son de `0066`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0066_alumno_sin_colegio.sql supabase/tests/alumno_sin_colegio.sql
git commit -m "feat(tenencia): el alumno puede no tener colegio, y su codigo sigue siendo unico"
```

---

### Task 4: El evento y la auditoría sin colegio

**Agente:** DeepSeek `reasoner`, contrato `enl-2-alumno-sin-colegio` (segunda mitad).

**Files:**
- Create: `supabase/migrations/0067_evento_y_audit_sin_colegio.sql`
- Modify: `supabase/tests/alumno_sin_colegio.sql` (ya escrito en la tarea 3)

**Interfaces:**
- Consumes: `app.puede_ver_alumno(uuid)` de `0058`.
- Produces: `app.colegio_del_evento(p_student_id uuid) returns uuid`; `app.audit(...)` con el guard ampliado.

- [ ] **Step 1: Escribir `0067_evento_y_audit_sin_colegio.sql`**

```sql
-- =============================================================================
-- 0067_evento_y_audit_sin_colegio.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Dos consecuencias de que exista un alumno sin colegio:
--
--  1. Lo que practica en casa NO tiene colegio, y el colegio no debe verlo.
--     `learning_events.school_id` pasa a nullable y lo RESUELVE el servidor a
--     partir de la membresia activa, nunca el cliente.
--  2. Un tutor no puede auditar sus propias acciones. El guard de `app.audit()`
--     que introdujo 0022 dice: si eres usuario de la app y no eres staff ni
--     superadmin, excepcion. Un `guardian` cae ahi.
--
--     Se ACOTA, no se quita. Quitarlo devolveria el fallo que 0022 cerro: un
--     log de auditoria en el que cualquier alumno puede escribir no prueba nada.
-- =============================================================================

alter table public.learning_events alter column school_id drop not null;

-- El colegio de un evento es el de la membresia ACTIVA del alumno hoy, o NULL.
-- `security definer` porque la ruta de ingesta corre con la sesion del alumno,
-- que no puede leer `student_school_memberships` de nadie mas — ni le hace
-- falta: solo pregunta por si mismo.
create or replace function app.colegio_del_evento(p_student_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.school_id
    from public.student_school_memberships m
   where m.student_id = p_student_id
     and m.status = 'activa'
     and m.starts_on <= current_date
     and (m.ends_on is null or m.ends_on > current_date)
   limit 1;
$$;

revoke all on function app.colegio_del_evento(uuid) from public;
grant execute on function app.colegio_del_evento(uuid) to authenticated, service_role;

comment on function app.colegio_del_evento(uuid) is
  'Colegio al que se atribuye un evento: la membresia activa, o NULL si practica en casa.';

-- -----------------------------------------------------------------------------
-- app.audit — el guard se acota, no se abre
-- -----------------------------------------------------------------------------
create or replace function app.audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid    default null,
  p_before      jsonb   default null,
  p_after       jsonb   default null,
  p_ip_hash     text    default null,
  p_user_agent  text    default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  -- Staff y superadmin: como siempre. Un tutor: SOLO sobre si mismo o sobre un
  -- hijo suyo, y eso lo decide `app.puede_ver_alumno`, que es la misma funcion
  -- que gobierna toda la RLS del tutor. Cualquier otro usuario de la app: no.
  if app.is_app_user()
     and not (app.is_staff() or app.is_superadmin())
     and not (
       app.current_role() = 'guardian'
       and (p_entity_id is null
            or p_entity_id = auth.uid()
            or app.puede_ver_alumno(p_entity_id))
     ) then
    raise exception 'Solo el personal del colegio y el tutor sobre los suyos escriben en el audit_log'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.audit_log (
    school_id, actor_id, actor_role, action, entity_type, entity_id,
    before, after, ip_hash, user_agent
  )
  values (
    app.current_school_id(),   -- NULL para tutor y superadmin: la columna ya lo admite
    auth.uid(),
    app.current_role(),
    p_action, p_entity_type, p_entity_id,
    p_before, p_after, p_ip_hash, p_user_agent
  )
  returning id into v_id;

  return v_id;
end;
$$;
```

- [ ] **Step 2: Aplicar y correr las pruebas completas**

Run: `node scripts/db-apply.mjs migrations && node scripts/db-test.mjs alumno_sin_colegio`
Expected: PASS, `# Looks like you planned 7 and ran 7`.

- [ ] **Step 3: Correr TODA la suite, que es donde aparecen las regresiones**

Run: `node scripts/db-test.mjs`
Expected: PASS en los 20 ficheros. Si `escrituras_de_perfil.sql` falla, es porque la aplicación todavía escribe `school_id` en alumnos: eso lo arregla la tarea 5 y **no** se tapa relajando la constraint.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0067_evento_y_audit_sin_colegio.sql
git commit -m "feat(tenencia): el evento sin colegio, y el tutor puede auditar lo suyo"
```

---

### Task 5: Purgar `if (!schoolId)`

**Agente:** Opus. No se delega: toca el examen, y un fallo aquí es un 403 a mitad de prueba.

**Files:**
- Modify: `apps/web/src/lib/auth/session.ts`
- Modify: `apps/web/src/app/api/attempts/_context.ts`
- Modify: `apps/web/src/components/staff/actions.ts` (`createStudent` deja de escribir `school_id` en `profiles`)
- Test: `apps/web/src/lib/auth/session.test.ts`

**Interfaces:**
- Consumes: `SessionProfile.schoolId: string | null`, que ya es nullable en el tipo.
- Produces: ninguna firma nueva. Lo que cambia es que `schoolId === null` deja de ser un error y pasa a significar «practica en casa».

- [ ] **Step 1: Escribir el test que falla**

```ts
it("un alumno sin colegio tiene sesion activa", async () => {
  const state = await sessionStateFrom({
    id: "33333333-3333-3333-3333-333333333331",
    school_id: null,
    role: "student",
    full_name: "Leo",
    locale: "es",
    status: "active",
  });
  expect(state.kind).toBe("active");
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `pnpm vitest run apps/web/src/lib/auth/session.test.ts`
Expected: FAIL — devuelve `stale` o lanza.

- [ ] **Step 3: Quitar los cortes**

En `session.ts` y en `_context.ts`, cada `if (!profile.schoolId) return forbidden()` se sustituye por el criterio real de esa ruta. En `_context.ts` el criterio es la **asignación de examen**, no el colegio: un examen se abre porque hay un `exam_assignments` que apunta al alumno, y eso ya se comprueba dos líneas más abajo. El corte por `schoolId` era un atajo, no una autorización.

- [ ] **Step 4: `createStudent` deja de escribir el colegio en `profiles`**

En `apps/web/src/components/staff/actions.ts`, el `insert` sobre `profiles` pasa `school_id: null` y la pertenencia se escribe en `student_school_memberships` con `status: 'activa'` y `starts_on: today`. `students.school_id` se conserva como caché denormalizada, que es lo que `DATA_MODEL` §3.3 dice que es.

- [ ] **Step 5: Correr todo**

Run: `pnpm verify && node scripts/db-test.mjs escrituras_de_perfil`
Expected: PASS en ambos.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib apps/web/src/app/api/attempts/_context.ts apps/web/src/components/staff/actions.ts
git commit -m "fix(tenencia): un alumno sin colegio deja de ser un 403 a mitad de examen"
```

---

### Task 6: `student-pin` fija el primer PIN

**Agente:** Kimi `k3`, contrato `enl-3-dos-puertas`.

**Files:**
- Modify: `supabase/functions/student-pin/index.ts`
- Test: `supabase/functions/_shared/puertas.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `POST /functions/v1/student-pin` con `{ op: "set-from-link", studentProfileId: string, newPin: string }` → `200 { ok: true }`. Solo `service_role`.

- [ ] **Step 1: Ampliar la unión discriminada**

```ts
const body = z.discriminatedUnion("op", [
  z.object({ op: z.literal("change"), currentPin: pinShape, newPin: pinShape }),
  z.object({ op: z.literal("reset"), studentProfileId: z.string().uuid() }),
  z.object({ op: z.literal("provision"), studentProfileId: z.string().uuid() }),
  // El llamante ya presento un enlace de un solo uso, asi que NO se le exige el
  // PIN anterior: no existe. Por eso mismo esta `op` solo la puede invocar
  // `service_role` — un JWT de usuario aqui seria un cambio de PIN sin
  // credencial.
  z.object({
    op: z.literal("set-from-link"),
    studentProfileId: z.string().uuid(),
    newPin: pinShape,
  }),
]);
```

- [ ] **Step 2: Exigir `service_role` para esa `op` y solo para esa**

El resto de operaciones siguen comprobando rol y tenant del llamante contra la base de datos. `set-from-link` comprueba que el `Authorization` es la clave de servicio y **rechaza cualquier JWT de usuario**, incluido el del propio tutor.

- [ ] **Step 3: Aplicar la lista de PIN débiles**

La misma que ya aplica `change`. Un enlace no convierte `1234` en un buen PIN.

- [ ] **Step 4: Test**

Run: `pnpm test:functions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/student-pin/index.ts supabase/functions/_shared/puertas.test.ts
git commit -m "feat(acceso): el nino fija su primer PIN sin teclear ninguno anterior"
```

---

### Task 7: La segunda puerta de `auth-pin`

**Agente:** Kimi `k3`, contrato `enl-3-dos-puertas`.

**Files:**
- Modify: `supabase/functions/auth-pin/index.ts`
- Test: `supabase/functions/_shared/puertas.test.ts`

**Interfaces:**
- Consumes: `student_devices` de la tarea 2.
- Produces: `POST /functions/v1/auth-pin` acepta además `{ deviceToken: string, pin: string }`, con las mismas respuestas que la puerta vieja.

- [ ] **Step 1: Escribir el test del discriminador**

```ts
import { entradaDeAuthPin } from "../auth-pin/index.ts";

it("acepta las dos puertas y rechaza lo demas", () => {
  expect(entradaDeAuthPin.safeParse({
    schoolId: "00000000-0000-4000-8000-000000000001",
    studentCode: "Y6A-001", pin: "1234",
  }).success).toBe(true);

  expect(entradaDeAuthPin.safeParse({
    deviceToken: "a".repeat(43), pin: "1234",
  }).success).toBe(true);

  // 43 caracteres es la longitud de 32 bytes en base64url. Ni 42 ni 44.
  expect(entradaDeAuthPin.safeParse({ deviceToken: "a".repeat(42), pin: "1234" }).success).toBe(false);
  // base64url no tiene `+` ni `/`.
  expect(entradaDeAuthPin.safeParse({ deviceToken: `${"a".repeat(42)}+`, pin: "1234" }).success).toBe(false);
  // Sin las dos puertas a la vez.
  expect(entradaDeAuthPin.safeParse({ deviceToken: "a".repeat(43), studentCode: "X", pin: "1234" }).success).toBe(false);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `pnpm test:functions`
Expected: FAIL — `entradaDeAuthPin` no está exportado.

- [ ] **Step 3: La unión, y el camino común**

```ts
const puertaDeColegio = z.object({
  schoolId: z.string().uuid(),
  studentCode: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9._-]+$/),
  pin: z.string().regex(/^[0-9]{4,8}$/),
}).strict();

/**
 * 32 bytes en base64url son EXACTAMENTE 43 caracteres. Acotarlo aqui, antes de
 * tocar la base de datos, es el mismo motivo por el que el PIN se acota a 4-8
 * digitos: sin limite, una entrada de 10 MB llega hasta Argon2id, que reserva
 * 19 MiB por verificacion, y eso es una denegacion de servicio gratuita.
 */
const puertaDeDispositivo = z.object({
  deviceToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  pin: z.string().regex(/^[0-9]{4,8}$/),
}).strict();

export const entradaDeAuthPin = z.union([puertaDeColegio, puertaDeDispositivo]);
```

Las dos puertas resuelven **un `profile_id` de alumno** y a partir de ahí el código es el mismo: lockout, Argon2id, canje por sesión. No se duplica ninguna de las tres defensas.

- [ ] **Step 4: El señuelo también en la puerta nueva**

```ts
// Dispositivo desconocido o revocado: se verifica igualmente contra el señuelo
// para gastar la MISMA CPU, y se sale por `respond()` para gastar el mismo
// reloj. Si no, se enumeran tokens con un cronometro — el mismo ataque que la
// cabecera de este fichero ya documenta para los codigos de alumno.
if (device === null) {
  await argon2Verify({ password: input.pin, hash: DECOY_HASH });
  return await respond(genericFailure());
}
```

- [ ] **Step 5: El lockout cuenta por alumno**

El `failed_pin_attempts` y el `locked_until` que se leen y escriben son los de `students`, indexados por `profile_id`. La puerta por la que se entró **no aparece** en esa cuenta. Si apareciera, alternar puertas daría intentos infinitos contra el mismo PIN.

- [ ] **Step 6: Escribir `last_seen_at` al entrar con éxito**

- [ ] **Step 7: Test y despliegue de la función**

Run: `pnpm test:functions`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/auth-pin/index.ts supabase/functions/_shared/puertas.test.ts
git commit -m "feat(acceso): la puerta del dispositivo, sin relajar ninguna defensa de la vieja"
```

---

### Task 8: Tokens y cookie

**Agente:** Kimi `codigo`, contrato `enl-4-acciones`.

**Files:**
- Create: `apps/web/src/lib/tutor/tokens.ts`, `apps/web/src/lib/tutor/dispositivo.ts`
- Test: `apps/web/src/lib/tutor/tokens.test.ts`, `apps/web/src/lib/tutor/dispositivo.test.ts`

**Interfaces:**
- Consumes: `node:crypto`, `next/headers`.
- Produces:

```ts
// tokens.ts
export function generarToken(): string;          // 43 caracteres base64url
export function hashToken(token: string): string; // 64 hex minusculas

// dispositivo.ts
export const COOKIE_DISPOSITIVO = "cet_device";
export const VIDA_COOKIE_SEGUNDOS = 60 * 60 * 24 * 365;
export async function leerCookieDispositivo(): Promise<string | null>;
export async function escribirCookieDispositivo(secreto: string): Promise<void>;
export async function borrarCookieDispositivo(): Promise<void>;
export function familiaDeAgente(userAgent: string | null): string;
```

- [ ] **Step 1: Escribir los tests que fallan**

```ts
describe("generarToken", () => {
  it("da 43 caracteres de base64url", () => {
    expect(generarToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("no se repite", () => {
    expect(generarToken()).not.toBe(generarToken());
  });
});

describe("hashToken", () => {
  it("es estable y no devuelve el token", () => {
    const t = generarToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
  });
});

describe("familiaDeAgente", () => {
  it("reduce a algo que un padre reconoce", () => {
    expect(familiaDeAgente("Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0"))
      .toBe("Chrome en Android");
  });
  it("nunca devuelve el user-agent completo", () => {
    const ua = "Mozilla/5.0 (algo raro que nadie ha visto)";
    expect(familiaDeAgente(ua)).toBe("Navegador");
    expect(familiaDeAgente(null)).toBe("Navegador");
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `pnpm vitest run apps/web/src/lib/tutor`
Expected: FAIL — no existen los módulos.

- [ ] **Step 3: Implementar `tokens.ts`**

```ts
/**
 * Tokens de la cadena de invitacion.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Puro a proposito: sin Supabase, sin cookies, sin `next/headers`. Es lo que
 * permite testearlo sin levantar nada, y es la pieza de la que depende que un
 * token no acabe nunca en claro en la base de datos.
 */
import { createHash, randomBytes } from "node:crypto";

/** 32 bytes son 256 bits de entropia; en base64url, exactamente 43 caracteres. */
export function generarToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Lo UNICO que se guarda. SHA-256 y no Argon2id a proposito: un token de 256
 * bits no se adivina por fuerza bruta, asi que el coste alto de Argon2 no
 * compra nada aqui y si costaria en cada canje. Argon2 es para secretos con
 * poca entropia, como un PIN de cuatro digitos.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
```

- [ ] **Step 4: Implementar `dispositivo.ts`**

```ts
/**
 * La cookie que casa un dispositivo con un alumno.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `HttpOnly` no es un detalle: sin el, cualquier script de la pagina lee el
 * secreto y el "dispositivo recordado" pasa a ser un token robable desde la
 * consola del navegador.
 *
 * Y lo que esta cookie compra es SOLO saltarse los pasos "colegio" y "codigo"
 * del formulario. No abre sesion. La sesion sigue naciendo de un Argon2id
 * verificado dentro de `auth-pin`.
 */
import { cookies } from "next/headers";

export const COOKIE_DISPOSITIVO = "cet_device";
export const VIDA_COOKIE_SEGUNDOS = 60 * 60 * 24 * 365;

export async function leerCookieDispositivo(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_DISPOSITIVO)?.value ?? null;
}

export async function escribirCookieDispositivo(secreto: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_DISPOSITIVO, secreto, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: VIDA_COOKIE_SEGUNDOS,
  });
}

export async function borrarCookieDispositivo(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_DISPOSITIVO);
}

/**
 * MINIMIZACION DE DATOS, no pereza.
 *
 * El tutor necesita reconocer que tablet esta revocando; para eso basta
 * "Chrome en Android". El user-agent completo de un menor es una huella
 * digital, y guardarlo seria recoger un dato que no necesitamos para nada.
 * Lo desconocido se degrada a "Navegador", nunca a la cadena original.
 */
export function familiaDeAgente(userAgent: string | null): string {
  if (userAgent === null || userAgent.trim() === "") return "Navegador";

  const navegador =
    /Edg\//.test(userAgent) ? "Edge"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Safari\//.test(userAgent) ? "Safari"
    : null;

  const sistema =
    /Android/.test(userAgent) ? "Android"
    : /iPhone|iPad|iPod/.test(userAgent) ? "iPad o iPhone"
    : /Windows/.test(userAgent) ? "Windows"
    : /Mac OS X/.test(userAgent) ? "Mac"
    : /Linux/.test(userAgent) ? "Linux"
    : null;

  if (navegador === null || sistema === null) return "Navegador";
  return `${navegador} en ${sistema}`;
}
```

- [ ] **Step 5: Correr y ver que pasan**

Run: `pnpm vitest run apps/web/src/lib/tutor`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/tutor/tokens.ts apps/web/src/lib/tutor/dispositivo.ts apps/web/src/lib/tutor/*.test.ts
git commit -m "feat(acceso): tokens opacos y la cookie del dispositivo, con el hash como unico residuo"
```

---

### Task 9: Los Zod de la cadena

**Agente:** Kimi `codigo`, contrato `enl-4-acciones`.

**Files:**
- Create: `apps/web/src/lib/tutor/schemas.ts`
- Test: `apps/web/src/lib/tutor/schemas.test.ts`

**Interfaces:**
- Consumes: `pinSchema` de `apps/web/src/lib/auth/schemas.ts`.
- Produces:

```ts
export const tokenSchema: z.ZodString;                 // /^[A-Za-z0-9_-]{43}$/
export const invitarTutorSchema: z.ZodObject<{ email }>;
export const altaDeTutorSchema: z.ZodObject<{ token, fullName, password }>;
export const crearHijoSchema: z.ZodObject<{ fullName, fechaNacimiento, yearLevel }>;
export const canjeDeEnlaceSchema: z.ZodObject<{ token, pin, pinRepetido }>;
export const olvidarDispositivoSchema: z.ZodObject<{ deviceId }>;
export function etapaDeCurso(yearLevel: number): "primary" | "secondary";
export function longitudDePin(etapa: "primary" | "secondary"): 4 | 6;
```

- [ ] **Step 1: Escribir el test que falla**

```ts
it("el token es opaco y de 43 caracteres", () => {
  expect(tokenSchema.safeParse("a".repeat(43)).success).toBe(true);
  expect(tokenSchema.safeParse("corto").success).toBe(false);
  expect(tokenSchema.safeParse(`${"a".repeat(42)}/`).success).toBe(false);
});

it("el canje exige que el PIN y su repeticion coincidan", () => {
  const base = { token: "a".repeat(43), pin: "1234" };
  expect(canjeDeEnlaceSchema.safeParse({ ...base, pinRepetido: "1234" }).success).toBe(true);
  expect(canjeDeEnlaceSchema.safeParse({ ...base, pinRepetido: "4321" }).success).toBe(false);
  expect(canjeDeEnlaceSchema.safeParse({ token: base.token, pin: "123", pinRepetido: "123" }).success).toBe(false);
});

it("la etapa y la longitud del PIN salen del curso", () => {
  expect(etapaDeCurso(6)).toBe("primary");
  expect(etapaDeCurso(7)).toBe("secondary");
  expect(longitudDePin("primary")).toBe(4);
  expect(longitudDePin("secondary")).toBe(6);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `pnpm vitest run apps/web/src/lib/tutor/schemas.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar**

```ts
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const canjeDeEnlaceSchema = z
  .object({ token: tokenSchema, pin: pinSchema, pinRepetido: pinSchema })
  .refine((v) => v.pin === v.pinRepetido, {
    // El mensaje lo pone la pantalla desde el diccionario; aqui solo el camino
    // del campo, para que el formulario sepa donde pintar el error.
    path: ["pinRepetido"],
    message: "no_coincide",
  });

/**
 * Y1-Y6 primaria, Y7-Y13 secundaria. La etapa decide cuantas casillas de PIN se
 * dibujan (AD-4), y por eso se deriva del curso y no se le pregunta al tutor:
 * un padre no tiene por que saber que significa "stage".
 */
export function etapaDeCurso(yearLevel: number): "primary" | "secondary" {
  return yearLevel <= 6 ? "primary" : "secondary";
}

export function longitudDePin(etapa: "primary" | "secondary"): 4 | 6 {
  return etapa === "primary" ? 4 : 6;
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `pnpm vitest run apps/web/src/lib/tutor/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/tutor/schemas.ts apps/web/src/lib/tutor/schemas.test.ts
git commit -m "feat(acceso): los Zod de la cadena, con la etapa derivada del curso"
```

---

### Task 10: Las seis Server Actions

**Agente:** Kimi `codigo`, contrato `enl-4-acciones`.

**Files:**
- Create: `apps/web/src/lib/tutor/actions.ts`, `apps/web/src/lib/tutor/queries.ts`

**Interfaces:**
- Consumes: todo lo de las tareas 8 y 9; `createAdminClient` de `apps/web/src/lib/supabase/admin.ts`; `requireRole` de `apps/web/src/lib/auth/session.ts`.
- Produces:

```ts
// Devuelven la URL UNA sola vez, en `values.url`. No se registra en ningun log.
export async function invitarTutor(prev: TutorState, fd: FormData): Promise<TutorState>;
export async function altaDeTutor(prev: TutorState, fd: FormData): Promise<TutorState>;
export async function crearHijo(prev: TutorState, fd: FormData): Promise<TutorState>;
export async function crearEnlaceDeAcceso(prev: TutorState, fd: FormData): Promise<TutorState>;
export async function canjearEnlace(prev: TutorState, fd: FormData): Promise<TutorState>;
export async function olvidarDispositivo(prev: TutorState, fd: FormData): Promise<TutorState>;

// queries.ts
export interface HijoRow {
  readonly id: string;
  readonly nombre: string;
  readonly colegio: string | null;
  readonly enlaceActivo: boolean;
  readonly dispositivos: number;
}
export async function listarHijos(): Promise<readonly HijoRow[]>;
export async function alumnoDelDispositivo(secreto: string): Promise<{
  readonly nombreDePila: string;
  readonly longitudDePin: 4 | 6;
} | null>;
```

- [ ] **Step 1: `invitarTutor` — solo superadmin**

Comprueba el rol con `requireRole(["superadmin"], { onDeny: "not-found" })`, genera el token, escribe `guardian_invites` con `expires_at = now() + 7 días`, y devuelve `${origin}/register?t=${token}`. **La URL se devuelve, no se registra.**

- [ ] **Step 2: `altaDeTutor` — el correo no se elige**

Resuelve la invitación por `hashToken(token)` con `revoked_at is null and used_at is null and expires_at > now()`. El correo del `profiles` que crea es **el de la invitación**, nunca el del formulario: si viniera del formulario, un enlace reenviado le fabricaría una cuenta a quien lo reenvió.

Crea `auth.users` con `email_confirm: true` —el enlace se entregó por ese buzón, así que abrirlo ya demuestra que lo controla— y `profiles(role: 'guardian', school_id: null, status: 'active')`. Marca `used_at` y `used_by`. Si el `insert` de `profiles` falla, `rollback()` borrando el `auth.users`, igual que hace `createStudent`.

- [ ] **Step 3: `crearHijo`**

`requireRole(["guardian"])`. Deriva etapa y longitud de PIN del curso. Genera un `student_code` con el prefijo `FAM-` y seis dígitos aleatorios, reintentando ante `23505` —el índice parcial de la tarea 3 es quien lo garantiza— hasta tres veces. Crea `auth.users` con `s.<código>@familia.cet.invalid`, `profiles(role:'student', school_id:null)`, `students(school_id:null, pin_hash: inservible, pin_must_change:true)` y `guardian_students`. Audita `tutor.hijo_creado`.

- [ ] **Step 4: `crearEnlaceDeAcceso`**

`requireRole(["guardian"])` **y** comprobar que ese hijo es suyo con `app.puede_ver_alumno`. Revoca cualquier enlace vivo anterior del mismo alumno antes de crear el nuevo: dos enlaces vivos a la vez son dos credenciales vivas a la vez. Devuelve `${origin}/e/${token}` una sola vez.

- [ ] **Step 5: `canjearEnlace` — la pieza central**

Sin sesión previa. Resuelve el enlace por hash; si no vale, devuelve el error genérico **sin distinguir** caducado de usado de inexistente. Si vale, y en este orden:

1. `student-pin` con `op: "set-from-link"` para escribir el `pin_hash`.
2. `student_access_links`: `revoked_at = now()`, `last_used_at = now()`.
3. `student_devices`: fila nueva con `hashToken(secreto)` y `familiaDeAgente(headers().get('user-agent'))`.
4. `escribirCookieDispositivo(secreto)`.
5. `auth-pin` con `{ deviceToken: secreto, pin }` para obtener la sesión — **por la misma puerta que usará mañana**, que es la forma de que la prueba de hoy pruebe el camino de mañana.
6. `app.audit('alumno.enlace_canjeado', 'student_access_links', linkId, …)`.

- [ ] **Step 6: `olvidarDispositivo`**

`requireRole(["guardian"])`, comprobar que el dispositivo es de un hijo suyo, escribir `revoked_at`. Auditar.

- [ ] **Step 7: `alumnoDelDispositivo` en `queries.ts`**

Escala a `createAdminClient("Resolver el alumno de una cookie de dispositivo: student_devices no es legible por anon")`, porque quien pregunta **todavía no tiene sesión**. Devuelve **solo** el nombre de pila y la longitud del PIN. Ni apellidos, ni curso, ni colegio: quien encuentre la tablet perdida no debe sacar de ahí la ficha de un menor.

- [ ] **Step 8: Correr**

Run: `pnpm verify`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/tutor/actions.ts apps/web/src/lib/tutor/queries.ts
git commit -m "feat(acceso): las seis acciones de la cadena, y el canje entra por la puerta de manana"
```

---

### Task 11: `/admin` invita a un tutor

**Agente:** Opus.

**Files:**
- Modify: `apps/web/src/components/staff/AdminPanel.tsx`
- Create: `apps/web/src/components/staff/InvitarTutor.tsx`
- Modify: `apps/web/src/lib/i18n/dictionaries/es.ts`, `en.ts`

- [ ] **Step 1: El formulario, un campo**

Correo, botón, y la URL devuelta en un bloque que se copia con un clic y un aviso de que **no se volverá a mostrar** — el mismo tratamiento que ya recibe el PIN de un solo uso en `resetStudentPin`.

- [ ] **Step 2: Diccionarios `es` y `en`**

- [ ] **Step 3: `pnpm verify` y commit**

```bash
git commit -am "feat(admin): invitar a un tutor, con la URL mostrada una sola vez"
```

---

### Task 12: `/register` deja de ser un alta libre

**Agente:** Opus.

**Files:**
- Modify: `apps/web/src/app/(auth)/register/page.tsx`
- Create: `apps/web/src/components/tutor/AltaDeTutorForm.tsx`

- [ ] **Step 1: Sin token, no hay formulario**

La página lee `?t=`. Sin token válido **no pinta campos**: pinta «El acceso a CET es por invitación. Si has contratado el servicio, busca el enlace en tu correo.» Con token válido, tres campos y el correo fijo, `readOnly`, con el `input` real oculto — el servidor lo ignora de todos modos y usa el de la invitación.

- [ ] **Step 2: Diccionarios, `pnpm verify`, commit**

```bash
git commit -am "feat(acceso): el alta de tutor es por invitacion, con el correo fijo"
```

---

### Task 13: La zona del tutor

**Agente:** Opus.

**Files:**
- Create: `apps/web/src/app/(tutor)/layout.tsx`, `tutor/page.tsx`, `tutor/hijos/[id]/page.tsx`
- Create: `apps/web/src/components/tutor/*`
- Modify: `apps/web/src/lib/routes.ts`

- [ ] **Step 1: La ruta entra en la matriz de autorización**

```ts
{ prefix: "/tutor", allow: ["guardian"], onDeny: "not-found" },
```

y `homeForRole` devuelve `/tutor` para `guardian`. Sin esto, la lista blanca de `routes.ts` deja la zona protegida pero inalcanzable, y el tutor entra en un bucle de redirecciones.

- [ ] **Step 2: `/tutor` — los hijos y el botón de añadir**

- [ ] **Step 3: `/tutor/hijos/[id]` — enlace, dispositivos, PIN**

Tres bloques: el enlace (generar · copiar una vez · revocar), la lista de dispositivos con etiqueta, «visto por última vez» y **«Olvidar este dispositivo»**, y el reseteo de PIN.

- [ ] **Step 4: Tono**

Ni un término técnico, tampoco en los errores. `modules/admin` §5.1 fija densidad para personal adulto; un padre no es eso.

- [ ] **Step 5: `pnpm verify`, axe en claro y oscuro, commit**

```bash
git commit -am "feat(tutor): mis hijos, su enlace y los dispositivos que recuerdan"
```

---

### Task 14: `/e/[token]` y el login que ya sabe quién eres

**Agente:** Opus.

**Files:**
- Create: `apps/web/src/app/(auth)/e/[token]/page.tsx`
- Create: `apps/web/src/components/tutor/ElegirPinForm.tsx`
- Modify: `apps/web/src/app/(auth)/login/student/page.tsx`
- Modify: `apps/web/src/components/auth/StudentLoginForm.tsx`

- [ ] **Step 1: `/e/[token]` — una pantalla**

Nombre de pila y dos grupos de casillas. Enlace inválido: pantalla amable que **no distingue** caducado de usado de inexistente, porque distinguirlos convierte la pantalla en un oráculo sobre qué tokens existieron.

- [ ] **Step 2: `/e` es pública**

Añadir `/e` a `PUBLIC_PREFIXES` en `routes.ts`. Sin eso, el middleware manda al niño a `/login` antes de que la página exista para él.

- [ ] **Step 3: El login lee la cookie**

`login/student/page.tsx` llama a `alumnoDelDispositivo(await leerCookieDispositivo())`. Si devuelve alumno, pasa `dispositivo={{ nombreDePila, longitudDePin }}` al formulario; si no, no pasa nada y todo sigue como hoy.

- [ ] **Step 4: `StudentLoginForm` con un solo paso**

Con `dispositivo`, el formulario arranca en el paso 3 con `TOTAL_STEPS = 1`, el título es «Hola, {nombre}» y el campo oculto que viaja es `deviceToken`. **Y sigue habiendo una salida:** «¿No eres tú?» vuelve al recorrido de tres pasos. Un niño que coge la tablet de su hermano tiene que poder entrar.

- [ ] **Step 5: Diccionarios, `pnpm verify`, axe, commit**

```bash
git commit -am "feat(acceso): el nino vuelve y solo teclea su PIN"
```

---

### Task 15: El camino completo en Playwright

**Agente:** Kimi `codigo`, contrato `enl-5-e2e`.

**Files:**
- Create: `apps/web/e2e/alta-por-enlace.spec.ts`

- [ ] **Step 1: Un solo `test()` con los ocho tramos del contrato**

- [ ] **Step 2: Borrar las cookies de sesión entre la primera y la segunda visita**

```ts
// Lo que se prueba es que `cet_device` basta para IDENTIFICAR y el PIN para
// ENTRAR. Si se conserva la sesion de Supabase, la prueba pasa sin que la
// cookie de dispositivo haga absolutamente nada.
const cookies = await context.cookies();
await context.clearCookies();
await context.addCookies(cookies.filter((c) => c.name === "cet_device"));
```

- [ ] **Step 3: Correr y commit**

Run: `pnpm --filter web exec playwright test alta-por-enlace`
Expected: PASS.

```bash
git commit -am "test(acceso): la cadena entera, de la invitacion al segundo dia"
```

---

### Task 16: Producción

**Agente:** Opus. **No se delega:** es destructivo y es irreversible.

**Files:** ninguno.

- [ ] **Step 1: Enseñar al propietario lo que se va a borrar**

```sql
select p.id, p.full_name, s.student_code from public.students s
  join public.profiles p on p.id = s.profile_id;
```

Confirmar con él antes de seguir. Autorizado el 29/08/2026 para `Y6A-001`, pero se enseña igualmente.

- [ ] **Step 2: Borrar el alumno de prueba**

Borrar el `auth.users`; `profiles` y `students` caen en cascada.

- [ ] **Step 3: Aplicar migraciones y desplegar las Edge Functions**

- [ ] **Step 4: Desplegar en Vercel y comprobar la portada**

- [ ] **Step 5: El alta real**

Invitar a `mendizabal.roberto@gmail.com`. Roberto se da de alta, crea a Leo Mendizabal, genera su enlace, Leo elige PIN y entra. **Cerrar la app y volver a abrirla** para comprobar que la segunda visita pide solo el PIN.

- [ ] **Step 6: Comprobar que no quedó nada en claro**

```sql
select count(*) from public.guardian_invites where length(token_hash) <> 64;
select count(*) from public.student_devices  where length(device_hash) <> 64;
```

Expected: `0` en las dos.

---

### Task 17: Los documentos que mandan

**Agente:** Opus.

**Files:**
- Modify: `DATA_MODEL.md`, `MASTER_PLAN.md`, `modules/auth/CLAUDE.md`

- [ ] **Step 1: `DATA_MODEL.md`**

`students.school_id` pasa a nullable y se documenta como caché; entran `guardian_invites` y `student_devices`. La cabecera del fichero exige avisar a las cinco vías del Hito 1: el aviso va en el propio commit.

- [ ] **Step 2: `MASTER_PLAN.md`**

AD-3 gana la segunda puerta; AD-4 gana el matiz de que el primer PIN se fija y no se transmite.

- [ ] **Step 3: `modules/auth/CLAUDE.md`**

El contrato de `auth-pin` con sus dos entradas.

- [ ] **Step 4: Commit**

```bash
git commit -am "docs(contratos): las dos puertas, las dos tablas y el alumno sin colegio"
```

---

## Autorrevisión

**Cobertura del spec.** §2 → tareas 1, 2, 10. §2.1 → 10 (paso 4) y 15. §2.2 → 2 (columna `contrato_ref`) y 11. §3 → 10 a 14. §3.1 → 6 y 10. §4.1 y §4.2 → 2. §4.3 → nada que hacer, y se dice. §4.4 → 3 y 10 (paso 3). §5 → 7. §5.1 → 8 y 14. §6 → 11, 12, 13, 14. §7 → 3, 4, 5, 16. §8 → repartido: 1 y 2 en la tarea 2, 3 en la 4 y la 10, 4 en la 4, 5 en la 8, 6 documentado. §9 → 2, 3, 8, 9, 15. §10 → la tabla de reparto. §11 → los diecisiete criterios tienen tarea.

**Sin marcadores.** Ningún «TBD», ningún «manejar errores», ninguna referencia a una función que no se defina en la tarea que la produce o en una anterior.

**Consistencia de nombres.** `generarToken` / `hashToken` (tarea 8) son los que llaman las tareas 10 y 2. `familiaDeAgente` (8) es el que llama `canjearEnlace` (10). `alumnoDelDispositivo` (10) es el que llama la página de login (14). `app.colegio_del_evento` (4) es el que llamará la ruta de ingesta. `entradaDeAuthPin` (7) es el nombre exportado que importa su test. `COOKIE_DISPOSITIVO = "cet_device"` es el mismo literal en la tarea 8 y en el filtro de Playwright de la 15.

**Un hueco que se cierra aquí:** el spec §5 exige que el lockout cuente por alumno y no por puerta, pero no decía cómo demostrarlo. El criterio de finalización correspondiente pide una prueba que agote intentos **alternando** las dos puertas; va en la tarea 7, paso 5, y se verifica en el pgTAP de `auth_attempts` que ya existe.
