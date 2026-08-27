# M02 · `auth` — identidad sintética, PIN, sesiones y lockout

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Depende de: M01 `security`. Del que dependen: M03, M04 y, en la práctica, todo.

---

## Objetivo

Dar a cada persona una sesión de Supabase real, por dos caminos muy distintos:

- **Alumno (AD-3, AD-4).** Colegio + código + PIN. Sin email, sin contraseña que
  memorizar, sin nada que un niño de 11 años pueda perder. Cuatro dígitos en
  primaria, seis en secundaria, configurable por colegio.
- **Staff.** Email + contraseña por GoTrue estándar. MFA (TOTP) obligatoria para
  `school_admin` y `superadmin`.

Y hacerlo sin que un PIN de 4 dígitos — 10.000 combinaciones, que un script prueba
en segundos — sea el eslabón que hunde el sistema.

---

## Arquitectura

### El flujo de identidad sintética (AD-3), paso a paso

```
   Navegador                Edge Function auth-pin           Postgres
      │                       (service_role)
      │  POST { schoolSlug, studentCode, pin }
      ├──────────────────────────►│
      │                           │ 1. Zod: slug, código y pin ∈ /^[0-9]{4,8}$/
      │                           │ 2. rate limit por IP  ──────► auth_attempts
      │                           │ 3. colegio por slug   ──────► schools
      │                           │ 4. rate limit por código ───► auth_attempts
      │                           │ 5. ficha del alumno   ──────► students (pin_hash)
      │                           │ 6. ¿locked_until > now()?
      │                           │ 7. argon2Verify(pin, pin_hash)
      │                           │ 8. registra el intento ─────► auth_attempts
      │                           │                              learning_events
      │                           │ 9. signInWithPassword(email sintético, HMAC)
      │                           │◄──── sesión GoTrue
      │◄──────────────────────────┤
      │  { session, pinMustChange }
```

### Las tres claves del diseño

**1. El PIN no es la contraseña.** El alumno tiene un `auth.users` real con:

```
email    = s.<student_code>@<school_slug>.students.cet.invalid
password = base64( HMAC-SHA256( CET_STUDENT_PASSWORD_SECRET, profile_id ) )
```

`.invalid` es un TLD reservado por la RFC 2606: **nunca** resuelve en DNS, así que
ese buzón no puede existir ni recibir un enlace de recuperación. La contraseña la
deriva únicamente el servidor, y el alumno no la ve jamás.

Consecuencias, que son el motivo de hacerlo así:
- Cambiar el PIN **no toca `auth.users`**: es un `update` de `students.pin_hash`.
- Volcar la tabla `students` **no da acceso a ninguna cuenta**: contiene el hash
  Argon2id de un PIN, no la contraseña sintética.
- `auth.uid()` sigue siendo el eje de toda la RLS, sin un segundo sistema de
  sesión que mantener en paralelo.

**2. `pin_hash` solo lo lee `service_role`.** `0013_grants.sql` enumera las
columnas de `students` que `authenticated` puede leer y `pin_hash` no está en la
lista. No es un `revoke select (pin_hash)` — que en Postgres no retira nada si el
rol conserva el SELECT de tabla — sino un `revoke select on students` seguido de
un `grant select (columnas permitidas)`.

**3. Todo lo que puntúa lo decide el servidor.** El cliente nunca dice si el PIN
era correcto, cuántos intentos lleva ni cuándo caduca el bloqueo.

### Argon2id — parámetros

| Parámetro | Valor | Por qué |
|---|---|---|
| variante | `argon2id` | Resiste a la vez canal lateral (como argon2i) y GPU (como argon2d) |
| `m` | 19456 KiB (19 MiB) | Mínimo de OWASP. Es lo que hace inviable la GPU: una tarjeta con 24 GB solo paraleliza ~1.200 hilos |
| `t` | 2 | Con m=19 MiB da ~50–90 ms en el runtime de una Edge Function |
| `p` | 1 | Deno es monohilo en este contexto |
| salt | 16 bytes aleatorios por PIN | Sin salt por fila, dos alumnos con el mismo PIN tendrían el mismo hash |

El CHECK `students_pin_hash_is_argon2id` exige el prefijo `$argon2id$`. Es la
defensa contra el bug catastrófico "alguien guardó el PIN en claro para probar".

### Rate limiting y lockout — dos ejes, no uno

| Eje | Umbral | Ventana | Qué ataque para |
|---|---|---|---|
| **Por código** (`failed_pin_attempts` → `locked_until`) | 5 fallos | bloqueo de 15 min | Probar 10.000 PIN contra UN alumno |
| **Por IP** (`auth_attempts` con `success = false`) | 30 fallos | 15 min | Probar UN PIN contra 500 alumnos |

**El eje por IP es el que casi todo el mundo olvida.** Un atacante que prueba
`0000` contra los 500 códigos de un colegio nunca acumula 5 fallos en ninguna
cuenta y no dispara un solo bloqueo. Con 500 alumnos y PIN de 4 dígitos, la
probabilidad de acertar al menos uno con un único intento por cuenta es ~5 %. Por
eso el límite por IP se comprueba **antes** de tocar `students`.

`auth_attempts` guarda el **código tecleado aunque no exista**: contar intentos
contra códigos inexistentes es precisamente la firma de una enumeración.

### Tiempo constante

Si "código inexistente" respondiera en 5 ms y "PIN incorrecto" en 90 ms, un
script con un cronómetro extrae el listado completo de alumnos de un colegio, y a
partir de ahí solo quedan 10.000 PIN por probar. Tres medidas, las tres necesarias:

1. Con código inexistente **se verifica igualmente** el PIN contra un hash señuelo
   de los mismos parámetros de coste.
2. Con la cuenta **bloqueada también se verifica** el PIN, aunque el resultado se
   descarte: si no, "bloqueado" respondería antes que "PIN erróneo" y el atacante
   sabría que ese código existe.
3. Toda respuesta se retiene hasta un suelo de `MIN_RESPONSE_MS = 350`.

Y el cuerpo devuelto es **idéntico** para todos los fallos de credencial:
`{"error":"invalid_credentials"}`. El motivo real (`bad_pin`, `locked`,
`unknown_code`, `school_suspended`) va a `learning_events.payload.reason` y a
`auth_attempts`, donde solo lo ve el staff.

---

## Tablas

| Tabla | Papel en M02 | Notas |
|---|---|---|
| `students` | `pin_hash`, `pin_must_change`, `pin_updated_at`, `failed_pin_attempts`, `locked_until` | Solo `service_role` lee `pin_hash`; `authenticated` no puede escribir `pin_hash` ni `pin_updated_at` (GRANT por columna + trigger `students_guard_update`) |
| `auth_attempts` | Rate limiting y forense | Append-only en UPDATE. Índices `(school_id, student_code, created_at desc)` y `(ip_hash, created_at desc) where not success` |
| `profiles` | `status` (`pending`/`active`/`suspended`) | Suspender un perfil lo deja sin acceso **inmediatamente**: los helpers de RLS exigen `status = 'active'`, así que no hay que esperar a que caduque su JWT |
| `learning_events` | `login_success`, `login_failed`, `pin_changed` | `login_failed` de un código inexistente **no** se registra aquí (`student_id` es NOT NULL): ese caso vive en `auth_attempts` |
| `schools` | `pin_length_primary`, `pin_length_secondary`, `status` | Un colegio `suspended` no autentica a nadie |

---

## APIs

### `POST /functions/v1/auth-pin`

```jsonc
// Petición
{ "schoolSlug": "demo", "studentCode": "Y6A-001", "pin": "4821" }

// 200
{ "session": { "access_token": "...", "refresh_token": "...", "expires_in": 3600 },
  "pinMustChange": true }

// 401 — idéntico para TODOS los fallos de credencial
{ "error": "invalid_credentials", "message": { "es": "...", "en": "..." } }

// 500 — el PIN era correcto pero la cuenta sintética falló. No cuenta como
//       intento fallido: sería castigar al alumno por un bug nuestro.
{ "error": "server_error" }
```

Variables de entorno: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ANON_KEY`, `CET_STUDENT_PASSWORD_SECRET`, `CET_IP_HASH_SALT`.

### `POST /functions/v1/auth-pin-change` *(pendiente)*

Requiere sesión válida. Verifica el PIN actual con Argon2id, valida el nuevo
contra `pin_length_*` del colegio y contra una lista negra (`0000`, `1234`,
`1111`, año de nacimiento), rehashea, pone `pin_must_change = false`,
`pin_updated_at = now()`, resetea `failed_pin_attempts` y emite `pin_changed`.

### `POST /admin/students/:id/pin-reset` *(Server Action, staff)*

Genera un PIN aleatorio con `crypto.getRandomValues` (nunca `Math.random`), lo
hashea, pone `pin_must_change = true`, limpia `locked_until` y llama a
`app.audit('student.pin_reset', 'students', id, ...)`. El PIN en claro se muestra
**una sola vez** al profesor y no se persiste en ningún sitio.

### Staff

`supabase.auth.signInWithPassword` estándar. MFA TOTP obligatoria para
`school_admin` y `superadmin`: se comprueba en el middleware de Next.js contra el
AAL del JWT (`aal2`), no en el cliente.

---

## Frontend

- **`/login/[slug]`** — pantalla del alumno. Selector de colegio por slug en la
  URL; código y PIN. El teclado del PIN es numérico (`inputmode="numeric"`,
  `autocomplete="one-time-code"`) y los dígitos se enmascaran.
- **`/login`** — pantalla del staff, email + contraseña, con paso de MFA.
- **`/pin/change`** — obligatoria si `pinMustChange`; el middleware redirige aquí
  y bloquea el resto de la app hasta que se complete.

Reglas de UX que son también reglas de seguridad:

1. **El mensaje de error nunca distingue** entre código desconocido y PIN
   incorrecto. La interfaz no puede filtrar lo que el backend se esfuerza en
   ocultar.
2. **El bloqueo se explica a un niño de 11 años.** No "429 Too Many Requests",
   sino "Has probado muchas veces. Espera 15 minutos o pídele a tu profe que te
   ayude", con un contador visible.
3. Accesible con teclado, contraste AA, etiquetas asociadas a los campos y
   `aria-live` en el mensaje de error para que un lector de pantalla lo anuncie.
4. Ningún dato de sesión en `localStorage`: cookies `httpOnly` vía
   `@supabase/ssr`.

---

## Seguridad

| Amenaza | Defensa |
|---|---|
| Fuerza bruta contra un alumno | 5 fallos → 15 min de bloqueo |
| Barrido de un PIN contra todo el colegio | Límite de 30 fallos por IP en 15 min, comprobado **antes** de tocar `students` |
| Enumeración de códigos por tiempo | Verificación señuelo + suelo de 350 ms + respuesta idéntica |
| Enumeración de códigos por respuesta | Un solo cuerpo de error para todos los fallos |
| Filtración de la tabla `students` | Argon2id con salt por fila; el hash no es la contraseña de la cuenta |
| DoS por PIN gigante | Zod acota a 4–8 dígitos **antes** de llegar a Argon2id (cada verificación reserva 19 MiB) |
| Alumno que se desbloquea solo | No tiene UPDATE sobre `students`; el trigger `students_guard_update` impide además subir `failed_pin_attempts` o tocar `pin_hash` |
| Sesión de un perfil suspendido | Los helpers exigen `status = 'active'`: el acceso muere al instante, sin esperar al JWT |
| Recuperación por email del alumno | Imposible por construcción: el dominio `.invalid` no existe |

---

## Pruebas

**Unitarias (Vitest, sobre la lógica extraída de la Edge Function):**
- La forma de `loginInput` rechaza PIN con letras, con menos de 4 dígitos, con
  más de 8 y de 10 MB.
- La derivación HMAC de la contraseña sintética es determinista y cambia con el
  secreto.

**Integración (Deno test contra un Supabase local):**
- PIN correcto → 200 con sesión, y `failed_pin_attempts` vuelve a 0.
- PIN incorrecto ×4 → 401 y `failed_pin_attempts = 4`, sin bloqueo.
- PIN incorrecto ×5 → `locked_until` a 15 minutos.
- **PIN correcto estando bloqueado → 401.** Es el test que falla si alguien
  "optimiza" comprobando el hash antes que el bloqueo.
- Código inexistente y PIN incorrecto sobre código existente: la diferencia de
  tiempo entre 50 muestras de cada uno está por debajo de 25 ms.
- 31 fallos desde la misma IP contra códigos distintos → el 31.º se rechaza sin
  que ninguna cuenta llegue a bloquearse.
- Colegio `suspended` → 401.

**pgTAP:**
- `has_column_privilege('authenticated','students','pin_hash','SELECT')` es false
  (`rls_answer_key_hidden.sql`).
- Un PIN en claro no se puede insertar (`constraints.sql`).
- Un alumno no puede hacer UPDATE de su propia ficha
  (`rls_student_cannot_read_peers.sql`).

**e2e (Playwright):** login → cambio de PIN obligatorio → home del alumno.

---

## Criterios de finalización

- [ ] Un alumno del colegio demo entra con colegio + código + PIN y obtiene una sesión Supabase válida.
- [ ] `pin_must_change` fuerza el cambio de PIN y el middleware bloquea el resto de la app hasta completarlo.
- [ ] 5 fallos bloquean 15 minutos; el bloqueo se explica con un contador y en el idioma del alumno.
- [ ] Un PIN correcto sobre una cuenta bloqueada devuelve 401.
- [ ] La diferencia de tiempo de respuesta entre "código inexistente" y "PIN incorrecto" es < 25 ms sobre 50 muestras.
- [ ] Ningún cuerpo de respuesta distingue los motivos de fallo.
- [ ] `pin_hash` no es legible por `authenticated` (test pgTAP en verde).
- [ ] MFA activa y obligatoria para `superadmin` y `school_admin`.
- [ ] Cero credenciales en el repositorio: todo por variables de entorno.
- [ ] `app.audit()` registra todo reseteo de PIN hecho por staff.
