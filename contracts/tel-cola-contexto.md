---
id: tel-cola-contexto
model: reasoner
territory: [apps/web/src/lib/telemetry/**]
forbidden: [packages/ui/src/index.ts, packages/shared/src/index.ts, packages/shared/src/events.ts]
context: [apps/web/src/lib/telemetry/client.ts, apps/web/src/lib/telemetry/client.test.ts, apps/web/src/lib/telemetry/provider.tsx, apps/web/src/lib/telemetry/provider.test.tsx, packages/shared/src/events.ts]
verify: pnpm --filter @cet/web exec vitest run src/lib/telemetry
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 4
deadline: 4 rondas o 25 minutos
---

## 1 · El problema

`packages/shared/src/events.ts` acaba de ganar tres tipos de evento —
`session_context`, `ui_interaction` y `nav_route_changed` — y **la cola del
cliente no sabe emitir ninguno**. `TelemetryQueue` solo tiene `track(input)`
generico: quien quiera emitir un `ui_interaction` correcto tiene que calcular a
mano su `ordinal`, su `sinceLastMs` y su `modality`, y treinta sitios que
calculan lo mismo a mano lo calculan de treinta maneras.

Los tres campos que hacen util a `ui_interaction` son precisamente los que solo
la cola puede saber, porque son estado de SESION y no de componente.

## 2 · La evidencia que ya tenemos

`apps/web/src/lib/telemetry/client.ts` mantiene ya el unico contador de sesion
que existe, y lo hace bien:

```
  track(input: TrackInput): void {
    ...
    const event: ClientEvent = {
      ...input,
      sessionId: this.sessionId,
      seq: this.seq++,
      clientTs: new Date().toISOString(),
      payload: input.payload ?? {},
    };
```

`start()` se puede llamar VARIAS veces sobre la misma instancia, y es
intencionado — el comentario del fichero lo explica:

```
   * `start()` levanta el flag de `dispose()` a propósito. Antes no lo hacía y
   * `disposed` era una puerta de un solo sentido: bastaba un ciclo
   * montar → desmontar → montar del provider —que es lo que hace React en
   * `StrictMode`, en CADA carga de desarrollo— para que la cola quedara muerta
```

Eso es exactamente la trampa de este contrato: en `StrictMode` el provider monta
dos veces y `start()` corre dos veces sobre **la misma instancia**
(`provider.tsx` guarda la cola en un `useRef`). Un `session_context` emitido sin
guarda saldria dos veces por sesion y los informes contarian el doble de
sesiones.

Los esquemas exactos de los tres payloads estan en `packages/shared/src/events.ts`,
en `eventPayloads`. **No los cambies: `events.ts` esta en `forbidden`.** Son el
contrato ya acordado y la base de datos ya los espera.

## 3 · El criterio de aceptacion

En `apps/web/src/lib/telemetry/client.ts`:

1. **`session_context` se emite UNA sola vez por instancia de cola, con
   `seq` 0**, al primer `start()`. Un segundo `start()` (StrictMode, o volver de
   un `dispose()`) NO lo repite. Se recogen los datos de forma DEFENSIVA:
   `window.matchMedia`, `navigator.connection` y `Intl.DateTimeFormat` pueden no
   existir (jsdom, Safari, Firefox); cada ausencia cae en el respaldo declarado
   por el esquema (`connection: "unknown"`, `modality: "unknown"`) y **nunca
   lanza**. Una excepcion aqui dejaria la cola sin arrancar y se perderia la
   sesion entera, que es peor que un campo a `unknown`.
2. **`trackUi(entrada)`** — recibe `{ control, surface, action, value? }` y
   completa `ordinal` (contador propio, empieza en 0, independiente de `seq`),
   `sinceLastMs` (milisegundos desde el `trackUi` anterior; 0 en el primero) y
   `modality`.
3. **La modalidad se OBSERVA**, no se adivina: un listener de `pointerdown`
   guarda `event.pointerType` (`touch`/`mouse`/`pen`) y uno de `keydown` la pone
   a `keyboard`. Se registran y se retiran en `start()`/`dispose()`, junto a los
   que ya hay. La modalidad vigente es la del ultimo de los dos.
4. **`trackNav(desde, hacia)`** — emite `nav_route_changed` con `dwellMs`
   medido desde el `trackNav` anterior (o desde `start()` en el primero).
5. `provider.tsx` expone `trackUi` y `trackNav` en el contexto, junto a `track`,
   `sessionId` y `flush`. El no-op de produccion sin provider los incluye
   tambien: si falta uno, un componente sin provider revienta en produccion, que
   es justo lo que ese no-op existe para evitar.

Pruebas nuevas en `client.test.ts` y `provider.test.tsx`, que deben cubrir:

- `session_context` sale con `seq` 0 y **exactamente una vez** tras dos
  `start()` seguidos;
- sigue saliendo una sola vez tras `start()` → `dispose()` → `start()`;
- `ordinal` correlativo y `sinceLastMs` creciente en `trackUi` (usa
  `vi.useFakeTimers()`; no dependas del reloj real);
- la modalidad cambia a `keyboard` tras un `keydown` y a `touch` tras un
  `pointerdown` con `pointerType: "touch"`;
- si `navigator.connection` no existe, `connection` es `"unknown"` y no se lanza;
- `trackNav` mide `dwellMs` desde la navegacion anterior.

## 4 · Que NO cuenta como resuelto

- Un `session_context` que sale dos veces en StrictMode. Es el fallo concreto que
  este contrato existe para evitar; una prueba que llame a `start()` una sola vez
  no lo demuestra.
- Un `ordinal` que reutilice `seq`. Son dos cosas distintas: `seq` cuenta TODOS
  los eventos de la sesion, `ordinal` cuenta solo los actos de interfaz. Si un
  hueco en `ordinal` puede deberse a un evento de otro tipo, deja de significar
  «se perdio un acto» y el analisis de conducta pierde su unica senal de perdida.
- Deducir la modalidad de `window.matchMedia('(pointer: coarse)')` en cada acto.
  Eso dice de que es CAPAZ el aparato, no con que lo esta usando el nino: un
  portatil con pantalla tactil da `coarse` mientras el alumno teclea.
- Medir el tiempo con `Date.now()` para `sinceLastMs` y `dwellMs`. Usa
  `performance.now()`: `Date.now()` salta si el sistema ajusta el reloj, y un
  salto de reloj produciria un `sinceLastMs` negativo que el esquema Zod
  (`nonnegative`) rechaza — el lote entero se perderia con un 400.
- Tocar `packages/shared/src/events.ts`. Esta en `forbidden`.
- Cualquier prueba que dependa del reloj real (`await sleep(...)`). Es la receta
  del test intermitente, y en este repositorio ya hubo uno.
