/**
 * Cronómetro de tiempo ACTIVO. Puro, sin React y sin `Date.now()` implícito.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ ESTE FICHERO EXISTE APARTE
 * ===========================================================================
 * Hay UNA sola definición de «tiempo» en este producto. Si el cronómetro de la
 * pantalla dice siete minutos y el informe del tutor dice cuatro, uno de los
 * dos miente y el niño se creerá el suyo. La definición de la base de datos
 * está en `supabase/migrations/0064_tiempo_de_estudio.sql`: el tiempo no es el
 * hueco entre el primer y el último evento, es la suma de los ratos en que
 * había alguien delante. Aquí se cuenta con ese mismo criterio — se para con la
 * pestaña oculta, con la ventana sin foco y tras un rato de inactividad — para
 * que las dos cifras salgan del mismo concepto y no de dos parecidos.
 *
 * ===========================================================================
 * POR QUÉ EL TIEMPO ENTRA COMO PARÁMETRO
 * ===========================================================================
 * Ni una función de aquí consulta un reloj. Lo hace el llamante, y le pasa un
 * instante de `performance.now()` (ver `monotonicNow`). Dos consecuencias, y
 * las dos son el motivo:
 *
 *  1. Es comprobable sin navegador y sin temporizadores falsos: las pruebas
 *     avanzan el tiempo escribiendo un número, no esperándolo.
 *  2. El reloj es MONÓTONO, igual que en `exam-runner/clock.ts`. Mide
 *     intervalos, no fechas. Adelantar el reloj del sistema media hora —que es
 *     lo primero que prueba un niño de once años— no regala ni un minuto,
 *     porque aquí nunca se resta una fecha de otra.
 *
 * El estado es INMUTABLE: cada transición devuelve un cronómetro nuevo. En un
 * componente de React eso evita el fallo clásico de mutar un objeto guardado en
 * una ref y que la pantalla no se entere de que cambió.
 */

/**
 * Cada cuánto tiempo ACTIVO se emite un latido de telemetría, y por tanto la
 * RESOLUCIÓN con la que queda registrado el tiempo de una pantalla.
 *
 * Empezó en 60 s con este razonamiento: el latido existe para que el portátil
 * que se cierra de golpe no se lleve la sesión entera —así es como se rompió el
 * cálculo de 0064—, y con un minuto lo peor que se pierde es un minuto.
 *
 * Se baja a 6 s porque ese argumento fija el TECHO de lo que se pierde, no el
 * suelo de lo que se quiere ver. Con 60 s, una visita de 40 segundos a una
 * pantalla no deja ni un latido: solo la fila de salida. Con 6 s se ve la forma
 * de la sesión —dónde se atascó, dónde voló— y no solo su total.
 *
 * LO QUE CUESTA, dicho en voz alta: son DIEZ VECES más filas en
 * `learning_events`. Una lección de veinte minutos pasa de ~20 a ~200 eventos
 * por niño. El envío no sufre —la cola del navegador ya agrupa cada 5 s o cada
 * 20 eventos, así que van en lote igual—, pero la tabla crece diez veces más
 * deprisa, y hoy NADIE la purga: la retención de 0054 se programa con pg_cron y
 * pg_cron no está instalado en este proyecto. Hay particiones precreadas hasta
 * 2027-08, así que espacio hay; lo que no hay es limpieza automática.
 *
 * Si algún día esto pesa, lo que se toca es este número y nada más: quien
 * agrega ya tiene que quedarse con el MÁXIMO por visita y no sumar, así que
 * cambiar la resolución no cambia ninguna cifra de ningún informe.
 */
export const LATIDO_CADA_MS = 6_000;

export interface Cronometro {
  /** Instante monótono del arranque. El origen de los milisegundos BRUTOS. */
  readonly inicioMs: number;
  /** Activo ya cerrado, de los tramos anteriores a la pausa en curso. */
  readonly activoCerradoMs: number;
  /** Instante monótono en que empezó el tramo abierto; `null` = pausado. */
  readonly corriendoDesdeMs: number | null;
  /** Milisegundos ACTIVOS que tenía el cronómetro cuando latió por última vez. */
  readonly activoDelUltimoLatidoMs: number;
}

/** Arranca corriendo. `ahoraMs` es el origen: antes de él no hay tiempo. */
export function arrancar(ahoraMs: number): Cronometro {
  return {
    inicioMs: ahoraMs,
    activoCerradoMs: 0,
    corriendoDesdeMs: ahoraMs,
    activoDelUltimoLatidoMs: 0,
  };
}

/**
 * Cierra el tramo abierto. Idempotente A PROPÓSITO: ocultar la pestaña y perder
 * el foco de la ventana son dos sucesos distintos que llegan casi siempre
 * juntos y en cualquier orden. Si la segunda pausa volviera a acumular, el
 * mismo tramo se contaría dos veces y el cronómetro correría al doble.
 */
export function pausar(c: Cronometro, ahoraMs: number): Cronometro {
  if (c.corriendoDesdeMs === null) return c;
  return {
    ...c,
    activoCerradoMs: c.activoCerradoMs + transcurrido(c.corriendoDesdeMs, ahoraMs),
    corriendoDesdeMs: null,
  };
}

/** Abre un tramo nuevo. Idempotente por la misma razón que `pausar`. */
export function reanudar(c: Cronometro, ahoraMs: number): Cronometro {
  if (c.corriendoDesdeMs !== null) return c;
  return { ...c, corriendoDesdeMs: ahoraMs };
}

/** Milisegundos con alguien delante: lo que se cuenta como estudio. */
export function msActivos(c: Cronometro, ahoraMs: number): number {
  if (c.corriendoDesdeMs === null) return c.activoCerradoMs;
  return c.activoCerradoMs + transcurrido(c.corriendoDesdeMs, ahoraMs);
}

/**
 * Milisegundos de reloj desde el arranque, pausas incluidas. No se pinta nunca:
 * viaja en la telemetría junto al activo porque la DIFERENCIA entre los dos es
 * la que responde «cuánto estuvo delante sin hacer nada» — y el día que el
 * cronómetro y el informe del tutor no cuadren, es la que dice cuál miente.
 */
export function msBrutos(c: Cronometro, ahoraMs: number): number {
  return transcurrido(c.inicioMs, ahoraMs);
}

/** ¿Toca latido? Se mide contra el ACTIVO, nunca contra el reloj de pared. */
export function debeLatir(c: Cronometro, ahoraMs: number): boolean {
  return msActivos(c, ahoraMs) - c.activoDelUltimoLatidoMs >= LATIDO_CADA_MS;
}

/**
 * Anota que se acaba de latir.
 *
 * Guarda el activo REAL del momento, no el último múltiplo de 60 s. La
 * diferencia importa cuando el navegador estrangula los temporizadores de una
 * pestaña en segundo plano y devuelve el control tres minutos después: con el
 * múltiplo quedaría una deuda de dos latidos que se emitirían en ráfaga, los
 * tres con el mismo total, y el análisis vería tres visitas donde hubo una.
 */
export function marcarLatido(c: Cronometro, ahoraMs: number): Cronometro {
  return { ...c, activoDelUltimoLatidoMs: msActivos(c, ahoraMs) };
}

/**
 * `4:12`. Minutos sin relleno, segundos con él, y SIN horas: noventa minutos
 * son `90:00`. Un formato con horas obligaría al niño a sumar dos números para
 * saber cuánto lleva, y volver a cero al pasar de la hora le mentiría por una
 * hora entera.
 *
 * Trunca en vez de redondear: enseñar `1:00` a los 59,9 s sería pintar un
 * minuto que todavía no ha ocurrido.
 */
export function formatearMmSs(ms: number): string {
  const seguros = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const totalSegundos = Math.floor(seguros / 1000);
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  return `${minutos}:${String(segundos).padStart(2, "0")}`;
}

/**
 * Los minutos del resumen final, redondeados al más cercano y con SUELO 1.
 *
 * El suelo no es un detalle de formato: «has estado 0 minutos» le dice a un
 * niño que lo que acaba de hacer no contó. Contó. Lo que se ALMACENA sigue
 * siendo el milisegundo exacto; esto solo decide qué se le dice.
 */
export function minutosParaElResumen(ms: number): number {
  const seguros = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  return Math.max(1, Math.round(seguros / 60_000));
}

/**
 * Reloj monótono. Duplica a conciencia el `monotonicNow` de
 * `exam-runner/clock.ts` en vez de importarlo: aquel fichero es del corredor de
 * examen y depende del contrato del intento, y el cronómetro de la lección no
 * debe arrastrar esa dependencia solo para leer la hora. Son seis líneas y el
 * criterio es el mismo, escrito en los dos sitios.
 */
export function ahoraMonotono(): number {
  const perf = globalThis.performance as Performance | undefined;
  return typeof perf?.now === "function" ? perf.now() : Date.now();
}

/**
 * Un intervalo, nunca negativo. `performance.now()` no retrocede, pero el
 * activo acaba en un esquema Zod declarado `nonnegative`: un negativo que se
 * colara haría que el servidor rechazara el lote ENTERO con un 400 y se
 * perderían también los eventos buenos que viajaban con él.
 */
function transcurrido(desdeMs: number, hastaMs: number): number {
  return Math.max(0, hastaMs - desdeMs);
}
