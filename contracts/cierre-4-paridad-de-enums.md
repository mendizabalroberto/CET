---
id: cierre-4-paridad-de-enums
model: chat
territory: [packages/shared/src/enums.ts]
forbidden: [packages/shared/src/index.ts, supabase/migrations/0057_tutor_y_membresias.sql, supabase/migrations/0002_enums.sql]
context: [packages/shared/src/enums.ts, packages/shared/src/__tests__/enum-parity.test.ts, supabase/migrations/0057_tutor_y_membresias.sql, supabase/migrations/0002_enums.sql]
verify: pnpm --filter @cet/shared exec vitest run src/__tests__/enum-parity.test.ts
rounds: 3
deadline: 3 rondas o 20 minutos
---

# TypeScript no conoce un enum que Postgres tiene desde hace días

`enum-parity.test.ts` está rojo:

> `no hay enums en el SQL que TypeScript desconozca`

El enum es **`membership_status`**, creado por `0057_tutor_y_membresias.sql` el
28 de agosto junto a las tablas de tenencia. La migración está commiteada y
aplicada en producción; el tipo en TypeScript no existe.

## Lo que hace este encargo interesante y no trivial

El rojo lleva ahí desde el 28 de agosto a las 15:54 y **nadie lo vio**, porque
Turbo servía un resultado cacheado de `@cet/shared`: sus entradas no habían
cambiado, así que repetía un verde anterior a `0057`. Salió a la luz por
casualidad, cuando otro cambio invalidó la caché.

Eso importa para tu trabajo: **no basta con que el test pase**. Comprueba que
pasa **ejecutándose de verdad**, no por caché. Si tienes dudas, fuerza la
ejecución del paquete y mira que el número de tests cambie.

## Qué hay que conseguir

Que `membership_status` exista en `packages/shared/src/enums.ts` con exactamente
los valores que declara la migración, en el mismo orden, y siguiendo el patrón de
los enums que ya están en ese fichero. No inventes valores ni añadas «por si
acaso»: el test compara contra el SQL.

## Lo que NO puedes hacer

- **No toques la migración.** Está aplicada en producción; cambiarla ahora haría
  saltar la comprobación de huella de `db-apply` («migración alterada después de
  aplicarse»), que existe precisamente para eso.
- **No debilites el test.** Si `enum-parity` te resulta incómodo en algún caso,
  dilo en el informe; no lo relajes. Es el único fichero que ata las dos mitades
  del modelo de datos, y hoy acaba de demostrar que sirve.

## Si encuentras más de uno

Es probable: la tanda de tenencia (`0055`–`0059`) tocó varios tipos. Arregla
todos los que el test señale, y **enumera en el informe cuáles eran** — cada uno
es una pieza del modelo que la aplicación no sabía nombrar.
