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

La cadena de invitación no tiene prueba de punta a punta. Es la única prueba que
puede demostrar que los cinco eslabones encajan entre sí.

## 2 · La evidencia que ya tenemos

`apps/web/e2e/login.spec.ts` fija cómo se arranca la aplicación en este
repositorio, cómo se siembra y qué selectores se usan.

El recorrido completo está en el spec §3, y la lista de tramos que hay que
cubrir, en su §9.

La cookie del dispositivo se llama `cet_device` y es `HttpOnly`.

## 3 · El criterio de aceptación

Un solo `test()` que recorre, en orden:

1. El superadmin invita a un tutor y obtiene una URL.
2. El tutor abre esa URL y se da de alta: el correo aparece **fijo** y no
   editable.
3. Crea un hijo.
4. Genera el enlace del hijo y obtiene una segunda URL.
5. El hijo abre su enlace, elige PIN, y entra.
6. **Segunda visita:** se borran las cookies de sesión de Supabase y se conserva
   **solo** `cet_device`. La pantalla de login pide únicamente el PIN, sin
   colegio ni código, y el hijo entra.
7. Reabrir el primer enlace del hijo muestra la pantalla amable de enlace no
   válido.
8. El tutor pulsa «Olvidar este dispositivo» y la siguiente visita vuelve a
   pedir colegio y código.

Para el tramo 6:

```ts
// Lo que se prueba es que `cet_device` basta para IDENTIFICAR y el PIN para
// ENTRAR. Si se conserva la sesion de Supabase, la prueba pasa sin que la
// cookie de dispositivo haga absolutamente nada.
const cookies = await context.cookies();
await context.clearCookies();
await context.addCookies(cookies.filter((c) => c.name === "cet_device"));
```

## 4 · Qué NO cuenta como resuelto

- Conservar la sesión entre la primera y la segunda visita.
- Saltarse el tramo 7 o el 8.
- Un `expect` que compare un valor consigo mismo.
- Un `data-testid` o un selector que no exista en el código.
- Marcar tramos como `test.skip` o `test.fixme`.
