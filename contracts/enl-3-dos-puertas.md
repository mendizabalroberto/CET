---
id: enl-3-dos-puertas
model: k3
territory: [supabase/functions/auth-pin/index.ts, supabase/functions/student-pin/index.ts, supabase/functions/_shared/puertas.ts, supabase/functions/_shared/puertas.test.ts]
forbidden: [packages/ui/src/index.ts, packages/shared/src/index.ts, apps/web/**]
context: [supabase/functions/auth-pin/index.ts, supabase/functions/student-pin/index.ts, docs/superpowers/specs/2026-08-29-alta-por-enlace-design.md]
verify: pnpm test:functions
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
hash señuelo con los MISMOS parámetros de coste que los hashes reales, suelo de
`MIN_RESPONSE_MS = 350` en TODAS las salidas, y cuerpo de respuesta idéntico
para todo fallo de credencial. El motivo, literal: «si "código inexistente"
respondiera en 5 ms y "PIN incorrecto" en 90 ms, cualquiera enumeraría el
listado completo de alumnos de un colegio con un script y un cronómetro».

`student-pin/index.ts` ya tiene una unión discriminada por `op` con `change`,
`reset` y `provision`, y es el único sitio del sistema que calcula Argon2id.
Sus parámetros de coste son `{ parallelism: 1, iterations: 2, memorySize: 19456,
hashLength: 32 }` y no se tocan.

La tabla `public.student_devices` tiene `device_hash` = SHA-256 en hexadecimal
minúsculas del secreto, `student_id` → `profiles(id)`, `revoked_at` y
`last_seen_at`.

## 3 · El criterio de aceptación

`pnpm test:functions` en verde, con `supabase/functions/_shared/puertas.test.ts`
cubriendo las funciones puras que extraigas — sin red y sin base de datos.

**Donde viven las piezas puras.** `supabase/functions/vitest.config.mjs` alias
`https://esm.sh/zod@3.23.8` a la libreria del workspace, y **solo esa**.
`hash-wasm` y `@supabase/supabase-js` NO tienen alias a proposito: pertenecen al
camino con efectos, que no se prueba con un test unitario. Asi que todo lo que
quieras probar —`entradaDeAuthPin`, `sha256hex`— va a
`supabase/functions/_shared/puertas.ts`, que importa zod y nada mas, y los dos
`index.ts` lo importan desde ahi. Un modulo de pruebas que importe `index.ts`
directamente muere en el primer import y no hay forma de arreglarlo desde el
contrato.

En `auth-pin`:

- Exporta `entradaDeAuthPin`, una `z.union` de dos objetos `.strict()`: la forma
  vieja intacta, y
  `{ deviceToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/), pin: z.string().regex(/^[0-9]{4,8}$/) }`.
  43 caracteres es la longitud exacta de 32 bytes en base64url.
- La puerta del dispositivo resuelve `student_devices` por
  `device_hash = sha256hex(deviceToken)` con `revoked_at is null`, obtiene el
  `profile_id` del alumno, y a partir de ahí **reutiliza el mismo camino** que la
  puerta vieja: lockout, Argon2id, canje por sesión.
- El lockout y el rate limit se cuentan **por `profile_id` de alumno**, nunca por
  puerta.
- `deviceToken` desconocido o revocado: se verifica igualmente contra
  `DECOY_HASH` y se sale por `respond(genericFailure())`.
- Al entrar con éxito por la puerta del dispositivo se escribe `last_seen_at`.

En `student-pin`, una `op` nueva:

    { op: "set-from-link", studentProfileId: uuid, newPin: string }

que exige que el llamante presente la clave de **`service_role`** (nunca un JWT
de usuario), escribe `pin_hash`, pone `pin_must_change = false` y
`pin_updated_at = now()`, y aplica la MISMA lista de PIN débiles que ya aplica
`change`.

Los tests comprueban, como mínimo: que `entradaDeAuthPin` acepta las dos formas
válidas; que rechaza un `deviceToken` de 42 y de 44 caracteres; que rechaza uno
con `+` o `/` (base64url no los tiene); que rechaza un objeto que traiga las dos
puertas a la vez; y que `sha256hex` de una cadena conocida da el hexadecimal
esperado en minúsculas.

## 4 · Qué NO cuenta como resuelto

- Una salida de `auth-pin` que no pase por `respond()`: rompe el suelo de tiempo
  y con él la defensa entera.
- Contar el lockout por puerta: convierte la puerta nueva en un rodeo para gastar
  intentos infinitos contra el mismo PIN.
- Que la puerta del dispositivo devuelva un cuerpo distinto de `genericFailure()`
  para cualquier fallo de credencial.
- Que `set-from-link` acepte un JWT de alumno o de tutor.
- Cambiar los parámetros de coste de Argon2id, o el valor de `DECOY_HASH`.
- Una aserción que compare un valor consigo mismo.
- Tocar cualquier fichero de `apps/web/`.
