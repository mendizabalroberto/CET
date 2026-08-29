---
id: enl-4-acciones
model: codigo
territory: [apps/web/src/lib/tutor/**]
forbidden: [packages/ui/src/index.ts, packages/shared/src/index.ts, apps/web/src/components/**, apps/web/src/app/**]
context: [apps/web/src/lib/auth/schemas.ts, apps/web/src/lib/auth/actions.ts, apps/web/src/components/staff/actions.ts, apps/web/src/lib/supabase/admin.ts, docs/superpowers/plans/2026-08-29-alta-por-enlace.md]
verify: pnpm vitest run apps/web/src/lib/tutor
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 3
timeout: 1800
deadline: 3 rondas o 40 min
---

## 1 · El problema

No existe la capa de dominio del tutor: generar y hashear tokens, reducir un
user-agent a algo que un padre reconozca, los Zod de las cinco entradas, y las
seis Server Actions que mueven la cadena de invitación.

## 2 · La evidencia que ya tenemos

`apps/web/src/lib/auth/schemas.ts` fija el estilo de los Zod y ya exporta
`pinSchema` y `studentCodeSchema`. Reutilízalos; no los redefinas.

`apps/web/src/components/staff/actions.ts:389` (`createStudent`) es el modelo
exacto de una acción que escala privilegios: comprueba el rol ANTES, documenta el
motivo en el propio `createAdminClient("…")`, y define un `rollback()` que borra
el `auth.users` recién creado si falla un paso posterior — porque una cuenta
huérfana sin ficha es invisible desde el panel y perfectamente utilizable.
Cópialo, incluido el rollback.

`apps/web/src/lib/supabase/admin.ts` exige una razón en texto al crear el cliente
administrativo. No es decorativa.

**Las firmas exactas están en las tareas 8, 9 y 10 del plan**
`docs/superpowers/plans/2026-08-29-alta-por-enlace.md`, en sus bloques
«Interfaces». Respétalas al carácter: hay pantallas que las importan y no son
tuyas.

## 3 · El criterio de aceptación

`pnpm vitest run apps/web/src/lib/tutor` en verde, con pruebas que comprueban:

- `generarToken()` casa con `/^[A-Za-z0-9_-]{43}$/`, y dos llamadas no coinciden.
- `hashToken()` es estable, casa con `/^[0-9a-f]{64}$/`, y su salida no contiene
  el token.
- `familiaDeAgente("Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0")` devuelve
  `"Chrome en Android"`; con un user-agent desconocido y con `null` devuelve
  `"Navegador"`, y **nunca** la cadena original.
- `tokenSchema` rechaza una cadena corta y una con `+` o `/`.
- `canjeDeEnlaceSchema` rechaza que `pin` y `pinRepetido` difieran, y rechaza un
  PIN de 3 dígitos.
- `etapaDeCurso(6) === "primary"`, `etapaDeCurso(7) === "secondary"`,
  `longitudDePin("primary") === 4`, `longitudDePin("secondary") === 6`.

## 4 · Qué NO cuenta como resuelto

- Guardar el token en claro en la base de datos, o registrarlo con `console.log`
  / `console.warn` / `console.error`.
- Una acción que devuelva la URL del enlace más de una vez, o que la escriba en
  un log.
- `familiaDeAgente()` devolviendo el user-agent completo: es la huella digital de
  un menor.
- Una acción que llame a `createAdminClient` sin haber comprobado el rol antes.
- `canjearEnlace` distinguiendo en su mensaje de error entre enlace caducado, ya
  usado e inexistente: eso convierte la pantalla en un oráculo sobre qué tokens
  existieron.
- Una aserción que compare un valor consigo mismo.
- Tocar `apps/web/src/components/**` o `apps/web/src/app/**`.
