---
id: telemetria-sin-disco
model: chat
territory: [apps/web/src/lib/telemetry/**]
forbidden: [packages/ui/src/index.ts, packages/shared/src/index.ts]
context: [apps/web/src/lib/telemetry/client.ts, apps/web/src/lib/telemetry/client.test.ts, apps/web/src/components/exam-runner/autosave.ts]
verify: pnpm --filter @cet/web exec vitest run src/lib/telemetry
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 5
deadline: 5 rondas o 25 min
---

## 1 · El problema

La cola de telemetria **agrupa bien y no persiste nada**. Vive solo en memoria.
Recargar la pagina, cerrar la pestana de golpe o quedarse sin bateria pierde
todo lo que no haya viajado — hasta 500 eventos. Y cuando se desborda, tira los
mas antiguos **en silencio**.

La cola hermana, la de las respuestas del examen, si persiste. Las dos guardan
trabajo de un nino; solo una lo protege.

## 2 · La evidencia que ya tenemos

`apps/web/src/lib/telemetry/client.ts`. La cola es un array en memoria y nada
mas:

```
 61:  private queue: ClientEvent[] = [];
 29: /** Tope de la cola en memoria. Si se supera, se descartan los MAS ANTIGUOS. */
 30: const MAX_QUEUE = 500;
```

El descarte silencioso, en `enqueue`:

```
157:    this.queue.push(event);
159:    if (this.queue.length > MAX_QUEUE) {
164:      this.queue = this.queue.slice(-MAX_QUEUE);
```

Y en el fallo de red los eventos vuelven a la cola... que sigue siendo memoria:

```
216:      // Red caida o 5xx: los eventos vuelven a la cabeza de la cola, en su
218:      this.queue = [...batch, ...this.queue].slice(-MAX_QUEUE);
```

El agrupado, que **ya esta bien y no hay que tocar**:

```
 25: export const FLUSH_INTERVAL_MS = 5_000;
 26: export const FLUSH_AT_COUNT = 20;
      MAX_EVENT_BATCH = 100   (en @cet/shared)
```

Contrasta con `apps/web/src/components/exam-runner/autosave.ts`, que resuelve
exactamente este problema y explica su eleccion en la cabecera:

```
 12: *     cola se persiste en `localStorage` en cada cambio, asi que sobrevive a
 26: * POR QUE `localStorage` Y NO IndexedDB (el contrato del modulo sugeria IDB):
 27: * la cola son unas pocas decenas de objetos JSON diminutos, y `localStorage` es
```

**Ojo con ese razonamiento: no se traslada tal cual.** Ahi son decenas de
objetos; aqui son hasta 500. Decide con ese dato delante y **escribe la razon en
un comentario**, sea cual sea la eleccion.

`autosave.ts` tambien te da el patron de inyeccion que usa la casa para poder
probar el almacenamiento:

```
 67:  /** Minimo que la cola necesita de `localStorage`. Se inyecta para poder testear. */
```

## 3 · El criterio de aceptacion

`pnpm --filter @cet/web exec vitest run src/lib/telemetry` en verde, con tests
nuevos que demuestren:

1. Un evento encolado **sobrevive a que la pagina se recargue**: se persiste al
   encolar, y una cola nueva construida sobre el mismo almacenamiento lo
   encuentra y lo envia.
2. Lo que se envio con exito **deja de estar persistido**. Si no, el alumno
   reenvia lo mismo cada vez que abre la aplicacion.
3. Un lote que falla por 5xx **sigue persistido** despues del fallo.
4. **El desbordamiento deja de ser silencioso**: al pasar de `MAX_QUEUE`, que se
   descarten los mas antiguos es aceptable, pero tiene que quedar constancia
   —cuenta, aviso por consola, lo que decidas— y un test que lo demuestre.
5. El agrupado no cambia: cada 5 s o cada 20 eventos, tope 100 por peticion.
   Si algun test existente de eso se pone rojo, has roto algo.
6. Si el almacenamiento no esta disponible —modo privado, cuota llena, el
   navegador lanza al escribir— **la telemetria sigue funcionando en memoria**.
   Perder telemetria es malo; tumbar la pagina de un nino por telemetria es
   peor. Con test.

## 4 · Que NO cuenta como resuelto

- Persistir en cada `flush` en vez de en cada encolado. Lo que se pierde es
  justo lo que aun no ha viajado.
- Escribir en `localStorage` sin envolver en `try/catch`. En modo privado y con
  la cuota llena, `setItem` **lanza**. Ver punto 6.
- Un test que llame al metodo de persistir y compruebe que persiste. Eso prueba
  el metodo, no la garantia. El fallo esta en el ciclo completo: encolar,
  perder la pagina, reconstruir, enviar. Pruebalo ahi.
- Reutilizar la clave de `localStorage` de `autosave.ts`. Son dos colas
  distintas y pisarse seria peor que el fallo original.
- Cambiar `FLUSH_INTERVAL_MS`, `FLUSH_AT_COUNT` o `MAX_EVENT_BATCH`. Estan
  puestos con criterio y no es tu encargo.
- Un test verde que siga verde si reviertes el arreglo. **Antes de entregar,
  comprueba por codigo de salida que tu test nuevo sale ROJO contra el codigo
  original**, y dilo en un comentario del test.
- Guardar en el almacenamiento nada que no sea el evento: ni el token de sesion,
  ni nada de `secrets/`.
